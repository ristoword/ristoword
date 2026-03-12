const { v4: uuid } = require("uuid");
const paths = require("../config/paths");
const tenantContext = require("../context/tenantContext");
const { safeReadJson, atomicWriteJson } = require("../utils/safeFileIO");

function getMovementsPath() {
  return paths.tenant(tenantContext.getRestaurantId(), "stock-movements.json");
}

function readAll() {
  const data = safeReadJson(getMovementsPath(), []);
  return Array.isArray(data) ? data : [];
}

function writeAll(data) {
  atomicWriteJson(getMovementsPath(), Array.isArray(data) ? data : []);
}

async function getAll() {
  return readAll();
}

function findByOrderId(orderId) {
  const movements = readAll();
  return movements.filter((m) => String(m.orderId) === String(orderId));
}

async function createMovement(data) {
  const movements = readAll();
  const movement = {
    id: uuid(),
    type: data.type || "deduction",
    orderId: data.orderId || null,
    orderStatus: data.orderStatus || null,
    itemName: data.itemName || "",
    ingredientName: data.ingredientName || "",
    quantity: Number(data.quantity) || 0,
    unit: data.unit || "",
    before: Number(data.before) || 0,
    after: Number(data.after) || 0,
    note: data.note || "",
    createdAt: new Date().toISOString()
  };

  movements.push(movement);
  writeAll(movements);

  return movement;
}

module.exports = {
  getAll,
  createMovement,
  findByOrderId,
};