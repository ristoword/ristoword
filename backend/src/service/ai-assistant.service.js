const ordersRepository = require("../repositories/orders.repository");
const inventoryRepository = require("../repositories/inventory.repository");
const paymentsRepository = require("../repositories/payments.repository");
const recipesRepository = require("../repositories/recipes.repository");
const reportsRepository = require("../repositories/reports.repository");
const orderFoodCostsRepository = require("../repositories/order-food-costs.repository");
const bookingsRepository = require("../repositories/bookings.repository");
const { summarizeOrders } = require("./reports.service");

const LATE_MINUTES = 15;
const DEPARTMENTS = ["cucina", "pizzeria", "bar"];

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

/**
 * 1. ORDERS ANALYSIS
 */
function analyzeOrders(dailyOrders) {
  let open = 0;
  let preparing = 0;
  let late = 0;
  const byDepartment = { cucina: 0, pizzeria: 0, bar: 0 };
  const now = Date.now();

  for (const o of dailyOrders || []) {
    const status = String(o.status || "").toLowerCase();
    if (status === "chiuso" || status === "annullato") continue;

    open += 1;
    const ts = o.updatedAt || o.createdAt;
    const minsOld = ts ? Math.floor((now - new Date(ts).getTime()) / 60000) : 0;
    const isLate = minsOld >= LATE_MINUTES;

    if (["in_attesa", "in_preparazione"].includes(status)) {
      preparing += 1;
      if (isLate) late += 1;
    }

    const area = String(o.area || "cucina").toLowerCase();
    if (DEPARTMENTS.includes(area)) {
      byDepartment[area] = (byDepartment[area] || 0) + 1;
    } else {
      byDepartment.cucina = (byDepartment.cucina || 0) + 1;
    }
  }

  const busiest = Object.entries(byDepartment)
    .sort((a, b) => (b[1] || 0) - (a[1] || 0))[0];
  const busiestDepartment = busiest && busiest[1] > 0 ? busiest[0] : null;

  return {
    open,
    preparing,
    late,
    busiestDepartment,
    byDepartment,
  };
}

/**
 * 2. SALES ANALYSIS
 */
function analyzeSales(dailyPayments, dailyOrders) {
  let revenueToday = 0;
  let covers = 0;
  for (const p of dailyPayments || []) {
    revenueToday += Number(p.total) || 0;
    covers += Number(p.covers) || 0;
  }

  const summary = summarizeOrders(dailyOrders || []);
  const topItems = (summary.topItems || [])
    .slice(0, 10)
    .map((t) => ({ name: t.name || "Senza nome", qty: Number(t.qty) || 0 }));

  const paymentCount = (dailyPayments || []).length;
  const averageTicket =
    paymentCount > 0 ? revenueToday / paymentCount : 0;

  return {
    revenueToday: Math.round(revenueToday * 100) / 100,
    covers,
    averageTicket: Math.round(averageTicket * 100) / 100,
    topItems,
  };
}

/**
 * 3. INVENTORY ANALYSIS
 */
function analyzeInventory(inventory) {
  const lowStock = (inventory || [])
    .filter(
      (item) =>
        Number(item.quantity || item.stock || 0) <=
          Number(item.threshold || item.min_stock || 0) &&
        Number(item.threshold || item.min_stock || 0) > 0
    )
    .map((item) => ({
      name: item.name || "Senza nome",
      quantity: Number(item.quantity || item.stock || 0),
    }));

  return { lowStock };
}

/**
 * 4. KITCHEN PRODUCTION ANALYSIS
 * Determines fastest-selling dishes and suggests prep quantities.
 */
function analyzeProduction(topItems, recipes) {
  const recommendedPrep = [];
  const PREP_MULTIPLIER = 0.5;
  const MIN_PREP = 2;
  const MAX_PREP = 10;

  for (let i = 0; i < Math.min(5, topItems.length); i++) {
    const item = topItems[i];
    const qty = Number(item.qty) || 0;
    const suggestedQty = Math.min(
      MAX_PREP,
      Math.max(MIN_PREP, Math.ceil(qty * PREP_MULTIPLIER))
    );
    recommendedPrep.push({
      item: item.name || "Senza nome",
      suggestedQty,
    });
  }

  return { recommendedPrep };
}

/**
 * 5. OPERATIONAL SUGGESTION ENGINE
 */
function buildOperationalSuggestion(data) {
  const {
    orders,
    sales,
    inventory,
    production,
  } = data;

  const parts = [];
  const actions = [];

  if (orders.late > 0) {
    parts.push(`${orders.late} ordini in ritardo`);
    actions.push("priorità cucina");
  }
  if (orders.preparing > 0 && orders.late === 0) {
    parts.push(`${orders.preparing} ordini in preparazione`);
  }

  const topItem = sales.topItems[0];
  if (topItem && topItem.qty > 0) {
    parts.push(`${topItem.name} è il piatto più venduto oggi (${topItem.qty})`);
  }

  if (inventory.lowStock.length > 0) {
    const names = inventory.lowStock
      .slice(0, 3)
      .map((x) => x.name)
      .join(", ");
    parts.push(`scorte basse: ${names}`);
    actions.push("verifica magazzino");
  }

  if (production.recommendedPrep.length > 0) {
    const prep = production.recommendedPrep[0];
    actions.push(`prepara altre ${prep.suggestedQty} porzioni di ${prep.item}`);
  }

  let suggestion = "";
  if (parts.length > 0) {
    suggestion = `Ci sono ${parts.join(". ")}. `;
  }
  if (actions.length > 0) {
    suggestion += `Suggerimento: ${actions.join(" e ")}.`;
  }
  if (!suggestion) {
    suggestion = "Situazione operativa stabile. Nessun alert.";
  }

  return suggestion;
}

/**
 * Gather all operational data in one pass to avoid duplicate repository reads.
 */
async function gatherOperationalData() {
  const today = new Date();
  const dateFrom = new Date(today);
  dateFrom.setHours(0, 0, 0, 0);
  const dateTo = new Date(today);
  dateTo.setHours(23, 59, 59, 999);

  const [allOrders, payments, inventory, recipes] = await Promise.all([
    Promise.resolve(ordersRepository.getAllOrders()),
    paymentsRepository.listPayments({
      dateFrom: dateFrom.toISOString(),
      dateTo: dateTo.toISOString(),
    }),
    Promise.resolve(inventoryRepository.getAll()),
    recipesRepository.getAll(),
  ]);

  const dailyOrders = (allOrders || []).filter((o) =>
    isSameDay(o.updatedAt || o.createdAt, today)
  );
  const dailyPayments = (payments || []).filter((p) =>
    isSameDay(p.closedAt || p.createdAt, today)
  );

  return {
    dailyOrders,
    dailyPayments,
    inventory,
    recipes: recipes || [],
  };
}

