const paths = require("../config/paths");
const tenantContext = require("../context/tenantContext");
const { safeReadJson, atomicWriteJson } = require("../utils/safeFileIO");

function getDataPath() {
  return paths.tenant(tenantContext.getRestaurantId(), "inventory.json");
}

function readInventory() {
  const data = safeReadJson(getDataPath(), []);
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}

function writeInventory(data) {
  atomicWriteJson(getDataPath(), Array.isArray(data) ? data : []);
}

function getAll() {
  return readInventory();
}

function getById(id) {
  const inventory = readInventory();
  return inventory.find((item) => String(item.id) === String(id)) || null;
}

function normalizeName(s) {
  return String(s || "").trim().toLowerCase();
}

function findInventoryItemByName(name) {
  const inventory = readInventory();
  const n = normalizeName(name);
  return inventory.find((item) => normalizeName(item.name) === n) || null;
}

/** Get cost per unit for an item (supports cost_per_unit or cost/quantity). */
function getCostPerUnit(item) {
  if (!item) return 0;
  const cpu = Number(item.cost_per_unit);
  if (Number.isFinite(cpu) && cpu >= 0) return cpu;
  const cost = Number(item.cost);
  const qty = Number(item.quantity) || Number(item.stock) || 0;
  if (Number.isFinite(cost) && qty > 0) return cost / qty;
  return 0;
}

/** Get current stock (supports stock or quantity). */
function getStock(item) {
  if (!item) return 0;
  const s = Number(item.stock);
  if (Number.isFinite(s)) return s;
  return Number(item.quantity) || 0;
}

/** Get min_stock (supports min_stock or threshold). */
function getMinStock(item) {
  if (!item) return 0;
  const m = Number(item.min_stock);
  if (Number.isFinite(m)) return m;
  return Number(item.threshold) || 0;
}

/**
 * Deduct quantity for an ingredient by name. Returns { success, newStock, belowMin } or { success: false }.
 */
function deductInventoryItem(ingredientName, amount, unitHint) {
  const inventory = readInventory();
  const n = normalizeName(ingredientName);
  const index = inventory.findIndex((item) => normalizeName(item.name) === n);
  if (index === -1) return { success: false, reason: "not_found" };

  const item = inventory[index];
  const current = getStock(item);
  const deduct = Number(amount) || 0;
  const newStock = Math.max(0, current - deduct);
  inventory[index] = { ...item, quantity: newStock, stock: newStock };
  writeInventory(inventory);

  const minS = getMinStock(item);
  return {
    success: true,
    newStock,
    belowMin: minS > 0 && newStock < minS,
    ingredientName: item.name,
  };
}

/**
 * Deduct multiple ingredients (e.g. from a recipe). Returns array of results.
 */
function deductInventoryIngredients(deductions) {
  const results = [];
  for (const d of deductions) {
    const name = d.name || d.ingredientName;
    const qty = Number(d.qty) ?? Number(d.quantity) ?? 0;
    if (!name || qty <= 0) continue;
    const r = deductInventoryItem(name, qty, d.unit);
    results.push({ name, qty, ...r });
  }
  return results;
}

function update(id, updates = {}) {
  const inventory = readInventory();
  const index = inventory.findIndex((item) => String(item.id) === String(id));

  if (index === -1) return null;

  const updated = {
    ...inventory[index],
    ...updates
  };

  inventory[index] = updated;
  writeInventory(inventory);

  return updated;
}

function nextId(inventory) {
  const ids = (inventory || []).map((x) => Number(x && x.id)).filter((n) => Number.isFinite(n) && n > 0);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

function create(data) {
  const inventory = readInventory();
  const id = nextId(inventory);
  const now = new Date().toISOString();
  const newItem = {
    id,
    name: String(data.name || "").trim(),
    unit: String(data.unit || "").trim(),
    quantity: Number(data.quantity) ?? 0,
    cost: Number(data.cost) ?? 0,
    threshold: Number(data.threshold) ?? 0,
    createdAt: now,
    updatedAt: now,
  };
  inventory.push(newItem);
  writeInventory(inventory);
  return newItem;
}

function remove(id) {
  const inventory = readInventory();
  const index = inventory.findIndex((item) => String(item.id) === String(id));
  if (index === -1) return false;
  inventory.splice(index, 1);
  writeInventory(inventory);
  return true;
}

/** Adjust quantity by delta (+/-). Returns updated item or null. */
function adjustQuantity(id, delta) {
  const inventory = readInventory();
  const index = inventory.findIndex((item) => String(item.id) === String(id));
  if (index === -1) return null;
  const item = inventory[index];
  const current = Number(item.quantity) || 0;
  const newQty = Math.max(0, current + delta);
  inventory[index] = {
    ...item,
    quantity: newQty,
    stock: newQty,
    updatedAt: new Date().toISOString(),
  };
  writeInventory(inventory);
  return inventory[index];
}

module.exports = {
  getAll,
  getById,
  update,
  create,
  remove,
  adjustQuantity,
  readInventory,
  writeInventory,
  findInventoryItemByName,
  getCostPerUnit,
  getStock,
  getMinStock,
  deductInventoryItem,
  deductInventoryIngredients,
};
