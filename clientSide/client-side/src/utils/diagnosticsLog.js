// The app's own diagnostic log, kept on this device so a support ticket can show what happened
// in the minutes before it was opened (pages/Support; the admin reads it on the ticket).
//
// What's recorded, newest last:
//   nav      the page opened
//   api      every request to the server: method, path, status, how long it took, and the
//            error message when it failed (never the request or response contents)
//   network  the browser going offline / online
//   toast    an error or warning message the user was shown
//   error    an uncaught error or rejected promise, with where it happened
//   console  console.error / console.warn
//   app      the app starting (which build)
// Query-string values whose names look secret (password, token, code, secret, key) are blanked.
//
// Kept in localStorage so it survives a reload (often the first thing tried when something
// breaks), trimmed to the last WINDOW_MS and MAX_ENTRIES. Losing it never matters.
//
// When something breaks for real — an uncaught error, or a server error on something the person
// did — it's also raised as a "problem", and the app offers to report it
// (components/AppShell/ProblemPrompt.jsx, components/ErrorBoundary.jsx).
const STORAGE_KEY = "pos-diagnostics";
const MAX_ENTRIES = 400;
const WINDOW_MS = 30 * 60 * 1000;
const MAX_TEXT = 500;
const SECRET_PARAM = /pass|token|secret|code|key|otp/i;

const text = (value) => {
  let out;
  if (value instanceof Error) out = `${value.name}: ${value.message}`;
  else if (typeof value === "string") out = value;
  else {
    try {
      out = JSON.stringify(value);
    } catch {
      out = String(value);
    }
  }
  return String(out ?? "").slice(0, MAX_TEXT);
};

// "/api/x?receiptNo=12&token=abc" → "/api/x?receiptNo=12&token=[hidden]"
export const redactPath = (path) => {
  const [base, query] = String(path).split("?");
  if (!query) return base;
  const params = new URLSearchParams(query);
  for (const name of [...params.keys()]) if (SECRET_PARAM.test(name)) params.set(name, "[hidden]");
  return `${base}?${params.toString()}`;
};

let entries = (() => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
})();

let saveTimer = null;
// Written at once — before the page is left for the report after a crash.
export const flushDiagnostics = () => {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {}
};
const save = () => {
  if (!saveTimer) saveTimer = setTimeout(flushDiagnostics, 1000);
};

const trim = () => {
  const since = Date.now() - WINDOW_MS;
  if (entries.length > MAX_ENTRIES || (entries[0] && entries[0].t < since)) {
    entries = entries.filter((e) => e.t >= since).slice(-MAX_ENTRIES);
  }
};

// Requests the app makes on its own every minute or so (badges, bells, the connection check):
// logged only when they fail, or they'd fill the log with the same line.
const BACKGROUND_PATHS = [
  "/api/health",
  "/api/device/status",
  "/api/inventory",
  "/api/settings",
  "/api/shifts/current",
  "/api/shop/notices",
  "/api/shop/storage-status",
  "/api/support/unread",
  "/api/bank-payments/intents",
];

// --- Problems ---------------------------------------------------------------------------
// The latest thing that broke, until it's reported or waved off. Not raised for a register
// being offline (503: it needs the internet for that) or for errors browsers report that
// aren't the app's (ResizeObserver, cross-origin "Script error.").
const IGNORED_ERRORS = /ResizeObserver loop|^Script error\.?$/i;
let problem = null;
const problemListeners = new Set();

const setProblem = (next) => {
  problem = next;
  problemListeners.forEach((listener) => listener(problem));
};
const raiseProblem = (message) => {
  if (IGNORED_ERRORS.test(message)) return;
  setProblem({ message: text(message).slice(0, 200), t: Date.now() });
};
export const currentProblem = () => problem;
export const clearProblem = () => setProblem(null);
export const onProblem = (listener) => {
  problemListeners.add(listener);
  return () => problemListeners.delete(listener);
};