/**
 * Compute full operational status for AI Supervisor.
 */
async function getOperationalStatus() {
  const { dailyOrders, dailyPayments, inventory, recipes } =
    await gatherOperationalData();

  const orders = analyzeOrders(dailyOrders);
  const sales = analyzeSales(dailyPayments, dailyOrders);
  const inventoryAnalysis = analyzeInventory(inventory);
  const production = analyzeProduction(sales.topItems, recipes);

  const suggestion = buildOperationalSuggestion({
    orders,
    sales,
    inventory: inventoryAnalysis,
    production,
  });

  return {
    orders: {
      open: orders.open,
      preparing: orders.preparing,
      late: orders.late,
    },
    sales: {
      revenueToday: sales.revenueToday,
      covers: sales.covers,
      averageTicket: sales.averageTicket,
      topItems: sales.topItems,
    },
    inventory: {
      lowStock: inventoryAnalysis.lowStock,
    },
    production: {
      recommendedPrep: production.recommendedPrep,
    },
    suggestion,
  };
}

// =======================
// PREDICTIVE KITCHEN ENGINE
// =======================

const TIME_WINDOW_MINUTES = 60;
const RECENT_VELOCITY_MINUTES = 45;
const PREDICTIVE_PREP_MULTIPLIER = 0.7;

/**
 * Extract sold items from orders, aggregated by item name.
 * @param {Array} orders - Array of order objects
 * @returns {Array} [{ name, qty }] sorted by qty desc
 */
function extractSoldItems(orders) {
  const itemMap = new Map();
  for (const order of orders || []) {
    const items = Array.isArray(order.items) ? order.items : [];
    for (const line of items) {
      const name = String(line.name || "Senza nome").trim();
      const qty = Number(line.qty) || 1;
      if (!name) continue;
      const current = itemMap.get(name) || 0;
      itemMap.set(name, current + qty);
    }
  }
  return [...itemMap.entries()]
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty);
}

/**
 * Compute items sold in the last N minutes.
 * @param {Array} orders - Array of order objects with createdAt/updatedAt
 * @param {number} minutes - Time window in minutes
 * @returns {Array} [{ name, qty }] velocity in that window
 */
function computeRecentVelocity(orders, minutes) {
  const now = Date.now();
  const cutoff = now - minutes * 60 * 1000;
  const recentOrders = (orders || []).filter((o) => {
    const ts = new Date(o.createdAt || o.updatedAt || 0).getTime();
    return ts >= cutoff;
  });
  return extractSoldItems(recentOrders);
}

/**
 * Estimate demand for next time window based on velocity and today's totals.
 * @param {Array} todayItems - Items sold today [{ name, qty }]
 * @param {Array} velocityItems - Items sold in recent window [{ name, qty }]
 * @returns {Array} [{ item, predictedQty, confidence }]
 */
function estimateNextDemand(todayItems, velocityItems) {
  const velocityMap = new Map(
    (velocityItems || []).map((x) => [x.name.toLowerCase(), x.qty])
  );
  const todayMap = new Map(
    (todayItems || []).map((x) => [x.name.toLowerCase(), x.qty])
  );

  const allNames = new Set([...velocityMap.keys(), ...todayMap.keys()]);
  const predictions = [];

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const minutesElapsed = (now - startOfDay) / (60 * 1000) || 1;

  for (const nameLower of allNames) {
    const velQty = velocityMap.get(nameLower) || 0;
    const todayQty = todayMap.get(nameLower) || 0;

    let predictedQty = 0;
    let confidence = "low";

    if (velQty > 0) {
      predictedQty = Math.ceil(
        velQty * (TIME_WINDOW_MINUTES / RECENT_VELOCITY_MINUTES)
      );
      confidence = "high";
    } else if (todayQty > 0) {
      const ratePerMinute = todayQty / minutesElapsed;
      predictedQty = Math.ceil(ratePerMinute * TIME_WINDOW_MINUTES);
      confidence = "medium";
    } else continue;

    const displayName =
      todayItems.find((x) => x.name.toLowerCase() === nameLower)?.name ||
      velocityItems.find((x) => x.name.toLowerCase() === nameLower)?.name ||
      nameLower;

    predictions.push({
      item: displayName,
      predictedQty: Math.max(0, predictedQty),
      confidence,
    });
  }

  return predictions
    .filter((p) => p.predictedQty > 0)
    .sort((a, b) => b.predictedQty - a.predictedQty)
    .slice(0, 10);
}

/**
 * Generate prep suggestions from predictions with Italian reasons.
 */
function generatePrepSuggestions(predictions) {
  return (predictions || []).slice(0, 5).map((p) => {
    const suggestedQty = Math.max(
      2,
      Math.min(10, Math.ceil(p.predictedQty * PREDICTIVE_PREP_MULTIPLIER))
    );
    let reason = "Basato su vendite di oggi.";
    if (p.confidence === "high") {
      reason = `Alta velocità ordini ultimi ${RECENT_VELOCITY_MINUTES} minuti.`;
    } else if (p.confidence === "medium") {
      reason = "Media velocità su base giornaliera.";
    }
    return {
      item: p.item,
      suggestedQty,
      reason,
    };
  });
}

/**
 * Generate stock warnings for predicted items based on recipe ingredients.
 */
function generateStockWarnings(predictions, inventory, recipes) {
  const warnings = [];
  const lowStockSet = new Set();
  const invItems = (inventory || []).map((i) => ({
    name: String(i.name || "").trim().toLowerCase(),
    quantity: Number(i.quantity || i.stock || 0),
    threshold: Number(i.threshold || i.min_stock || 0),
    displayName: i.name || "Senza nome",
  }));

  for (const inv of invItems) {
    if (inv.threshold > 0 && inv.quantity <= inv.threshold) {
      lowStockSet.add(inv.name);
    }
  }

  const recipeMap = new Map();
  for (const r of recipes || []) {
    const menuName = String(r.menuItemName || r.menu_item_name || r.name || "")
      .trim()
      .toLowerCase();
    const ingredients = Array.isArray(r.ingredients) ? r.ingredients : [];
    recipeMap.set(menuName, ingredients);
  }

  for (const p of predictions || []) {
    const itemLower = String(p.item || "").trim().toLowerCase();
    const ingredients = recipeMap.get(itemLower) || [];
    for (const ing of ingredients) {
      const ingName = String(ing.name || "").trim().toLowerCase();
      const inv = invItems.find((i) => i.name === ingName);
      if (inv && lowStockSet.has(ingName)) {
        warnings.push({
          item: p.item,
          ingredient: inv.displayName,
          quantity: inv.quantity,
          message: `${inv.displayName} sotto soglia (${inv.quantity}). Necessario per ${p.item}.`,
        });
      }
    }
  }

  return warnings;
}

