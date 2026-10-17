// "Last active" (migration 037, ExpressBackend/utils/activity.js) and the register's sync pace
// (device/syncWorker.js). In the cloud: a request records the user as active on the web, a page's
// own background refresh doesn't. On a register: sign-ins and use are reported with the next sync
// (sent twice, they land once), and a change made there goes up within seconds, not at the next
// slow cycle. One register against a TEMPORARY cloud shop (removed at the end).
//
//   node scripts/activity-test.js     (the cloud backend must be running: POS_CLOUD_URL,
//                                      default https://localhost:4000)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // this script's own calls to a local cloud
const fs = require("fs");
const path = require("path");
const { signToken } = require("../../ExpressBackend/utils/auth");
const { systemPool: cloudDb } = require("../../ExpressBackend/Db");
const { stopDevice, login } = require("./harness");
const { CLOUD, sleep, cloudCall, removeCloudShop, openRegister, syncNow } = require("./cloudHarness");
const { nextDelay, FAST_MS, IDLE_MAX_MS } = require("../syncWorker");

const DATA = path.join(__dirname, "..", "data", "activity-test");

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "  OK  " : "  FAIL"} ${label}${ok ? "" : `  -> ${String(JSON.stringify(detail)).slice(0, 400)}`}`);
};
const activityOf = async (userId) => (await cloudDb.query(`SELECT last_active_at, device_id FROM user_activity WHERE user_id = $1`, [userId])).rows[0];
const loginsOf = async (userId) =>
  (await cloudDb.query(`SELECT device_id, created_at FROM login_events WHERE user_id = $1 AND outcome = 'success' ORDER BY id`, [userId])).rows;

(async () => {
  // --- The pace, on its own.
  check("A cycle that moved data keeps the fast pace", nextDelay(80000, { moved: true, inUse: false }) === FAST_MS, null);
  check("…so does someone using the register", nextDelay(80000, { moved: false, inUse: true }) === FAST_MS, null);
  check("A quiet cycle doubles the wait", nextDelay(FAST_MS, { moved: false, inUse: false }) === 2 * FAST_MS, null);
  check("…up to the idle limit", nextDelay(IDLE_MAX_MS, { moved: false, inUse: false }) === IDLE_MAX_MS, null);

  const [admin] = (await cloudDb.query(`SELECT id, display_name FROM users WHERE role = 'superadmin' LIMIT 1`)).rows;
  const adminToken = signToken({ id: admin.id, role: "superadmin", displayName: admin.display_name });
  const stamp = Date.now().toString(36);
  let shopId = null;
  let A = null;
  try {
    const owner = { username: `zz_act_${stamp}`, password: "Act-Owner-111" };
    const created = await cloudCall(adminToken, "POST", "/api/admin/shops", { name: `ZZ Activity ${stamp}`, tier: "advanced", ownerUsername: owner.username, ownerPassword: owner.password, maxUsers: 5 });
    shopId = created.body.shop.id;
    const ownerId = created.body.owner.id;
    const ownerToken = signToken({ id: ownerId, role: "owner", displayName: "Owner" });
    const cashier = (await cloudCall(ownerToken, "POST", "/api/users", { username: `zz_actc_${stamp}`, password: "Act-Cash-111", displayName: "Cashier", role: "cashier" })).body;

    // --- The web app.
    const cashierToken = signToken({ id: cashier.id, role: "cashier", displayName: "Cashier" });
    const background = await fetch(`${CLOUD}/api/shop/notices`, { headers: { cookie: `pos_session=${cashierToken}`, "x-pos-background": "1" } });
    check("A page's own background refresh works…", background.status === 200, background.status);
    check("…and doesn't count as the user being active", !(await activityOf(cashier.id)), await activityOf(cashier.id));
    await cloudCall(cashierToken, "GET", "/api/auth/me");
    let web; // written just after the request, without holding it up
    for (let i = 0; i < 20 && !web; i++) web = (await sleep(250), await activityOf(cashier.id));
    check("A request the user made records them active, on the web", web && web.device_id === null && Date.now() - new Date(web.last_active_at) < 60000, web);

    // --- A register: setting it up signs the owner in there.
    fs.rmSync(DATA, { recursive: true, force: true });
    A = await openRegister(DATA, "Activity Phone", 4198, owner);
    const deviceId = (await cloudDb.query(`SELECT id FROM devices WHERE shop_id = $1`, [shopId])).rows[0].id;
    const before = (await loginsOf(ownerId)).filter((l) => l.device_id === deviceId);
    await A.api("GET", "/api/auth/me");
    await syncNow(A);
    const logins = (await loginsOf(ownerId)).filter((l) => l.device_id === deviceId);
    check("The register's sign-in reaches the cloud's sign-in history, as that register's", before.length === 0 && logins.length === 1, { before, logins });
    const onRegister = await activityOf(ownerId);
    check("…and the owner shows active on that register", onRegister?.device_id === deviceId && Date.now() - new Date(onRegister.last_active_at) < 60000, onRegister);

    const again = await login(A.device.base, owner.username, owner.password);
    await again("GET", "/api/auth/me");
    await syncNow(A);
    await syncNow(A);
    check("A second sign-in there is reported once, the first not again", (await loginsOf(ownerId)).filter((l) => l.device_id === deviceId).length === 2, await loginsOf(ownerId));

    // --- A change made on the register goes up within seconds.
    await syncNow(A);
    await again("POST", "/categories", { category_name: `Fans ${stamp}` });
    await sleep(4000);
    const { rows: cats } = await cloudDb.query(`SELECT 1 FROM categories WHERE shop_id = $1 AND category_name = $2`, [shopId, `Fans ${stamp}`]);
    check("A change on the register reaches the cloud within seconds", cats.length === 1, cats);
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
