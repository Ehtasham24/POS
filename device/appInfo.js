// Which app this register is and which release it runs: shown on the Devices page, sent with
// registration, sync and support tickets. A release build sets POS_APP_VERSION (the Android app
// from its release.json, see mobile/node/index.js); otherwise it's device/package.json's.
const APP_VERSION = process.env.POS_APP_VERSION || require("./package.json").version;
const PLATFORM = process.platform === "android" ? "android" : "windows";

module.exports = { APP_VERSION, PLATFORM };
