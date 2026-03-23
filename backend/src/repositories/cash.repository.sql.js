/**
 * Cassa / turni POS su MySQL — sessioni e transazioni.
 * Pool: getDbPool() (config da src/config/db.js).
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { getDbPool } = require("../config/dbPool");
const paths = require("../config/paths");
const tenantContext = require("../context/tenantContext");

let schemaReady = false;
let cashLogged = false;
let migrationAttempted = false;

function logCashOnce() {
  if (cashLogged) return;
  cashLogged = true;
  // eslint-disable-next-line no-console
  console.log("Cash → DB mode active");
}

function currentTenantId() {
  return tenantContext.getRestaurantId();
}

function createPublicId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `shift_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toIso(v) {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeString(v, fallback = "") {
  if (v == null) return fallback;
  return String(v).trim();
}

function rowToShift(row) {
  if (!row) return null;
  return {
    id: row.shift_public_id,
    opened_at: toIso(row.opened_at) || new Date().toISOString(),
    closed_at: row.closed_at ? toIso(row.closed_at) : null,
    operator: row.operator || "",
    opening_float: toNumber(row.opening_float, 0),
    cash_total: toNumber(row.cash_total, 0),
    card_total: toNumber(row.card_total, 0),
    other_total: toNumber(row.other_total, 0),
    status: normalizeString(row.status, "open"),
  };
}

async function ensureSchema(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS cash_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL,
      shift_public_id VARCHAR(64) NOT NULL,
      opened_at DATETIME NOT NULL,
      closed_at DATETIME NULL,
      opening_float DECIMAL(14,2) NOT NULL DEFAULT 0,
      closing_total DECIMAL(14,2) NULL,
      cash_total DECIMAL(14,2) NULL,
      card_total DECIMAL(14,2) NULL,
      other_total DECIMAL(14,2) NULL,
      operator VARCHAR(255) NULL,
      status VARCHAR(32) NOT NULL,
      UNIQUE KEY uq_tenant_shift (tenant_id, shift_public_id),
      KEY idx_tenant_status (tenant_id, status),
      KEY idx_tenant_opened (tenant_id, opened_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS cash_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL,
      session_id INT NOT NULL,
      order_id INT NULL,
      amount DECIMAL(14,2) NOT NULL,
      method VARCHAR(64) NOT NULL,
      type VARCHAR(32) NOT NULL,
      created_at DATETIME NOT NULL,
      UNIQUE KEY uq_tenant_order_sale (tenant_id, order_id, type),
      KEY idx_session (session_id),
      CONSTRAINT fk_cash_tx_session
        FOREIGN KEY (session_id) REFERENCES cash_sessions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function initSchema() {
  if (schemaReady) return;
  const pool = getDbPool();
  const conn = await pool.getConnection();
  try {
    await ensureSchema(conn);
  } finally {
    conn.release();
  }
  schemaReady = true;
}

async function ensureReady() {
  await initSchema();
  logCashOnce();
  if (!migrationAttempted) {
    migrationAttempted = true;
    try {
      await migrateFromPosShiftsJsonIfEmpty();
    } catch (e) {
      console.warn("[cash.sql] migrazione pos-shifts.json:", e.message);
    }
  }
}

async function migrateFromPosShiftsJsonIfEmpty() {
  const pool = getDbPool();
  const tenantId = currentTenantId();
  const [cnt] = await pool.query(
    "SELECT COUNT(*) AS c FROM cash_sessions WHERE tenant_id = ?",
    [tenantId]
  );
  if (Number(cnt[0].c) > 0) return;

  const fp = path.join(paths.DATA, "tenants", tenantId, "pos-shifts.json");
  if (!fs.existsSync(fp)) return;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return;
  }
  const shifts = Array.isArray(raw.shifts) ? raw.shifts : [];
  if (!shifts.length) return;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const s of shifts) {
      const shiftPublicId = String(s.id || createPublicId());
      const openedAt = s.opened_at ? new Date(s.opened_at) : new Date();
      const closedAt = s.closed_at ? new Date(s.closed_at) : null;
      const status = normalizeString(s.status, closedAt ? "closed" : "open");
      await conn.query(
        `INSERT INTO cash_sessions (tenant_id, shift_public_id, opened_at, closed_at, opening_float, closing_total,
            cash_total, card_total, other_total, operator, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          tenantId,
          shiftPublicId,
          openedAt,
          closedAt,
          toNumber(s.opening_float, 0),
          null,
          s.cash_total != null ? toNumber(s.cash_total, 0) : null,
          s.card_total != null ? toNumber(s.card_total, 0) : null,
          s.other_total != null ? toNumber(s.other_total, 0) : null,
          s.operator || "",
          status,
        ]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * Apertura sessione cassa (equivalente a createShift POS).
 */
async function openSession(openingFloat, operator, openedAt, shiftPublicId) {
  await ensureReady();
  const pool = getDbPool();
  const tenantId = currentTenantId();
  const sid = shiftPublicId || createPublicId();
  const opened = openedAt ? new Date(openedAt) : new Date();
  const op = operator != null ? String(operator) : "";

  const [r] = await pool.query(
    `INSERT INTO cash_sessions (tenant_id, shift_public_id, opened_at, closed_at, opening_float, status, operator)
     VALUES (?,?,?,?,?,?,?)`,
    [tenantId, sid, opened, null, toNumber(openingFloat, 0), "open", op]
  );
  const internalId = r.insertId;
  const [rows] = await pool.query(
    "SELECT * FROM cash_sessions WHERE tenant_id = ? AND id = ?",
    [tenantId, internalId]
  );
  return rows[0];
}

