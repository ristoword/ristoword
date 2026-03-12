// backend/src/repositories/pos-shifts.repository.js
// POS cash register shifts – tenant-aware, uses data/tenants/{tenantId}/pos-shifts.json

const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const paths = require("../config/paths");
const tenantContext = require("../context/tenantContext");

function getDataDir() {
  return path.join(paths.DATA, "tenants", tenantContext.getRestaurantId());
}

function getShiftsFilePath() {
  return paths.tenantDataPath(tenantContext.getRestaurantId(), "pos-shifts.json");
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeString(v, fallback = "") {
  if (v == null) return fallback;
  return String(v).trim();
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `shift_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function ensureFile() {
  const SHIFTS_FILE = getShiftsFilePath();
  const legacyPosShifts = paths.legacy("pos-shifts.json");
  const legacyShifts = paths.legacy("shifts.json");

  await fsp.mkdir(getDataDir(), { recursive: true });
  if (!fs.existsSync(SHIFTS_FILE)) {
    if (fs.existsSync(legacyPosShifts)) {
      await fsp.copyFile(legacyPosShifts, SHIFTS_FILE);
    } else if (fs.existsSync(legacyShifts)) {
      try {
        const legacyRaw = await fsp.readFile(legacyShifts, "utf8");
        const legacy = JSON.parse(legacyRaw.trim() || "{}");
        const shifts = Array.isArray(legacy?.shifts) ? legacy.shifts : [];
        await fsp.writeFile(SHIFTS_FILE, JSON.stringify({ shifts }, null, 2), "utf8");
      } catch {
        await fsp.writeFile(SHIFTS_FILE, JSON.stringify({ shifts: [] }, null, 2), "utf8");
      }
    } else {
      await fsp.writeFile(SHIFTS_FILE, JSON.stringify({ shifts: [] }, null, 2), "utf8");
    }
    return;
  }
  const raw = await fsp.readFile(SHIFTS_FILE, "utf8");
  if (!raw.trim()) {
    await fsp.writeFile(SHIFTS_FILE, JSON.stringify({ shifts: [] }, null, 2), "utf8");
  }
}

async function readShifts() {
  await ensureFile();
  const raw = await fsp.readFile(getShiftsFilePath(), "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.shifts) ? parsed.shifts : [];
  } catch (err) {
    throw new Error("pos-shifts.json non valido");
  }
}

async function writeShifts(shifts) {
  await ensureFile();
  const data = { shifts: Array.isArray(shifts) ? shifts : [] };
  await fsp.writeFile(getShiftsFilePath(), JSON.stringify(data, null, 2), "utf8");
}

async function getOpenShift() {
  const shifts = await readShifts();
  return shifts.find((s) => String(s.status || "").toLowerCase() === "open") || null;
}

async function createShift(shiftData) {
  const shifts = await readShifts();
  const shift = {
    id: shiftData.id || createId(),
    opened_at: shiftData.opened_at || new Date().toISOString(),
    closed_at: shiftData.closed_at || null,
    operator: normalizeString(shiftData.operator, ""),
    opening_float: toNumber(shiftData.opening_float, 0),
    cash_total: toNumber(shiftData.cash_total, 0),
    card_total: toNumber(shiftData.card_total, 0),
    other_total: toNumber(shiftData.other_total, 0),
    status: normalizeString(shiftData.status, "open"),
  };
  shifts.push(shift);
  await writeShifts(shifts);
  return shift;
}

async function closeShift(id, updates) {
  const shifts = await readShifts();
  const index = shifts.findIndex((s) => String(s.id) === String(id));
  if (index === -1) return null;

  const current = shifts[index];
  const closed = {
    ...current,
    ...updates,
    id: current.id,
    closed_at: updates.closed_at || new Date().toISOString(),
    status: "closed",
  };
  shifts[index] = closed;
  await writeShifts(shifts);
  return closed;
}

async function getShiftsByDate(dateStr) {
  const shifts = await readShifts();
  const target = String(dateStr || "").slice(0, 10);
  return shifts.filter((s) => {
    const opened = (s.opened_at || "").slice(0, 10);
    return opened === target;
  });
}

async function updateShift(id, updates) {
  const shifts = await readShifts();
  const index = shifts.findIndex((s) => String(s.id) === String(id));
  if (index === -1) return null;

  const current = shifts[index];
  const next = { ...current, ...updates, id: current.id };
  shifts[index] = next;
  await writeShifts(shifts);
  return next;
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
