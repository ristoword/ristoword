// backend/src/repositories/inventory.repository.js
// Magazzino a doppio livello: Centrale + Scorte reparti (cucina, sala, ...)

const paths = require("../config/paths");
const tenantContext = require("../context/tenantContext");
const { safeReadJson, atomicWriteJson } = require("../utils/safeFileIO");

const DEPARTMENTS = ["cucina", "sala"];

function getDataPath() {
  return paths.tenant(tenantContext.getRestaurantId(), "inventory.json");
}

function readInventory() {
  const data = safeReadJson(getDataPath(), []);
  let items = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []);
  return items.map(normalizeItem);
}

function normalizeItem(item) {
  const stocks = item.stocks && typeof item.stocks === "object" ? { ...item.stocks } : {};
  DEPARTMENTS.forEach((d) => {
    if (stocks[d] == null) stocks[d] = 0;
  });
  const central = item.central != null ? Number(item.central) : (Number(item.quantity) ?? 0);
  return {
    ...item,
    quantity: central,
    central,
    stocks,
    category: item.category || "",
    lot: item.lot || "",
    notes: item.notes || "",
    threshold: Number(item.threshold) ?? 0,
    cost: Number(item.cost) ?? 0,
  };
}

function writeInventory(data) {
  const items = (Array.isArray(data) ? data : []).map((i) => {
    const { central, stocks, ...rest } = i;
    return { ...rest, quantity: central ?? i.quantity, central: central ?? i.quantity, stocks: stocks || {} };
  });
  atomicWriteJson(getDataPath(), items);
}

function getAll() {
  return readInventory();
}

function getById(id) {
  const inventory = readInventory();
  return inventory.find((item) => String(item.id) === String(id)) || null;
}

function getByLocation(location) {
  const items = readInventory();
  if (location === "central" || !location) {
    return items.filter((i) => (Number(i.central) || 0) > 0);
  }
  if (DEPARTMENTS.includes(location)) {
    return items
      .map((i) => ({
        ...i,
        qtyDept: Number(i.stocks && i.stocks[location]) || 0,
      }))
      .filter((i) => i.qtyDept > 0);
  }
  return items;
}

function normalizeName(s) {
  return String(s || "").trim().toLowerCase();
}

function findInventoryItemByName(name) {
  const inventory = readInventory();
  const n = normalizeName(name);
  return inventory.find((item) => normalizeName(item.name) === n) || null;
}

function getCostPerUnit(item) {
  if (!item) return 0;
  const cpu = Number(item.cost_per_unit);
  if (Number.isFinite(cpu) && cpu >= 0) return cpu;
  const cost = Number(item.cost);
  const qty = Number(item.central ?? item.quantity) || 0;
  if (Number.isFinite(cost) && qty > 0) return cost / qty;
  return Number(item.cost) || 0;
}

function getStock(item) {
  if (!item) return 0;
  return Number(item.central ?? item.quantity ?? item.stock) || 0;
}

function getDepartmentStock(item, dept) {
  if (!item || !dept) return 0;
  return Number(item.stocks && item.stocks[dept]) || 0;
}

function getMinStock(item) {
  if (!item) return 0;
  const m = Number(item.min_stock);
  if (Number.isFinite(m)) return m;
  return Number(item.threshold) || 0;
}

function deductInventoryItem(ingredientName, amount, unitHint) {
  const inventory = readInventory();
  const n = normalizeName(ingredientName);
  const index = inventory.findIndex((item) => normalizeName(item.name) === n);
  if (index === -1) return { success: false, reason: "not_found" };

  const item = inventory[index];
  const current = getStock(item);
  const deduct = Number(amount) || 0;
  const newStock = Math.max(0, current - deduct);
  inventory[index] = {
    ...item,
    quantity: newStock,
    central: newStock,
    stock: newStock,
    updatedAt: new Date().toISOString(),
  };
  writeInventory(inventory);

  const minS = getMinStock(item);
  return {
    success: true,
    newStock,
    belowMin: minS > 0 && newStock < minS,
    ingredientName: item.name,
  };
}

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

  const item = inventory[index];
  let { central, stocks } = item;
  if (updates.central != null) central = Number(updates.central) || 0;
  if (updates.stocks && typeof updates.stocks === "object") {
    stocks = { ...(item.stocks || {}), ...updates.stocks };
  }

  const updated = {
    ...item,
    ...updates,
    central: central ?? item.central,
    quantity: central ?? item.quantity,
    stocks: stocks || item.stocks,
    updatedAt: new Date().toISOString(),
  };
  inventory[index] = normalizeItem(updated);
  writeInventory(inventory);
  return inventory[index];
}

