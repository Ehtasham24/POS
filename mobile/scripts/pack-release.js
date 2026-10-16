// Packs a release of the Android app into mobile/release/, the files a GitHub release carries
// (.github/workflows/release.yml uploads them) and the app's updater reads (device/updater.js):
//
//   pos-register-<v>.apk     the app itself (built by `npm run apk:release` beforehand)
//   pos-bundle-<v>.pkg.gz    just the code (www/nodejs: device runtime, backend, React build), for
//                            phones whose app can already run it
//   update.json              what this release is, and each file's size and SHA-256
//   update.json.sig          update.json's Ed25519 signature
//
// The signing key comes from OTA_SIGNING_KEY (PEM, in CI) or ~/.pos-release/ota-signing-key.pem;
// the app only accepts updates signed by it (the public key is in mobile/node/index.js).
//   node scripts/pack-release.js ["release notes"]
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { writePackage } = require("../../device/bundlePackage");

const MOBILE = path.join(__dirname, "..");
const NODE_DIR = path.join(MOBILE, "www", "nodejs");
const OUT = path.join(MOBILE, "release");

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const describe = (file) => ({ file: path.basename(file), sha256: sha256(file), size: fs.statSync(file).size });

(async () => {
  const release = JSON.parse(fs.readFileSync(path.join(NODE_DIR, "release.json"), "utf8"));
  const apkBuilt = path.join(MOBILE, "android", "app", "build", "outputs", "apk", "release", `pos-register-${release.version}.apk`);
  if (!fs.existsSync(apkBuilt)) throw new Error(`No release APK for ${release.version}: run npm run apk:release first`);

  const keyPem = process.env.OTA_SIGNING_KEY || fs.readFileSync(path.join(os.homedir(), ".pos-release", "ota-signing-key.pem"), "utf8");
  const privateKey = crypto.createPrivateKey(keyPem);

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const apk = path.join(OUT, path.basename(apkBuilt));
  fs.copyFileSync(apkBuilt, apk);

  // The code as the app runs it: *.gz.keep (a workaround for Android's asset packaging,
  // scripts/bundle-node.js) back to *.gz; the start-up file stays the installed app's own.
  const bundle = path.join(OUT, `pos-bundle-${release.version}.pkg.gz`);
  const packed = await writePackage(NODE_DIR, bundle, {
    skip: (rel) => rel === "index.js",
    rename: (rel) => (rel.endsWith(".gz.keep") ? rel.slice(0, -".keep".length) : rel),
  });

  const manifest = {
    version: release.version,
    // A phone takes the code alone only if its app is at least this shell level.
    minShell: release.shell,
    commit: release.commit,
    publishedAt: new Date().toISOString(),
    notes: process.argv[2] || null,
    bundle: describe(bundle),
    apk: { ...describe(apk), versionCode: release.version.split(".").reduce((n, part) => n * 100 + Number(part), 0) },
  };
  const text = JSON.stringify(manifest, null, 2);
  fs.writeFileSync(path.join(OUT, "update.json"), text);
  fs.writeFileSync(path.join(OUT, "update.json.sig"), crypto.sign(null, Buffer.from(text), privateKey).toString("base64"));

  const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
  console.log(`Release ${release.version} in ${path.relative(process.cwd(), OUT)}:`);
  console.log(`  ${manifest.apk.file}  ${mb(manifest.apk.size)}`);
  console.log(`  ${manifest.bundle.file}  ${mb(manifest.bundle.size)} (${packed.files} files, ${mb(packed.bytes)} unpacked)`);
  console.log("  update.json, update.json.sig");
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
