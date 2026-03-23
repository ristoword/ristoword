// backend/src/service/cassa-shifts.service.js
// Cash register shift operations: open, shift-change, z-report

const cassaShiftsRepository = require("../repositories/cassa-shifts.repository");
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

// OPEN SHIFT (nuova apertura cassa)
async function openShift(body = {}) {
  const existing = await cassaShiftsRepository.getOpenShift();
  if (existing) {
    return {
      ok: false,
      error: "Cassa già aperta",
      message: "Esiste già un turno aperto. Esegui prima un cambio turno o chiusura Z.",
      openShift: existing,
    };
  }

  const openingFloat = toNumber(body.opening_float, 0);
  const openedAt = body.opened_at || new Date().toISOString();

  const shift = await cassaShiftsRepository.create({
    opened_at: openedAt,
    closed_at: null,
    opening_float: openingFloat,
    cash_total: 0,
    card_total: 0,
    other_total: 0,
    status: "open",
  });

  return {
    ok: true,
    shift,
  };
}

// SHIFT CHANGE (cambio turno con conteggio cassa)
async function shiftChange(body = {}) {
  const currentShift = await cassaShiftsRepository.getOpenShift();
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
  const cashTotal = countedCash;
  const cardTotal = computed.cardTotal;
  const otherTotal = computed.otherTotal;

  await cassaShiftsRepository.update(currentShift.id, {
    closed_at: closedAt,
    cash_total: cashTotal,
    card_total: cardTotal,
    other_total: otherTotal,
    status: "closed",
  });

  const openingFloatForNew = toNumber(body.new_opening_float, countedCash);
  const newShift = await cassaShiftsRepository.create({
    opened_at: closedAt,
    closed_at: null,
    opening_float: openingFloatForNew,
    cash_total: 0,
    card_total: 0,
    other_total: 0,
    status: "open",
  });

  return {
    ok: true,
    closedShift: {
      ...currentShift,
      closed_at: closedAt,
      cash_total: cashTotal,
      card_total: cardTotal,
      other_total: otherTotal,
      status: "closed",
    },
    newShift,
  };
}

// Z REPORT (chiusura definitiva giornata)
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

  const currentShift = await cassaShiftsRepository.getOpenShift();
  if (currentShift) {
    const countedCash = toNumber(body.counted_cash, 0);
    const closedAt = new Date().toISOString();

    const allPayments = await paymentsRepository.listPayments({});
    const shiftPayments = allPayments.filter((p) =>
      isPaymentInShift(p, currentShift.opened_at, closedAt)
    );

    const computed = computeTotalsFromPayments(shiftPayments);
    const cashTotal = countedCash;
    const cardTotal = computed.cardTotal;
    const otherTotal = computed.otherTotal;

    await cassaShiftsRepository.update(currentShift.id, {
      closed_at: closedAt,
      cash_total: cashTotal,
      card_total: cardTotal,
      other_total: otherTotal,
      status: "closed",
    });
  }

  const dayShifts = await cassaShiftsRepository.getShiftsByDate(dateStr);
  const closedShifts = dayShifts.filter((s) => String(s.status || "").toLowerCase() === "closed");

  let cashTotal = 0;
  let cardTotal = 0;
  let otherTotal = 0;
  let paymentsCount = 0;

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
  paymentsCount = dailyPayments.length;

  const grandTotal = cashTotal + cardTotal + otherTotal;

  const allOrders = await ordersRepository.getAllOrders();
  const closedOrdersCount = allOrders.filter(
    (o) =>
      isSameDay(o.updatedAt || o.createdAt, new Date(dateStr)) &&
      String(o.status || "").toLowerCase() === "chiuso"
  ).length;

  const closure = await closuresRepository.createClosure({
    date: dateStr,
    cashTotal,
    cardTotal,
    otherTotal,
    grandTotal,
    paymentsCount,
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

async function getShiftStatus() {
  const openShift = await cassaShiftsRepository.getOpenShift();
  return {
    hasOpenShift: !!openShift,
    openShift: openShift || null,
  };
}

module.exports = {
  openShift,
  shiftChange,
  zReport,
  getShiftStatus,
};