function nextId(inventory) {
  const ids = (inventory || []).map((x) => Number(x && x.id)).filter((n) => Number.isFinite(n) && n > 0);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

function create(data) {
  const inventory = readInventory();
  const id = nextId(inventory);
  const now = new Date().toISOString();
  const stocks = {};
  DEPARTMENTS.forEach((d) => {
    stocks[d] = 0;
  });
  const central = Number(data.quantity) ?? Number(data.central) ?? 0;
  const newItem = normalizeItem({
    id,
    name: String(data.name || "").trim(),
    unit: String(data.unit || "").trim(),
    quantity: central,
    central,
    stocks,
    cost: Number(data.cost) ?? 0,
    threshold: Number(data.threshold) ?? 0,
    category: String(data.category || "").trim(),
    lot: String(data.lot || "").trim(),
    notes: String(data.notes || "").trim(),
    createdAt: now,
    updatedAt: now,
  });
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

function adjustQuantity(id, delta) {
  const inventory = readInventory();
  const index = inventory.findIndex((item) => String(item.id) === String(id));
  if (index === -1) return null;
  const item = inventory[index];
  const current = Number(item.central ?? item.quantity) || 0;
  const newQty = Math.max(0, current + delta);
  inventory[index] = normalizeItem({
    ...item,
    quantity: newQty,
    central: newQty,
    stock: newQty,
    updatedAt: new Date().toISOString(),
  });
  writeInventory(inventory);
  return inventory[index];
}

function transfer(productId, toDepartment, quantity, note, operator) {
  if (!DEPARTMENTS.includes(toDepartment)) {
    return { success: false, error: "Reparto non valido" };
  }
  const qty = Number(quantity) || 0;
  if (qty <= 0) return { success: false, error: "Quantità non valida" };

  const inventory = readInventory();
  const index = inventory.findIndex((item) => String(item.id) === String(productId));
  if (index === -1) return { success: false, error: "Prodotto non trovato" };

  const item = inventory[index];
  const centralQty = Number(item.central ?? item.quantity) || 0;
  if (qty > centralQty) {
    return { success: false, error: `Quantità insufficiente. Disponibile: ${centralQty}` };
  }

  const stocks = { ...(item.stocks || {}) };
  stocks[toDepartment] = (Number(stocks[toDepartment]) || 0) + qty;
  const newCentral = centralQty - qty;

  inventory[index] = normalizeItem({
    ...item,
    quantity: newCentral,
    central: newCentral,
    stocks,
    updatedAt: new Date().toISOString(),
  });
  writeInventory(inventory);

  return {
    success: true,
    item: inventory[index],
    transfer: {
      productId,
      productName: item.name,
      unit: item.unit,
      quantity: qty,
      from: "central",
      to: toDepartment,
      note: note || "",
      operator: operator || "",
    },
  };
}

function returnToCentral(productId, fromDepartment, quantity, note, operator) {
  if (!DEPARTMENTS.includes(fromDepartment)) {
    return { success: false, error: "Reparto non valido" };
  }
  const qty = Number(quantity) || 0;
  if (qty <= 0) return { success: false, error: "Quantità non valida" };

  const inventory = readInventory();
  const index = inventory.findIndex((item) => String(item.id) === String(productId));
  if (index === -1) return { success: false, error: "Prodotto non trovato" };

  const item = inventory[index];
  const stocks = { ...(item.stocks || {}) };
  const deptQty = Number(stocks[fromDepartment]) || 0;
  if (qty > deptQty) {
    return { success: false, error: `Quantità insufficiente nel reparto. Disponibile: ${deptQty}` };
  }

  const centralQty = Number(item.central ?? item.quantity) || 0;
  stocks[fromDepartment] = Math.max(0, deptQty - qty);
  const newCentral = centralQty + qty;

  inventory[index] = normalizeItem({
    ...item,
    quantity: newCentral,
    central: newCentral,
    stocks,
    updatedAt: new Date().toISOString(),
  });
  writeInventory(inventory);

  return {
    success: true,
    item: inventory[index],
    return: {
      productId,
      productName: item.name,
      unit: item.unit,
      quantity: qty,
      from: fromDepartment,
      to: "central",
      note: note || "",
      operator: operator || "",
    },
  };
}

module.exports = {
  DEPARTMENTS,
  getAll,
  getById,
  getByLocation,
  update,
  create,
  remove,
  adjustQuantity,
  transfer,
  returnToCentral,
  readInventory,
  writeInventory,
  findInventoryItemByName,
  getCostPerUnit,
  getStock,
  getDepartmentStock,
  getMinStock,
  deductInventoryItem,
  deductInventoryIngredients,
};
