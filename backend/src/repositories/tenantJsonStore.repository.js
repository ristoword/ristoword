/**
 * JSON per-tenant in MySQL (tabella tenant_json_store).
 * Usato dalla migrazione e da futuri repository (menu, bookings, …).
 */
const { getDbPool } = require("../config/dbPool");
const { ensureOperationalSchema } = require("../utils/ensureOperationalSchema");

async function get(tenantId, storeKey) {
  await ensureOperationalSchema();
  const pool = getDbPool();
  const [rows] = await pool.query(
    "SELECT payload FROM tenant_json_store WHERE tenant_id = ? AND store_key = ? LIMIT 1",
    [String(tenantId || "default"), String(storeKey)]
  );
  if (!rows.length) return null;
  const p = rows[0].payload;
  if (p == null) return null;
  return typeof p === "string" ? JSON.parse(p) : p;
}

async function set(tenantId, storeKey, payload) {
  await ensureOperationalSchema();
  const pool = getDbPool();
  const json = typeof payload === "string" ? payload : JSON.stringify(payload);
  await pool.query(
    `INSERT INTO tenant_json_store (tenant_id, store_key, payload)
     VALUES (?,?,CAST(? AS JSON))
     ON DUPLICATE KEY UPDATE payload = CAST(? AS JSON), updated_at = CURRENT_TIMESTAMP`,
    [String(tenantId || "default"), String(storeKey), json, json]
  );
}


module.exports = { get, set };
