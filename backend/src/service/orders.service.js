// backend/src/service/orders.service.js
// Business logic for orders. Data access via orders.repository only.

const ordersRepository = require("../repositories/orders.repository");
const closuresRepository = require("../repositories/closures.repository");

async function listOrders() {
  return ordersRepository.getAllOrders();
}

function getOrderDateStr(order) {
  const d = order.updatedAt || order.createdAt || order.date;
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Returns only operationally active orders:
 * - Non-closed/non-cancelled OR
 * - Closed/cancelled but their date has NOT been closed with Z (chiusura cassa)
 * Used by Sala, Cassa, Supervisor active view.
 */
async function listActiveOrders() {
  const all = ordersRepository.getAllOrders();
  const closures = await closuresRepository.listClosures({});
  const closedDates = new Set(
    (closures || []).map((c) => String(c.date || "").slice(0, 10)).filter(Boolean)
  );

  return all.filter((o) => {
    const status = String(o.status || "").toLowerCase();
    if (status !== "chiuso" && status !== "annullato") return true;
    const dateStr = getOrderDateStr(o);
    if (!dateStr) return true;
    return !closedDates.has(dateStr);
  });
}

/**
 * Returns all orders for a specific date (for storico giornaliero).
 */
async function listOrdersByDate(dateStr) {
  const all = ordersRepository.getAllOrders();
  const target = String(dateStr || "").slice(0, 10);
  if (!target) return [];

  return all.filter((o) => {
    const d = getOrderDateStr(o);
    return d === target;
  });
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
  listActiveOrders,
  listOrdersByDate,
  createOrder,
  setStatus,
  tryMarkOrderInventoryProcessed,
  getOrderDateStr,
};