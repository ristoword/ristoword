const ordersRepository = require("../repositories/orders.repository");
const paymentsRepository = require("../repositories/payments.repository");
const reportsRepository = require("../repositories/reports.repository");
const closuresRepository = require("../repositories/closures.repository");
const orderFoodCostsRepository = require("../repositories/order-food-costs.repository");
const recipesRepository = require("../repositories/recipes.repository");
const paymentsService = require("./payments.service");
const inventoryService = require("./inventory.service");

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isSameDay(dateValue, targetDate) {
  const d = normalizeDate(dateValue);
  const t = normalizeDate(targetDate);
  if (!d || !t) return false;

  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

function getOrderTotal(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.reduce((acc, item) => {
    const price = toNumber(item.price, 0);
    const qty = toNumber(item.qty, 1);
    return acc + price * qty;
  }, 0);
}

function getPaymentDate(payment) {
  return payment.closedAt || payment.createdAt || null;
}

function summarizeOrders(orders = []) {
  const summary = {
    totalOrders: orders.length,
    openOrders: 0,
    servedOrders: 0,
    closedOrders: 0,
    totalCoversEstimated: 0,
    totalOrderValueEstimated: 0,
    tablesWorked: 0,
    topItems: []
  };

  const tableSet = new Set();
  const itemMap = new Map();

  for (const order of orders) {
    const status = String(order.status || "").toLowerCase();
    const table = order.table != null ? String(order.table) : "-";
    const covers = toNumber(order.covers, 0);
    const items = Array.isArray(order.items) ? order.items : [];

    summary.totalCoversEstimated += covers;
    summary.totalOrderValueEstimated += getOrderTotal(order);

    if (table) tableSet.add(table);

    if (status === "chiuso") summary.closedOrders += 1;
    else if (status === "servito") summary.servedOrders += 1;
    else summary.openOrders += 1;

    for (const item of items) {
      const name = String(item.name || "Senza nome").trim();
      const qty = toNumber(item.qty, 1);
      const revenue = toNumber(item.price, 0) * qty;

      if (!itemMap.has(name)) {
        itemMap.set(name, {
          name,
          qty: 0,
          revenue: 0
        });
      }

      const current = itemMap.get(name);
      current.qty += qty;
      current.revenue += revenue;
    }
  }

  summary.tablesWorked = tableSet.size;
  summary.topItems = [...itemMap.values()]
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  return summary;
}

function summarizePayments(payments = []) {
  const summary = {
    totalPayments: payments.length,
    gross: 0,
    discountAmount: 0,
    vatAmount: 0,
    net: 0,
    covers: 0,
    averageReceipt: 0,
    byMethod: {}
  };

  for (const payment of payments) {
    const subtotal = toNumber(payment.subtotal, 0);
    const discountAmount = toNumber(payment.discountAmount, 0);
    const vatAmount = toNumber(payment.vatAmount, 0);
    const total = toNumber(payment.total, 0);
    const covers = toNumber(payment.covers, 0);
    const method = String(payment.paymentMethod || "unknown").trim().toLowerCase();

    summary.gross += subtotal;
    summary.discountAmount += discountAmount;
    summary.vatAmount += vatAmount;
    summary.net += total;
    summary.covers += covers;

    if (!summary.byMethod[method]) {
      summary.byMethod[method] = {
        count: 0,
        total: 0
      };
    }

    summary.byMethod[method].count += 1;
    summary.byMethod[method].total += total;
  }

  summary.averageReceipt =
    summary.totalPayments > 0 ? summary.net / summary.totalPayments : 0;

  return summary;
}

async function buildDailyReport(targetDate = new Date()) {
  const { orders: dailyOrders, payments: dailyPayments } = await reportsRepository.getDailyData(targetDate);

  const ordersSummary = summarizeOrders(dailyOrders);
  const paymentsSummary = summarizePayments(dailyPayments);

  return {
    date: new Date(targetDate).toISOString(),
    orders: ordersSummary,
    payments: paymentsSummary,
    kpi: {
      openOrders: ordersSummary.openOrders,
      servedOrders: ordersSummary.servedOrders,
      closedOrders: ordersSummary.closedOrders,
      tablesWorked: ordersSummary.tablesWorked,
      estimatedOrderValue: ordersSummary.totalOrderValueEstimated,
      grossRevenue: paymentsSummary.gross,
      netRevenue: paymentsSummary.net,
      discounts: paymentsSummary.discountAmount,
      vat: paymentsSummary.vatAmount,
      covers: paymentsSummary.covers,
      averageReceipt: paymentsSummary.averageReceipt
    }
  };
}

/**
 * Dashboard summary: aggregates daily report, current shift, ready orders, alerts.
 * Used by dashboard frontend for live operational control.
 */
async function buildDashboardSummary(targetDate = new Date()) {
  const date = normalizeDate(targetDate) || new Date();
  const dateStr = date.toISOString().slice(0, 10);

  const [dailyReport, cashStatus, dayClosed] = await Promise.all([
    buildDailyReport(date),
    paymentsService.getCurrentShift(),
    closuresRepository.isDayClosed(dateStr),
  ]);

  const allOrders = ordersRepository.getAllOrders();
  const dailyOrders = allOrders.filter((o) =>
    isSameDay(o.updatedAt || o.createdAt, date)
  );

  const readyOrdersCount = dailyOrders.filter(
    (o) => String(o.status || "").toLowerCase() === "pronto"
  ).length;

  const ordersInPreparationCount = dailyOrders.filter((o) => {
    const s = String(o.status || "").toLowerCase();
    return ["in_attesa", "in_preparazione"].includes(s);
  }).length;

  const openTablesSet = new Set();
  dailyOrders.forEach((o) => {
    const s = String(o.status || "").toLowerCase();
    if (!["chiuso", "annullato"].includes(s)) {
      openTablesSet.add(String(o.table != null ? o.table : "-"));
    }
  });
  const openTablesCount = openTablesSet.size;

  const lateOrdersCount = dailyOrders.filter((o) => {
    const status = String(o.status || "").toLowerCase();
    if (["pronto", "servito", "chiuso", "annullato"].includes(status)) return false;
    const ts = o.updatedAt || o.createdAt;
    if (!ts) return false;
    const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    return mins >= 15;
  }).length;

  const inventoryLowStockCount = inventoryService.getLowStockCount();
  const totalFoodCostToday = orderFoodCostsRepository.getTotalFoodCostForDate(date);

  const topItems = dailyReport.orders?.topItems || [];
  const topProfitableItems = [];
  for (const item of topItems.slice(0, 5)) {
    const name = item.name || "";
    const revenue = toNumber(item.revenue, 0);
    const qty = toNumber(item.qty, 1);
    const recipe = await recipesRepository.getByMenuItemName(name);
    const foodCost = recipe ? inventoryService.calculateRecipeIngredientCost(recipe, qty) : 0;
    topProfitableItems.push({
      name,
      revenue,
      foodCost,
      margin: revenue - foodCost,
      qty,
    });
  }

  const alerts = [];
  if (dayClosed) alerts.push({ id: "day_closed", type: "info", message: "Giornata chiusa con Z" });
  if (!cashStatus.hasOpenShift && !dayClosed) alerts.push({ id: "cash_closed", type: "warn", message: "Cassa chiusa" });
  if (lateOrdersCount > 0) alerts.push({ id: "orders_late", type: "warn", message: `${lateOrdersCount} ordine/i in ritardo` });
  if (readyOrdersCount > 0) alerts.push({ id: "ready_pickup", type: "info", message: `${readyOrdersCount} ordine/i pronti da ritirare` });
  if (inventoryLowStockCount > 0) alerts.push({ id: "inventory_low", type: "warn", message: `${inventoryLowStockCount} ingrediente/i sotto scorta minima` });

  return {
    date: date.toISOString(),
    dayClosed,
    kpi: {
      ...dailyReport.kpi,
      readyOrdersCount,
      ordersInPreparationCount,
      openTablesCount,
      lateOrdersCount,
      inventoryLowStockCount,
      totalFoodCostToday,
    },
    paymentsByMethod: dailyReport.payments?.byMethod || {},
    topProfitableItems,
    cash: {
      hasOpenShift: cashStatus.hasOpenShift,
      shift: cashStatus.shift || null,
    },
    alerts,
  };
}

/**
 * Report per commercialista: totali giornalieri, breakdown metodi pagamento,
 * conteggio transazioni, chiusure con operatore.
 */
async function buildAccountantReport(dateFrom, dateTo) {
  const from = normalizeDate(dateFrom) || new Date();
  const to = normalizeDate(dateTo) || new Date();
  if (!from || !to || from > to) {
    return { error: "Date non valide", dateFrom: from, dateTo: to };
  }

  const allPayments = await paymentsRepository.listPayments({});
  const allOrders = ordersRepository.getAllOrders();
  const closures = await closuresRepository.listClosures({
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  });

  const days = [];
  let d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);

  while (d <= end) {
    const dayStr = d.toISOString().slice(0, 10);
    const dailyPayments = allPayments.filter((p) =>
      isSameDay(getPaymentDate(p), d)
    );
    const dailyOrders = allOrders.filter((o) =>
      isSameDay(o.updatedAt || o.createdAt, d)
    );
    const closedOrders = dailyOrders.filter(
      (o) => String(o.status || "").toLowerCase() === "chiuso"
    );

    const paySummary = summarizePayments(dailyPayments);
    const closure = closures.find((c) => String(c.date || "").slice(0, 10) === dayStr);

    days.push({
      date: dayStr,
      totals: {
        gross: paySummary.gross,
        net: paySummary.net,
        discounts: paySummary.discountAmount,
        vat: paySummary.vatAmount,
        covers: paySummary.covers,
      },
      paymentMethodsBreakdown: paySummary.byMethod,
      transactionCount: paySummary.totalPayments,
      closedOrdersCount: closedOrders.length,
      closure: closure
        ? {
            closedAt: closure.closedAt,
            closedBy: closure.closedBy,
            grandTotal: closure.grandTotal,
            notes: closure.notes,
          }
        : null,
    });

    d.setDate(d.getDate() + 1);
  }

  const grandTotals = days.reduce(
    (acc, day) => {
      acc.gross += day.totals.gross;
      acc.net += day.totals.net;
      acc.discounts += day.totals.discounts;
      acc.vat += day.totals.vat;
      acc.covers += day.totals.covers;
      acc.transactionCount += day.transactionCount;
      acc.closedOrdersCount += day.closedOrdersCount;
      acc.closedDaysCount += day.closure ? 1 : 0;
      return acc;
    },
    {
      gross: 0,
      net: 0,
      discounts: 0,
      vat: 0,
      covers: 0,
      transactionCount: 0,
      closedOrdersCount: 0,
      closedDaysCount: 0,
    }
  );

  const byMethodAggregated = {};
  for (const day of days) {
    for (const [method, data] of Object.entries(day.paymentMethodsBreakdown || {})) {
      if (!byMethodAggregated[method]) {
        byMethodAggregated[method] = { count: 0, total: 0 };
      }
      byMethodAggregated[method].count += data.count;
      byMethodAggregated[method].total += data.total;
    }
  }

  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    grandTotals,
    paymentMethodsBreakdown: byMethodAggregated,
    days,
    closuresSummary: days
      .filter((d) => d.closure)
      .map((d) => ({
        date: d.date,
        closedBy: d.closure.closedBy,
        closedAt: d.closure.closedAt,
        grandTotal: d.closure.grandTotal,
      })),
  };
}

module.exports = {
  buildDailyReport,
  buildDashboardSummary,
  buildAccountantReport,
  summarizeOrders,
  summarizePayments,
};