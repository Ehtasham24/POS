// Runs the Android project's Gradle wrapper with the JDK that ships with Android Studio (Capacitor 8
// needs Java 21), so building doesn't depend on whatever Java is on the PATH.
//   node scripts/gradle.js assembleDebug
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const candidates = [
  process.env.JAVA_HOME,
  "C:/Program Files/Android/Android Studio/jbr",
  "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
].filter(Boolean);
const javaHome = candidates.find((dir) => fs.existsSync(path.join(dir, "bin", process.platform === "win32" ? "java.exe" : "java")));
if (!javaHome) throw new Error("No Java 21 found: install Android Studio or set JAVA_HOME");

const androidDir = path.join(__dirname, "..", "android");
// By full path: some shells (NoDefaultCurrentDirectoryInExePath) don't look in the working directory.
const wrapper = path.join(androidDir, process.platform === "win32" ? "gradlew.bat" : "gradlew");
const result = spawnSync(`"${wrapper}"`, process.argv.slice(2), {
  cwd: androidDir,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, JAVA_HOME: javaHome },
});
process.exit(result.status ?? 1);
