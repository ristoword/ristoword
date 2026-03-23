// Atomic writes and safe reads for JSON data files.
const fs = require("fs");
const path = require("path");
const paths = require("../config/paths");

/**
 * Safely read JSON file. Returns fallback on missing/corrupted.
 */
function safeReadJson(filePath, fallback = null) {
  const def = fallback !== undefined ? fallback : [];
  try {
    if (!fs.existsSync(filePath)) return def;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return def;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (err) {
    if (err.code === "ENOENT") return def;
    console.error(`[Ristoword] safeReadJson error ${filePath}:`, err.message);
    return def;
  }
}

/**
 * Se MYSQL_DATA_PRIMARY e path è data/tenants/{id}/{chiave}.json, replica su tenant_json_store.
 */
function mirrorTenantJsonToMysqlIfPrimary(filePath, data) {
  try {
    const { isMysqlPrimary } = require("./mysqlPrimary");
    if (!isMysqlPrimary()) return;
    const tenantsRoot = path.join(paths.DATA, "tenants");
    const norm = path.normalize(filePath);
    const normRoot = path.normalize(tenantsRoot);
    if (!norm.startsWith(normRoot)) return;
    const rel = path.relative(normRoot, norm);
    const parts = rel.split(path.sep).filter(Boolean);
    if (parts.length < 2) return;
    const tenantId = parts[0];
    const file = parts[parts.length - 1];
    if (!file.endsWith(".json")) return;
    const storeKey = file.replace(/\.json$/i, "");
    if (!paths.sanitizeTenantId(tenantId) || !storeKey) return;
    const tenantJsonStore = require("../repositories/tenantJsonStore.repository");
    setImmediate(() => {
      tenantJsonStore.set(tenantId, storeKey, data).catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[tenant_json_store] mirror write failed:", err && err.message ? err.message : err);
      });
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[tenant_json_store] mirror hook:", e && e.message ? e.message : e);
  }
}

/**
 * Atomic write: write to .tmp then rename. Fallback to direct write if rename fails.
 * @param {string} filePath
 * @param {*} data
 * @param {{ skipMysqlMirror?: boolean }} [opts] — usato da hydrateTenantFilesFromMysql per evitare round-trip inutile
 */
function atomicWriteJson(filePath, data, opts = {}) {
  const dir = path.dirname(filePath);
  const tmpPath = filePath + "." + Date.now() + ".tmp";
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (_) {}
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  }
  if (!opts.skipMysqlMirror) {
    mirrorTenantJsonToMysqlIfPrimary(filePath, data);
  }
}

module.exports = { safeReadJson, atomicWriteJson };
