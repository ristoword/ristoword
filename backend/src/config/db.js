// Config connessione MySQL: Railway internal in produzione, proxy pubblico in locale.
// Opzionale: MYSQL_URL o DATABASE_URL (mysql://user:pass@host:port/db) sovrascrive host/port/user/password/database.
const { loadEnv } = require("./loadEnv");
const { parseMysqlUrl } = require("./mysqlUrl");

let modeLogged = false;

function getDbConfig() {
  loadEnv();

  const isProduction = process.env.NODE_ENV === "production";
  const urlStr = process.env.MYSQL_URL || process.env.DATABASE_URL;
  const fromUrl = parseMysqlUrl(urlStr);

  const dbConfig = fromUrl
    ? {
        host: fromUrl.host,
        port: fromUrl.port,
        user: fromUrl.user,
        password: fromUrl.password,
        database: fromUrl.database,
      }
    : {
        host: isProduction ? process.env.MYSQLHOST : process.env.DB_HOST,
        port: isProduction ? process.env.MYSQLPORT : process.env.DB_PORT,
        user: process.env.MYSQLUSER,
        password:
          process.env.MYSQLPASSWORD != null ? String(process.env.MYSQLPASSWORD) : "",
        database: process.env.MYSQLDATABASE,
      };

  const portNum = Number(dbConfig.port);
  dbConfig.port = Number.isFinite(portNum) && portNum > 0
    ? portNum
    : isProduction
      ? 3306
      : 24677;

  if (!modeLogged) {
    modeLogged = true;
    // eslint-disable-next-line no-console
    console.log(
      "DB MODE:",
      fromUrl ? "MYSQL_URL" : isProduction ? "RAILWAY INTERNAL" : "LOCAL PROXY"
    );
  }

  return dbConfig;
}

/**
 * Esegue una query sul pool MySQL (stessa connessione di ordini/cassa).
 * Lazy-require di dbPool per evitare dipendenze circolari con db.js.
 */
async function query(sql, params) {
  const { getDbPool } = require("./dbPool");
  const pool = getDbPool();
  return pool.query(sql, params);
}

module.exports = { getDbConfig, query };
