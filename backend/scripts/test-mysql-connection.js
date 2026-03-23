/**
 * Test isolato: connessione MySQL + SELECT 1.
 * Usa la stessa getDbConfig() di backend/src/config/db.js
 */
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

const backendRoot = path.resolve(__dirname, "..");
const envPath = path.join(backendRoot, ".env");

if (!fs.existsSync(envPath)) {
  console.error("[test-mysql] File .env non trovato:", envPath);
  process.exit(1);
}

dotenv.config({ path: envPath });

const REQUIRED = [
  "MYSQLUSER",
  "MYSQLPASSWORD",
  "MYSQLDATABASE",
];
for (const key of REQUIRED) {
  const v = process.env[key];
  if (v == null || String(v).trim() === "") {
    console.error(`[test-mysql] Variabile mancante o vuota: ${key}`);
    process.exit(1);
  }
}

const isProduction = process.env.NODE_ENV === "production";
if (!isProduction) {
  for (const key of ["DB_HOST", "DB_PORT"]) {
    const v = process.env[key];
    if (v == null || String(v).trim() === "") {
      console.error(`[test-mysql] In locale serve anche: ${key}`);
      process.exit(1);
    }
  }
} else {
  for (const key of ["MYSQLHOST", "MYSQLPORT"]) {
    const v = process.env[key];
    if (v == null || String(v).trim() === "") {
      console.error(`[test-mysql] In produzione serve anche: ${key}`);
      process.exit(1);
    }
  }
}

async function main() {
  const { getDbConfig } = require("../src/config/db");
  const cfg = getDbConfig();
  const mysql = require("mysql2/promise");

  let conn;
  try {
    conn = await mysql.createConnection({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      connectTimeout: 20000,
    });

    const [rows] = await conn.execute("SELECT 1 AS ok");
    console.log("[test-mysql] Connessione OK");
    console.log("[test-mysql] SELECT 1:", JSON.stringify(rows));
  } catch (err) {
    const code = err.code || err.errno || err.name || "UNKNOWN";
    console.error("[test-mysql] Connessione fallita");
    console.error("[test-mysql] Codice:", code);
    console.error("[test-mysql] Messaggio:", err.message);
    process.exit(1);
  } finally {
    if (conn) {
      await conn.end().catch(() => {});
    }
  }
}

main();
