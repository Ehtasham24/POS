const { pool } = require("../Db");

const getSettings = async () => {
  const result = await pool.query("SELECT key, value FROM settings");
  return result.rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
};

const updateSetting = async (key, value) => {
  const result = await pool.query(
    `INSERT INTO settings(key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
     RETURNING key, value`,
    [key, String(value)]
  );
  return result.rows[0];
};

module.exports = { getSettings, updateSetting };
