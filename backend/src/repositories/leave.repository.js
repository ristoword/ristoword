// Richieste assenze (ferie, permessi, malattia) per tenant.
// File: data/tenants/<restaurantId>/leave-requests.json

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const paths = require("../config/paths");
const { safeReadJson, atomicWriteJson } = require("../utils/safeFileIO");
const usersRepository = require("./users.repository");

const RECORDS_KEY = "requests";

function getFilePath(restaurantId) {
  const id = restaurantId != null && String(restaurantId).trim() !== "" ? String(restaurantId).trim() : null;
  if (!id) return path.join(paths.DATA, "leave-requests.json");
  return path.join(paths.DATA, "tenants", id, "leave-requests.json");
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readLeaveRequests(restaurantId) {
  const filePath = getFilePath(restaurantId);
  const data = safeReadJson(filePath, { [RECORDS_KEY]: [] });
  return Array.isArray(data[RECORDS_KEY]) ? data[RECORDS_KEY] : [];
}

function writeLeaveRequests(restaurantId, items) {
  const filePath = getFilePath(restaurantId);
  ensureDir(filePath);
  atomicWriteJson(filePath, { [RECORDS_KEY]: items });
}

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : `lr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function defaultBalances() {
  return {
    ferieMaturate: 0,
    ferieUsate: 0,
    permessiUsati: 0,
    malattiaGiorni: 0,
  };
}

function getOrInitUserBalances(user) {
  if (!user) return defaultBalances();
  const b = user.leaveBalances;
  if (b && typeof b === "object") {
    return {
      ferieMaturate: Number(b.ferieMaturate) || 0,
      ferieUsate: Number(b.ferieUsate) || 0,
      permessiUsati: Number(b.permessiUsati) || 0,
      malattiaGiorni: Number(b.malattiaGiorni) || 0,
    };
  }
  return defaultBalances();
}

async function updateUserBalances(userId, restaurantId, patch) {
  const user = await usersRepository.findById(userId);
  if (!user || user.restaurantId !== restaurantId) return null;
  const current = getOrInitUserBalances(user);
  const next = {
    ferieMaturate: patch.ferieMaturate !== undefined ? Number(patch.ferieMaturate) : current.ferieMaturate,
    ferieUsate: patch.ferieUsate !== undefined ? Number(patch.ferieUsate) : current.ferieUsate,
    permessiUsati: patch.permessiUsati !== undefined ? Number(patch.permessiUsati) : current.permessiUsati,
    malattiaGiorni: patch.malattiaGiorni !== undefined ? Number(patch.malattiaGiorni) : current.malattiaGiorni,
  };
  return await usersRepository.updateUser(userId, { leaveBalances: next });
}

function dateOnly(str) {
  if (!str) return "";
  return String(str).slice(0, 10);
}

function createLeaveRequest(restaurantId, payload) {
  const now = new Date().toISOString();
  const startDate = dateOnly(payload.startDate);
  const endDate = dateOnly(payload.endDate);
  let days = Number(payload.days) || 0;
  if (days <= 0 && startDate && endDate) {
    const a = new Date(startDate).getTime();
    const b = new Date(endDate).getTime();
    days = Math.max(0, Math.ceil((b - a) / (24 * 60 * 60 * 1000)) + 1);
  }
  if (startDate && endDate && startDate === endDate) days = 1;

  const record = {
    id: payload.id || createId(),
    restaurantId: String(restaurantId),
    userId: String(payload.userId),
    username: String(payload.username || ""),
    name: String(payload.name || ""),
    surname: String(payload.surname || ""),
    type: payload.type === "ferie" || payload.type === "permesso" || payload.type === "malattia" ? payload.type : "ferie",
    startDate,
    endDate,
    days: days || 1,
    hours: payload.hours != null ? Number(payload.hours) : null,
    reason: String(payload.reason || ""),
    status: "pending",
    ownerNote: "",
    createdAt: now,
    updatedAt: now,
    reviewedAt: null,
    reviewedBy: null,
  };
  const items = readLeaveRequests(restaurantId);
  items.push(record);
  writeLeaveRequests(restaurantId, items);
  return record;
}

function findLeaveById(restaurantId, id) {
  const items = readLeaveRequests(restaurantId);
  return items.find((r) => r.id === id && r.restaurantId === restaurantId) || null;
}

function updateLeaveRequest(restaurantId, id, patch) {
  const items = readLeaveRequests(restaurantId);
  const idx = items.findIndex((r) => r.id === id && r.restaurantId === restaurantId);
  if (idx === -1) return null;
  const now = new Date().toISOString();
  items[idx] = { ...items[idx], ...patch, updatedAt: now };
  writeLeaveRequests(restaurantId, items);
  return items[idx];
}

/** Check overlapping approved/pending for same user, same type, and overlapping date range */
function hasOverlap(restaurantId, userId, type, startDate, endDate, excludeId) {
  const items = readLeaveRequests(restaurantId);
  const start = dateOnly(startDate);
  const end = dateOnly(endDate);
  return items.some((r) => {
    if (r.userId !== String(userId) || r.type !== type) return false;
    if (excludeId && r.id === excludeId) return false;
    if (r.status !== "pending" && r.status !== "approved") return false;
    const rStart = dateOnly(r.startDate);
    const rEnd = dateOnly(r.endDate);
    return (start >= rStart && start <= rEnd) || (end >= rStart && end <= rEnd) || (start <= rStart && end >= rEnd);
  });
}

module.exports = {
  readLeaveRequests,
  writeLeaveRequests,
  createLeaveRequest,
  findLeaveById,
  updateLeaveRequest,
  getOrInitUserBalances,
  updateUserBalances,
  defaultBalances,
  dateOnly,
  hasOverlap,
};
