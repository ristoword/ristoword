const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const paths = require("../config/paths");
const tenantContext = require("../context/tenantContext");

function getDataDir() {
  const restaurantId = tenantContext.getRestaurantId();
  if (!restaurantId) return paths.DATA;
  return path.join(paths.DATA, "tenants", restaurantId);
}

function getPaymentsPath() {
  return path.join(getDataDir(), "payments.json");
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `pay_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeString(value, fallback = "") {
  if (value == null) return fallback;
  return String(value).trim();
}

async function ensurePaymentsFile() {
  const dataDir = getDataDir();
  const paymentsPath = getPaymentsPath();
  await fsp.mkdir(dataDir, { recursive: true });

  if (!fs.existsSync(paymentsPath)) {
    await fsp.writeFile(paymentsPath, "[]", "utf8");
    return;
  }

  const raw = await fsp.readFile(paymentsPath, "utf8");
  if (!raw.trim()) {
    await fsp.writeFile(paymentsPath, "[]", "utf8");
  }
}

async function readAllPayments() {
  await ensurePaymentsFile();
  const raw = await fsp.readFile(getPaymentsPath(), "utf8");

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[Ristoword] payments.json parse error:", err.message);
    return [];
  }
}

async function writeAllPayments(payments) {
  const paymentsPath = getPaymentsPath();
  await fsp.mkdir(getDataDir(), { recursive: true });
  const tmpPath = paymentsPath + "." + Date.now() + ".tmp";
  try {
    await fsp.writeFile(tmpPath, JSON.stringify(payments, null, 2), "utf8");
    await fsp.rename(tmpPath, paymentsPath);
  } catch (err) {
    try {
      await fsp.unlink(tmpPath).catch(() => {});
    } catch (_) {}
    await fsp.writeFile(paymentsPath, JSON.stringify(payments, null, 2), "utf8");
  }
}

function normalizePaymentInput(input = {}) {
  const nowIso = new Date().toISOString();

  return {
    id: input.id || createId(),
    table: normalizeString(input.table, "-"),
    orderIds: Array.isArray(input.orderIds)
      ? input.orderIds.map((id) => normalizeString(id)).filter(Boolean)
      : [],
    subtotal: toNumber(input.subtotal, 0),
    discountAmount: toNumber(input.discountAmount, 0),
    discountType: normalizeString(input.discountType, "none"),
    discountReason: normalizeString(input.discountReason, ""),
    vatPercent: toNumber(input.vatPercent, 0),
    vatAmount: toNumber(input.vatAmount, 0),
    total: toNumber(input.total, 0),
    paymentMethod: normalizeString(input.paymentMethod, "unknown"),
    amountReceived: toNumber(input.amountReceived, 0),
    changeAmount: toNumber(input.changeAmount, 0),
    covers: toNumber(input.covers, 0),
    operator: normalizeString(input.operator, ""),
    note: normalizeString(input.note, ""),
    customerName: normalizeString(input.customerName, ""),
    customerId: normalizeString(input.customerId, ""),
    companyName: normalizeString(input.companyName, ""),
    vatNumber: normalizeString(input.vatNumber, ""),
    status: normalizeString(input.status, "closed"),
    createdAt: input.createdAt || nowIso,
    updatedAt: nowIso,
    closedAt: input.closedAt || nowIso
  };
}

function matchesFilters(payment, filters = {}) {
  if (filters.id && payment.id !== filters.id) return false;
  if (filters.table && String(payment.table) !== String(filters.table)) return false;
  if (
    filters.paymentMethod &&
    String(payment.paymentMethod).toLowerCase() !== String(filters.paymentMethod).toLowerCase()
  ) {
    return false;
  }
  if (
    filters.operator &&
    String(payment.operator).toLowerCase() !== String(filters.operator).toLowerCase()
  ) {
    return false;
  }
  if (
    filters.status &&
    String(payment.status).toLowerCase() !== String(filters.status).toLowerCase()
  ) {
    return false;
  }

  if (filters.dateFrom) {
    const fromTs = new Date(filters.dateFrom).getTime();
    const payTs = new Date(payment.closedAt || payment.createdAt).getTime();
    if (Number.isFinite(fromTs) && payTs < fromTs) return false;
  }

  if (filters.dateTo) {
    const toTs = new Date(filters.dateTo).getTime();
    const payTs = new Date(payment.closedAt || payment.createdAt).getTime();
    if (Number.isFinite(toTs) && payTs > toTs) return false;
  }

  return true;
}

async function listPayments(filters = {}) {
  const payments = await readAllPayments();
  return payments
    .filter((payment) => matchesFilters(payment, filters))
    .sort((a, b) => {
      const aTs = new Date(a.closedAt || a.createdAt || 0).getTime();
      const bTs = new Date(b.closedAt || b.createdAt || 0).getTime();
      return bTs - aTs;
    });
}

async function getPaymentById(id) {
  const payments = await readAllPayments();
  return payments.find((payment) => payment.id === id) || null;
}

async function findByOrderIds(orderIds) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) return [];
  const ids = new Set(orderIds.map((id) => String(id)));
  const payments = await readAllPayments();
  return payments.filter((p) =>
    (p.orderIds || []).some((oid) => ids.has(String(oid)))
  );
}

async function createPayment(payload) {
  const payments = await readAllPayments();
  const payment = normalizePaymentInput(payload);

  payments.push(payment);
  await writeAllPayments(payments);

  return payment;
}

async function updatePayment(id, updates = {}) {
  const payments = await readAllPayments();
  const index = payments.findIndex((payment) => payment.id === id);

  if (index === -1) return null;

  const current = payments[index];
  const next = {
    ...current,
    ...updates,
    id: current.id,
    updatedAt: new Date().toISOString()
  };

  payments[index] = next;
  await writeAllPayments(payments);

  return next;
}

async function deletePayment(id) {
  const payments = await readAllPayments();
  const index = payments.findIndex((payment) => payment.id === id);

  if (index === -1) return false;

  payments.splice(index, 1);
  await writeAllPayments(payments);

  return true;
}

async function getPaymentsSummary(filters = {}) {
  const payments = await listPayments(filters);

  const summary = {
    count: payments.length,
    gross: 0,
    discountAmount: 0,
    vatAmount: 0,
    net: 0,
    covers: 0,
    byMethod: {}
  };

  for (const payment of payments) {
    const subtotal = toNumber(payment.subtotal, 0);
    const discountAmount = toNumber(payment.discountAmount, 0);
    const vatAmount = toNumber(payment.vatAmount, 0);
    const total = toNumber(payment.total, 0);
    const covers = toNumber(payment.covers, 0);
    const method = normalizeString(payment.paymentMethod, "unknown");

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

  return summary;
}

module.exports = {
  PAYMENTS_FILE: getPaymentsPath,
  ensurePaymentsFile,
  readAllPayments,
  writeAllPayments,
  listPayments,
  getPaymentById,
  findByOrderIds,
  createPayment,
  updatePayment,
  deletePayment,
  getPaymentsSummary
};