const db = require("../config/db");
const tenantContext = require("../context/tenantContext");

/**
 * KPI aggregati dal DB per tenant corrente (ordini MySQL).
 * Esclude ordini annullati dai totali di conteggio/incasso/coperti.
 */
async function getKPI() {
  const tenantId = tenantContext.getRestaurantId();
  if (!tenantId) {
    return {
      orders: 0,
      revenue: 0,
      cost: 0,
      margin: 0,
      avgTicket: 0,
      covers: 0,
      delayed: 0,
    };
  }

  const [totalRows] = await db.query(
    `
    SELECT
      COUNT(*) AS orders,
      COALESCE(SUM(total_price), 0) AS revenue,
      COALESCE(SUM(total_cost), 0) AS cost,
      COALESCE(SUM(margin), 0) AS margin
    FROM orders
    WHERE tenant_id = ?
      AND LOWER(TRIM(COALESCE(status, ''))) NOT IN ('annullato', 'cancelled')
    `,
    [tenantId]
  );
  const totals = totalRows[0] || {};

  const [coverRows] = await db.query(
    `
    SELECT COALESCE(SUM(covers), 0) AS covers
    FROM orders
    WHERE tenant_id = ?
      AND LOWER(TRIM(COALESCE(status, ''))) NOT IN ('annullato', 'cancelled')
    `,
    [tenantId]
  );
  const coversRow = coverRows[0] || {};

  const [delayedRows] = await db.query(
    `
    SELECT COUNT(*) AS delayed
    FROM orders
    WHERE tenant_id = ?
      AND status = 'in_preparazione'
      AND TIMESTAMPDIFF(MINUTE, created_at, NOW()) > 15
    `,
    [tenantId]
  );
  const delayedRow = delayedRows[0] || {};

  const orders = Number(totals.orders) || 0;
  const revenue = Number(totals.revenue) || 0;
  const cost = Number(totals.cost) || 0;
  const margin = Number(totals.margin) || 0;
  const avgTicket = orders > 0 ? revenue / orders : 0;

  return {
    orders,
    revenue,
    cost,
    margin,
    avgTicket,
    covers: Number(coversRow.covers) || 0,
    delayed: Number(delayedRow.delayed) || 0,
  };
}

module.exports = { getKPI };
