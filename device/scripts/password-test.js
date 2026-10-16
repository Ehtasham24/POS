// Changing a password, in the cloud and from a register (device/readThrough.js passes it on, then
// pulls the new hash back down): the current password is checked, the new one works everywhere
// at once — offline sign-in on the register included — and the old one stops working. The
// must-change flag from an admin-issued temporary password clears the same way. Offline, a
// change says it needs the internet. One register against a TEMPORARY cloud shop (removed at
// the end).
//
//   node scripts/password-test.js     (the cloud backend must be running: POS_CLOUD_URL,
//                                      default https://localhost:4000)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // this script's own calls to a local cloud
const fs = require("fs");
const path = require("path");
const { signToken } = require("../../ExpressBackend/utils/auth");
const { systemPool: cloudDb } = require("../../ExpressBackend/Db");
const { stopDevice, login } = require("./harness");
const { CLOUD, createLine, cloudCall, removeCloudShop, openRegister, syncNow } = require("./cloudHarness");

const DATA = path.join(__dirname, "..", "data", "password-test");

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "  OK  " : "  FAIL"} ${label}${ok ? "" : `  -> ${String(JSON.stringify(detail)).slice(0, 400)}`}`);
};
const signsIn = async (base, username, password) => {
  const res = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
  return res.status === 200;
};

(async () => {
  const [admin] = (await cloudDb.query(`SELECT id, display_name FROM users WHERE role = 'superadmin' LIMIT 1`)).rows;
  const adminToken = signToken({ id: admin.id, role: "superadmin", displayName: admin.display_name });
  const stamp = Date.now().toString(36);
  let shopId = null;
  let A = null;
  try {
    const owner = { username: `zz_pwdev_${stamp}`, password: "Pw-Owner-111" };
    const created = await cloudCall(adminToken, "POST", "/api/admin/shops", { name: `ZZ Password ${stamp}`, tier: "advanced", ownerUsername: owner.username, ownerPassword: owner.password, maxUsers: 5 });
    shopId = created.body.shop.id;
    const ownerToken = signToken({ id: created.body.owner.id, role: "owner", displayName: "Owner" });

    // --- In the cloud (the web app).
    check("A wrong current password is refused", (await cloudCall(ownerToken, "PATCH", "/api/auth/password", { currentPassword: "nope", newPassword: "Whatever-123" })).status === 400, null);
    check("A new password under 8 characters is refused", (await cloudCall(ownerToken, "PATCH", "/api/auth/password", { currentPassword: owner.password, newPassword: "short" })).status === 400, null);
    check("The same password again is refused", (await cloudCall(ownerToken, "PATCH", "/api/auth/password", { currentPassword: owner.password, newPassword: owner.password })).status === 400, null);
    check("Setting a password without the current one is refused when none is required", (await cloudCall(ownerToken, "PATCH", "/api/auth/set-new-password", { newPassword: "Taken-Over-123" })).status === 400, null);
    check("Not signed in: 401",(await fetch(`${CLOUD}/api/auth/password`, { method: "PATCH" })).status === 401, null);

    // --- From a register.
    fs.rmSync(DATA, { recursive: true, force: true });
    const cloudAddress = new URL(CLOUD);
    const line = createLine(4995, { host: cloudAddress.hostname, port: Number(cloudAddress.port) || 443 });
    await line.connect();
    A = await openRegister(DATA, "Owner Phone", 4199, owner, line.url);
    await syncNow(A);

    const changed = await A.api("PATCH", "/api/auth/password", { currentPassword: owner.password, newPassword: "Pw-Changed-222" });
    check("The owner changes their password on the register", changed.status === 204, changed);
    check("…the cloud has it: the new one signs in there", await signsIn(CLOUD, owner.username, "Pw-Changed-222"), null);
    check("…and the old one doesn't", !(await signsIn(CLOUD, owner.username, owner.password)), null);
    check("The register has it at once: the new one signs in here", await signsIn(A.device.base, owner.username, "Pw-Changed-222"), null);
    check("…and the old one doesn't", !(await signsIn(A.device.base, owner.username, owner.password)), null);
    const wrong = await A.api("PATCH", "/api/auth/password", { currentPassword: "nope", newPassword: "Whatever-123" });
    check("A wrong current password from the register comes back as the cloud's 400", wrong.status === 400 && /current password/i.test(wrong.body.message), wrong);

    // An admin-issued temporary password: must change it at the next sign-in.
    await cloudDb.query(`UPDATE users SET must_change_password = true WHERE username = $1`, [owner.username]);
    await syncNow(A);
    const api = await login(A.device.base, owner.username, "Pw-Changed-222");
    check("The register knows a new password is required", (await api("GET", "/api/auth/me")).body.mustChangePassword === true, null);
    const set = await api("PATCH", "/api/auth/set-new-password", { newPassword: "Pw-Chosen-333" });
    check("Setting it on the register works", set.status === 204, set);
    check("…and the register's own record clears the flag at once (no redirect loop)", (await api("GET", "/api/auth/me")).body.mustChangePassword === false, null);
    check("…and the chosen one signs in on both", (await signsIn(CLOUD, owner.username, "Pw-Chosen-333")) && (await signsIn(A.device.base, owner.username, "Pw-Chosen-333")), null);

    // Offline.
    await line.cut();
    const offline = await api("PATCH", "/api/auth/password", { currentPassword: "Pw-Chosen-333", newPassword: "Pw-Offline-444" });
    check("Offline: a change says it needs the internet", offline.status === 503 && offline.body.code === "NEEDS_CLOUD", offline);
    check("…and the person is still signed in", (await api("GET", "/api/auth/me")).status === 200, null);
    check("Offline sign-in uses the latest password", await signsIn(A.device.base, owner.username, "Pw-Chosen-333"), null);
  } catch (err) {
    fail++;
    console.error("CRASH", err);
  } finally {
    if (A) await stopDevice(A.device.child).catch(() => {});
    if (shopId) await removeCloudShop(shopId);
    fs.rmSync(DATA, { recursive: true, force: true });
    await cloudDb.end();
    process.stdout.write(`\n${pass} passed, ${fail} failed\n`, () => process.exit(fail ? 1 : 0));
  }
})();
