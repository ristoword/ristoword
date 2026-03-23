// backend/src/service/ai-context.service.js
// Builds summarized operational context for OpenAI from real Ristoword repositories.
// Reuses same data sources as ai-assistant.service.js but produces a single JSON summary.

const ordersRepository = require("../repositories/orders.repository");
const inventoryRepository = require("../repositories/inventory.repository");
const paymentsRepository = require("../repositories/payments.repository");
const recipesRepository = require("../repositories/recipes.repository");
const reportsRepository = require("../repositories/reports.repository");
const orderFoodCostsRepository = require("../repositories/order-food-costs.repository");
const bookingsRepository = require("../repositories/bookings.repository");
const { summarizeOrders } = require("./reports.service");

function isSameDay(d1, d2) {
  if (!d1 || !d2) return false;
  const a = new Date(d1);
  const b = new Date(d2);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const DEPARTMENTS = ["cucina", "sala", "bar", "proprieta"];

/**
 * Gather all relevant operational data for a user question.
 * Returns a compact summary (not raw DB dumps) to keep prompt efficient.
 */
async function buildContextForQuery() {
  console.log("[AI CONTEXT] buildContextForQuery global start");
  const today = new Date();
  const dateFrom = new Date(today);
  dateFrom.setHours(0, 0, 0, 0);
  const dateTo = new Date(today);
  dateTo.setHours(23, 59, 59, 999);

  const [allOrders, payments, inventory, recipes, dailyData, bookings, foodCosts] =
    await Promise.all([
      ordersRepository.getAllOrders(),
      paymentsRepository.listPayments({
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
      }),
      Promise.resolve(inventoryRepository.getAll()),
      recipesRepository.getAll(),
      reportsRepository.getDailyData(today),
      bookingsRepository.getAll(),
      Promise.resolve(orderFoodCostsRepository.readAll()),
    ]);

  const dailyOrders = (allOrders || []).filter((o) =>
    isSameDay(o.updatedAt || o.createdAt, today)
  );
  const dailyPayments = (payments || []).filter((p) =>
    isSameDay(p.closedAt || p.createdAt, today)
  );

  // Active orders summary
  const activeOrders = (allOrders || []).filter(
    (o) =>
      String(o.status || "").toLowerCase() !== "chiuso" &&
      String(o.status || "").toLowerCase() !== "annullato"
  );
  const pendingCount = activeOrders.filter((o) => {
    const s = String(o.status || "").toLowerCase();
    return s === "in_attesa" || s === "in_preparazione";
  }).length;
  const readyCount = activeOrders.filter(
    (o) => String(o.status || "").toLowerCase() === "pronto"
  ).length;

  // Low stock
  const lowStock = (inventory || [])
    .filter(
      (item) =>
        Number(item.quantity ?? item.central ?? item.stock ?? 0) <=
          Number(item.threshold ?? item.min_stock ?? 0) &&
        Number(item.threshold ?? item.min_stock ?? 0) > 0
    )
    .map((item) => ({
      name: item.name || "Senza nome",
      quantity: Number(item.quantity ?? item.central ?? item.stock ?? 0),
      threshold: Number(item.threshold ?? item.min_stock ?? 0),
    }));

  // Department-level low stock and transfer suggestions
  const centralLow = [];
  const deptLow = {};
  const suggestTransfer = [];
  DEPARTMENTS.forEach((d) => {
    deptLow[d] = [];
  });
  for (const item of inventory || []) {
    const central = Number(item.central ?? item.quantity ?? 0) || 0;
    const threshold = Number(item.threshold ?? item.min_stock ?? 0) || 0;
    const name = item.name || "Senza nome";
    if (threshold > 0 && central <= threshold) {
      centralLow.push({ name, quantity: central, threshold });
    }
    for (const dept of DEPARTMENTS) {
      const qty = Number(item.stocks && item.stocks[dept]) || 0;
      if (threshold > 0 && qty > 0 && qty <= threshold) {
        (deptLow[dept] || (deptLow[dept] = [])).push({
          name,
          quantity: qty,
          threshold,
        });
      }
      if (central > 0 && qty === 0) {
        suggestTransfer.push({
          product: name,
          unit: item.unit || "un",
          central,
          to: dept,
        });
      }
    }
  }

  // Sales summary
  const ordersSummary = summarizeOrders(dailyOrders || []);
  let revenueToday = 0;
  let covers = 0;
  for (const p of dailyPayments || []) {
    revenueToday += Number(p.total) || 0;
    covers += Number(p.covers) || 0;
  }
  if (covers === 0 && ordersSummary.totalCoversEstimated > 0) {
    covers = ordersSummary.totalCoversEstimated;
  }
  const topItems = (ordersSummary.topItems || [])
    .slice(0, 10)
    .map((t) => ({
      name: t.name || "Senza nome",
      qty: Number(t.qty) || 0,
      revenue: Math.round((Number(t.revenue) || 0) * 100) / 100,
    }));
  const paymentCount = (dailyPayments || []).length;
  const averageTicket =
    paymentCount > 0
      ? revenueToday / paymentCount
      : (ordersSummary.totalOrderValueEstimated || 0) /
        Math.max(1, (dailyOrders || []).length);

  // Recipes / food cost (compact)
  const todayStr = today.toISOString().slice(0, 10);
  const todayFoodCost = (foodCosts || [])
    .filter((r) => String(r.date || "").slice(0, 10) === todayStr)
    .reduce((sum, r) => sum + (Number(r.totalFoodCost) || 0), 0);
  const recipeList = (recipes || [])
    .slice(0, 15)
    .map((r) => ({
      name: r.menuItemName || r.name || "Senza nome",
      sellingPrice: Number(r.sellingPrice ?? r.selling_price ?? 0),
      targetFoodCost: Number(r.targetFoodCost ?? r.target_food_cost ?? 0),
      yieldPortions: Number(r.yieldPortions ?? r.yield_portions ?? 1),
    }));

  // Bookings today
  const bookingsToday = (bookings || []).filter((b) =>
    isSameDay(b.date || b.time, today)
  ).length;

  // Expiring items (next 7 days)
  const expiringItems = (inventory || [])
    .filter((item) => {
      const exp = item.expiresAt || item.expiryDate || item.expires;
      if (!exp) return false;
      const expDate = new Date(exp);
      const daysUntil =
        (expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
      return daysUntil >= 0 && daysUntil <= 7;
    })
    .map((item) => ({
      name: item.name || "Senza nome",
      expiresAt: item.expiresAt || item.expiryDate || item.expires,
    }));

  const ctx = {
    activeOrders: {
      total: activeOrders.length,
      pending: pendingCount,
      ready: readyCount,
      sampleTables: activeOrders
        .slice(0, 5)
        .map((o) => ({ table: o.table, status: o.status })),
    },
    lowStock: {
      central: centralLow.slice(0, 15),
      byDepartment: Object.fromEntries(
        Object.entries(deptLow).filter(([, v]) => v.length > 0)
      ),
      all: lowStock.slice(0, 20),
    },
    suggestTransfer: suggestTransfer.slice(0, 10),
    sales: {
      revenueToday: Math.round(revenueToday * 100) / 100,
      covers,
      averageTicket: Math.round(averageTicket * 100) / 100,
      topItems,
      paymentCount,
      closedOrders: ordersSummary.closedOrders || 0,
    },
    recipes: {
      todayFoodCost: Math.round(todayFoodCost * 100) / 100,
      sample: recipeList,
    },
    bookingsToday,
    expiringItems: expiringItems.slice(0, 10),
  };

  console.log("[AI CONTEXT] buildContextForQuery global done");
  return ctx;
}

module.exports = {
  buildContextForQuery,
};
