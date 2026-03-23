/**
 * Registry licenze (codice → tenant numerico, stato, scadenza).
 * Coesiste con requireLicense.middleware (file JSON per tenant) senza sostituirlo.
 */
const { getDbPool } = require("../config/dbPool");

async function ensureLicensesTable() {
  const pool = getDbPool();
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS licenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        tenant_id INT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'inactive',
        expires_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await conn.query(
      `
      INSERT INTO licenses (code, tenant_id, status, expires_at)
      VALUES ('RISTO-TEST-001', 1, 'active', NULL)
      ON DUPLICATE KEY UPDATE status = 'active'
      `
    );
  } finally {
    conn.release();
  }
}

module.exports = { ensureLicensesTable };
