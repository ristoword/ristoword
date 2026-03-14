// backend/src/repositories/daily-menu.repository.js
// Menu del Giorno – tenant-aware, JSON storage.

const paths = require("../config/paths");
const tenantContext = require("../context/tenantContext");
const { safeReadJson, atomicWriteJson } = require("../utils/safeFileIO");

const CATEGORIES = ["antipasto", "primo", "secondo", "contorno", "dolce", "bevanda", "extra"];

function getDataPath() {
  return paths.tenantDataPath(tenantContext.getRestaurantId(), "daily-menu.json");
}

function readData() {
  const raw = safeReadJson(getDataPath(), null);
  if (raw && typeof raw === "object") return raw;
  return {
    menuActive: false,
    updatedAt: null,
    dishes: [],
  };
}

function writeData(data) {
  const d = {
    menuActive: data.menuActive !== false,
    updatedAt: new Date().toISOString(),
    dishes: Array.isArray(data.dishes) ? data.dishes : [],
  };
  atomicWriteJson(getDataPath(), d);
  return d;
}

function getNextId(dishes) {
  const ids = dishes.map((d) => d.id).filter((n) => Number.isFinite(n));
  return ids.length ? Math.max(...ids) + 1 : 1;
}

function getAll() {
  return readData();
}

function getActiveDishes() {
  const data = readData();
  if (!data.menuActive) return [];
  return (data.dishes || []).filter((d) => d.active !== false);
}

function addDish(dish) {
  const data = readData();
  const dishes = data.dishes || [];
  const id = getNextId(dishes);
  const cat = String(dish.category || "extra").toLowerCase();
  const category = CATEGORIES.includes(cat) ? cat : "extra";
  const newDish = {
    id,
    name: String(dish.name || "").trim() || "Senza nome",
    description: String(dish.description || "").trim() || "",
    category,
    price: Number(dish.price) || 0,
    active: dish.active !== false,
    allergens: String(dish.allergens || "").trim() || "",
    order: dishes.length,
  };
  dishes.push(newDish);
  writeData({ ...data, dishes });
  return newDish;
}

function updateDish(id, updates) {
  const data = readData();
  const dishes = data.dishes || [];
  const idx = dishes.findIndex((d) => String(d.id) === String(id));
  if (idx === -1) return null;
  const cat = updates.category != null ? String(updates.category).toLowerCase() : null;
  const patch = {};
  if (updates.name !== undefined) patch.name = String(updates.name).trim() || dishes[idx].name;
  if (updates.description !== undefined) patch.description = String(updates.description).trim();
  if (updates.category !== undefined) patch.category = CATEGORIES.includes(cat) ? cat : dishes[idx].category;
  if (updates.price !== undefined) patch.price = Number(updates.price) || 0;
  if (updates.active !== undefined) patch.active = !!updates.active;
  if (updates.allergens !== undefined) patch.allergens = String(updates.allergens).trim();
  dishes[idx] = { ...dishes[idx], ...patch };
  writeData({ ...data, dishes });
  return dishes[idx];
}

function removeDish(id) {
  const data = readData();
  const dishes = data.dishes || [];
  const idx = dishes.findIndex((d) => String(d.id) === String(id));
  if (idx === -1) return false;
  dishes.splice(idx, 1);
  writeData({ ...data, dishes });
  return true;
}

function toggleDish(id) {
  const data = readData();
  const dishes = data.dishes || [];
  const idx = dishes.findIndex((d) => String(d.id) === String(id));
  if (idx === -1) return null;
  dishes[idx].active = !dishes[idx].active;
  writeData({ ...data, dishes });
  return dishes[idx];
}

function setMenuActive(active) {
  const data = readData();
  data.menuActive = !!active;
  writeData(data);
  return data;
}

module.exports = {
  CATEGORIES,
  getAll,
  getActiveDishes,
  addDish,
  updateDish,
  removeDish,
  toggleDish,
  setMenuActive,
};
