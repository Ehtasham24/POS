// Installs the debug build on the phone connected by USB (USB debugging on) and opens it.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk");
const adb = path.join(sdk, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb");
const apk = path.join(__dirname, "..", "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
if (!fs.existsSync(apk)) throw new Error(`No APK at ${apk}: run "npm run apk" first`);

const run = (...args) => execFileSync(adb, args, { stdio: "inherit" });
run("install", "-r", apk);
run("shell", "monkey", "-p", "pk.pos.register", "-c", "android.intent.category.LAUNCHER", "1");
