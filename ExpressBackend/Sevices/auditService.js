const { pool } = require("../Db");
const { parsePaging, pagedResult } = require("../utils/pagination");

// The admin console's audit trail (migration 031): every change a platform admin makes to a
// shop, a user, billing or platform settings — who, what, when, and the before/after.
//
// Written after the change has succeeded, and best-effort: a failed audit write is logged
// but never turns an action that already happened into an error response (the admin would
// retry something that was in fact done).
const recordAudit = async (adminUserId, action, { shopId = null, details = {} } = {}) => {
  try {
    await pool.query(
      `INSERT INTO admin_audit_log (admin_user_id, action, shop_id, details) VALUES ($1, $2, $3, $4)`,
      [adminUserId, action, shopId, details]
    );
  } catch (err) {
    console.error(`Audit log write failed (${action}):`, err);
  }
};

const listAudit = async ({ shopId, action, ...paging } = {}) => {
  const { page, pageSize, offset } = parsePaging(paging);
  const conditions = [];
  const params = [];
  if (shopId) {
    params.push(Number(shopId));
    conditions.push(`a.shop_id = $${params.length}`);
  }
  if (action) {
    // "shop." matches every shop action, "shop.tier" just that one.
    params.push(`${action}%`);
    conditions.push(`a.action LIKE $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(pageSize, offset);
  const { rows } = await pool.query(
    `SELECT a.id, a.action, a.shop_id, s.name AS shop_name, a.details, a.created_at,
            u.display_name AS admin_name, COUNT(*) OVER () AS total_count
     FROM admin_audit_log a
     LEFT JOIN shops s ON s.id = a.shop_id
     LEFT JOIN users u ON u.id = a.admin_user_id
     ${where}
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return pagedResult(rows, { page, pageSize });
};

module.exports = { recordAudit, listAudit };
