// backend/src/controllers/closures.controller.js
// Daily Z closure: create, list, get by date, export CSV/Excel

const closuresRepository = require("../repositories/closures.repository");
const paymentsRepository = require("../repositories/payments.repository");
const ordersRepository = require("../repositories/orders.repository");
const XLSX = require("xlsx");

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeString(v, fallback = "") {
  if (v == null) return fallback;
  return String(v).trim();
}

function isSameDay(dateValue, targetDate) {
  const d = new Date(dateValue);
  const t = new Date(targetDate);
  if (Number.isNaN(d.getTime()) || Number.isNaN(t.getTime())) return false;
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

function getPaymentDate(p) {
  return p.closedAt || p.createdAt || null;
}

async function computeDayTotals(dateStr) {
  const targetDate = new Date(dateStr);
  const dateFrom = new Date(targetDate);
  dateFrom.setHours(0, 0, 0, 0);
  const dateTo = new Date(targetDate);
  dateTo.setHours(23, 59, 59, 999);

  const allPayments = await paymentsRepository.listPayments({});
  const dailyPayments = allPayments.filter((p) =>
    isSameDay(getPaymentDate(p), targetDate)
  );

  const allOrders = ordersRepository.getAllOrders();
  const closedOrders = allOrders.filter(
    (o) =>
      isSameDay(o.updatedAt || o.createdAt, targetDate) &&
      String(o.status || "").toLowerCase() === "chiuso"
  );

  let cashTotal = 0;
  let cardTotal = 0;
  let otherTotal = 0;

  for (const p of dailyPayments) {
    const total = toNumber(p.total, 0);
    const method = normalizeString(p.paymentMethod, "").toLowerCase();
    if (method === "cash") cashTotal += total;
    else if (["card", "pos", "carta"].includes(method)) cardTotal += total;
    else otherTotal += total;
  }

  const grandTotal = cashTotal + cardTotal + otherTotal;

  return {
    cashTotal,
    cardTotal,
    otherTotal,
    grandTotal,
    paymentsCount: dailyPayments.length,
    closedOrdersCount: closedOrders.length,
  };
}

// POST /api/closures
async function createClosure(req, res) {
  const body = req.body || {};
  const dateStr = normalizeString(body.date);
  const closedBy = normalizeString(body.closedBy, "");
  const notes = normalizeString(body.notes, "");

  if (!dateStr) {
    return res.status(400).json({ error: "Campo 'date' obbligatorio (YYYY-MM-DD)" });
  }

  const existing = await closuresRepository.getClosureByDate(dateStr);
  if (existing) {
    return res.status(409).json({
      error: "Giornata già chiusa",
      message: `La data ${dateStr} risulta già chiusa. Impossibile creare una seconda chiusura.`,
      closure: existing,
    });
  }

  const totals = await computeDayTotals(dateStr);

  const closure = await closuresRepository.createClosure({
    date: dateStr,
    cashTotal: body.cashTotal != null ? toNumber(body.cashTotal) : totals.cashTotal,
    cardTotal: body.cardTotal != null ? toNumber(body.cardTotal) : totals.cardTotal,
    otherTotal: body.otherTotal != null ? toNumber(body.otherTotal) : totals.otherTotal,
    grandTotal: body.grandTotal != null ? toNumber(body.grandTotal) : totals.grandTotal,
    paymentsCount: body.paymentsCount != null ? toNumber(body.paymentsCount) : totals.paymentsCount,
    closedOrdersCount: body.closedOrdersCount != null ? toNumber(body.closedOrdersCount) : totals.closedOrdersCount,
    closedAt: new Date().toISOString(),
    closedBy,
    notes,
  });

  res.status(201).json(closure);
}

// GET /api/closures
async function listClosures(req, res) {
  const { dateFrom, dateTo } = req.query || {};
  const filters = {};
  if (dateFrom) filters.dateFrom = String(dateFrom).trim();
  if (dateTo) filters.dateTo = String(dateTo).trim();
  const closures = await closuresRepository.listClosures(filters);
  res.json(closures);
}

// GET /api/closures/check/:date
async function checkDateClosed(req, res) {
  const { date } = req.params;
  const closed = await closuresRepository.isDayClosed(date);
  res.json({ date: String(date).slice(0, 10), closed });
}

// GET /api/closures/:date
async function getClosureByDate(req, res) {
  const { date } = req.params;
  const closure = await closuresRepository.getClosureByDate(date);
  if (!closure) {
    return res.status(404).json({ error: "Chiusura non trovata per la data indicata" });
  }
  res.json(closure);
}

// GET /api/closures/preview/:date
async function getClosurePreview(req, res) {
  const { date } = req.params;
  const dateStr = String(date).slice(0, 10);
  const totals = await computeDayTotals(dateStr);
  const closed = await closuresRepository.isDayClosed(dateStr);
  res.json({ date: dateStr, ...totals, closed });
}

function buildExportRows(closureOrPreview) {
  const c = closureOrPreview || {};
  return [
    ["RISTOWORD – Chiusura Z", ""],
    ["Data", c.date || ""],
    ["Chiusa il", c.closedAt || ""],
    ["Operatore", c.closedBy || ""],
    ["", ""],
    ["Contanti", c.cashTotal ?? c.cash ?? 0],
    ["Carta / POS", c.cardTotal ?? c.card ?? 0],
    ["Altri", c.otherTotal ?? c.other ?? 0],
    ["Totale", c.grandTotal ?? 0],
    ["", ""],
    ["Pagamenti", c.paymentsCount ?? 0],
    ["Ordini chiusi", c.closedOrdersCount ?? 0],
    ["", ""],
    ["Note", c.notes || ""],
  ];
}

// GET /api/closures/:date/export?format=csv|excel
async function exportClosure(req, res) {
  const { date } = req.params;
  const format = (req.query.format || "csv").toLowerCase();
  const dateStr = String(date).slice(0, 10);

  let data = await closuresRepository.getClosureByDate(dateStr);
  if (!data) {
    const preview = await computeDayTotals(dateStr);
    data = {
      date: dateStr,
      ...preview,
      closedAt: "",
      closedBy: "",
      notes: "(Anteprima - giornata non chiusa)",
    };
  }

  const rows = buildExportRows(data);

  if (format === "excel" || format === "xlsx") {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Chiusura Z");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="chiusura_z_${data.date}.xlsx"`);
    return res.send(buf);
  }

  const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="chiusura_z_${data.date}.csv"`);
  res.send("\uFEFF" + csv);
}

module.exports = {
  createClosure,
  listClosures,
  getClosureByDate,
  getClosurePreview,
  checkDateClosed,
  exportClosure,
  computeDayTotals,
};
