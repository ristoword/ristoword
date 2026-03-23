// backend/src/service/payments.service.js
// POS cash register: openShift, shiftChange, partialClose, zReport

const posShiftsRepository = require("../repositories/pos-shifts.repository");
const paymentsRepository = require("../repositories/payments.repository");
const closuresRepository = require("../repositories/closures.repository");
const ordersRepository = require("../repositories/orders.repository");

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

function isPaymentInShift(payment, openedAt, closedAt) {
  const payTs = new Date(getPaymentDate(payment)).getTime();
  const openTs = new Date(openedAt).getTime();
  const closeTs = closedAt ? new Date(closedAt).getTime() : Number.MAX_SAFE_INTEGER;
  return payTs >= openTs && payTs <= closeTs;
}

function computeTotalsFromPayments(payments) {
  let cashTotal = 0;
  let cardTotal = 0;
  let otherTotal = 0;
  for (const p of payments) {
    const total = toNumber(p.total, 0);
    const method = normalizeString(p.paymentMethod, "").toLowerCase();
    if (method === "cash") cashTotal += total;
    else if (["card", "pos", "carta"].includes(method)) cardTotal += total;
    else otherTotal += total;
  }
  return { cashTotal, cardTotal, otherTotal };
}

// openShift – create shift, prevent opening if shift already open
async function openShift(body = {}) {
  const existing = await posShiftsRepository.getOpenShift();
  if (existing) {
    return {
      ok: false,
      error: "Cassa già aperta",
      message: "Esiste già un turno aperto. Esegui prima un cambio turno o chiusura Z.",
      openShift: existing,
    };
  }

  const shift = await posShiftsRepository.createShift({
    opened_at: body.opened_at || new Date().toISOString(),
    closed_at: null,
    operator: normalizeString(body.operator, ""),
    opening_float: toNumber(body.opening_float, 0),
    cash_total: 0,
    card_total: 0,
    other_total: 0,
    status: "open",
  });

  return { ok: true, shift };
}

// shiftChange – close current shift, calculate totals, open new shift with carryover float
async function shiftChange(body = {}) {
  const currentShift = await posShiftsRepository.getOpenShift();
  if (!currentShift) {
    return {
      ok: false,
      error: "Nessun turno aperto",
      message: "Non c'è un turno aperto. Esegui prima 'Apri Cassa'.",
    };
  }

  const countedCash = toNumber(body.counted_cash, 0);
  const closedAt = new Date().toISOString();

  const allPayments = await paymentsRepository.listPayments({});
  const shiftPayments = allPayments.filter((p) =>
    isPaymentInShift(p, currentShift.opened_at, closedAt)
  );
  const computed = computeTotalsFromPayments(shiftPayments);

  const closedShift = await posShiftsRepository.closeShift(currentShift.id, {
    closed_at: closedAt,
    cash_total: countedCash,
    card_total: computed.cardTotal,
    other_total: computed.otherTotal,
  });

  const openingFloatForNew = body.new_opening_float != null
    ? toNumber(body.new_opening_float)
    : countedCash;
  const newShift = await posShiftsRepository.createShift({
    opened_at: closedAt,
    closed_at: null,
    operator: normalizeString(body.operator, currentShift.operator),
    opening_float: openingFloatForNew,
    cash_total: 0,
    card_total: 0,
    other_total: 0,
    status: "open",
  });

  return {
    ok: true,
    closedShift,
    newShift,
  };
}