/**
 * Build Italian suggestion for predictive kitchen.
 */
function buildPredictiveSuggestion(recommendedPrep, stockWarnings) {
  if (recommendedPrep.length === 0) {
    return "Nessuna preparazione urgente consigliata al momento.";
  }

  const top = recommendedPrep[0];
  const itemName =
    top.item.toLowerCase().includes("margherita") ||
    top.item.toLowerCase().includes("pizza")
      ? "margherite"
      : top.item.toLowerCase().includes("pasta")
        ? "porzioni di pasta"
        : `porzioni di ${top.item}`;

  let msg = `Prepara ${top.suggestedQty} ${itemName} nei prossimi 20 minuti.`;

  if (stockWarnings.length > 0) {
    msg += ` Verifica scorte: ${stockWarnings
      .slice(0, 2)
      .map((w) => w.ingredient)
      .join(", ")}.`;
  }

  return msg;
}

/**
 * Get predictive kitchen analysis.
 */
async function getPredictiveKitchen() {
  const { dailyOrders, dailyPayments, inventory, recipes } =
    await gatherOperationalData();

  const currentLoad = analyzeOrders(dailyOrders);
  const todayItems = extractSoldItems(dailyOrders);
  const velocityItems = computeRecentVelocity(
    dailyOrders,
    RECENT_VELOCITY_MINUTES
  );

  const predictions = estimateNextDemand(todayItems, velocityItems);
  const recommendedPrep = generatePrepSuggestions(predictions);
  const stockWarnings = generateStockWarnings(
    predictions,
    inventory,
    recipes
  );
  const suggestion = buildPredictiveSuggestion(recommendedPrep, stockWarnings);

  return {
    timeWindowMinutes: TIME_WINDOW_MINUTES,
    currentLoad: {
      openOrders: currentLoad.open,
      preparingOrders: currentLoad.preparing,
      lateOrders: currentLoad.late,
    },
    predictions: predictions.map((p) => ({
      item: p.item,
      predictedQty: p.predictedQty,
      confidence: p.confidence,
    })),
    recommendedPrep,
    stockWarnings,
    suggestion,
  };
}

// =======================
// DAILY BRAIN ENGINE
// =======================

const KITCHEN_LOAD_LOW = 3;
const KITCHEN_LOAD_MEDIUM = 8;

/**
 * Get today's orders via reports repository.
 */
async function getTodayOrders(targetDate = new Date()) {
  const { orders } = await reportsRepository.getDailyData(targetDate);
  return orders || [];
}

/**
 * Summarize sales: revenue, covers, average ticket, top items with revenue, top departments.
 */
function summarizeSales(dailyOrders, dailyPayments) {
  const salesSummary = summarizeOrders(dailyOrders || []);
  let revenue = 0;
  let covers = 0;
  for (const p of dailyPayments || []) {
    revenue += Number(p.total) || 0;
    covers += Number(p.covers) || 0;
  }
  if (covers === 0 && salesSummary.totalCoversEstimated > 0) {
    covers = salesSummary.totalCoversEstimated;
  }
  const paymentCount = (dailyPayments || []).length;
  const averageTicket =
    paymentCount > 0 ? revenue / paymentCount : (salesSummary.totalOrderValueEstimated || 0) / Math.max(1, (dailyOrders || []).length);

  const topItems = (salesSummary.topItems || []).slice(0, 10).map((t) => ({
    name: t.name || "Senza nome",
    qty: Number(t.qty) || 0,
    revenue: Math.round((Number(t.revenue) || 0) * 100) / 100,
  }));

  const deptMap = new Map();
  for (const o of dailyOrders || []) {
    let area = String(o.area || "").trim().toLowerCase();
    if (!area && (o.items || []).length > 0) {
      area = String(o.items[0].area || "").trim().toLowerCase();
    }
    const dept = area && DEPARTMENTS.includes(area) ? area : "cucina";
    deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
  }
  const topDepartments = [...deptMap.entries()]
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    revenue: Math.round(revenue * 100) / 100,
    covers,
    averageTicket: Math.round(averageTicket * 100) / 100,
    topItems,
    topDepartments,
  };
}

/**
 * Summarize inventory: low stock items and critical ingredients for top 3 sold items.
 */
function summarizeInventory(inventory, topItemNames, recipes) {
  const lowStock = [];
  const invItems = inventory || [];
  for (const item of invItems) {
    const qty = Number(item.quantity ?? item.stock) || 0;
    const threshold = Number(item.threshold ?? item.min_stock) || 0;
    if (threshold > 0 && qty <= threshold) {
      lowStock.push({
        name: item.name || "Senza nome",
        quantity: qty,
        threshold,
      });
    }
  }

  const recipeMap = new Map();
  for (const r of recipes || []) {
    const menuName = String(r.menuItemName || r.menu_item_name || r.name || "")
      .trim()
      .toLowerCase();
    recipeMap.set(menuName, r);
  }

  const criticalIngredientsForTopItems = [];
  const top3 = (topItemNames || []).slice(0, 3);
  const invMap = new Map(
    invItems.map((i) => [
      String(i.name || "").trim().toLowerCase(),
      { name: i.name, available: Number(i.quantity ?? i.stock) || 0 },
    ])
  );

  for (const itemName of top3) {
    const itemLower = String(itemName || "").trim().toLowerCase();
    const recipe = recipeMap.get(itemLower);
    if (!recipe || !Array.isArray(recipe.ingredients)) continue;
    for (const ing of recipe.ingredients) {
      const ingName = String(ing.name || "").trim().toLowerCase();
      const inv = invMap.get(ingName);
      if (inv) {
        criticalIngredientsForTopItems.push({
          item: itemName,
          ingredient: inv.name || ing.name,
          available: inv.available,
        });
      }
    }
  }

  return { lowStock, criticalIngredientsForTopItems };
}

/**
 * Summarize production: recommended prep (from predictive logic) and kitchen load.
 */
