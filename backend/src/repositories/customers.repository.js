// backend/src/repositories/customers.repository.js
const crypto = require("crypto");
const paths = require("../config/paths");
const tenantContext = require("../context/tenantContext");
const { loadJsonArray, saveJsonArray } = require("../utils/fileStore");

function getDataPath() {
  return paths.tenant(tenantContext.getRestaurantId(), "customers.json");
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `cli_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function normalizeString(v, fallback = "") {
  if (v == null) return fallback;
  return String(v).trim();
}

function normalizeArray(v, fallback = []) {
  if (v == null) return fallback;
  return Array.isArray(v) ? v : [v];
}

function normalizeObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

async function getAll() {
  return loadJsonArray(getDataPath());
}

async function getById(id) {
  const list = await getAll();
  return list.find((c) => c.id === id) || null;
}

async function findByPhone(phone) {
  const p = normalizeString(phone).replace(/\D/g, "");
  if (!p) return null;
  const list = await getAll();
  return list.find((c) => {
    const cp = normalizeString(c.phone).replace(/\D/g, "");
    return cp && cp === p;
  }) || null;
}

async function findByEmail(email) {
  const e = normalizeString(email).toLowerCase();
  if (!e) return null;
  const list = await getAll();
  return list.find((c) => {
    const ce = normalizeString(c.email).toLowerCase();
    return ce && ce === e;
  }) || null;
}

async function searchByNameOrPhone(query) {
  const q = normalizeString(query).toLowerCase();
  if (!q) return [];
  const list = await getAll();
  return list.filter((c) => {
    const full = `${normalizeString(c.name)} ${normalizeString(c.surname)}`.toLowerCase();
    const phone = normalizeString(c.phone);
    return full.includes(q) || phone.includes(q);
  });
}

function buildCustomer(data = {}) {
  const now = new Date().toISOString();
  return {
    id: data.id || createId(),
    name: normalizeString(data.name, ""),
    surname: normalizeString(data.surname, ""),
    phone: normalizeString(data.phone, ""),
    email: normalizeString(data.email, ""),
    notes: normalizeString(data.notes, ""),
    birthday: normalizeString(data.birthday, ""),
    anniversaries: Array.isArray(data.anniversaries)
      ? data.anniversaries.map((a) => ({
          label: normalizeString(a.label || a, ""),
          date: normalizeString(typeof a === "object" ? a.date : "", ""),
        }))
      : [],
    allergies: Array.isArray(data.allergies) ? data.allergies.map(String) : [],
    intolerances: Array.isArray(data.intolerances) ? data.intolerances.map(String) : [],
    preferences: Array.isArray(data.preferences) ? data.preferences.map(String) : [],
    category: ["normal", "top", "vip"].includes(data.category) ? data.category : "normal",
    createdAt: data.createdAt || now,
    updatedAt: now,
  };
}

async function create(data) {
  const list = await getAll();
  const customer = buildCustomer({ ...data });
  list.push(customer);
  saveJsonArray(getDataPath(), list);
  return customer;
}

async function update(id, data) {
  const list = await getAll();
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return null;

  const existing = list[idx];
  const merged = {
    ...existing,
    ...data,
    id: existing.id,
    createdAt: existing.createdAt,
  };
  const updated = buildCustomer(merged);
  updated.createdAt = existing.createdAt;
  updated.updatedAt = new Date().toISOString();

  list[idx] = updated;
  saveJsonArray(getDataPath(), list);
  return updated;
}

module.exports = {
  getAll,
  getById,
  findByPhone,
  findByEmail,
  searchByNameOrPhone,
  create,
  update,
  buildCustomer,
};
