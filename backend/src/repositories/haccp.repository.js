const { v4: uuid } = require("uuid");
const paths = require("../config/paths");
const tenantContext = require("../context/tenantContext");
const { loadJsonArray, saveJsonArray } = require("../utils/fileStore");

function getDataPath() {
  return paths.tenant(tenantContext.getRestaurantId(), "haccp-checks.json");
}

function readAll() {
  const data = loadJsonArray(getDataPath());
  return Array.isArray(data) ? data : [];
}

function writeAll(checks) {
  saveJsonArray(getDataPath(), Array.isArray(checks) ? checks : []);
}

exports.getAll = async () => readAll();

exports.getById = async (id) => {
  const list = readAll();
  return list.find((c) => c.id === id) || null;
};

exports.create = async (data) => {
  const check = {
    id: uuid(),
    type: data.type || "",
    value: data.value ?? data.temp ?? "",
    unit: data.unit || "",
    date: data.date || "",
    time: data.time || "",
    operator: data.operator || "",
    note: data.note || data.notes || "",
    temp: data.temp ?? data.value,
    notes: data.notes || data.note || "",
    createdAt: data.createdAt || new Date().toISOString(),
  };
  const list = readAll();
  list.push(check);
  writeAll(list);
  return check;
};

exports.update = async (id, data) => {
  const list = readAll();
  const index = list.findIndex((c) => c.id === id);
  if (index === -1) return null;
  list[index] = { ...list[index], ...data };
  writeAll(list);
  return list[index];
};

exports.remove = async (id) => {
  const list = readAll();
  const index = list.findIndex((c) => c.id === id);
  if (index === -1) return false;
  list.splice(index, 1);
  writeAll(list);
  return true;
};