// partialClose – calculate totals without closing day (does NOT change shift status)
// Optional counted_cash: if provided, computes difference (counted - expected cash)
async function partialClose(body = {}) {
  const currentShift = await posShiftsRepository.getOpenShift();
  const now = new Date().toISOString();
  const openedAt = currentShift ? currentShift.opened_at : now;
  const closedAt = now;
  const countedCash = body.counted_cash != null ? toNumber(body.counted_cash, 0) : null;

  const allPayments = await paymentsRepository.listPayments({});
  const shiftPayments = allPayments.filter((p) =>
    isPaymentInShift(p, openedAt, closedAt)
  );
  const computed = computeTotalsFromPayments(shiftPayments);

  const grandTotal = computed.cashTotal + computed.cardTotal + computed.otherTotal;
  const openingFloat = currentShift ? toNumber(currentShift.opening_float, 0) : 0;
  const expectedCash = openingFloat + computed.cashTotal;

  const report = {
    hasOpenShift: !!currentShift,
    shiftId: currentShift?.id ?? null,
    opened_at: openedAt,
    as_of: closedAt,
    opening_float: openingFloat,
    cash_total: computed.cashTotal,
    card_total: computed.cardTotal,
    other_total: computed.otherTotal,
    grand_total: grandTotal,
    payments_count: shiftPayments.length,
  };

  if (countedCash !== null) {
    report.counted_cash = countedCash;
    report.cash_difference = round2(countedCash - expectedCash);
    report.cash_difference_label =
      report.cash_difference > 0 ? "sopra" : report.cash_difference < 0 ? "sotto" : "ok";
  }

  return { ok: true, report };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// zReport – close all shifts, generate daily totals
async function zReport(body = {}) {
  const today = new Date();
  const dateStr =
    body.date ||
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const existingClosure = await closuresRepository.getClosureByDate(dateStr);
  if (existingClosure) {
    return {
      ok: false,
      error: "Giornata già chiusa",
      message: `La giornata ${dateStr} risulta già chiusa con la Z.`,
      closure: existingClosure,
    };
  }

  const currentShift = await posShiftsRepository.getOpenShift();
  if (currentShift) {
    const countedCash = toNumber(body.counted_cash, 0);
    const closedAt = new Date().toISOString();
    const allPayments = await paymentsRepository.listPayments({});
    const shiftPayments = allPayments.filter((p) =>
      isPaymentInShift(p, currentShift.opened_at, closedAt)
    );
    const computed = computeTotalsFromPayments(shiftPayments);

    await posShiftsRepository.closeShift(currentShift.id, {
      closed_at: closedAt,
      cash_total: countedCash,
      card_total: computed.cardTotal,
      other_total: computed.otherTotal,
    });
  }

  const dayShifts = await posShiftsRepository.getShiftsByDate(dateStr);
  const closedShifts = dayShifts.filter((s) => String(s.status || "").toLowerCase() === "closed");

  let cashTotal = 0;
  let cardTotal = 0;
  let otherTotal = 0;

  for (const s of closedShifts) {
    cashTotal += toNumber(s.cash_total, 0);
    cardTotal += toNumber(s.card_total, 0);
    otherTotal += toNumber(s.other_total, 0);
  }

  const allPayments = await paymentsRepository.listPayments({});
  const targetDate = new Date(dateStr);
  const dailyPayments = allPayments.filter((p) =>
    isSameDay(getPaymentDate(p), targetDate)
  );
  const grandTotal = cashTotal + cardTotal + otherTotal;

  const allOrders = await ordersRepository.getAllOrders();
  const closedOrdersCount = allOrders.filter(
    (o) =>
      isSameDay(o.updatedAt || o.createdAt, targetDate) &&
      String(o.status || "").toLowerCase() === "chiuso"
  ).length;

  const closure = await closuresRepository.createClosure({
    date: dateStr,
    cashTotal,
    cardTotal,
    otherTotal,
    grandTotal,
    paymentsCount: dailyPayments.length,
    closedOrdersCount,
    closedAt: new Date().toISOString(),
    closedBy: normalizeString(body.closed_by, ""),
    notes: normalizeString(body.notes, ""),
  });

  return {
    ok: true,
    closure,
    shiftsCount: closedShifts.length,
  };
}

async function getCurrentShift() {
  const openShift = await posShiftsRepository.getOpenShift();
  return {
    hasOpenShift: !!openShift,
    shift: openShift || null,
  };
}

module.exports = {
  openShift,
  shiftChange,
  partialClose,
  zReport,
  getCurrentShift,
};
