// The register's code update package (device/updater.js): a folder tree — the device runtime,
// the backend and the React build — as one gzip stream, read on the phone file by file without
// holding the whole package in memory. A format of its own rather than tar: only names and
// contents need to survive, and tar's limits (100-character names, extensions) don't apply.
//
//   "POSPKG1\n", then per file: u32 name length, name (UTF-8, "/"-separated), u64 size, bytes;
//   then a u32 zero.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const MAGIC = Buffer.from("POSPKG1\n");

// Writes every file under `dir` (except those `skip(relativePath)` excludes) into `outFile`.
// `rename(relativePath)` changes a name as it's stored. Resolves to { files, bytes }.
const writePackage = (dir, outFile, { skip = () => false, rename = (name) => name } = {}) =>
  new Promise((resolve, reject) => {
    const gzip = zlib.createGzip({ level: 9 });
    const out = fs.createWriteStream(outFile);
    gzip.pipe(out);
    out.on("finish", () => resolve(stats));
    out.on("error", reject);
    gzip.on("error", reject);
    const stats = { files: 0, bytes: 0 };
    const walk = (current) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const full = path.join(current, entry.name);
        const rel = path.relative(dir, full).split(path.sep).join("/");
        if (skip(rel)) continue;
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile()) {
          const name = Buffer.from(rename(rel));
          const data = fs.readFileSync(full);
          const head = Buffer.alloc(4 + name.length + 8);
          head.writeUInt32BE(name.length, 0);
          name.copy(head, 4);
          head.writeBigUInt64BE(BigInt(data.length), 4 + name.length);
          gzip.write(head);
          gzip.write(data);
          stats.files += 1;
          stats.bytes += data.length;
        }
      }
    };
    try {
      gzip.write(MAGIC);
      walk(dir);
      gzip.end(Buffer.alloc(4));
    } catch (err) {
      reject(err);
    }
  });

// Unpacks `file` into `targetDir` (which must not exist yet). A name that would land outside the
// target is refused, and so is a package cut short. Resolves to the number of files.
const readPackage = async (file, targetDir) => {
  fs.mkdirSync(targetDir, { recursive: true });
  const root = path.resolve(targetDir);
  let buffer = Buffer.alloc(0);
  let files = 0;
  let state = { step: "magic" };
  let output = null;
  let done = false;

  const take = (n) => {
    const part = buffer.subarray(0, n);
    buffer = buffer.subarray(n);
    return part;
  };

  for await (const chunk of fs.createReadStream(file).pipe(zlib.createGunzip())) {
    buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
    for (;;) {
      if (state.step === "magic") {
        if (buffer.length < MAGIC.length) break;
        if (!take(MAGIC.length).equals(MAGIC)) throw new Error("Not a register update package");
        state = { step: "nameLength" };
      } else if (state.step === "nameLength") {
        if (buffer.length < 4) break;
        const length = take(4).readUInt32BE(0);
        if (length === 0) {
          done = true;
          state = { step: "end" };
        } else state = { step: "name", length };
      } else if (state.step === "name") {
        if (buffer.length < state.length + 8) break;
        const name = take(state.length).toString("utf8");
        const size = Number(take(8).readBigUInt64BE(0));
        const target = path.resolve(root, name);
        if (!target.startsWith(root + path.sep)) throw new Error(`Refusing a file outside the update: ${name}`);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        output = fs.openSync(target, "w");
        state = { step: "data", left: size };
        files += 1;
      } else if (state.step === "data") {
        if (state.left > 0) {
          if (!buffer.length) break;
          const part = take(Math.min(state.left, buffer.length));
          fs.writeSync(output, part);
          state.left -= part.length;
        }
        if (state.left === 0) {
          fs.closeSync(output);
          output = null;
          state = { step: "nameLength" };
        } else break;
      } else break;
    }
  }
  if (output !== null) fs.closeSync(output);
  if (!done) throw new Error("The update package is incomplete");
  return files;
};

module.exports = { writePackage, readPackage };
