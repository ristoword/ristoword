// backend/src/repositories/closures.repository.js
// Persistent daily Z closure records

const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const paths = require("../config/paths");
const tenantContext = require("../context/tenantContext");

function getDataDir() {
  const restaurantId = tenantContext.getRestaurantId();
  if (!restaurantId) return paths.DATA;
  return path.join(paths.DATA, "tenants", restaurantId);
}

function getClosuresPath() {
  return path.join(getDataDir(), "closures.json");
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `cls_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeString(v, fallback = "") {
  if (v == null) return fallback;
  return String(v).trim();
}

async function ensureClosuresFile() {
  const closuresPath = getClosuresPath();
  await fsp.mkdir(getDataDir(), { recursive: true });
  if (!fs.existsSync(closuresPath)) {
    await fsp.writeFile(closuresPath, "[]", "utf8");
    return;
  }
  const raw = await fsp.readFile(closuresPath, "utf8");
  if (!raw.trim()) {
    await fsp.writeFile(closuresPath, "[]", "utf8");
  }
}

async function readAllClosures() {
  await ensureClosuresFile();
  const raw = await fsp.readFile(getClosuresPath(), "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[Ristoword] closures.json parse error:", err.message);
    return [];
  }
}

async function writeAllClosures(closures) {
  const closuresPath = getClosuresPath();
  await fsp.mkdir(getDataDir(), { recursive: true });
  const tmpPath = closuresPath + "." + Date.now() + ".tmp";
  try {
    await fsp.writeFile(tmpPath, JSON.stringify(closures, null, 2), "utf8");
    await fsp.rename(tmpPath, closuresPath);
  } catch (err) {
    try {
      await fsp.unlink(tmpPath).catch(() => {});
    } catch (_) {}
    await fsp.writeFile(closuresPath, JSON.stringify(closures, null, 2), "utf8");
  }
}

function normalizeClosureInput(input = {}) {
  const nowIso = new Date().toISOString();
  return {
    id: input.id || createId(),
    date: normalizeString(input.date, ""),
    cashTotal: toNumber(input.cashTotal, 0),
    cardTotal: toNumber(input.cardTotal, 0),
    otherTotal: toNumber(input.otherTotal, 0),
    grandTotal: toNumber(input.grandTotal, 0),
    paymentsCount: toNumber(input.paymentsCount, 0),
    closedOrdersCount: toNumber(input.closedOrdersCount, 0),
    closedAt: input.closedAt || nowIso,
    closedBy: normalizeString(input.closedBy, ""),
    notes: normalizeString(input.notes, ""),
    createdAt: input.createdAt || nowIso,
  };
}

async function createClosure(payload) {
  const closures = await readAllClosures();
  const closure = normalizeClosureInput(payload);
  closures.push(closure);
  await writeAllClosures(closures);
  return closure;
}

async function listClosures(filters = {}) {
  const closures = await readAllClosures();
  let result = [...closures];
  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom).getTime();
    result = result.filter((c) => new Date(c.date).getTime() >= from);
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo).getTime();
    result = result.filter((c) => new Date(c.date).getTime() <= to);
  }
  result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return result;
}

async function getClosureByDate(dateStr) {
  const closures = await readAllClosures();
  const d = String(dateStr || "").slice(0, 10);
  return closures.find((c) => String(c.date || "").slice(0, 10) === d) || null;
}

async function getClosureById(id) {
  const closures = await readAllClosures();
  return closures.find((c) => c.id === id) || null;
}

async function isDayClosed(dateStr) {
  const c = await getClosureByDate(dateStr);
  return !!c;
}

module.exports = {
  CLOSURES_FILE: getClosuresPath,
  ensureClosuresFile,
  readAllClosures,
  writeAllClosures,
  createClosure,
  listClosures,
  getClosureByDate,
  getClosureById,
  isDayClosed,
  normalizeClosureInput,
};
