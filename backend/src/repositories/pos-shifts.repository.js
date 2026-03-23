// POS cash register shifts — persistenza MySQL (cash_sessions) via cash.repository.sql.js
const crypto = require("crypto");
const { getDbPool } = require("../config/dbPool");
const tenantContext = require("../context/tenantContext");
const cashSql = require("./cash.repository.sql");

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `shift_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeString(v, fallback = "") {
  if (v == null) return fallback;
  return String(v).trim();
}

async function getOpenShift() {
  const row = await cashSql.getActiveSession();
  return cashSql.rowToShift(row);
}

async function createShift(shiftData) {
  const row = await cashSql.openSession(
    toNumber(shiftData.opening_float, 0),
    normalizeString(shiftData.operator, ""),
    shiftData.opened_at || new Date().toISOString(),
    shiftData.id || createId()
  );
  return cashSql.rowToShift(row);
}

async function closeShift(id, updates) {
  const row = await cashSql.closeSession(id, {
    cash_total: updates.cash_total,
    card_total: updates.card_total,
    other_total: updates.other_total,
    closed_at: updates.closed_at,
  });
  return cashSql.rowToShift(row);
}

async function getShiftsByDate(dateStr) {
  const rows = await cashSql.listSessionsByOpenedDate(dateStr);
  return rows.map((r) => cashSql.rowToShift(r));
}

async function readShifts() {
  await cashSql.ensureReady();
  const pool = getDbPool();
  const tenantId = tenantContext.getRestaurantId();
  const [rows] = await pool.query(
    "SELECT * FROM cash_sessions WHERE tenant_id = ? ORDER BY opened_at DESC",
    [tenantId]
  );
  return rows.map((r) => cashSql.rowToShift(r));
}

async function writeShifts() {
  throw new Error("writeShifts non supportato in modalità DB cassa");
}

async function updateShift(id, updates) {
  await cashSql.ensureReady();
  const row = await cashSql.getSessionByPublicId(id);
  if (!row) return null;
  const pool = getDbPool();
  const tenantId = tenantContext.getRestaurantId();
  const openedAt = updates.opened_at != null ? new Date(updates.opened_at) : row.opened_at;
  let closedAt = row.closed_at;
  if (updates.closed_at !== undefined) {
    closedAt = updates.closed_at ? new Date(updates.closed_at) : null;
  }
  const openingFloat =
    updates.opening_float != null ? toNumber(updates.opening_float, 0) : row.opening_float;
  const operator = updates.operator !== undefined ? normalizeString(updates.operator, "") : row.operator;
  const cashTotal = updates.cash_total != null ? toNumber(updates.cash_total, 0) : row.cash_total;
  const cardTotal = updates.card_total != null ? toNumber(updates.card_total, 0) : row.card_total;
  const otherTotal = updates.other_total != null ? toNumber(updates.other_total, 0) : row.other_total;
  const status = updates.status != null ? normalizeString(updates.status, row.status) : row.status;

  await pool.query(
    `UPDATE cash_sessions SET opened_at=?, closed_at=?, opening_float=?, operator=?, cash_total=?, card_total=?, other_total=?, status=?
     WHERE tenant_id=? AND shift_public_id=?`,
    [
      openedAt,
      closedAt,
      openingFloat,
      operator,
      cashTotal,
      cardTotal,
      otherTotal,
      status,
      tenantId,
      String(id),
    ]
  );
  const next = await cashSql.getSessionByPublicId(id);
  return cashSql.rowToShift(next);
}

module.exports = {
  readShifts,
  writeShifts,
  getOpenShift,
  createShift,
  closeShift,
  getShiftsByDate,
  updateShift,
  toNumber,
  normalizeString,
};
