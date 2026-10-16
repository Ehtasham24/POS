// Keeps a register up to date from the project's GitHub releases (.github/workflows/release.yml
// publishes one per version tag). Every few hours, when online, it reads the latest release's
// update.json — trusted only if its signature checks out against the public key built into the
// app — and, if that's a newer version:
//
//   code update  the version runs on this app as installed (its minShell ≤ this app's shell):
//                the package with the new code is downloaded, checked against update.json's
//                hash, unpacked beside the running one, and marked pending. The app's start-up
//                (mobile/node/index.js) runs it at the next start, and keeps it only if it
//                starts properly; the page offers to restart now.
//   app update   the version needs a newer app (native changes): the APK is downloaded and
//                checked, and the page offers to install it (Android asks the person to confirm;
//                it only accepts an APK signed with the same key as the installed one).
//
// Nothing here ever runs code that isn't signed: a release without a valid signature is ignored.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const { readPackage } = require("./bundlePackage");

const FIRST_CHECK_MS = 30 * 1000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const FEED_TIMEOUT_MS = 20 * 1000;
const VERSION = /^\d{1,2}\.\d{1,2}\.\d{1,2}$/;
const FILE_NAME = /^[\w.-]{1,100}$/;

// "1.10.0" vs "1.9.3": by number, part by part. >0 when a is newer.
const compareVersions = (a, b) => {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};

const sha256OfFile = async (file) => {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
};

// update.json, checked: signed by the release key, well-formed.
const verifiedManifest = (text, signature, publicKey) => {
  const ok = crypto.verify(null, Buffer.from(text), publicKey, Buffer.from(String(signature).trim(), "base64"));
  if (!ok) throw new Error("The update's signature doesn't match — ignored");
  const manifest = JSON.parse(text);
  if (!VERSION.test(manifest.version) || !Number.isInteger(manifest.minShell)) throw new Error("The update's description is malformed");
  for (const part of ["bundle", "apk"]) {
    const item = manifest[part];
    if (!item || !FILE_NAME.test(item.file) || !/^[a-f0-9]{64}$/.test(item.sha256) || !(item.size > 0)) {
      throw new Error(`The update's ${part} entry is malformed`);
    }
  }
  return manifest;
};

// `feedUrl`: the releases page (https://github.com/<owner>/<repo>/releases); `version`/`shell`:
// what's running; `updatesDir`: where downloads, unpacked versions and pending.json live.
const createUpdater = ({ updatesDir, feedUrl, publicKey, version, shell, fetchImpl = fetch }) => {
  const state = { status: "idle", current: version, available: null, progress: null, apkPath: null, lastCheckAt: null, error: null };
  let running = null;
  let timer = null;

  const set = (changes) => Object.assign(state, changes);
  const dirs = {
    downloads: path.join(updatesDir, "downloads"),
    bundles: path.join(updatesDir, "bundles"),
    apk: path.join(updatesDir, "apk"),
  };

  const fetchText = async (url) => {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(FEED_TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) throw Object.assign(new Error(`${url}: ${res.status}`), { status: res.status });
    return res.text();
  };

  // Downloads a release file to `target`, checking its size and hash on the way.
  const download = async (manifest, item, target) => {
    if (fs.existsSync(target) && (await sha256OfFile(target)) === item.sha256) return target;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const partial = `${target}.partial`;
    const res = await fetchImpl(`${feedUrl}/download/v${manifest.version}/${item.file}`);
    if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status}`);
    const hash = crypto.createHash("sha256");
    let received = 0;
    set({ progress: { bytes: 0, total: item.size } });
    const counted = Readable.fromWeb(res.body).on("data", (chunk) => {
      received += chunk.length;
      if (received > item.size) counted.destroy(new Error("The download is bigger than the release says"));
      hash.update(chunk);
      state.progress.bytes = received;
    });
    await pipeline(counted, fs.createWriteStream(partial));
    if (received !== item.size || hash.digest("hex") !== item.sha256) {
      fs.rmSync(partial, { force: true });
      throw new Error("The download doesn't match the release (size or hash) — discarded");
    }
    fs.renameSync(partial, target);
    return target;
  };

  const prepareCode = async (manifest) => {
    const finalDir = path.join(dirs.bundles, manifest.version);
    if (!fs.existsSync(path.join(finalDir, "release.json"))) {
      set({ status: "downloading" });
      const pkg = await download(manifest, manifest.bundle, path.join(dirs.downloads, manifest.bundle.file));
      const partialDir = `${finalDir}.partial`;
      fs.rmSync(partialDir, { recursive: true, force: true });
      set({ status: "installing", progress: null });
      await readPackage(pkg, partialDir);
      const unpacked = JSON.parse(fs.readFileSync(path.join(partialDir, "release.json"), "utf8"));
      if (unpacked.version !== manifest.version || !fs.existsSync(path.join(partialDir, "device", "runtime.js"))) {
        fs.rmSync(partialDir, { recursive: true, force: true });
        throw new Error("The update package isn't the version it claims");
      }
      fs.rmSync(finalDir, { recursive: true, force: true });
      fs.renameSync(partialDir, finalDir);
      fs.rmSync(dirs.downloads, { recursive: true, force: true });
    }
    // Read by mobile/node/index.js at the next start.
    fs.writeFileSync(path.join(updatesDir, "pending.json"), JSON.stringify({ version: manifest.version }));
    set({ status: "ready", progress: null });
  };

  const prepareApp = async (manifest) => {
    set({ status: "downloading" });
    // Older downloaded APKs aren't needed once a newer one is here.
    if (fs.existsSync(dirs.apk)) for (const name of fs.readdirSync(dirs.apk)) if (name !== manifest.apk.file) fs.rmSync(path.join(dirs.apk, name), { force: true });
    const apkPath = await download(manifest, manifest.apk, path.join(dirs.apk, manifest.apk.file));
    set({ status: "app-ready", progress: null, apkPath });
  };

  const checkOnce = async () => {
    set({ status: "checking", error: null });
    try {
      const [text, signature] = await Promise.all([
        fetchText(`${feedUrl}/latest/download/update.json`),
        fetchText(`${feedUrl}/latest/download/update.json.sig`),
      ]);
      const manifest = verifiedManifest(text, signature, publicKey);
      set({ lastCheckAt: new Date().toISOString() });
      if (compareVersions(manifest.version, version) <= 0) return set({ status: "up-to-date", available: null });
      const kind = manifest.minShell > shell ? "app" : "code";
      set({ available: { version: manifest.version, kind, notes: typeof manifest.notes === "string" ? manifest.notes.slice(0, 500) : null } });
      if (kind === "app") await prepareApp(manifest);
      else await prepareCode(manifest);
    } catch (err) {
      // No release yet (404) is simply nothing to do.
      if (err.status === 404) return set({ status: "up-to-date", lastCheckAt: new Date().toISOString() });
      set({ status: "error", error: err.message, progress: null });
    }
    return state;
  };

  // One check at a time; a request during one waits for it.
  const check = () => {
    if (state.status === "ready" || state.status === "app-ready") return Promise.resolve(state);
    running ??= checkOnce().finally(() => (running = null));
    return running;
  };

  return {
    state: () => ({ ...state, progress: state.progress && { ...state.progress } }),
    check,
    start() {
      setTimeout(check, FIRST_CHECK_MS).unref?.();
      timer = setInterval(check, CHECK_EVERY_MS);
      timer.unref?.();
    },
    stop() {
      clearInterval(timer);
    },
  };
};

module.exports = { createUpdater, compareVersions, verifiedManifest };
