/**
 * Persistenza ordini su MySQL (tenant-aware).
 * Schema: chiave composta (tenant_id, id) per allineamento ai vecchi ID per-tenant.
 */
const fs = require("fs");
const path = require("path");
const { getDbPool } = require("../config/dbPool");
const paths = require("../config/paths");
const tenantContext = require("../context/tenantContext");
const { safeReadJson } = require("../utils/safeFileIO");

let schemaReady = false;
let migrationAttempted = false;
let dbModeLogged = false;

function logDbModeOnce() {
  if (dbModeLogged) return;
  dbModeLogged = true;
  // eslint-disable-next-line no-console
  console.log("Orders → DB mode active");
}

function currentTenantId() {
  return tenantContext.getRestaurantId();
}

function toIso(v) {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function rowToOrder(row, items) {
  const o = {
    id: Number(row.id),
    table: row.table_number != null ? Number(row.table_number) : null,
    covers: row.covers != null ? Number(row.covers) : null,
    area: row.area || "sala",
    waiter: row.waiter || "",
    notes: row.notes || "",
    items: Array.isArray(items) ? items : [],
    activeCourse: row.active_course != null ? Number(row.active_course) : 1,
    status: row.status || "in_attesa",
    createdAt: toIso(row.created_at) || new Date().toISOString(),
    updatedAt: toIso(row.updated_at) || new Date().toISOString(),
    inventoryProcessedAt: row.inventory_processed_at ? toIso(row.inventory_processed_at) : undefined,
  };
  if (row.total_cost != null && row.total_cost !== "") o.totalCost = Number(row.total_cost);
  if (row.total_price != null && row.total_price !== "") o.totalPrice = Number(row.total_price);
  if (row.margin != null && row.margin !== "") o.margin = Number(row.margin);
  return o;
}

function itemRowToJson(r) {
  const o = {
    name: r.name || "",
    category: r.category || "",
    type: r.type || "",
    qty: Number(r.qty) || 1,
    notes: r.notes || "",
  };
  if (r.course != null) o.course = Number(r.course);
  if (r.item_area) o.area = r.item_area;
  if (r.price != null && r.price !== "") o.price = Number(r.price);
  return o;
}

async function addColumnIfMissing(conn, table, column, definition) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  const c = Number(rows[0] && rows[0].c) || 0;
  if (c === 0) {
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

async function ensureSchema(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS orders (
      tenant_id VARCHAR(128) NOT NULL,
      id INT NOT NULL,
      table_number INT NULL,
      covers INT NULL,
      area VARCHAR(255) NULL,
      waiter VARCHAR(255) NULL,
      status VARCHAR(64) NOT NULL,
      notes TEXT NULL,
      active_course INT NULL DEFAULT 1,
      inventory_processed_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (tenant_id, id),
      KEY idx_tenant_status (tenant_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await addColumnIfMissing(conn, "orders", "total_cost", "DECIMAL(14,4) NULL DEFAULT NULL");
  await addColumnIfMissing(conn, "orders", "total_price", "DECIMAL(14,4) NULL DEFAULT NULL");
  await addColumnIfMissing(conn, "orders", "margin", "DECIMAL(14,4) NULL DEFAULT NULL");
  await conn.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id VARCHAR(128) NOT NULL,
      order_id INT NOT NULL,
      name VARCHAR(512) NOT NULL,
      category VARCHAR(255) NULL,
      type VARCHAR(128) NULL,
      qty INT NOT NULL DEFAULT 1,
      notes TEXT NULL,
      course INT NULL,
      item_area VARCHAR(64) NULL,
      price DECIMAL(12,2) NULL,
      KEY idx_tenant_order (tenant_id, order_id),
      CONSTRAINT fk_order_items_order
        FOREIGN KEY (tenant_id, order_id) REFERENCES orders (tenant_id, id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function migrateTenantFromJsonIfEmpty(pool, tenantId) {
  const [cntRows] = await pool.query(
    "SELECT COUNT(*) AS c FROM orders WHERE tenant_id = ?",
    [tenantId]
  );
  const n = Number(cntRows[0] && cntRows[0].c) || 0;
  if (n > 0) return;

  const fp = path.join(paths.DATA, "tenants", tenantId, "orders.json");
  if (!fs.existsSync(fp)) return;
  const raw = safeReadJson(fp, []);
  if (!Array.isArray(raw) || raw.length === 0) return;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const o of raw) {
      const id = Number(o.id);
      if (!Number.isFinite(id)) continue;
      const items = Array.isArray(o.items) ? o.items : [];
      const createdAt = o.createdAt ? new Date(o.createdAt) : new Date();
      const updatedAt = o.updatedAt ? new Date(o.updatedAt) : createdAt;
      await conn.query(
        `INSERT INTO orders (tenant_id, id, table_number, covers, area, waiter, status, notes, active_course, inventory_processed_at, created_at, updated_at, total_cost, total_price, margin)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          tenantId,
          id,
          o.table != null ? Number(o.table) : null,
          o.covers != null ? Number(o.covers) : null,
          o.area || "sala",
          o.waiter || "",
          o.status || "in_attesa",
          o.notes || "",
          o.activeCourse != null ? Number(o.activeCourse) : 1,
          o.inventoryProcessedAt ? new Date(o.inventoryProcessedAt) : null,
          createdAt,
          updatedAt,
          o.totalCost != null && o.totalCost !== "" ? Number(o.totalCost) : null,
          o.totalPrice != null && o.totalPrice !== "" ? Number(o.totalPrice) : null,
          o.margin != null && o.margin !== "" ? Number(o.margin) : null,
        ]
      );
      for (const it of items) {
        await conn.query(
          `INSERT INTO order_items (tenant_id, order_id, name, category, type, qty, notes, course, item_area, price)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            tenantId,
            id,
            String(it.name || ""),
            it.category || "",
            it.type || "",
            Number(it.qty) || 1,
            it.notes || "",
            it.course != null ? Number(it.course) : null,
            it.area || null,
            it.price != null && it.price !== "" ? Number(it.price) : null,
          ]
        );
      }
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function migrateAllTenantsOnce(pool) {
  if (migrationAttempted) return;
  migrationAttempted = true;
  const tenantsDir = path.join(paths.DATA, "tenants");
  if (!fs.existsSync(tenantsDir)) return;
  const dirs = fs.readdirSync(tenantsDir).filter((d) => d && !d.startsWith("."));
  for (const tid of dirs) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await migrateTenantFromJsonIfEmpty(pool, tid);
    } catch (e) {
      console.warn("[orders.sql] Migrazione JSON tenant", tid, e.message);
    }
  }
}

async function initDb() {
  const pool = getDbPool();
  const conn = await pool.getConnection();
  try {
    await ensureSchema(conn);
  } finally {
    conn.release();
  }
  await migrateAllTenantsOnce(pool);
  schemaReady = true;
}

async function ensureReady() {
  if (!schemaReady) await initDb();
}

async function loadItemsForOrders(pool, tenantId, orderIds) {
  if (!orderIds.length) return new Map();
  const placeholders = orderIds.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT * FROM order_items WHERE tenant_id = ? AND order_id IN (${placeholders}) ORDER BY id ASC`,
    [tenantId, ...orderIds]
  );
  const map = new Map();
  for (const r of rows) {
    const oid = Number(r.order_id);
    if (!map.has(oid)) map.set(oid, []);
    map.get(oid).push(itemRowToJson(r));
  }
  return map;
}

async function getAllOrders() {
  await ensureReady();
  logDbModeOnce();
  const pool = getDbPool();
  const tenantId = currentTenantId();
  await migrateTenantFromJsonIfEmpty(pool, tenantId);

  const [orderRows] = await pool.query(
    "SELECT * FROM orders WHERE tenant_id = ? ORDER BY id ASC",
    [tenantId]
  );
  const ids = orderRows.map((r) => Number(r.id));
  const itemsMap = await loadItemsForOrders(pool, tenantId, ids);
  return orderRows.map((row) => rowToOrder(row, itemsMap.get(Number(row.id)) || []));
}

async function getOrderById(id) {
  await ensureReady();
  logDbModeOnce();
  const pool = getDbPool();
  const tenantId = currentTenantId();
  const [rows] = await pool.query(
    "SELECT * FROM orders WHERE tenant_id = ? AND id = ? LIMIT 1",
    [tenantId, Number(id)]
  );
  if (!rows.length) return null;
  const row = rows[0];
  const [itemRows] = await pool.query(
    "SELECT * FROM order_items WHERE tenant_id = ? AND order_id = ? ORDER BY id ASC",
    [tenantId, Number(row.id)]
  );
  return rowToOrder(
    row,
    itemRows.map(itemRowToJson)
  );
}

async function getNextId(_orders) {
  await ensureReady();
  logDbModeOnce();
  const pool = getDbPool();
  const tenantId = currentTenantId();
  const [rows] = await pool.query(
    "SELECT COALESCE(MAX(id), 0) AS m FROM orders WHERE tenant_id = ?",
    [tenantId]
  );
  const m = Number(rows[0] && rows[0].m) || 0;
  return m + 1;
}

async function saveAllOrders(orders) {
  await ensureReady();
  logDbModeOnce();
  const pool = getDbPool();
  const tenantId = currentTenantId();
  const list = Array.isArray(orders) ? orders : [];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM order_items WHERE tenant_id = ?", [tenantId]);
    await conn.query("DELETE FROM orders WHERE tenant_id = ?", [tenantId]);

    for (const o of list) {
      const id = Number(o.id);
      if (!Number.isFinite(id)) continue;
      const items = Array.isArray(o.items) ? o.items : [];
      const createdAt = o.createdAt ? new Date(o.createdAt) : new Date();
      const updatedAt = o.updatedAt ? new Date(o.updatedAt) : createdAt;
      await conn.query(
        `INSERT INTO orders (tenant_id, id, table_number, covers, area, waiter, status, notes, active_course, inventory_processed_at, created_at, updated_at, total_cost, total_price, margin)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          tenantId,
          id,
          o.table != null ? Number(o.table) : null,
          o.covers != null ? Number(o.covers) : null,
          o.area || "sala",
          o.waiter || "",
          o.status || "in_attesa",
          o.notes || "",
          o.activeCourse != null ? Number(o.activeCourse) : 1,
          o.inventoryProcessedAt ? new Date(o.inventoryProcessedAt) : null,
          createdAt,
          updatedAt,
          o.totalCost != null && o.totalCost !== "" ? Number(o.totalCost) : null,
          o.totalPrice != null && o.totalPrice !== "" ? Number(o.totalPrice) : null,
          o.margin != null && o.margin !== "" ? Number(o.margin) : null,
        ]
      );
      for (const it of items) {
        await conn.query(
          `INSERT INTO order_items (tenant_id, order_id, name, category, type, qty, notes, course, item_area, price)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            tenantId,
            id,
            String(it.name || ""),
            it.category || "",
            it.type || "",
            Number(it.qty) || 1,
            it.notes || "",
            it.course != null ? Number(it.course) : null,
            it.area || null,
            it.price != null && it.price !== "" ? Number(it.price) : null,
          ]
        );
      }
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * Aggiorna solo lo stato (percorso ottimizzato; il flusso attuale usa ancora saveAllOrders).
 */
async function updateOrderStatus(id, status) {
  await ensureReady();
  logDbModeOnce();
  const pool = getDbPool();
  const tenantId = currentTenantId();
  const now = new Date();
  await pool.query(
    "UPDATE orders SET status = ?, updated_at = ? WHERE tenant_id = ? AND id = ?",
    [String(status || ""), now, tenantId, Number(id)]
  );
  return getOrderById(id);
}

/**
 * Aggiunge righe a un ordine esistente (senza riscrittura completa).
 */
async function addItems(orderId, items) {
  await ensureReady();
  logDbModeOnce();
  const pool = getDbPool();
  const tenantId = currentTenantId();
  const list = Array.isArray(items) ? items : [];
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const it of list) {
      await conn.query(
        `INSERT INTO order_items (tenant_id, order_id, name, category, type, qty, notes, course, item_area, price)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          tenantId,
          Number(orderId),
          String(it.name || ""),
          it.category || "",
          it.type || "",
          Number(it.qty) || 1,
          it.notes || "",
          it.course != null ? Number(it.course) : null,
          it.area || null,
          it.price != null && it.price !== "" ? Number(it.price) : null,
        ]
      );
    }
    await conn.query(
      "UPDATE orders SET updated_at = ? WHERE tenant_id = ? AND id = ?",
      [new Date(), tenantId, Number(orderId)]
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  return getOrderById(orderId);
}

/**
 * Crea un singolo ordine + righe (equivalente logico a push + saveAllOrders).
 */
async function createOrder(order) {
  await ensureReady();
  logDbModeOnce();
  const o = order || {};
  const orders = await getAllOrders();
  const id = await getNextId(orders);
  const now = new Date().toISOString();
  const newOrder = {
    ...o,
    id,
    status: o.status || "in_attesa",
    createdAt: o.createdAt || now,
    updatedAt: o.updatedAt || now,
    items: Array.isArray(o.items) ? o.items : [],
  };
  const all = [...orders, newOrder];
  await saveAllOrders(all);
  return newOrder;
}

module.exports = {
  getAllOrders,
  getOrderById,
  saveAllOrders,
  getNextId,
  updateOrderStatus,
  addItems,
  createOrder,
};
