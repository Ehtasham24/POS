// Starts the Windows app (electron/main.js).
//
//   npm run app
//   npm run app -- --shop="Shop name:owner_username:owner_password"   (first run only)
//
// --shop creates that shop in an empty local database, as a stand-in for the first-run
// download from the cloud (phase 2). Launching through this script, rather than `electron .`
// directly, also clears ELECTRON_RUN_AS_NODE: VS Code sets it in its terminals, and it makes
// Electron run as plain Node, without a window.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const electron = require("electron");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
// Development: the local cloud backend (https://localhost:4000) uses an mkcert certificate.
// When the repo has that root (mkcert-rootCA.pem, never committed), the app trusts it, so
// device setup can reach the local cloud without switching certificate checks off.
const devRoot = path.join(__dirname, "..", "..", "mkcert-rootCA.pem");
if (!env.POS_CLOUD_URL && !env.NODE_EXTRA_CA_CERTS && fs.existsSync(devRoot)) env.NODE_EXTRA_CA_CERTS = devRoot;
const args = process.argv.slice(2);
const shop = args.find((a) => a.startsWith("--shop="));
if (shop) env.POS_DEV_SHOP = shop.slice("--shop=".length);

// Anything else (e.g. --remote-debugging-port=9222) goes to Electron.
const electronArgs = [path.join(__dirname, ".."), ...args.filter((a) => a !== shop)];
const app = spawn(electron, electronArgs, { env, stdio: "inherit" });
app.on("exit", (code) => process.exit(code ?? 0));
