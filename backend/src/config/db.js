// Config connessione MySQL: Railway internal in produzione, proxy pubblico in locale.
const { loadEnv } = require("./loadEnv");

let modeLogged = false;

function getDbConfig() {
  loadEnv();

  const isProduction = process.env.NODE_ENV === "production";

  const dbConfig = {
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
    console.log("DB MODE:", isProduction ? "RAILWAY INTERNAL" : "LOCAL PROXY");
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
