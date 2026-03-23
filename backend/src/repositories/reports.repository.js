const { v4: uuid } = require("uuid");
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const ordersRepository = require("./orders.repository");
const paymentsRepository = require("./payments.repository");
const paths = require("../config/paths");
const tenantContext = require("../context/tenantContext");

const REPORTS_KEY = "reports";

function getDataDir() {
  const restaurantId = tenantContext.getRestaurantId();
  if (!restaurantId) return path.join(paths.DATA, "tenants", "default");
  return path.join(paths.DATA, "tenants", restaurantId);
}

function getReportsFilePath() {
  return path.join(getDataDir(), "reports.json");
}

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
  const allOrders = await ordersRepository.getAllOrders();
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

async function ensureReportsFile() {
  const fp = getReportsFilePath();
  await fsp.mkdir(getDataDir(), { recursive: true });
  if (!fs.existsSync(fp)) {
    await fsp.writeFile(fp, JSON.stringify({ [REPORTS_KEY]: [] }, null, 2), "utf8");
    return;
  }
  const raw = await fsp.readFile(fp, "utf8");
  if (!raw.trim()) {
    await fsp.writeFile(fp, JSON.stringify({ [REPORTS_KEY]: [] }, null, 2), "utf8");
  }
}

async function readReportsList() {
  await ensureReportsFile();
  const raw = await fsp.readFile(getReportsFilePath(), "utf8");
  try {
    const data = JSON.parse(raw);
    const list = data[REPORTS_KEY];
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error("[Ristoword] reports.json parse error:", err.message);
    return [];
  }
}

async function writeReportsList(reports) {
  const fp = getReportsFilePath();
  await fsp.mkdir(getDataDir(), { recursive: true });
  const tmpPath = fp + "." + Date.now() + ".tmp";
  await fsp.writeFile(tmpPath, JSON.stringify({ [REPORTS_KEY]: reports }, null, 2), "utf8");
  await fsp.rename(tmpPath, fp);
}

exports.getDailyData = getDailyData;

exports.getAll = async () => {
  return readReportsList();
};

exports.getById = async (id) => {
  const reports = await readReportsList();
  return reports.find((r) => r.id === id) || null;
};

exports.create = async (data) => {
  const reports = await readReportsList();
  const report = {
    id: data.id || uuid(),
    date: data.date || "",
    revenue: Number(data.revenue) || 0,
    covers: Number(data.covers) || 0,
    note: data.note || "",
  };
  reports.push(report);
  await writeReportsList(reports);
  return report;
};

exports.remove = async (id) => {
  const reports = await readReportsList();
  const index = reports.findIndex((r) => r.id === id);
  if (index === -1) return false;
  reports.splice(index, 1);
  await writeReportsList(reports);
  return true;
};
