// backend/src/repositories/staff-requests.repository.js
// Staff requests – tenant-aware, uses data/tenants/{tenantId}/staff-requests.json

const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const paths = require("../config/paths");
const tenantContext = require("../context/tenantContext");

function getDataDir() {
  return path.join(paths.DATA, "tenants", tenantContext.getRestaurantId());
}

function getRequestsFilePath() {
  return paths.tenantDataPath(tenantContext.getRestaurantId(), "staff-requests.json");
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `req_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

async function ensureFile() {
  const REQUESTS_FILE = getRequestsFilePath();
  const legacyPath = paths.legacy("staff-requests.json");

  await fsp.mkdir(getDataDir(), { recursive: true });
  if (!fs.existsSync(REQUESTS_FILE)) {
    if (fs.existsSync(legacyPath)) {
      await fsp.copyFile(legacyPath, REQUESTS_FILE);
    } else {
      await fsp.writeFile(REQUESTS_FILE, "[]", "utf8");
    }
    return;
  }
}

async function readAll() {
  await ensureFile();
  const raw = await fsp.readFile(getRequestsFilePath(), "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

async function writeAll(requests) {
  await ensureFile();
  await fsp.writeFile(getRequestsFilePath(), JSON.stringify(requests, null, 2), "utf8");
}

exports.getAll = async (filters = {}) => {
  let requests = await readAll();
  if (filters.staffId) requests = requests.filter((r) => r.staffId === filters.staffId);
  if (filters.type) requests = requests.filter((r) => r.type === filters.type);
  if (filters.status) requests = requests.filter((r) => r.status === filters.status);
  if (filters.dateFrom) requests = requests.filter((r) => (r.createdAt || r.date || "") >= filters.dateFrom);
  if (filters.dateTo) requests = requests.filter((r) => (r.createdAt || r.date || "") <= filters.dateTo);
  return requests.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
};

exports.getById = async (id) => {
  const requests = await readAll();
  return requests.find((r) => r.id === id) || null;
};

exports.getByStaffId = async (staffId) => {
  return exports.getAll({ staffId });
};

exports.create = async (data) => {
  const requests = await readAll();
  const req = {
    id: data.id || createId(),
    staffId: data.staffId || "",
    type: data.type || "vacation",
    status: data.status || "pending",
    dateFrom: data.dateFrom || "",
    dateTo: data.dateTo || "",
    dates: data.dates || [],
    shiftId: data.shiftId || null,
    reason: data.reason || "",
    notes: data.notes || "",
    requestNotes: data.requestNotes || "",
    approvedBy: data.approvedBy || null,
    rejectedBy: data.rejectedBy || null,
    approvedAt: data.approvedAt || null,
    rejectedAt: data.rejectedAt || null,
    rejectionReason: data.rejectionReason || "",
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString(),
  };
  requests.push(req);
  await writeAll(requests);
  return req;
};

exports.update = async (id, data) => {
  const requests = await readAll();
  const idx = requests.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const allowed = [
    "status", "notes", "requestNotes", "approvedBy", "rejectedBy",
    "approvedAt", "rejectedAt", "rejectionReason", "dateFrom", "dateTo", "dates", "reason",
  ];
  for (const k of allowed) {
    if (data[k] !== undefined) requests[idx][k] = data[k];
  }
  requests[idx].updatedAt = new Date().toISOString();
  await writeAll(requests);
  return requests[idx];
};