// One server request, from utils/api.js. `status` is null when it never got an answer.
export const logRequest = ({ method, path, status, ms, error }) => {
  const bare = String(path).split("?")[0];
  const background = method === "GET" && BACKGROUND_PATHS.some((p) => bare === p || bare.startsWith(`${p}/`));
  if (background && status != null && status < 400) return;
  logEvent("api", { method, path: redactPath(path), status, ms: Math.round(ms), error: error ? text(error) : undefined });
  if (!background && status >= 500 && status !== 503) raiseProblem(`${method} ${bare} failed (${status})${error ? `: ${text(error)}` : ""}`);
};

export const logEvent = (type, data = {}) => {
  entries.push({ t: Date.now(), type, ...data });
  trim();
  save();
};

// An error the app didn't handle: logged with its stack, and raised as a problem to report.
export const logError = (error, { prefix = "", where, componentStack } = {}) => {
  const message = text(error);
  logEvent("error", {
    message: `${prefix}${message}`,
    where,
    stack: error?.stack ? String(error.stack).slice(0, 1500) : undefined,
    componentStack: componentStack ? String(componentStack).slice(0, 1500) : undefined,
  });
  raiseProblem(message);
};

let installed = false;

// Starts recording what the app can see without being asked: errors, console warnings and
// errors, and the connection. Pages, requests and toasts are logged where they happen
// (DiagnosticsRouteLogger, utils/api.js, ToastContext). Call once, before the first render.
export const installDiagnostics = () => {
  if (installed) return;
  installed = true;
  const build = [...document.scripts].map((s) => s.src).find((src) => /\/static\/js\/main\./.test(src));
  logEvent("app", { message: "App started", build: build ? build.split("/").pop() : "dev" });

  window.addEventListener("error", (e) => {
    logError(e.error || e.message, { where: e.filename ? `${e.filename.split("/").pop()}:${e.lineno}:${e.colno}` : undefined });
  });
  window.addEventListener("unhandledrejection", (e) => logError(e.reason, { prefix: "Unhandled: " }));
  window.addEventListener("online", () => logEvent("network", { message: "Online" }));
  window.addEventListener("offline", () => logEvent("network", { message: "Offline" }));
  for (const level of ["error", "warn"]) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      logEvent("console", { level, message: args.map(text).join(" ").slice(0, MAX_TEXT) });
      original(...args);
    };
  }
};

// The environment the problem happened in. `deviceStatus` is /api/device/status on a register.
const environment = (deviceStatus) => {
  let timeZone;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {}
  const html = document.documentElement;
  return {
    page: `${window.location.pathname}${window.location.search}`,
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    screen: `${window.screen?.width}x${window.screen?.height} @${window.devicePixelRatio}x`,
    language: html.lang || navigator.language,
    timeZone,
    online: navigator.onLine,
    theme: html.classList.contains("dark") ? "dark" : "light",
    textSize: html.style.fontSize || "100%",
    register: deviceStatus?.device
      ? {
          platform: deviceStatus.platform,
          appVersion: deviceStatus.appVersion,
          shop: deviceStatus.shopName,
          name: deviceStatus.deviceName,
          receiptPrefix: deviceStatus.receiptPrefix,
          sync: deviceStatus.sync,
        }
      : undefined,
  };
};

// What goes on a support ticket: the last WINDOW_MS of the log and the environment.
export const snapshotDiagnostics = (deviceStatus) => {
  trim();
  return {
    capturedAt: new Date().toISOString(),
    windowMinutes: WINDOW_MS / 60000,
    environment: environment(deviceStatus),
    entries: entries.map((e) => ({ ...e, t: new Date(e.t).toISOString() })),
  };
};

// How much would be sent, for the ticket form ("42 events from the last 30 minutes").
export const diagnosticsSummary = () => {
  trim();
  return { count: entries.length, errors: entries.filter((e) => e.type === "error" || (e.type === "api" && e.status >= 500)).length, windowMinutes: WINDOW_MS / 60000 };
};
