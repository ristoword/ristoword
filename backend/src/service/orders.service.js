// backend/src/service/orders.service.js
// Business logic for orders. Data access via orders.repository only.

const ordersRepository = require("../repositories/orders.repository");

async function listOrders() {
  return ordersRepository.getAllOrders();
}

async function createOrder(payload) {
  const orders = await ordersRepository.getAllOrders();
  const id = ordersRepository.getNextId(orders);
  const now = new Date().toISOString();

  const newOrder = {
    id,
    table: payload.table ?? null,
    covers: payload.covers ?? null,
    area: payload.area || "sala",
    waiter: payload.waiter || "",
    notes: payload.notes || "",
    items: Array.isArray(payload.items) ? payload.items : [],
    status: "in_attesa",
    createdAt: now,
    updatedAt: now,
  };

  orders.push(newOrder);
  ordersRepository.saveAllOrders(orders);
  return newOrder;
}

async function setStatus(id, status) {
  const orders = await ordersRepository.getAllOrders();
  const target = orders.find((o) => String(o.id) === String(id));
  if (!target) {
    const err = new Error("Ordine non trovato");
    err.status = 404;
    throw err;
  }

  target.status = status;
  target.updatedAt = new Date().toISOString();

  ordersRepository.saveAllOrders(orders);
  return target;
}

/**
 * Try to mark order as inventory-processed. Returns true if we marked it (caller should deduct),
 * false if already marked (idempotent – do not deduct again).
 */
function tryMarkOrderInventoryProcessed(id) {
  const orders = ordersRepository.getAllOrders();
  const target = orders.find((o) => String(o.id) === String(id));
  if (!target) return false;
  if (target.inventoryProcessedAt) return false;

  target.inventoryProcessedAt = new Date().toISOString();
  ordersRepository.saveAllOrders(orders);
  return true;
}

module.exports = {
  listOrders,
  createOrder,
  setStatus,
  tryMarkOrderInventoryProcessed,
};