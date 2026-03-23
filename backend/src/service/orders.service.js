// backend/src/service/orders.service.js
// Business logic for orders. Data access via orders.repository only.

const ordersRepository = require("../repositories/orders.repository");
const cashRepository = require("../repositories/cash.repository.sql");

async function listOrders() {
  try {
    const orders = await ordersRepository.getAllOrders();
    return Array.isArray(orders) ? orders : [];
  } catch (err) {
    // CORE PROTECTION: order listing must never crash because of IO/parsing issues.
    return [];
  }
}

async function getOrderById(id) {
  return ordersRepository.getOrderById(id);
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
 * Returns only operationally active orders.
 * EXCLUDES: chiuso, annullato, closed, cancelled, archived, pagato (final states).
 * Used by Sala, Cassa, Supervisor active view. Closed/cancelled never appear in active.
 *
 * HARD RULE: this function must NEVER throw. Optional business intelligence
 * (recipes, food cost, inventory, reports, AI) must not be required here.
 */
async function listActiveOrders() {
  let all = [];
  try {
    all = await ordersRepository.getAllOrders();
  } catch (err) {
    // If anything goes wrong reading orders, return an empty list instead of breaking UI.
    all = [];
  }
  const excludeStatuses = ["chiuso", "annullato", "closed", "cancelled", "archived", "pagato", "paid"];
  return all.filter((o) => {
    const status = String(o.status || "").toLowerCase().trim();
    return !excludeStatuses.includes(status);
  });
}

/**
 * Returns all orders for a specific date (for storico giornaliero).
 */
async function listOrdersByDate(dateStr) {
  const all = await ordersRepository.getAllOrders();
  const target = String(dateStr || "").slice(0, 10);
  if (!target) return [];

  return all.filter((o) => {
    const d = getOrderDateStr(o);
    return d === target;
  });
}

function normalizeItemCourse(it) {
  const c = Number(it && it.course);
  const course = Number.isFinite(c) && c >= 1 ? Math.floor(c) : 1;
  return { ...it, course };
}

async function createOrder(payload) {
  const body = payload || {};
  const orders = await ordersRepository.getAllOrders();
  const id = await ordersRepository.getNextId(orders);
  const now = new Date().toISOString();

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems.map(normalizeItemCourse);

  const ac = Number(body.activeCourse);
  const activeCourse = Number.isFinite(ac) && ac >= 1 ? Math.floor(ac) : 1;

  const newOrder = {
    id,
    table: body.table ?? null,
    covers: body.covers ?? null,
    area: body.area || "sala",
    waiter: body.waiter || "",
    notes: body.notes || "",
    items,
    activeCourse,
    status: "in_attesa",
    createdAt: now,
    updatedAt: now,
  };

  orders.push(newOrder);
  await ordersRepository.saveAllOrders(orders);
  return newOrder;
}

async function patchOrderFoodCost(id, { totalCost, totalPrice, margin }) {
  const orders = await ordersRepository.getAllOrders();
  const target = orders.find((o) => String(o.id) === String(id));
  if (!target) return null;
  target.totalCost = totalCost;
  target.totalPrice = totalPrice;
  target.margin = margin;
  target.updatedAt = new Date().toISOString();
  await ordersRepository.saveAllOrders(orders);
  return target;
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

  await ordersRepository.saveAllOrders(orders);
  try {
    await cashRepository.recordSaleAfterOrderStatusIfNeeded(target);
  } catch (err) {
    console.warn("[Cash] recordSaleAfterOrderStatusIfNeeded:", err && err.message ? err.message : err);
  }
  return target;
}

async function setActiveCourse(id, activeCourse) {
  const n = Number(activeCourse);
  if (!Number.isFinite(n) || n < 1) {
    const err = new Error("activeCourse deve essere un numero intero >= 1");
    err.status = 400;
    throw err;
  }
  const orders = await ordersRepository.getAllOrders();
  const target = orders.find((o) => String(o.id) === String(id));
  if (!target) {
    const err = new Error("Ordine non trovato");
    err.status = 404;
    throw err;
  }
  target.activeCourse = Math.floor(n);
  target.updatedAt = new Date().toISOString();
  await ordersRepository.saveAllOrders(orders);
  return target;
}

/**
 * Try to mark order as inventory-processed. Returns true if we marked it (caller should deduct),
 * false if already marked (idempotent – do not deduct again).
 */
async function tryMarkOrderInventoryProcessed(id) {
  const orders = await ordersRepository.getAllOrders();
  const target = orders.find((o) => String(o.id) === String(id));
  if (!target) return false;
  if (target.inventoryProcessedAt) return false;

  target.inventoryProcessedAt = new Date().toISOString();
  await ordersRepository.saveAllOrders(orders);
  return true;
}

module.exports = {
  listOrders,
  getOrderById,
  listActiveOrders,
  listOrdersByDate,
  createOrder,
  patchOrderFoodCost,
  setStatus,
  setActiveCourse,
  tryMarkOrderInventoryProcessed,
  getOrderDateStr,
};