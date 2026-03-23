const db = require("../config/db");
const tenantContext = require("../context/tenantContext");
const { ensureRecipeInventoryTables } = require("./inventory.service");

async function calculateDishCost(dishName) {
  try {
    await ensureRecipeInventoryTables();
  } catch (e) {
    return 0;
  }

  const tenantId = tenantContext.getRestaurantId();
  const name = String(dishName || "").trim();
  if (!tenantId || !name) return 0;

  let ingredients;
  try {
    [ingredients] = await db.query(
      `
      SELECT r.quantity, i.cost
      FROM recipes r
      JOIN inventory i ON r.ingredient_id = i.id AND r.tenant_id = i.tenant_id
      WHERE r.tenant_id = ? AND r.dish_name = ?
      `,
      [tenantId, name]
    );
  } catch (e) {
    return 0;
  }

  let total = 0;
  for (const ing of ingredients || []) {
    const q = Number(ing.quantity);
    const c = ing.cost != null ? Number(ing.cost) : 0;
    if (Number.isFinite(q) && Number.isFinite(c)) {
      total += q * c;
    }
  }

  return total;
}

async function calculateOrderCost(items) {
  if (!Array.isArray(items) || items.length === 0) return 0;

  let total = 0;
  for (const item of items) {
    const dishName = String(item && item.name ? item.name : "").trim();
    if (!dishName) continue;
    const lineQty = Number(item.qty);
    const qty = Number.isFinite(lineQty) && lineQty > 0 ? lineQty : 1;
    // eslint-disable-next-line no-await-in-loop
    const cost = await calculateDishCost(dishName);
    total += cost * qty;
  }

  return total;
}

module.exports = {
  calculateDishCost,
  calculateOrderCost,
};
