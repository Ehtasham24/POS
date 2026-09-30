// Test helpers: runs the device (../index.js) as a child process against a data folder, and
// talks to it the way the app does. Used by smoke.js and power-cut.js.
const { spawn } = require("child_process");
const path = require("path");

const DEVICE_DIR = path.join(__dirname, "..");

// Starts the device and resolves once its HTTP server is listening. `log` collects its output
// so a failed start can be explained.
const startDevice = ({ dataDir, port = 4100, env = {} }) =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(DEVICE_DIR, "index.js")], {
      env: {
        ...process.env,
        POS_DATA_DIR: dataDir,
        POS_PORT: String(port),
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    const onData = (chunk) => {
      log += chunk;
      if (/Server started at Port/.test(log)) resolve({ child, base: `http://127.0.0.1:${port}`, startMs: Date.now() - started, log: () => log });
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => reject(new Error(`Device exited (${code}) before starting:\n${log.slice(-2000)}`)));
  });

// Hard kill: no shutdown handlers run, the closest a test gets to pulling the plug.
const killDevice = (child) =>
  new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once("exit", resolve);
    child.kill("SIGKILL");
  });

const stopDevice = (child) =>
  new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once("exit", resolve);
    child.kill("SIGTERM");
  });

const client = (base, token) => async (method, url, body) => {
  const res = await fetch(base + url, {
    method,
    headers: { "content-type": "application/json", cookie: `pos_session=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, body: json ?? text };
};

// Logs in through the real endpoint and returns a client carrying that session.
const login = async (base, username, password) => {
  const res = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const cookie = (res.headers.get("set-cookie") || "").match(/pos_session=([^;]+)/);
  if (!cookie) throw new Error(`Login as ${username} failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return Object.assign(client(base, cookie[1]), { user: body.user ?? body });
};

module.exports = { startDevice, killDevice, stopDevice, client, login };
