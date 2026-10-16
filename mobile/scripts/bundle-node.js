// Lays out the Node.js project the Android app runs (www/nodejs/, capacitor-nodejs's nodeDir):
// the device runtime, the backend and the React build, in the same folders as in the repository
// so their relative paths (../ExpressBackend, ../clientSide/client-side/build) hold. Ships the
// same things the Windows installer does (device/package.json "build"): never the backend's
// .env files, certificates, scripts or cloud migrations.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(__dirname, "..", "www", "nodejs");

const copy = (from, to, skip = () => false) =>
  fs.cpSync(path.join(ROOT, from), path.join(OUT, to ?? from), {
    recursive: true,
    filter: (src) => !skip(path.relative(path.join(ROOT, from), src).replace(/\\/g, "/")),
  });

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// The device runtime: its own code, local migrations and schema, and PGlite (not Electron).
copy("device", "device", (rel) => /^(node_modules|data|dist|scripts|electron)(\/|$)/.test(rel));
copy("device/node_modules/@electric-sql", "device/node_modules/@electric-sql");

copy("ExpressBackend", "ExpressBackend", (rel) =>
  /^(node_modules|certs|scripts|migrations)(\/|$)/.test(rel) || /(^|\/)([^/]*\.env|\.env)$/.test(rel)
);
copy("ExpressBackend/node_modules", "ExpressBackend/node_modules");

// The app's pages; source maps only add size.
copy("clientSide/client-side/build", "clientSide/client-side/build", (rel) => rel.endsWith(".map"));

fs.copyFileSync(path.join(__dirname, "..", "node", "index.js"), path.join(OUT, "index.js"));

// What this build is, read by node/index.js (and by Gradle for the APK's version):
//   version   the release (a tag v1.2.3 in CI sets POS_VERSION=1.2.3; else mobile/package.json's)
//   shell     the native app's compatibility level (mobile/package.json "posShell"): raised
//             whenever the APK itself changes — plugins, permissions, Java code — so an update
//             to the code alone is only taken by an APK that can run it
//   cloudUrl  the shop's cloud server (POS_CLOUD_URL, else mobile/package.json "posCloudUrl")
//   updateFeed  the GitHub releases the app updates itself from (mobile/package.json
//             "posUpdateFeed"; device/updater.js)
const pkg = require("../package.json");
const version = process.env.POS_VERSION || pkg.version;
if (!/^\d{1,2}\.\d{1,2}\.\d{1,2}$/.test(version)) throw new Error(`Version must look like 1.2.3 (each part 0-99), got "${version}"`);
const release = {
  version,
  shell: pkg.posShell,
  cloudUrl: process.env.POS_CLOUD_URL || pkg.posCloudUrl,
  updateFeed: pkg.posUpdateFeed,
  commit: process.env.GITHUB_SHA || null,
  builtAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(OUT, "release.json"), JSON.stringify(release, null, 2));

// Android's build unpacks every *.gz asset and drops the ".gz" (PGlite's extension bundles,
// pg_trgm.tar.gz and the like, would arrive as plain .tar, which PGlite can't load). So they
// travel as *.gz.keep, and node/index.js names them back before the backend starts.
const GZ_SUFFIX = ".keep";
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
for (const file of walk(OUT).filter((f) => f.endsWith(".gz"))) fs.renameSync(file, file + GZ_SUFFIX);

// Nothing secret may ride along: fail the build rather than ship it.
const files = walk(OUT);
const leaked = files.filter((f) => /Development\.env$|\.env$|[\\/]certs[\\/]|\.pem$|\.key$/.test(f) && !/node_modules/.test(f));
if (leaked.length) throw new Error(`Refusing to bundle secrets:\n${leaked.join("\n")}`);
const bytes = files.reduce((n, f) => n + fs.statSync(f).size, 0);
console.log(`Bundled ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB, into ${path.relative(process.cwd(), OUT)} (v${version}, shell ${release.shell}, ${release.cloudUrl})`);
