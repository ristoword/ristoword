const { v4: uuid } = require("uuid");
const paths = require("../config/paths");
const tenantContext = require("../context/tenantContext");
const { loadJsonArray, saveJsonArray } = require("../utils/fileStore");

function getDataPath() {
  return paths.tenant(tenantContext.getRestaurantId(), "catering-events.json");
}

function readAll() {
  const data = loadJsonArray(getDataPath());
  return Array.isArray(data) ? data : [];
}

function writeAll(events) {
  saveJsonArray(getDataPath(), Array.isArray(events) ? events : []);
}

exports.getAll = async () => readAll();

exports.getById = async (id) => {
  const list = readAll();
  return list.find((c) => c.id === id) || null;
};

exports.create = async (data) => {
  const event = {
    id: uuid(),
    customer: data.customer || "",
    date: data.date || "",
    people: Number(data.people) || 0,
    price: Number(data.price) || 0,
    note: data.note || "",
    createdAt: data.createdAt || new Date().toISOString(),
  };
  const list = readAll();
  list.push(event);
  writeAll(list);
  return event;
};

exports.update = async (id, data) => {
  const list = readAll();
  const index = list.findIndex((c) => c.id === id);
  if (index === -1) return null;
  list[index] = { ...list[index], ...data, id: list[index].id };
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