function summarizeProduction(dailyOrders, predictions) {
  const ordersAnalysis = analyzeOrders(dailyOrders);
  const total = ordersAnalysis.open + ordersAnalysis.preparing + ordersAnalysis.late;
  let kitchenLoad = "low";
  if (total > KITCHEN_LOAD_MEDIUM) kitchenLoad = "high";
  else if (total > KITCHEN_LOAD_LOW) kitchenLoad = "medium";

  const recommendedPrep = generatePrepSuggestions(predictions || []);

  return {
    recommendedPrep,
    kitchenLoad,
  };
}

/**
 * Estimate recipe ingredient cost for a dish (using inventory cost_per_unit).
 */
function estimateRecipeCost(recipe, servedQty, inventory) {
  if (!recipe || !Array.isArray(recipe.ingredients)) return 0;
  const invMap = new Map(
    (inventory || []).map((i) => [
      String(i.name || "").trim().toLowerCase(),
      inventoryRepository.getCostPerUnit(i) || Number(i.cost) / Math.max(1, Number(i.quantity || i.stock)),
    ])
  );
  let cost = 0;
  for (const ing of recipe.ingredients) {
    const ingName = String(ing.name || "").trim().toLowerCase();
    const qty = (Number(ing.quantity) ?? Number(ing.qty) ?? 0) * (Number(servedQty) || 1);
    const cpu = invMap.get(ingName) ?? Number(ing.unitCost) ?? 0;
    cost += qty * cpu;
  }
  return cost;
}

/**
 * Summarize food cost: estimated today total and top margin items.
 */
function summarizeFoodCost(dailyOrders, inventory, recipes, topItems, recordedFoodCostToday) {
  const recipeMap = new Map();
  for (const r of recipes || []) {
    const menuName = String(r.menuItemName || r.menu_item_name || r.name || "")
      .trim()
      .toLowerCase();
    recipeMap.set(menuName, r);
  }

  let estimatedFoodCostToday = recordedFoodCostToday;
  if (estimatedFoodCostToday <= 0) {
    for (const o of dailyOrders || []) {
      for (const it of o.items || []) {
        const name = String(it.name || "").trim();
        const qty = Number(it.qty) || 1;
        if (!name) continue;
        const recipe = recipeMap.get(name.toLowerCase());
        if (recipe) {
          estimatedFoodCostToday += estimateRecipeCost(recipe, qty, inventory);
        }
      }
    }
  }

  const topMarginItems = [];
  for (const t of topItems || []) {
    const name = t.name || "";
    const qty = Number(t.qty) || 0;
    const revenue = Number(t.revenue) || 0;
    if (!name || qty <= 0) continue;
    const itemLower = name.trim().toLowerCase();
    const recipe = recipeMap.get(itemLower);
    const foodCost = recipe ? estimateRecipeCost(recipe, qty, inventory) : 0;
    const margin = revenue - foodCost;
    topMarginItems.push({
      name,
      estimatedMargin: Math.round(margin * 100) / 100,
    });
  }

  topMarginItems.sort((a, b) => b.estimatedMargin - a.estimatedMargin);

  return {
    estimatedFoodCostToday: Math.round((estimatedFoodCostToday || 0) * 100) / 100,
    topMarginItems: topMarginItems.slice(0, 5),
  };
}

/**
 * Build Italian operational suggestion for daily brain.
 */
function buildDailyBrainSuggestion(data) {
  const { today, sales, inventory, production } = data;
  const parts = [];
  const actions = [];

  if (today.revenue > 0) {
    parts.push(today.revenue >= 500 ? "Incasso buono" : `Incasso: €${today.revenue}`);
  }

  if (today.lateOrders > 0) {
    parts.push(`cucina sotto pressione: ${today.lateOrders} ordini in ritardo`);
    actions.push("priorità ordini in ritardo");
  } else if (today.preparingOrders > 0) {
    parts.push(`${today.preparingOrders} ordini in preparazione`);
  }

  const topItem = sales.topItems?.[0];
  if (topItem && topItem.qty > 0) {
    const itemLabel = topItem.name.toLowerCase().includes("pizza") || topItem.name.toLowerCase().includes("margherita")
      ? "la " + topItem.name.split(" ").pop()
      : topItem.name;
    parts.push(`${itemLabel} è il piatto più richiesto`);
  }

  const lowNames = (inventory.lowStock || []).slice(0, 3).map((x) => x.name);
  if (lowNames.length > 0) {
    parts.push(`${lowNames.join(" e ")} ${lowNames.length === 1 ? "è bassa" : "sono basse"}`);
    actions.push("verifica magazzino subito");
  }

  const prep = production.recommendedPrep?.[0];
  if (prep && prep.suggestedQty > 0) {
    const prepLabel = prep.item.toLowerCase().includes("margherita") || prep.item.toLowerCase().includes("pizza")
      ? `${prep.suggestedQty} margherite`
      : `${prep.suggestedQty} porzioni di ${prep.item}`;
    actions.push(`prepara ${prepLabel}`);
  }

  let suggestion = "";
  if (parts.length > 0) {
    suggestion = parts.join(" ma ") + ". ";
  }
  if (actions.length > 0) {
    const first = actions[0];
    const rest = actions.slice(1);
    suggestion += (first ? first.charAt(0).toUpperCase() + first.slice(1) : "");
    if (rest.length > 0) suggestion += " e " + rest.join(" e ");
    suggestion += ".";
  }
  if (!suggestion.trim()) {
    suggestion = "Situazione operativa stabile. Nessun alert rilevato.";
  }

  return suggestion.trim();
}

/**
 * Get full daily restaurant operations summary (Daily Brain).
 */
