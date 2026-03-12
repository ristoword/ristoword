// backend/src/service/inventory.service.js
// Automatic inventory deduction and food cost when an order reaches final state (servito/chiuso).
// Safe: no recipe = skip with warning; never breaks order flow.

const inventoryRepository = require("../repositories/inventory.repository");
const logger = require("../utils/logger");
const recipesRepository = require("../repositories/recipes.repository");
const stockMovementsRepository = require("../repositories/stock-movements.repository");
const orderFoodCostsRepository = require("../repositories/order-food-costs.repository");

const processedClosedOrders = new Set();

function normalizeName(s) {
  return String(s || "").trim().toLowerCase();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Compute order total revenue from items (price * qty). */
function getOrderTotal(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.reduce((acc, item) => {
    const price = toNumber(item.price, 0);
    const qty = toNumber(item.qty, 1);
    return acc + price * qty;
  }, 0);
}

/**
 * Calculate recipe ingredient cost (sum of qty * cost_per_unit from inventory).
 */
function calculateRecipeIngredientCost(recipe, servedQty) {
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  let cost = 0;

  for (const ing of ingredients) {
    const invItem = inventoryRepository.findInventoryItemByName(ing.name);
    const qty = (Number(ing.quantity) ?? Number(ing.qty) ?? 0) * (Number(servedQty) || 1);
    const costPerUnit = invItem
      ? inventoryRepository.getCostPerUnit(invItem)
      : Number(ing.unitCost) || 0;
    cost += qty * costPerUnit;
  }

  return cost;
}

/**
 * Deduct recipe ingredients from inventory. Returns { warnings }.
 * Uses type "recipe_consumption" for stock movements.
 * Adds explicit warning when stock would go negative (insufficient stock).
 */
function deductRecipeIngredients(order, itemName, recipe, servedQty) {
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const warnings = [];

  for (const ing of ingredients) {
    const name = ing.name || "";
    const needQty = (Number(ing.quantity) ?? Number(ing.qty) ?? 0) * (Number(servedQty) || 1);
    if (!name || needQty <= 0) continue;

    const invItem = inventoryRepository.findInventoryItemByName(name);
    if (!invItem) {
      warnings.push({ type: "missing_inventory", ingredient: name });
      continue;
    }

    const before = inventoryRepository.getStock(invItem);
    if (before < needQty) {
      warnings.push({
        type: "insufficient_stock",
        ingredient: name,
        requested: needQty,
        available: before,
        message: `${name}: richiesti ${needQty}, disponibili ${before}`,
      });
    }

    const result = inventoryRepository.deductInventoryItem(name, needQty);
    if (!result.success) {
      warnings.push({ type: "deduct_failed", ingredient: name });
      continue;
    }

    if (result.belowMin) {
      warnings.push({
        type: "low_stock",
        ingredient: name,
        newStock: result.newStock,
        minStock: inventoryRepository.getMinStock(invItem),
      });
    }

    stockMovementsRepository.createMovement({
      type: "recipe_consumption",
      orderId: order.id,
      orderStatus: order.status || "chiuso",
      itemName: itemName || "",
      ingredientName: name,
      quantity: needQty,
      unit: ing.unit || invItem.unit || "",
      before,
      after: result.newStock,
      note: "Consumo ingredienti da ricetta (ordine servito/chiuso)",
    });
  }

  return { warnings };
}

/**
 * Process order when it reaches final state (servito or chiuso): deduct ingredients, record stock movements, compute food cost and margin.
 * Idempotent: uses order.inventoryProcessedAt (via tryMarkOrderInventoryProcessed) + in-memory Set.
 * Safe: missing recipe = skip item and add warning; never throws.
 */
async function onOrderFinalized(order) {
  if (!order || !order.id) {
    return { ok: false, message: "Ordine non valido", totalFoodCost: 0, itemFoodCosts: [], warnings: [] };
  }

  const processKey = `closed_${order.id}`;
  if (processedClosedOrders.has(processKey)) {
    return {
      ok: true,
      skipped: true,
      message: "Ordine già scaricato",
      totalFoodCost: 0,
      itemFoodCosts: [],
      warnings: [],
    };
  }

  const existingMovements = stockMovementsRepository.findByOrderId(order.id);
  const hasRecipeConsumption = existingMovements.some((m) => m.type === "recipe_consumption" || m.type === "deduction");
  if (hasRecipeConsumption) {
    return {
      ok: true,
      skipped: true,
      message: "Ordine già scaricato (movimenti esistenti)",
      totalFoodCost: 0,
      itemFoodCosts: [],
      warnings: [],
    };
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const itemFoodCosts = [];
  const allWarnings = [];
  let totalFoodCost = 0;

  for (const item of items) {
    const itemName = String(item.name || "").trim();
    const servedQty = Number(item.qty) || 1;

    const recipe = await recipesRepository.findRecipeByMenuItemName(itemName);

    if (!recipe) {
      allWarnings.push({ type: "no_recipe", item: itemName });
      continue;
    }

    const foodCost = calculateRecipeIngredientCost(recipe, servedQty);
    totalFoodCost += foodCost;
    itemFoodCosts.push({ itemName, qty: servedQty, foodCost });

    const { warnings } = deductRecipeIngredients(order, itemName, recipe, servedQty);
    allWarnings.push(...warnings);
  }

  processedClosedOrders.add(processKey);

  if (allWarnings.length > 0) {
    logger.warn("Inventory deduction warnings", { orderId: order.id, warnings: allWarnings.length });
  }
  if (totalFoodCost > 0 || allWarnings.length > 0) {
    logger.info("Inventory deduction event", { orderId: order.id, totalFoodCost, itemCount: itemFoodCosts.length });
  }

  const estimatedRevenue = getOrderTotal(order);
  const estimatedMargin = estimatedRevenue - totalFoodCost;

  if (totalFoodCost > 0 || estimatedRevenue > 0) {
    orderFoodCostsRepository.recordOrderFoodCost(
      order.id,
      totalFoodCost,
      order.updatedAt || new Date().toISOString(),
      { estimatedRevenue, estimatedMargin }
    );
  }

  return {
    ok: true,
    orderId: order.id,
    itemFoodCosts,
    totalFoodCost,
    estimatedRevenue,
    estimatedMargin,
    warnings: allWarnings,
  };
}

/** @deprecated Use onOrderFinalized. Kept for backward compatibility. */
async function onOrderClosed(order) {
  return onOrderFinalized(order);
}

/**
 * Count inventory items below min stock.
 */
function getLowStockCount() {
  const items = inventoryRepository.readInventory();
  let count = 0;
  for (const item of items) {
    const stock = inventoryRepository.getStock(item);
    const min = inventoryRepository.getMinStock(item);
    if (min > 0 && stock < min) count += 1;
  }
  return count;
}

module.exports = {
  onOrderFinalized,
  onOrderClosed,
  calculateRecipeIngredientCost,
  getLowStockCount,
};
