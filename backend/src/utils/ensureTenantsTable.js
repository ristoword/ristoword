/**
 * Tabella registry tenant (nome leggibile + id numerico stabile per header SaaS).
 *
 * NOTA Step 7: orders / inventory / recipes hanno GIÀ tenant_id VARCHAR(128) in schema
 * esistente; non va aggiunta una seconda colonna tenant_id INT su quelle tabelle.
 */
const { getDbPool } = require("../config/dbPool");

async function ensureTenantsTable() {
  const pool = getDbPool();
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await conn.query(
      `
      INSERT INTO tenants (id, name)
      VALUES (1, 'Baia Verde')
      ON DUPLICATE KEY UPDATE name = VALUES(name)
      `
    );
  } finally {
    conn.release();
  }
}

module.exports = { ensureTenantsTable };
