// backend/src/repositories/shifts.repository.js
// Staff shifts – tenant-aware, uses data/tenants/{tenantId}/staff-shifts.json

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
  return paths.tenantDataPath(tenantContext.getRestaurantId(), "staff-shifts.json");
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `sh_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

async function ensureShiftsFile() {
  const SHIFTS_FILE = getShiftsFilePath();
  const legacyPath = paths.legacy("staff-shifts.json");

  await fsp.mkdir(getDataDir(), { recursive: true });
  if (!fs.existsSync(SHIFTS_FILE)) {
    if (fs.existsSync(legacyPath)) {
      await fsp.copyFile(legacyPath, SHIFTS_FILE);
    } else {
      await fsp.writeFile(SHIFTS_FILE, "[]", "utf8");
    }
    return;
  }
  const raw = await fsp.readFile(SHIFTS_FILE, "utf8");
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "{" || trimmed.startsWith("{")) {
    await fsp.writeFile(SHIFTS_FILE, "[]", "utf8");
  }
}

async function readAllShifts() {
  await ensureShiftsFile();
  const raw = await fsp.readFile(getShiftsFilePath(), "utf8");
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && parsed.id) {
      return [{ ...parsed, id: parsed.id || createId() }];
    }
    return [];
  } catch (err) {
    return [];
  }
}

async function writeAllShifts(shifts) {
  await ensureShiftsFile();
  await fsp.writeFile(getShiftsFilePath(), JSON.stringify(shifts, null, 2), "utf8");
}

exports.getAll = readAllShifts;

exports.getByStaffId = async (staffId, filters = {}) => {
  let shifts = await readAllShifts();
  shifts = shifts.filter((s) => s.staffId === staffId);
  if (filters.dateFrom) {
    shifts = shifts.filter((s) => (s.date || "") >= filters.dateFrom);
  }
  if (filters.dateTo) {
    shifts = shifts.filter((s) => (s.date || "") <= filters.dateTo);
  }
  if (filters.status) {
    shifts = shifts.filter((s) => (s.status || "scheduled") === filters.status);
  }
  return shifts.sort((a, b) => (a.date || "").localeCompare(b.date || "") || 0);
};

exports.getByDateRange = async (dateFrom, dateTo, filters = {}) => {
  let shifts = await readAllShifts();
  if (dateFrom) shifts = shifts.filter((s) => (s.date || "") >= dateFrom);
  if (dateTo) shifts = shifts.filter((s) => (s.date || "") <= dateTo);
  if (filters.staffId) shifts = shifts.filter((s) => s.staffId === filters.staffId);
  if (filters.department) shifts = shifts.filter((s) => s.area === filters.department || s.department === filters.department);
  return shifts.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
};

exports.getById = async (id) => {
  const shifts = await readAllShifts();
  return shifts.find((s) => s.id === id) || null;
};

exports.create = async (data) => {
  const shifts = await readAllShifts();
  const shift = {
    id: data.id || createId(),
    staffId: data.staffId || "",
    date: data.date || "",
    start: data.start || "",
    end: data.end || "",
    area: data.area || data.department || "",
    department: data.department || data.area || "",
    status: data.status || "scheduled",
    type: data.type || "work",
    notes: data.notes || "",
    createdAt: data.createdAt || new Date().toISOString(),
  };
  shifts.push(shift);
  await writeAllShifts(shifts);
  return shift;
};

exports.createMany = async (items) => {
  const shifts = await readAllShifts();
  const created = [];
  for (const data of items) {
    const shift = {
      id: data.id || createId(),
      staffId: data.staffId || "",
      date: data.date || "",
      start: data.start || "",
      end: data.end || "",
      area: data.area || data.department || "",
      department: data.department || data.area || "",
      status: data.status || "scheduled",
      type: data.type || "work",
      notes: data.notes || "",
      createdAt: data.createdAt || new Date().toISOString(),
    };
    shifts.push(shift);
    created.push(shift);
  }
  await writeAllShifts(shifts);
  return created;
};

exports.update = async (id, data) => {
  const shifts = await readAllShifts();
  const idx = shifts.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const allowed = ["date", "start", "end", "area", "department", "status", "type", "notes"];
  for (const k of allowed) {
    if (data[k] !== undefined) shifts[idx][k] = data[k];
  }
  await writeAllShifts(shifts);
  return shifts[idx];
};

exports.remove = async (id) => {
  const shifts = await readAllShifts();
  const idx = shifts.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  shifts.splice(idx, 1);
  await writeAllShifts(shifts);
  return true;
};
