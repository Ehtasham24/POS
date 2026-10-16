// The register's self-update (device/updater.js) against a local stand-in for GitHub releases:
// a newer code-only release is downloaded, checked, unpacked and marked pending; one that needs a
// newer app downloads its APK instead; an unsigned or wrongly signed release, a download that
// doesn't match its hash, and a release no newer than the running one change nothing.
//
//   node scripts/updater-test.js
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { createUpdater, compareVersions } = require("../updater");
const { writePackage } = require("../bundlePackage");

const WORK = path.join(os.tmpdir(), `pos-updater-test-${process.pid}`);
let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "  OK  " : "  FAIL"} ${label}${ok ? "" : `  -> ${String(JSON.stringify(detail)).slice(0, 400)}`}`);
};

const keys = crypto.generateKeyPairSync("ed25519");
const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

// One release as the workflow publishes it: files by name, plus update.json and its signature.
const makeRelease = async (version, { minShell = 1, signWith = keys.privateKey, corruptBundle = false } = {}) => {
  const src = path.join(WORK, `src-${version}`);
  fs.mkdirSync(path.join(src, "device"), { recursive: true });
  fs.writeFileSync(path.join(src, "release.json"), JSON.stringify({ version, shell: minShell }));
  fs.writeFileSync(path.join(src, "device", "runtime.js"), `module.exports = "v${version}";`);
  fs.mkdirSync(path.join(src, "ExpressBackend", "deep", "er"), { recursive: true });
  fs.writeFileSync(path.join(src, "ExpressBackend", "deep", "er", "file.txt"), crypto.randomBytes(200000));
  const bundleFile = path.join(WORK, `pos-bundle-${version}.pkg.gz`);
  await writePackage(src, bundleFile);
  const bundle = fs.readFileSync(bundleFile);
  const apk = Buffer.from(`fake apk ${version}`);
  const manifest = {
    version,
    minShell,
    bundle: { file: `pos-bundle-${version}.pkg.gz`, sha256: sha256(bundle), size: bundle.length },
    apk: { file: `pos-register-${version}.apk`, sha256: sha256(apk), size: apk.length },
  };
  const text = JSON.stringify(manifest);
  return {
    version,
    files: {
      [manifest.bundle.file]: corruptBundle ? Buffer.concat([bundle.subarray(0, bundle.length - 10), Buffer.alloc(10)]) : bundle,
      [manifest.apk.file]: apk,
      "update.json": Buffer.from(text),
      "update.json.sig": Buffer.from(crypto.sign(null, Buffer.from(text), signWith).toString("base64")),
    },
  };
};

// GitHub's shapes: /latest/download/<file> and /download/v<version>/<file>.
let latest = null;
const releases = new Map();
const server = http.createServer((req, res) => {
  const m = /^\/releases\/(?:latest\/download|download\/v([\d.]+))\/([^/]+)$/.exec(req.url);
  const release = m && (m[1] ? releases.get(m[1]) : latest);
  const body = release?.files[m[2]];
  if (!body) return res.writeHead(404).end("Not Found");
  res.writeHead(200, { "content-length": body.length }).end(body);
});

const publish = (release) => {
  releases.set(release.version, release);
  latest = release;
};

(async () => {
  fs.mkdirSync(WORK, { recursive: true });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const feedUrl = `http://127.0.0.1:${server.address().port}/releases`;
  const updater = (name, version = "1.0.0", shell = 1) =>
    createUpdater({ updatesDir: path.join(WORK, name), feedUrl, publicKey, version, shell });
  try {
    check("Versions compare by number (1.10.0 > 1.9.3)", compareVersions("1.10.0", "1.9.3") > 0 && compareVersions("1.0.0", "1.0.0") === 0, null);

    const none = await updater("none").check();
    check("No release published yet: up to date, no error", none.status === "up-to-date" && !none.error, none);

    publish(await makeRelease("1.0.0"));
    const same = await updater("same").check();
    check("A release no newer than the running version: up to date", same.status === "up-to-date" && !same.available, same);

    publish(await makeRelease("1.1.0"));
    const u = updater("code");
    const code = await u.check();
    const dir = path.join(WORK, "code", "bundles", "1.1.0");
    check("A newer code release is downloaded and ready", code.status === "ready" && code.available.version === "1.1.0" && code.available.kind === "code", code);
    check("…unpacked beside the running code", require(path.join(dir, "device", "runtime.js")) === "v1.1.0" && fs.existsSync(path.join(dir, "ExpressBackend", "deep", "er", "file.txt")), null);
    check("…marked pending for the next start", JSON.parse(fs.readFileSync(path.join(WORK, "code", "pending.json"), "utf8")).version === "1.1.0", null);
    check("…and the download cleaned up", !fs.existsSync(path.join(WORK, "code", "downloads")), null);
    check("Checking again once ready changes nothing", (await u.check()).status === "ready", null);

    publish(await makeRelease("1.2.0", { minShell: 2 }));
    const app = await updater("app").check();
    check("A release needing a newer app downloads the APK instead", app.status === "app-ready" && app.available.kind === "app" && app.apkPath?.endsWith("pos-register-1.2.0.apk"), app);
    check("…the APK as published", fs.readFileSync(app.apkPath, "utf8") === "fake apk 1.2.0", null);
    check("…and no code bundle", !fs.existsSync(path.join(WORK, "app", "bundles")), null);
    check("An app already at that shell level takes the code instead", (await updater("shell2", "1.0.0", 2).check()).status === "ready", null);

    publish(await makeRelease("1.3.0", { signWith: crypto.generateKeyPairSync("ed25519").privateKey }));
    const forged = await updater("forged").check();
    check("A release signed with another key is ignored", forged.status === "error" && /signature/i.test(forged.error) && !fs.existsSync(path.join(WORK, "forged", "bundles")), forged);

    publish(await makeRelease("1.4.0", { corruptBundle: true }));
    const corrupt = await updater("corrupt").check();
    const leftovers = fs.existsSync(path.join(WORK, "corrupt", "downloads")) ? fs.readdirSync(path.join(WORK, "corrupt", "downloads")) : [];
    check("A download that doesn't match its hash is discarded", corrupt.status === "error" && /hash|size/i.test(corrupt.error) && leftovers.length === 0, { corrupt, leftovers });
    check("…and nothing is marked pending", !fs.existsSync(path.join(WORK, "corrupt", "pending.json")), null);

    const tampered = await makeRelease("1.5.0");
    tampered.files["update.json"] = Buffer.from(tampered.files["update.json"].toString().replace('"1.5.0"', '"1.6.0"'));
    publish(tampered);
    const changed = await updater("tampered").check();
    check("A manifest changed after signing is ignored", changed.status === "error" && /signature/i.test(changed.error), changed);
  } catch (err) {
    fail++;
    console.error("CRASH", err);
  } finally {
    server.close();
    fs.rmSync(WORK, { recursive: true, force: true });
    process.stdout.write(`\n${pass} passed, ${fail} failed\n`, () => process.exit(fail ? 1 : 0));
  }
})();