async function getDailyBrain() {
  const today = new Date();
  const { orders: dailyOrders, payments: dailyPayments } =
    await reportsRepository.getDailyData(today);

  const [inventory, recipes] = await Promise.all([
    Promise.resolve(inventoryRepository.getAll()),
    recipesRepository.getAll(),
  ]);

  const ordersAnalysis = analyzeOrders(dailyOrders);
  const todayItems = extractSoldItems(dailyOrders);
  const velocityItems = computeRecentVelocity(dailyOrders, RECENT_VELOCITY_MINUTES);
  const predictions = estimateNextDemand(todayItems, velocityItems);

  const sales = summarizeSales(dailyOrders, dailyPayments);
  const inventorySummary = summarizeInventory(
    inventory,
    sales.topItems.map((t) => t.name),
    recipes
  );
  const production = summarizeProduction(dailyOrders, predictions);

  const recordedFoodCost = orderFoodCostsRepository.getTotalFoodCostForDate(today);
  const foodCost = summarizeFoodCost(
    dailyOrders,
    inventory,
    recipes,
    sales.topItems,
    recordedFoodCost
  );

  const suggestion = buildDailyBrainSuggestion({
    today: {
      ordersCount: (dailyOrders || []).length,
      openOrders: ordersAnalysis.open,
      preparingOrders: ordersAnalysis.preparing,
      lateOrders: ordersAnalysis.late,
      covers: sales.covers,
      revenue: sales.revenue,
      averageTicket: sales.averageTicket,
    },
    sales,
    inventory: inventorySummary,
    production,
    foodCost,
  });

  return {
    today: {
      ordersCount: (dailyOrders || []).length,
      openOrders: ordersAnalysis.open,
      preparingOrders: ordersAnalysis.preparing,
      lateOrders: ordersAnalysis.late,
      covers: sales.covers,
      revenue: sales.revenue,
      averageTicket: sales.averageTicket,
    },
    sales: {
      topItems: sales.topItems,
      topDepartments: sales.topDepartments,
    },
    inventory: {
      lowStock: inventorySummary.lowStock,
      criticalIngredientsForTopItems: inventorySummary.criticalIngredientsForTopItems,
    },
    production: {
      recommendedPrep: production.recommendedPrep,
      kitchenLoad: production.kitchenLoad,
    },
    foodCost: {
      estimatedFoodCostToday: foodCost.estimatedFoodCostToday,
      topMarginItems: foodCost.topMarginItems,
    },
    suggestion,
  };
}

async function gatherKitchenContext() {
  const orders = ordersRepository.getAllOrders();
  const inventory = inventoryRepository.getAll();

  const activeOrders = (orders || []).filter(
    (o) =>
      o.status !== "chiuso" &&
      o.status !== "annullato" &&
      o.status !== "servito"
  );
  const pendingOrders = activeOrders.filter(
    (o) =>
      String(o.status || "").toLowerCase() === "in_attesa" ||
      String(o.status || "").toLowerCase() === "in_preparazione"
  ).length;
  const readyOrders = activeOrders.filter(
    (o) => String(o.status || "").toLowerCase() === "pronto"
  ).length;

  const lowStock = (inventory || [])
    .filter(
      (item) =>
        Number(item.quantity) <= Number(item.threshold || 0) &&
        Number(item.threshold || 0) > 0
    )
    .map((item) => ({ name: item.name || "Senza nome" }));

  return {
    pendingOrders,
    readyOrders,
    lowStock
  };
}

async function gatherSalesContext() {
  const orders = ordersRepository.getAllOrders();
  const reports = await reportsRepository.getAll();
  const summary = summarizeOrders(orders || []);
  const topItems = (summary.topItems || []).slice(0, 10).map((t) => ({ name: t.name }));

  let reportStats = null;
  if (Array.isArray(reports) && reports.length > 0) {
    const totalRevenue = reports.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
    const totalCovers = reports.reduce((s, r) => s + (Number(r.covers) || 0), 0);
    reportStats = { totalRevenue, totalCovers, count: reports.length };
  }

  return {
    topItems,
    lowMarginItems: [],
    reportStats
  };
}

