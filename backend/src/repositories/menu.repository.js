// backend/src/repositories/menu.repository.js

const paths = require("../config/paths");
const tenantContext = require("../context/tenantContext");
const { safeReadJson, atomicWriteJson } = require("../utils/safeFileIO");

function getMenuPath() {
  return paths.tenant(tenantContext.getRestaurantId(), "menu.json");
}

function readMenu() {
  const data = safeReadJson(getMenuPath(), []);
  return Array.isArray(data) ? data : [];
}

function writeMenu(data) {
  atomicWriteJson(getMenuPath(), Array.isArray(data) ? data : []);
}

function getAll() {
  return readMenu();
}

function getById(id) {
  const menu = readMenu();
  return menu.find((item) => item.id === Number(id));
}

function getActive() {
  const menu = readMenu();
  return menu.filter((item) => item.active);
}

function add(itemData) {
  const menu = readMenu();
  const ids = menu.map((m) => m.id || 0).filter((n) => Number.isFinite(n));
  const nextId = ids.length ? Math.max(...ids) + 1 : 1;

  const newItem = {
    id: nextId,
    name: itemData.name,
    category: itemData.category || "Generale",
    price: Number(itemData.price) || 0,
    recipe: itemData.recipe || null,
    active: itemData.active !== false,
    area: itemData.area || null,
    code: itemData.code || null,
    notes: itemData.notes || null,
  };

  menu.push(newItem);
  writeMenu(menu);
  return newItem;
}

function update(id, updates) {
  const menu = readMenu();
  const index = menu.findIndex((m) => String(m.id) === String(id));
  if (index === -1) return null;
  menu[index] = { ...menu[index], ...updates };
  writeMenu(menu);
  return menu[index];
}

function remove(id) {
  const menu = readMenu();
  const index = menu.findIndex((m) => String(m.id) === String(id));
  if (index === -1) return false;
  menu.splice(index, 1);
  writeMenu(menu);
  return true;
}

module.exports = {
  getAll,
  getActive,
  getById,
  add,
  update,
  remove,
};