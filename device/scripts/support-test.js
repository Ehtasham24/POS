// Support tickets from a register (device/readThrough.js): they live only in the cloud, so the
// register passes every request on — opening a ticket, the list, a picture's bytes — as the
// person signed in on it, adding its own report (sync state, its server's errors) when the
// person sends diagnostics; offline it says the internet is needed, without signing them out.
// One register against a TEMPORARY cloud shop (removed at the end).
//
//   node scripts/support-test.js     (the cloud backend must be running: POS_CLOUD_URL,
//                                     default https://localhost:4000)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // this script's own calls to a local cloud
const fs = require("fs");
const path = require("path");
const { signToken } = require("../../ExpressBackend/utils/auth");
const { systemPool: cloudDb } = require("../../ExpressBackend/Db");
const { stopDevice } = require("./harness");
const { CLOUD, createLine, cloudCall, removeCloudShop, openRegister, syncNow } = require("./cloudHarness");

const DATA = path.join(__dirname, "..", "data", "support-test");
// 1x1 PNG
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "  OK  " : "  FAIL"} ${label}${ok ? "" : `  -> ${String(JSON.stringify(detail)).slice(0, 400)}`}`);
};

(async () => {
  const [admin] = (await cloudDb.query(`SELECT id, display_name FROM users WHERE role = 'superadmin' LIMIT 1`)).rows;
  const adminToken = signToken({ id: admin.id, role: "superadmin", displayName: admin.display_name });
  const stamp = Date.now().toString(36);
  let shopId = null;
  let A = null;
  try {
    const owner = { username: `zz_supdev_${stamp}`, password: "Sup-Owner-1" };
    const created = await cloudCall(adminToken, "POST", "/api/admin/shops", { name: `ZZ Support Device ${stamp}`, tier: "advanced", ownerUsername: owner.username, ownerPassword: owner.password, maxUsers: 5 });
    shopId = created.body.shop.id;
    await cloudCall(adminToken, "PATCH", `/api/admin/shops/${shopId}`, { maxDevices: 1 });
    await cloudCall(signToken({ id: created.body.owner.id, role: "owner", displayName: "Owner" }), "POST", "/api/shifts", { openingFloat: 0 });

    fs.rmSync(DATA, { recursive: true, force: true });
    const cloudAddress = new URL(CLOUD);
    const line = createLine(4996, { host: cloudAddress.hostname, port: Number(cloudAddress.port) || 443 });
    await line.connect();
    A = await openRegister(DATA, "Counter PC", 4198, owner, line.url);
    await syncNow(A);

    const opened = await A.api("POST", "/api/support/tickets", {
      kind: "bug",
      title: "Drawer doesn't open",
      body: "The cash drawer stays shut after a sale.",
      attachments: [{ data: PNG }],
      context: { page: "/", platform: "windows", appVersion: "0.0.1" },
      diagnostics: { capturedAt: new Date().toISOString(), entries: [{ t: new Date().toISOString(), type: "nav", path: "/" }] },
    });
    check("A register opens a ticket (it lands in the cloud)", opened.status === 201 && opened.body.id, opened.body);
    const { rows } = await cloudDb.query(`SELECT shop_id, opened_by, context, diagnostics FROM support_tickets WHERE id = $1`, [opened.body.id]);
    const [{ id: cloudOwnerId }] = (await cloudDb.query(`SELECT id FROM users WHERE username = $1`, [owner.username])).rows;
    check("…for the register's shop, as the person signed in on it", rows[0]?.shop_id === shopId && rows[0].opened_by === cloudOwnerId && rows[0].context.platform === "windows", rows[0]);
    const report = rows[0]?.diagnostics?.device;
    check("The register added its own report: name, prefix, sync state, its server errors", report?.receiptPrefix === "P1" && report.sync && Array.isArray(report.serverErrors) && rows[0].diagnostics.client.entries.length === 1, rows[0]?.diagnostics);
    const plain = await A.api("POST", "/api/support/tickets", { kind: "feature", title: "Bigger buttons", body: "Please." });
    const { rows: plainRows } = await cloudDb.query(`SELECT diagnostics FROM support_tickets WHERE id = $1`, [plain.body.id]);
    check("Without diagnostics, the register adds nothing either", plain.status === 201 && plainRows[0].diagnostics === null, plainRows[0]);

    const list = await A.api("GET", "/api/support/tickets");
    check("The register lists them", list.status === 200 && list.body.length === 2, list.body);
    const detail = await A.api("GET", `/api/support/tickets/${opened.body.id}`);
    const attachmentId = detail.body.events?.[0]?.attachments?.[0]?.id;
    check("…and opens it, picture included", detail.status === 200 && attachmentId, detail.body);
    const picture = await fetch(`${A.device.base}/api/support/attachments/${attachmentId}`, { headers: { cookie: (await loginCookie(A, owner)) } });
    const bytes = Buffer.from(await picture.arrayBuffer());
    check("The picture comes through as PNG bytes", picture.status === 200 && picture.headers.get("content-type") === "image/png" && bytes[1] === 0x50, { status: picture.status, type: picture.headers.get("content-type") });

    await cloudCall(adminToken, "PATCH", `/api/admin/support/tickets/${opened.body.id}/status`, { status: "in_review" });
    const unread = await A.api("GET", "/api/support/unread");
    check("The admin's status change shows as new on the register", unread.status === 200 && unread.body.count === 1, unread.body);
    const after = await A.api("GET", `/api/support/tickets/${opened.body.id}`);
    check("…and the register sees the new status", after.body.status === "in_review", after.body.status);

    await line.cut();
    const offline = await A.api("GET", "/api/support/tickets");
    check("Offline: 503 saying it needs the internet (not a sign-out)", offline.status === 503 && offline.body.code === "NEEDS_CLOUD", offline);
    const stillSignedIn = await A.api("GET", "/api/auth/me");
    check("…and the person is still signed in on the register", stillSignedIn.status === 200, stillSignedIn.status);
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

// The register's session cookie, for a raw fetch (the harness client parses JSON only).
async function loginCookie(register, owner) {
  const res = await fetch(`${register.device.base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: owner.username, password: owner.password }),
  });
  return (res.headers.get("set-cookie") || "").split(";")[0];
}
