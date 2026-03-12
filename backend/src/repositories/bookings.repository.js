// backend/src/repositories/bookings.repository.js
const { v4: uuid } = require("uuid");
const paths = require("../config/paths");
const tenantContext = require("../context/tenantContext");
const { loadJsonArray, saveJsonArray } = require("../utils/fileStore");

function getDataPath() {
  return paths.tenant(tenantContext.getRestaurantId(), "bookings.json");
}

function getAll() {
  return loadJsonArray(getDataPath());
}

function getById(id) {
  const list = getAll();
  return list.find((b) => b.id === id) || null;
}

function create(data) {
  const list = getAll();
  const booking = {
    id: uuid(),
    customerId: data.customerId || null,
    name: data.name || "",
    phone: data.phone || "",
    people: Number(data.people) || 1,
    date: data.date || "",
    time: data.time || "",
    note: data.note || data.notes || "",
    area: data.area || "",
    status: data.status || "nuova",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  list.push(booking);
  saveJsonArray(getDataPath(), list);
  return booking;
}

function update(id, data) {
  const list = getAll();
  const idx = list.findIndex((b) => b.id === id);
  if (idx === -1) return null;

  const existing = list[idx];
  const updated = {
    ...existing,
    ...data,
    id: existing.id,
    updatedAt: new Date().toISOString(),
  };
  list[idx] = updated;
  saveJsonArray(getDataPath(), list);
  return updated;
}

function remove(id) {
  const list = getAll();
  const idx = list.findIndex((b) => b.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  saveJsonArray(getDataPath(), list);
  return true;
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
};