async function gatherProductionContext() {
  const inventory = inventoryRepository.getAll();
  const bookings = await bookingsRepository.getAll();
  const today = new Date();

  const expiringItems = (inventory || [])
    .filter((item) => {
      const exp = item.expiresAt || item.expiryDate || item.expires;
      if (!exp) return false;
      const expDate = new Date(exp);
      const daysUntilExpiry =
        (expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
      return daysUntilExpiry >= 0 && daysUntilExpiry <= 3;
    })
    .map((item) => ({ name: item.name || "Senza nome" }));

  const bookingsToday = (bookings || []).filter((b) =>
    isSameDay(b.date || b.time, today)
  ).length;

  return {
    expiringItems,
    bookingsToday
  };
}

async function gatherInventoryContext() {
  const inventory = inventoryRepository.getAll();
  const today = new Date();

  const lowStock = (inventory || [])
    .filter(
      (item) =>
        Number(item.quantity) <= Number(item.threshold || 0) &&
        Number(item.threshold || 0) > 0
    )
    .map((item) => ({ name: item.name || "Senza nome" }));

  const expiringItems = (inventory || [])
    .filter((item) => {
      const exp = item.expiresAt || item.expiryDate || item.expires;
      if (!exp) return false;
      const expDate = new Date(exp);
      const daysUntilExpiry =
        (expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
      return daysUntilExpiry >= 0 && daysUntilExpiry <= 7;
    })
    .map((item) => ({ name: item.name || "Senza nome" }));

  return { lowStock, expiringItems };
}

/**
 * Magazzino multi-livello: Centrale + Scorte reparti.
 * Suggerimenti per: centrale sotto soglia, reparti quasi scarichi, prodotti da reintegrare.
 */
async function getInventoryWarehouseSuggestion() {
  const inventory = inventoryRepository.getAll();
  const DEPARTMENTS = inventoryRepository.DEPARTMENTS || ["cucina", "sala"];
  const centralLow = [];
  const deptLow = { cucina: [], sala: [] };
  const suggestTransfer = [];
  const topMoved = [];

  for (const item of inventory || []) {
    const central = Number(item.central ?? item.quantity) || 0;
    const threshold = Number(item.threshold ?? item.min_stock) || 0;
    const name = item.name || "Senza nome";

    if (threshold > 0 && central <= threshold) {
      centralLow.push({ name, quantity: central, threshold });
    }
    for (const dept of DEPARTMENTS) {
      const qty = Number(item.stocks && item.stocks[dept]) || 0;
      if (threshold > 0 && qty > 0 && qty <= threshold) {
        (deptLow[dept] || (deptLow[dept] = [])).push({ name, quantity: qty, threshold });
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

  const messages = [];
  if (centralLow.length > 0) {
    messages.push(
      `Centrale sotto soglia: ${centralLow.map((x) => x.name).join(", ")}. Valuta riordino.`
    );
  }
  for (const dept of DEPARTMENTS) {
    const list = deptLow[dept] || [];
    if (list.length > 0) {
      messages.push(
        `Scorta ${dept} quasi esaurita: ${list.map((x) => x.name).join(", ")}. Trasferisci dal centrale.`
      );
    }
  }
  if (suggestTransfer.length > 0 && messages.length < 3) {
    const sample = suggestTransfer.slice(0, 3);
    messages.push(
      `Prodotti da reintegrare nei reparti: ${sample.map((s) => `${s.product} → ${s.to}`).join("; ")}.`
    );
  }
  if (messages.length === 0) {
    messages.push("Magazzino OK. Nessun alert centrale o reparti.");
  }

  return {
    type: "inventory",
    message: messages.join(" "),
    lowStockCentral: centralLow,
    lowStockByDept: deptLow,
    suggestTransfer: suggestTransfer.slice(0, 10),
  };
}

// Mapping: ingredient keyword -> dishes per course (antipasto, primo, secondo, dolce)
const DISH_MAPPING = {
  pane: {
    antipasto: [
      { name: "Bruschetta al pomodoro", desc: "Pane tostato con pomodori freschi e basilico", reason: "Usa pane in esubero" }
    ],
    primo: [
      { name: "Pappa al pomodoro", desc: "Zuppa rustica toscana con pane raffermo", reason: "Consuma pane in abbondanza" }
    ],
    dolce: [
      { name: "Buddino di pane", desc: "Dolce tradizionale con pane raffermo e uova", reason: "Recupero pane" }
    ]
  },
  pomodoro: {
    antipasto: [
      { name: "Bruschetta al pomodoro", desc: "Pane tostato con pomodoro fresco e basilico", reason: "Usa pomodori in stock" }
    ],
    primo: [
      { name: "Spaghetti al pomodoro fresco", desc: "Pasta con salsa di pomodoro semplice", reason: "Sfrutta surplus pomodori" }
    ],
    secondo: [
      { name: "Pomodori ripieni", desc: "Pomodori al forno ripieni di riso e erbe", reason: "Consuma pomodori in scadenza" }
    ]
  },
  pasta: {
    primo: [
      { name: "Pasta al pomodoro fresco", desc: "Pasta corta con salsa di pomodoro", reason: "Usa pasta in magazzino" }
    ]
  },
  riso: {
    primo: [
      { name: "Risotto alla parmigiana", desc: "Risotto cremoso con burro e parmigiano", reason: "Sfrutta riso in stock" }
    ]
  },
  carne: {
    secondo: [
      { name: "Tagliata di manzo", desc: "Carne ai ferri con rucola e grana", reason: "Usa carne da consumare" }
    ]
  },
  manzo: {
    secondo: [
      { name: "Tagliata di manzo", desc: "Carne ai ferri con rucola e grana", reason: "Carne in magazzino" }
    ]
  },
  pollo: {
    secondo: [
      { name: "Pollo al forno", desc: "Pollo aromatizzato con erbe e limone", reason: "Usa pollo disponibile" }
    ]
  },
  pesce: {
    secondo: [
      { name: "Filetto di pesce al forno", desc: "Pesce con patate e olive", reason: "Consuma pesce fresco" }
    ]
  },
  formaggio: {
    antipasto: [
      { name: "Tagliere di formaggi", desc: "Selezione di formaggi con miele e noci", reason: "Formaggio in esubero" }
    ]
  },
  mozzarella: {
    antipasto: [
      { name: "Insalata caprese", desc: "Mozzarella, pomodoro e basilico", reason: "Mozzarella da consumare" }
    ]
  },
  uova: {
    primo: [
      { name: "Spaghetti alla carbonara", desc: "Pasta con uova, guanciale e pecorino", reason: "Usa uova disponibili" }
    ],
    dolce: [
      { name: "Tiramisù", desc: "Dolce con savoiardi, mascarpone e caffè", reason: "Consuma uova in scadenza" }
    ]
  },
  farina: {
    primo: [
      { name: "Gnocchi di patate", desc: "Gnocchi fatti in casa con salsa al pomodoro", reason: "Farina in magazzino" }
    ],
    dolce: [
      { name: "Torta della nonna", desc: "Torta con crema e pinoli", reason: "Sfrutta farina in stock" }
    ]
  },
  zucchero: {
    dolce: [
      { name: "Panna cotta", desc: "Dolce al cucchiaio con frutti di bosco", reason: "Zucchero disponibile" }
    ]
  },
  cioccolato: {
    dolce: [
      { name: "Brownies al cioccolato", desc: "Squares di cioccolato fondente", reason: "Usa cioccolato in magazzino" }
    ]
  },
  latte: {
    dolce: [
      { name: "Panna cotta", desc: "Dolce al cucchiaio con vaniglia", reason: "Latte da consumare" }
    ]
  },
  basilico: {
    antipasto: [
      { name: "Pesto genovese", desc: "Salsa con basilico, pinoli e parmigiano", reason: "Basilico fresco" }
    ]
  },
  insalata: {
    antipasto: [
      { name: "Insalata mista", desc: "Insalata verde con olio e aceto", reason: "Consuma insalata" }
    ]
  },
  verdure: {
    antipasto: [
      { name: "Antipasto di verdure grigliate", desc: "Zucchine, melanzane e peperoni", reason: "Verdure in magazzino" }
    ]
  },
  patate: {
    secondo: [
      { name: "Patate al forno", desc: "Patate con rosmarino e sale", reason: "Patate disponibili" }
    ]
  }
};

const FALLBACK_DISHES = {
  antipasto: { name: "Antipasto della casa", desc: "Selezione di salumi e formaggi", reason: "Basato su disponibilità magazzino" },
  primo: { name: "Pasta del giorno", desc: "Piatto di pasta con ingredienti freschi", reason: "Ingredienti in stock" },
  secondo: { name: "Secondo del giorno", desc: "Proteina con contorno fresco", reason: "Da consumare" },
  dolce: { name: "Dolce della casa", desc: "Dessert fatto in casa", reason: "Stock disponibile" }
};

function normalizeIngredient(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function findDishForIngredient(ingredient, course) {
  const norm = normalizeIngredient(ingredient);
  for (const [key, courses] of Object.entries(DISH_MAPPING)) {
    if (norm.includes(key) || key.includes(norm)) {
      const dishList = courses[course];
      if (Array.isArray(dishList) && dishList.length > 0) {
        return dishList[0];
      }
    }
  }
  return null;
}

async function gatherMenuContext() {
  const inventory = inventoryRepository.getAll();
  const today = new Date();
  const items = inventory || [];

  const overstock = items
    .filter((item) => {
      const q = Number(item.quantity) || 0;
      const t = Number(item.threshold) || 0;
      return t > 0 && q > t * 2;
    })
    .map((item) => ({ ...item, name: item.name || "Senza nome", reason: "esubero" }));

  const highQuantity = items
    .filter((item) => {
      const q = Number(item.quantity) || 0;
      const t = Number(item.threshold) || 0;
      return t > 0 && q > t && q <= t * 2;
    })
    .map((item) => ({ ...item, name: item.name || "Senza nome", reason: "alta quantità" }));

  const priorityItems = items
    .filter((item) => {
      const exp = item.expiresAt || item.expiryDate || item.expires;
      if (!exp) return false;
      const expDate = new Date(exp);
      const daysUntil = (expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
      return daysUntil >= 0 && daysUntil <= 7;
    })
    .map((item) => ({ ...item, name: item.name || "Senza nome", reason: "da consumare" }));

  const allPrioritized = [
    ...priorityItems.map((i) => ({ ...i, score: 3 })),
    ...overstock.map((i) => ({ ...i, score: 2 })),
    ...highQuantity.map((i) => ({ ...i, score: 1 }))
  ];

  const sortedNames = [...new Set(allPrioritized
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .map((i) => i.name))];

  return {
    overstock: overstock.map((i) => i.name),
    highQuantity: highQuantity.map((i) => i.name),
    priorityItems: priorityItems.map((i) => i.name),
    ingredientsForMenu: sortedNames.length > 0 ? sortedNames : items.map((i) => i.name || "Senza nome"),
    allItems: items.map((i) => i.name || "Senza nome")
  };
}

async function gatherContextForType(type) {
  switch (type) {
    case "kitchen":
    case "orders":
      return gatherKitchenContext();
    case "sales":
      return gatherSalesContext();
    case "production":
      return gatherProductionContext();
    case "inventory":
      return gatherInventoryContext();
    case "menu":
      return gatherMenuContext();
    default:
      return {};
  }
}

function detectIntent(question) {
  const q = String(question || "").toLowerCase().trim();
  if (!q) return "general";

  const sales = /vendite|incasso|incassi|revenue|top|piatti.*vendut|report|rapporto|coperti|incassato/i;
  const orders = /ordini|ordine|ordini\s+aperti|aperti|in\s+attesa|pronto|pronti|cucina|kitchen|quanti\s+ordini|ordini\s+in\s+corso/i;
  const production = /produzione|prenotazioni|prenotati|oggi|production|prenotati\s+oggi/i;
  const inventory = /magazzino|inventario|stock|scorte|sotto\s+soglia|soglia|scadenza|scadono|low\s+stock|inventory|cosa\s+manca|mancano/i;
  const menu = /menu\s+del\s+giorno|menu\s+da\s+4\s+portate|4\s+portate|esubero\s+magazzino|merce\s+in\s+magazzino|crea\s+un\s+menu|dammi\s+un\s+menu|suggerisci\s+menu/i;

  if (menu.test(q)) return "menu";
  if (sales.test(q)) return "sales";
  if (orders.test(q)) return "orders";
  if (production.test(q)) return "production";
  if (inventory.test(q)) return "inventory";

  return "general";
}

function tryAnswerSpecificQuestion(question) {
  const q = String(question || "").trim();
  if (!q) return null;

  const qLower = q.toLowerCase();

  const itemSoldMatch = q.match(
    /quant[ie]\s+(.+?)\s+(?:abbiamo\s+)?vendut[oie]|(?:quante?|quanti?|quanto)\s+(.+?)\s+vendut[oi]/i
  );
  if (itemSoldMatch) {
    const itemName = (itemSoldMatch[1] || itemSoldMatch[2] || "").trim();
    if (itemName.length >= 2) {
      const orders = ordersRepository.getAllOrders();
      let total = 0;
      const normalized = itemName.toLowerCase();
      const stem = normalized.replace(/(he|i|e)$/, "").slice(0, 7);
      for (const order of orders || []) {
        for (const item of order.items || []) {
          const name = String(item.name || "").toLowerCase();
          if (name.includes(stem) || name.includes(normalized)) {
            total += Number(item.qty) || 1;
          }
        }
      }
      const label = total === 1 ? itemName : itemName;
      return {
        type: "sales",
        message: `Hai venduto ${total} ${label}.`
      };
    }
  }

  if (/quanti\s+ordini\s+aperti|ordini\s+aperti|ordini\s+aperte?/i.test(q)) {
    const orders = ordersRepository.getAllOrders();
    const openCount = (orders || []).filter(
      (o) =>
        String(o.status || "").toLowerCase() !== "chiuso" &&
        String(o.status || "").toLowerCase() !== "annullato"
    ).length;
    return {
      type: "orders",
      message: `Hai ${openCount} ordini aperti.`
    };
  }

  if (/cosa\s+manca|cosa\s+mancano|cosa\s+mancano\s+in\s+magazzino/i.test(q)) {
    const context = inventoryRepository.getAll();
    const lowStock = (context || [])
      .filter(
        (item) =>
          Number(item.quantity) <= Number(item.threshold || 0) &&
          Number(item.threshold || 0) > 0
      )
      .map((item) => item.name || "Senza nome");
    const msg =
      lowStock.length > 0
        ? `Mancano o sono sotto soglia: ${lowStock.join(", ")}.`
        : "Nessun prodotto sotto soglia. Magazzino OK.";
    return { type: "inventory", message: msg };
  }

  return null;
}

function buildKitchenSuggestion(context = {}) {
  const lowStock = Array.isArray(context.lowStock) ? context.lowStock : [];
  const pendingOrders = Number(context.pendingOrders) || 0;
  const readyOrders = Number(context.readyOrders) || 0;

  const messages = [];

  if (pendingOrders > 10) {
    messages.push("Attenzione: molti ordini in attesa. Dai priorità ai piatti più veloci.");
  } else if (pendingOrders > 0) {
    messages.push("Ordini in attesa sotto controllo. Mantieni il ritmo di uscita.");
  }

  if (readyOrders > 0) {
    messages.push(`Ci sono ${readyOrders} ordini pronti da consegnare.`);
  }

  if (lowStock.length > 0) {
    messages.push(
      `Prodotti sotto soglia: ${lowStock.map((x) => x.name || x).join(", ")}. Valuta blocco vendita o riordino.`
    );
  }

  if (!messages.length) {
    messages.push("Situazione stabile. Nessun alert operativo rilevato.");
  }

  return messages.join(" ");
}

function buildSalesSuggestion(context = {}) {
  const topItems = Array.isArray(context.topItems) ? context.topItems : [];
  const lowMarginItems = Array.isArray(context.lowMarginItems) ? context.lowMarginItems : [];
  const reportStats = context.reportStats || null;

  const messages = [];

  if (reportStats && reportStats.count > 0) {
    messages.push(
      `Dai report: ${reportStats.count} registrati, totale ${reportStats.totalRevenue}€ e ${reportStats.totalCovers} coperti.`
    );
  }

  if (topItems.length > 0) {
    messages.push(`Piatti forti del momento: ${topItems.map((x) => x.name || x).join(", ")}.`);
  }

  if (lowMarginItems.length > 0) {
    messages.push(
      `Margine basso su: ${lowMarginItems.map((x) => x.name || x).join(", ")}. Valuta aumento prezzo o revisione ricetta.`
    );
  }

  if (!messages.length) {
    messages.push("Nessun dato vendite sufficiente per suggerimenti commerciali.");
  }

  return messages.join(" ");
}

function buildInventorySuggestion(context = {}) {
  const lowStock = Array.isArray(context.lowStock) ? context.lowStock : [];
  const expiringItems = Array.isArray(context.expiringItems) ? context.expiringItems : [];
  const messages = [];

  if (lowStock.length > 0) {
    messages.push(
      `Prodotti sotto soglia: ${lowStock.map((x) => x.name || x).join(", ")}. Valuta riordino.`
    );
  }
  if (expiringItems.length > 0) {
    messages.push(
      `In scadenza (7 giorni): ${expiringItems.map((x) => x.name || x).join(", ")}.`
    );
  }
  if (!messages.length) {
    messages.push("Magazzino OK. Nessun prodotto sotto soglia o in scadenza imminente.");
  }
  return messages.join(" ");
}

function buildProductionSuggestion(context = {}) {
  const expiringItems = Array.isArray(context.expiringItems) ? context.expiringItems : [];
  const bookingsToday = Number(context.bookingsToday) || 0;

  const messages = [];

  if (bookingsToday > 0) {
    messages.push(`Prenotazioni previste oggi: ${bookingsToday}. Prepara linea e scorte in anticipo.`);
  }

  if (expiringItems.length > 0) {
    messages.push(
      `Ingredienti in scadenza: ${expiringItems.map((x) => x.name || x).join(", ")}. Consigliato inserirli nei piatti del giorno.`
    );
  }

  if (!messages.length) {
    messages.push("Produzione regolare. Nessun alert di scadenza o carico prenotazioni.");
  }

  return messages.join(" ");
}

function buildMenuSuggestion(context = {}) {
  const ingredients = context.ingredientsForMenu || context.allItems || [];
  const overstock = context.overstock || [];
  const priorityItems = context.priorityItems || [];
  const highQuantity = context.highQuantity || [];
  const allNames = [...new Set([...priorityItems, ...overstock, ...highQuantity, ...ingredients])];

  const menu = { starter: null, first: null, main: null, dessert: null };

  const pickDish = (course) => {
    const mapKey = course === "antipasto" ? "antipasto" : course === "primo" ? "primo" : course === "secondo" ? "secondo" : "dolce";
    for (const ing of allNames) {
      const dish = findDishForIngredient(ing, mapKey);
      if (dish) {
        return {
          dishName: dish.name,
          description: dish.desc,
          mainIngredients: [ing],
          whySuggested: dish.reason
        };
      }
    }
    const fallback = FALLBACK_DISHES[mapKey];
    return fallback ? {
      dishName: fallback.name,
      description: fallback.desc,
      mainIngredients: allNames.slice(0, 2),
      whySuggested: fallback.reason
    } : null;
  };

  menu.starter = pickDish("antipasto");
  menu.first = pickDish("primo");
  menu.main = pickDish("secondo");
  menu.dessert = pickDish("dolce");

  if (!menu.starter) menu.starter = { dishName: FALLBACK_DISHES.antipasto.name, description: FALLBACK_DISHES.antipasto.desc, mainIngredients: allNames.slice(0, 2) || ["disponibili"], whySuggested: FALLBACK_DISHES.antipasto.reason };
  if (!menu.first) menu.first = { dishName: FALLBACK_DISHES.primo.name, description: FALLBACK_DISHES.primo.desc, mainIngredients: allNames.slice(0, 2) || ["disponibili"], whySuggested: FALLBACK_DISHES.primo.reason };
  if (!menu.main) menu.main = { dishName: FALLBACK_DISHES.secondo.name, description: FALLBACK_DISHES.secondo.desc, mainIngredients: allNames.slice(0, 2) || ["disponibili"], whySuggested: FALLBACK_DISHES.secondo.reason };
  if (!menu.dessert) menu.dessert = { dishName: FALLBACK_DISHES.dolce.name, description: FALLBACK_DISHES.dolce.desc, mainIngredients: allNames.slice(0, 2) || ["disponibili"], whySuggested: FALLBACK_DISHES.dolce.reason };

  const summary = [];
  if (priorityItems.length > 0) summary.push(`Priorità consumo: ${priorityItems.join(", ")}`);
  if (overstock.length > 0) summary.push(`Esubero: ${overstock.join(", ")}`);
  if (highQuantity.length > 0) summary.push(`Alta quantità: ${highQuantity.join(", ")}`);
  if (summary.length === 0 && allNames.length > 0) summary.push(`Da magazzino: ${allNames.slice(0, 5).join(", ")}`);

  return {
    message: summary.length > 0
      ? `Menu del giorno da 4 portate basato su: ${summary.join(" | ")}.`
      : "Menu del giorno da 4 portate basato sul magazzino attuale.",
    menu
  };
}

function getAssistantResponse(type = "general", context = {}) {
  switch (type) {
    case "kitchen":
    case "orders":
      return {
        type: "orders",
        message: buildKitchenSuggestion(context)
      };

    case "sales":
      return {
        type: "sales",
        message: buildSalesSuggestion(context)
      };

    case "production":
      return {
        type: "production",
        message: buildProductionSuggestion(context)
      };

    case "inventory":
      return {
        type: "inventory",
        message: buildInventorySuggestion(context)
      };

    case "menu": {
      const menuResult = buildMenuSuggestion(context);
      return {
        type: "menu",
        message: menuResult.message,
        menu: menuResult.menu
      };
    }

    default:
      return {
        type: "general",
        message: "Assistente AI pronto. Chiedi di ordini, vendite, produzione o magazzino per dati in tempo reale."
      };
  }
}

async function getResponseForQuestion(question) {
  const specific = tryAnswerSpecificQuestion(question);
  if (specific) return specific;

  const intent = detectIntent(question);
  if (intent === "general") {
    return getAssistantResponse("general", {});
  }
  const context = await gatherContextForType(intent);
  return getAssistantResponse(intent, context);
}

module.exports = {
  getAssistantResponse,
  gatherContextForType,
  getResponseForQuestion,
  getOperationalStatus,
  getPredictiveKitchen,
  getDailyBrain,
  getInventoryWarehouseSuggestion,
};