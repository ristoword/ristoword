// Pool mysql2: usa backend/src/config/db.js (host proxy in locale, internal su Railway).
const { getDbConfig } = require("./db");

let pool = null;

function getDbPool() {
  if (pool) return pool;

  const cfg = getDbConfig();
  const { host, port, user, password, database } = cfg;

  if (!host || !user || database == null || String(database).trim() === "") {
    throw new Error(
      "MySQL: impostare MYSQLUSER, MYSQLDATABASE e (in locale) DB_HOST/DB_PORT oppure (su Railway) MYSQLHOST/MYSQLPORT."
    );
  }

  // eslint-disable-next-line global-require
  const mysql = require("mysql2/promise");
  pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    timezone: "Z",
  });

  return pool;
}

module.exports = { getDbPool };
