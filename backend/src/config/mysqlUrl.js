/**
 * Parsing MYSQL_URL / DATABASE_URL (Railway) → opzioni mysql2.
 * Formato tipico: mysql://user:password@host:port/database
 */
function parseMysqlUrl(urlStr) {
  const raw = String(urlStr || "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (!["mysql:", "mysql2:"].includes(u.protocol)) return null;
    const database = (u.pathname || "").replace(/^\//, "").split("?")[0];
    if (!database) return null;
    const port = u.port ? Number(u.port) : 3306;
    return {
      host: u.hostname,
      port: Number.isFinite(port) && port > 0 ? port : 3306,
      user: decodeURIComponent(u.username || ""),
      password: decodeURIComponent(u.password || ""),
      database,
    };
  } catch {
    return null;
  }
}

module.exports = { parseMysqlUrl };
