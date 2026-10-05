// capacitor-nodejs copies the whole Node.js project out of the APK on every launch (only
// deleting the old copy after an update), which took ~11s per start for ours. This changes it
// to copy only after an install or update, or when the copy is missing — saving the update time
// only once a copy succeeded, so a launch killed mid-copy copies again. Runs after npm install;
// fails loudly if the plugin's code no longer looks as expected (a new version may fix or move it).
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "node_modules", "capacitor-nodejs", "android", "src", "main", "java", "net", "hampoelz", "capacitor", "nodejs", "CapacitorNodeJS.java");
const MARK = "// Copied only after an install or update";
const raw = fs.readFileSync(file, "utf8");
if (raw.includes(MARK)) process.exit(0);

const nl = raw.includes("\r\n") ? "\r\n" : "\n";
const source = raw.replace(/\r\n/g, "\n");
const before = `        boolean success = true;
        if (FileOperations.ExistsPath(projectPath) && isAppUpdated()) {
            success = FileOperations.DeleteDir(projectPath);
        }
        success &= FileOperations.CopyAssetDir(assetManager, nodeAssetDir, projectPath);

        if (FileOperations.ExistsPath(modulesPath) && isAppUpdated()) {
            success = FileOperations.DeleteDir(modulesPath);
        }
        success &= FileOperations.CopyAssetDir(assetManager, modulesAssetDir, modulesPath);

        saveAppUpdateTime();
        return success;`;
const after = `        ${MARK} (or if missing), not on every start: copying a
        // few thousand files took ~11s per launch. The update time is saved only once the copy
        // succeeded, so a launch killed mid-copy copies again next time. (mobile/scripts/patch-plugin.js)
        final boolean updated = isAppUpdated();
        boolean success = true;
        if (updated || !FileOperations.ExistsPath(projectPath)) {
            if (FileOperations.ExistsPath(projectPath)) {
                success = FileOperations.DeleteDir(projectPath);
            }
            success &= FileOperations.CopyAssetDir(assetManager, nodeAssetDir, projectPath);
        }

        if (updated || !FileOperations.ExistsPath(modulesPath)) {
            if (FileOperations.ExistsPath(modulesPath)) {
                success &= FileOperations.DeleteDir(modulesPath);
            }
            success &= FileOperations.CopyAssetDir(assetManager, modulesAssetDir, modulesPath);
        }

        if (success) {
            saveAppUpdateTime();
        }
        return success;`;
if (!source.includes(before)) throw new Error(`capacitor-nodejs changed: ${file} no longer has the copy code this patches`);
fs.writeFileSync(file, source.replace(before, after).replace(/\n/g, nl));
console.log("Patched capacitor-nodejs: copies its Node.js project only after an install or update");
