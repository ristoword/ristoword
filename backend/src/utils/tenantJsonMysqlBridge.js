/**
 * Con MYSQL_DATA_PRIMARY=1: all'avvio copia tenant_json_store → file sotto data/tenants/
 * così i repository sync (menu, inventory, …) leggono sempre i JSON locali aggiornati dal DB.
 * Le scritture verso quei file passano da atomicWriteJson che rimanda il payload su MySQL.
 */
const fs = require("fs");
const path = require("path");
const paths = require("../config/paths");
const { ensureOperationalSchema } = require("./ensureOperationalSchema");
const { getDbPool } = require("../config/dbPool");
const { atomicWriteJson } = require("./safeFileIO");

async function hydrateTenantFilesFromMysql() {
  await ensureOperationalSchema();
  const pool = getDbPool();
  const [rows] = await pool.query(
    "SELECT tenant_id, store_key, payload FROM tenant_json_store ORDER BY tenant_id, store_key"
  );
  let n = 0;
  for (const row of rows) {
    const tid = paths.sanitizeTenantId(row.tenant_id);
    const key = String(row.store_key || "").trim();
    if (!tid || !key) continue;

    let payload = row.payload;
    if (payload == null) continue;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        continue;
      }
    }

    const dest = paths.tenant(tid, `${key}.json`);
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    atomicWriteJson(dest, payload, { skipMysqlMirror: true });
    n += 1;
  }
  if (n > 0) {
    // eslint-disable-next-line no-console
    console.log("[mysql] tenant JSON files hydrated from DB:", n);
  }
  return n;
}

module.exports = { hydrateTenantFilesFromMysql };
