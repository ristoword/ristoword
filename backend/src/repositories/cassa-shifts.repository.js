// backend/src/repositories/cassa-shifts.repository.js
// Cash register (cassa) shifts – tenant-aware, uses data/tenants/{tenantId}/cassa-shifts.json

const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const paths = require("../config/paths");
const tenantContext = require("../context/tenantContext");

function getDataDir() {
  return path.join(paths.DATA, "tenants", tenantContext.getRestaurantId());
}

function getCassaShiftsFilePath() {
  return paths.tenantDataPath(tenantContext.getRestaurantId(), "cassa-shifts.json");
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `cs_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeString(v, fallback = "") {
  if (v == null) return fallback;
  return String(v).trim();
}

async function ensureFile() {
  const CASSA_SHIFTS_FILE = getCassaShiftsFilePath();
  const legacyPath = paths.legacy("cassa-shifts.json");

  await fsp.mkdir(getDataDir(), { recursive: true });
  if (!fs.existsSync(CASSA_SHIFTS_FILE)) {
    if (fs.existsSync(legacyPath)) {
      await fsp.copyFile(legacyPath, CASSA_SHIFTS_FILE);
    } else {
      await fsp.writeFile(CASSA_SHIFTS_FILE, JSON.stringify({ shifts: [] }, null, 2), "utf8");
    }
    return;
  }
  const raw = await fsp.readFile(CASSA_SHIFTS_FILE, "utf8");
  if (!raw.trim()) {
    await fsp.writeFile(CASSA_SHIFTS_FILE, JSON.stringify({ shifts: [] }, null, 2), "utf8");
  }
}

async function readAll() {
  await ensureFile();
  const raw = await fsp.readFile(CASSA_SHIFTS_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    const shifts = Array.isArray(parsed.shifts) ? parsed.shifts : [];
    return shifts;
  } catch (err) {
    throw new Error("cassa-shifts.json non valido");
  }
}

async function writeAll(shifts) {
  await ensureFile();
  const data = { shifts: Array.isArray(shifts) ? shifts : [] };
  await fsp.writeFile(getCassaShiftsFilePath(), JSON.stringify(data, null, 2), "utf8");
}

function getNextNumericId(shifts) {
  const ids = shifts.map((s) => Number(s.id)).filter((n) => Number.isFinite(n));
  if (ids.length === 0) return 1;
  return Math.max(...ids) + 1;
}

async function create(shiftData) {
  const shifts = await readAll();
  const id = getNextNumericId(shifts);
  const shift = {
    id,
    shift_id: id,
    opened_at: shiftData.opened_at || new Date().toISOString(),
    closed_at: shiftData.closed_at || null,
    opening_float: toNumber(shiftData.opening_float, 0),
    cash_total: toNumber(shiftData.cash_total, 0),
    card_total: toNumber(shiftData.card_total, 0),
    other_total: toNumber(shiftData.other_total, 0),
    status: normalizeString(shiftData.status, "open"),
  };
  shifts.push(shift);
  await writeAll(shifts);
  return shift;
}

async function update(id, updates) {
  const shifts = await readAll();
  const index = shifts.findIndex((s) => String(s.id) === String(id) || s.shift_id === id);
  if (index === -1) return null;

  const current = shifts[index];
  const next = {
    ...current,
    ...updates,
    id: current.id,
    shift_id: current.shift_id ?? current.id,
  };
  shifts[index] = next;
  await writeAll(shifts);
  return next;
}

async function getOpenShift() {
  const shifts = await readAll();
  return shifts.find((s) => String(s.status || "").toLowerCase() === "open") || null;
}

async function getById(id) {
  const shifts = await readAll();
  return shifts.find((s) => String(s.id) === String(id) || s.shift_id === id) || null;
}

async function getShiftsByDate(dateStr) {
  const shifts = await readAll();
  const target = String(dateStr || "").slice(0, 10);
  return shifts.filter((s) => {
    const opened = (s.opened_at || "").slice(0, 10);
    return opened === target;
  });
}

module.exports = {
  CASSA_SHIFTS_FILE: getCassaShiftsFilePath,
  ensureFile,
  readAll,
  writeAll,
  create,
  update,
  getOpenShift,
  getById,
  getShiftsByDate,
  toNumber,
  normalizeString,
};
