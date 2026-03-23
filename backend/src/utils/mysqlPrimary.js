/**
 * Modalità dati operativi su MySQL (Railway).
 * - MYSQL_DATA_PRIMARY=1|true → lettura/scrittura principale da tabelle / tenant_json_store
 * - MYSQL_JSON_MIRROR=1|true (default) → ogni scrittura SQL replica anche sui file JSON (backup)
 */
function truthy(v) {
  const s = String(v || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function isMysqlPrimary() {
  return truthy(process.env.MYSQL_DATA_PRIMARY);
}

function isJsonMirror() {
  if (process.env.MYSQL_JSON_MIRROR == null || process.env.MYSQL_JSON_MIRROR === "") return true;
  return truthy(process.env.MYSQL_JSON_MIRROR);
}

module.exports = { isMysqlPrimary, isJsonMirror, truthy };