/**
 * Chiusura sessione (shift_public_id = id esposto al client).
 */
async function closeSession(shiftPublicId, { cash_total, card_total, other_total, closed_at }) {
  await ensureReady();
  const pool = getDbPool();
  const tenantId = currentTenantId();
  const closedAt = closed_at ? new Date(closed_at) : new Date();
  const c = toNumber(cash_total, 0);
  const card = toNumber(card_total, 0);
  const oth = toNumber(other_total, 0);
  const closing = c + card + oth;

  await pool.query(
    `UPDATE cash_sessions SET closed_at = ?, cash_total = ?, card_total = ?, other_total = ?,
            closing_total = ?, status = 'closed'
     WHERE tenant_id = ? AND shift_public_id = ?`,
    [closedAt, c, card, oth, closing, tenantId, String(shiftPublicId)]
  );

  const [rows] = await pool.query(
    "SELECT * FROM cash_sessions WHERE tenant_id = ? AND shift_public_id = ? LIMIT 1",
    [tenantId, String(shiftPublicId)]
  );
  return rows[0] || null;
}

async function getActiveSession() {
  await ensureReady();
  const pool = getDbPool();
  const tenantId = currentTenantId();
  const [rows] = await pool.query(
    "SELECT * FROM cash_sessions WHERE tenant_id = ? AND LOWER(status) = 'open' ORDER BY opened_at DESC LIMIT 1",
    [tenantId]
  );
  return rows[0] || null;
}

async function addTransaction(data) {
  await ensureReady();
  const pool = getDbPool();
  const tenantId = currentTenantId();
  const sessionId = Number(data.session_id);
  const orderId = data.order_id != null ? Number(data.order_id) : null;
  const amount = toNumber(data.amount, 0);
  const method = normalizeString(data.method, "cash");
  const type = normalizeString(data.type, "sale");
  const createdAt = data.created_at ? new Date(data.created_at) : new Date();

  try {
    await pool.query(
      `INSERT INTO cash_transactions (tenant_id, session_id, order_id, amount, method, type, created_at)
       VALUES (?,?,?,?,?,?,?)`,
      [tenantId, sessionId, orderId, amount, method, type, createdAt]
    );
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") return;
    throw err;
  }
}

async function getSessionTransactions(sessionId) {
  await ensureReady();
  const pool = getDbPool();
  const tenantId = currentTenantId();
  const [rows] = await pool.query(
    "SELECT * FROM cash_transactions WHERE tenant_id = ? AND session_id = ? ORDER BY id ASC",
    [tenantId, Number(sessionId)]
  );
  return rows;
}

function computeOrderTotal(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  let sum = 0;
  for (const it of items) {
    const qty = Number(it.qty) || 1;
    const price = it.price != null ? Number(it.price) : 0;
    sum += price * qty;
  }
  return Math.round(sum * 100) / 100;
}

/**
 * Dopo passaggio ordine a servito/chiuso: una sola transazione "sale" per ordine (idempotenza).
 */
async function recordSaleAfterOrderStatusIfNeeded(order) {
  const st = String(order.status || "").toLowerCase();
  if (st !== "servito" && st !== "chiuso") return;

  await ensureReady();
  const pool = getDbPool();
  const tenantId = currentTenantId();
  const session = await getActiveSession();
  if (!session) return;

  const oid = Number(order.id);
  if (!Number.isFinite(oid) || oid <= 0) return;

  const [dup] = await pool.query(
    "SELECT id FROM cash_transactions WHERE tenant_id = ? AND order_id = ? AND type = ? LIMIT 1",
    [tenantId, oid, "sale"]
  );
  if (dup.length) return;

  const amount = computeOrderTotal(order);
  await addTransaction({
    session_id: session.id,
    order_id: oid,
    amount,
    method: "cash",
    type: "sale",
  });
}

async function listSessionsByOpenedDate(dateStr) {
  await ensureReady();
  const pool = getDbPool();
  const tenantId = currentTenantId();
  const d = String(dateStr || "").slice(0, 10);
  const [rows] = await pool.query(
    `SELECT * FROM cash_sessions WHERE tenant_id = ? AND DATE(opened_at) = ? ORDER BY opened_at ASC`,
    [tenantId, d]
  );
  return rows;
}

async function getSessionByPublicId(shiftPublicId) {
  await ensureReady();
  const pool = getDbPool();
  const tenantId = currentTenantId();
  const [rows] = await pool.query(
    "SELECT * FROM cash_sessions WHERE tenant_id = ? AND shift_public_id = ? LIMIT 1",
    [tenantId, String(shiftPublicId)]
  );
  return rows[0] || null;
}

module.exports = {
  openSession,
  closeSession,
  getActiveSession,
  addTransaction,
  getSessionTransactions,
  recordSaleAfterOrderStatusIfNeeded,
  listSessionsByOpenedDate,
  getSessionByPublicId,
  rowToShift,
  ensureReady,
};
