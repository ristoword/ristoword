const { v4: uuid } = require("uuid");
const ordersRepository = require("./orders.repository");
const paymentsRepository = require("./payments.repository");

let reports = [];

function isSameDay(dateValue, targetDate) {
  if (!dateValue) return false;
  const d = new Date(dateValue);
  const t = targetDate ? new Date(targetDate) : new Date();
  if (Number.isNaN(d.getTime()) || Number.isNaN(t.getTime())) return false;
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

/**
 * Daily report data from orders.json and payments.json.
 * Used by reports service for daily summary and dashboard KPIs.
 */
async function getDailyData(targetDate = new Date()) {
  const allOrders = ordersRepository.getAllOrders();
  const allPayments = await paymentsRepository.listPayments({});
  const date = targetDate instanceof Date ? targetDate : new Date(targetDate);

  const orders = allOrders.filter((o) =>
    isSameDay(o.updatedAt || o.createdAt || o.date, date)
  );
  const payments = allPayments.filter((p) =>
    isSameDay(p.closedAt || p.createdAt, date)
  );

  return { orders, payments };
}

exports.getDailyData = getDailyData;
exports.getAll = async () => reports;

exports.getById = async (id) => {
  return reports.find((r) => r.id === id);
};

exports.create = async (data) => {
  const report = {
    id: uuid(),
    date: data.date || "",
    revenue: Number(data.revenue) || 0,
    covers: Number(data.covers) || 0,
    note: data.note || "",
  };

  reports.push(report);
  return report;
};

exports.remove = async (id) => {
  const index = reports.findIndex((r) => r.id === id);
  if (index === -1) return false;

  reports.splice(index, 1);
  return true;
};