/**
 * Scarico ingredienti su DB (ricette + magazzino SQL).
 * Separato da service/inventory.service.js (persistenza JSON operativa).
 */
const db = require("../config/db");
const { getDbPool } = require("../config/dbPool");
const tenantContext = require("../context/tenantContext");

let schemaReady = false;

async function ensureRecipeInventoryTables() {
  if (schemaReady) return;
  const conn = await getDbPool().getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS recipes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(128) NOT NULL,
        dish_name VARCHAR(512) NOT NULL,
        ingredient_id INT NOT NULL,
        quantity DECIMAL(14,4) NOT NULL DEFAULT 0,
        KEY idx_tenant_dish (tenant_id, dish_name(191)),
        KEY idx_ingredient (ingredient_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(128) NOT NULL,
        name VARCHAR(512) NOT NULL,
        quantity DECIMAL(14,4) NOT NULL DEFAULT 0,
        KEY idx_tenant (tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    try {
      await conn.query(
        "ALTER TABLE inventory ADD COLUMN cost DECIMAL(14,4) NULL DEFAULT NULL"
      );
    } catch (e) {
      if (e && e.code !== "ER_DUP_FIELDNAME") throw e;
    }
    schemaReady = true;
  } finally {
    conn.release();
  }
}

/**
 * Scala ingredienti in magazzino in base alle righe ricetta SQL per nome piatto.
 * @param {Array<{ name?: string, qty?: number }>} orderItems
 */
async function deductIngredients(orderItems) {
  if (!Array.isArray(orderItems) || orderItems.length === 0) return;

  try {
    await ensureRecipeInventoryTables();
  } catch (e) {
    console.warn("[inventory.service] ensureRecipeInventoryTables:", e.message);
    return;
  }

  const tenantId = tenantContext.getRestaurantId();

  for (const item of orderItems) {
    const dishName = String(item.name || "").trim();
    if (!dishName) continue;

    const lineQty = Number(item.qty);
    const orderLineQty = Number.isFinite(lineQty) && lineQty > 0 ? lineQty : 1;

    let ingredients;
    try {
      [ingredients] = await db.query(
        "SELECT ingredient_id, quantity FROM recipes WHERE tenant_id = ? AND dish_name = ?",
        [tenantId, dishName]
      );
    } catch (e) {
      console.warn("[inventory.service] recipes query:", e.message);
      continue;
    }

    if (!Array.isArray(ingredients) || ingredients.length === 0) continue;

    for (const ing of ingredients) {
      const ingId = Number(ing.ingredient_id);
      const perPortion = Number(ing.quantity);
      if (!Number.isFinite(ingId) || ingId <= 0) continue;
      const deduct = (Number.isFinite(perPortion) ? perPortion : 0) * orderLineQty;
      if (deduct <= 0) continue;

      try {
        await db.query(
          "UPDATE inventory SET quantity = GREATEST(quantity - ?, 0) WHERE tenant_id = ? AND id = ?",
          [deduct, tenantId, ingId]
        );
      } catch (e) {
        console.warn("[inventory.service] inventory update:", e.message);
      }
    }
  }
}

module.exports = { deductIngredients, ensureRecipeInventoryTables };
