// backend/src/repositories/order-food-costs.repository.js
// Stores food cost per closed order for daily reports.

const paths = require("../config/paths");
const tenantContext = require("../context/tenantContext");
const { safeReadJson, atomicWriteJson } = require("../utils/safeFileIO");

function getDataPath() {
  return paths.tenant(tenantContext.getRestaurantId(), "order-food-costs.json");
}

function readAll() {
  const data = safeReadJson(getDataPath(), []);
  return Array.isArray(data) ? data : [];
}

function writeAll(records) {
  atomicWriteJson(getDataPath(), Array.isArray(records) ? records : []);
}

function recordOrderFoodCost(orderId, totalFoodCost, closedAt, options = {}) {
  const dateStr = closedAt ? new Date(closedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const records = readAll();
  const record = {
    orderId,
    date: dateStr,
    totalFoodCost: Number(totalFoodCost) || 0,
    closedAt: closedAt || new Date().toISOString(),
  };
  if (Number(options.estimatedRevenue) >= 0) record.estimatedRevenue = Number(options.estimatedRevenue);
  if (Number(options.estimatedMargin) !== undefined && !Number.isNaN(options.estimatedMargin)) {
    record.estimatedMargin = Number(options.estimatedMargin);
  }
  records.push(record);
  writeAll(records);
}

function getTotalFoodCostForDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const dateStr = d.toISOString().slice(0, 10);
  const records = readAll();
  return records
    .filter((r) => String(r.date).slice(0, 10) === dateStr)
    .reduce((sum, r) => sum + (Number(r.totalFoodCost) || 0), 0);
}

module.exports = {
  recordOrderFoodCost,
  getTotalFoodCostForDate,
  readAll,
};
