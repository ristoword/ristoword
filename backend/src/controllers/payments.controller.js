const paymentsRepository = require("../repositories/payments.repository");
const ordersRepository = require("../repositories/orders.repository");
const closuresRepository = require("../repositories/closures.repository");
const paymentsService = require("../service/payments.service");
const ordersService = require("../service/orders.service");
const { broadcastOrders, broadcastSupervisorSyncFromData } = require("../service/websocket.service");

// =============================
// HELPERS
// =============================

function getPaymentDateStr(payment) {
  const iso = payment?.closedAt || payment?.createdAt;
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeString(value, fallback = "") {
  if (value == null) return fallback;
  return String(value).trim();
}

function buildFilters(query = {}) {
  const filters = {};

  if (query.id) filters.id = normalizeString(query.id);
  if (query.table) filters.table = normalizeString(query.table);
  if (query.paymentMethod) filters.paymentMethod = normalizeString(query.paymentMethod);
  if (query.operator) filters.operator = normalizeString(query.operator);
  if (query.status) filters.status = normalizeString(query.status);
  if (query.dateFrom) filters.dateFrom = normalizeString(query.dateFrom);
  if (query.dateTo) filters.dateTo = normalizeString(query.dateTo);

  return filters;
}

function validateCreatePayload(body = {}) {
  const table = normalizeString(body.table, "");
  const paymentMethod = normalizeString(body.paymentMethod, "");
  const total = toNumber(body.total, NaN);

  const errors = [];

  if (!table) errors.push("table obbligatorio");
  if (!paymentMethod) errors.push("paymentMethod obbligatorio");
  if (!Number.isFinite(total)) errors.push("total obbligatorio e numerico");

  return {
    isValid: errors.length === 0,
    errors
  };
}

function approxEqual(a, b, eps = 0.01) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= eps;
}

/**
 * Mirror the most important frontend validation rules from cassa.js
 * to ensure backend never accepts obviously inconsistent payments.
 */
function validateBusinessRules(body = {}) {
  const errors = [];
  const total = toNumber(body.total, 0);
  const method = normalizeString(body.paymentMethod, "").toLowerCase();
  const amountReceived = toNumber(body.amountReceived, 0);

  if (!Number.isFinite(total) || total < 0) {
    errors.push("total non valido");
  }

  if (method === "cash") {
    if (amountReceived < total) {
      errors.push("importo contanti insufficiente rispetto al totale");
    }
  } else if (["ticket", "voucher", "mixed"].includes(method)) {
    if (!approxEqual(amountReceived, total)) {
      errors.push("il totale registrato del pagamento deve coincidere con il totale finale");
    }
  }

  const split = body.split;
  if (split && Array.isArray(split.shares) && split.shares.length > 0) {
    const sharesTotal = split.shares.reduce(
      (acc, v) => acc + toNumber(v, 0),
      0
    );
    if (!approxEqual(sharesTotal, total)) {
      errors.push("la somma delle quote split deve coincidere con il totale finale");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// =============================
// CONTROLLERS
// =============================

// GET /api/payments
async function listPayments(req, res) {
  const filters = buildFilters(req.query);
  const payments = await paymentsRepository.listPayments(filters);

  res.json(payments);
}

// GET /api/payments/summary
async function getPaymentsSummary(req, res) {
  const filters = buildFilters(req.query);
  const summary = await paymentsRepository.getPaymentsSummary(filters);

  res.json(summary);
}

// GET /api/payments/:id
async function getPaymentById(req, res) {
  const { id } = req.params;
  const payment = await paymentsRepository.getPaymentById(id);

  if (!payment) {
    return res.status(404).json({ error: "Pagamento non trovato" });
  }

  res.json(payment);
}

// POST /api/payments
async function createPayment(req, res) {
  const payload = req.body || {};
  const validation = validateCreatePayload(payload);

  if (!validation.isValid) {
    return res.status(400).json({
      error: "Payload pagamento non valido",
      details: validation.errors
    });
  }

  const businessValidation = validateBusinessRules(payload);
  if (!businessValidation.isValid) {
    return res.status(400).json({
      error: "Regole pagamento non rispettate",
      details: businessValidation.errors,
    });
  }

  const paymentDateIso = payload.closedAt || new Date().toISOString();
  const paymentDateStr = getPaymentDateStr({ closedAt: paymentDateIso });
  if (paymentDateStr) {
    const dayClosed = await closuresRepository.isDayClosed(paymentDateStr);
    if (dayClosed) {
      return res.status(409).json({
        error: "Giornata chiusa",
        message: "La giornata risulta già chiusa con la Z. Non è possibile registrare nuovi pagamenti."
      });
    }
  }

  const orderIds = Array.isArray(payload.orderIds) ? payload.orderIds.map(String) : [];
  if (orderIds.length > 0) {
    const allOrders = await ordersRepository.getAllOrders();
    for (const oid of orderIds) {
      const order = allOrders.find((o) => String(o.id) === oid);
      if (order && String(order.status || "").toLowerCase() === "chiuso") {
        return res.status(409).json({
          error: "Ordini già pagati",
          message: `Ordine ${oid} risulta già chiuso. Impossibile registrare un secondo pagamento.`
        });
      }
    }
    const existing = await paymentsRepository.findByOrderIds(orderIds);
    if (existing.length > 0) {
      return res.status(409).json({
        error: "Ordini già pagati",
        message: "Uno o più ordini di questo tavolo risultano già pagati. Impossibile registrare un secondo pagamento."
      });
    }
  }

  const payment = await paymentsRepository.createPayment({
    table: normalizeString(payload.table, "-"),
    orderIds: Array.isArray(payload.orderIds) ? payload.orderIds : [],
    subtotal: toNumber(payload.subtotal, 0),
    discountAmount: toNumber(payload.discountAmount, 0),
    discountType: normalizeString(payload.discountType, "none"),
    discountReason: normalizeString(payload.discountReason, ""),
    vatPercent: toNumber(payload.vatPercent, 0),
    vatAmount: toNumber(payload.vatAmount, 0),
    total: toNumber(payload.total, 0),
    paymentMethod: normalizeString(payload.paymentMethod, "unknown"),
    amountReceived: toNumber(payload.amountReceived, 0),
    changeAmount: toNumber(payload.changeAmount, 0),
    covers: toNumber(payload.covers, 0),
    operator: normalizeString(payload.operator, ""),
    note: normalizeString(payload.note, ""),
    customerName: normalizeString(payload.customerName, ""),
    customerId: normalizeString(payload.customerId, ""),
    companyName: normalizeString(payload.companyName, ""),
    vatNumber: normalizeString(payload.vatNumber, ""),
    status: normalizeString(payload.status, "closed"),
    closedAt: payload.closedAt || new Date().toISOString()
  });

  // Chiude atomicamente gli ordini del tavolo (evita fallimenti parziali frontend)
  for (const oid of orderIds) {
    try {
      await ordersService.setStatus(oid, "chiuso");
    } catch (err) {
      console.warn("[Payments] setStatus chiuso fallito per ordine", oid, err.message);
    }
  }

  try {
    const activeOrders = await ordersService.listActiveOrders();
    broadcastOrders(activeOrders);
  } catch (err) {
    console.warn("[Payments] broadcast orders fallito:", err.message);
  }
  broadcastSupervisorSyncFromData();

  res.status(201).json(payment);
}

// PATCH /api/payments/:id
async function updatePayment(req, res) {
  const { id } = req.params;
  const payload = req.body || {};

  const existing = await paymentsRepository.getPaymentById(id);
  if (!existing) {
    return res.status(404).json({ error: "Pagamento non trovato" });
  }
  const paymentDateStr = getPaymentDateStr(existing);
  if (paymentDateStr) {
    const dayClosed = await closuresRepository.isDayClosed(paymentDateStr);
    if (dayClosed) {
      return res.status(409).json({
        error: "Giornata chiusa",
        message: "La giornata di questo pagamento risulta già chiusa. Modifiche non consentite."
      });
    }
  }

  const updated = await paymentsRepository.updatePayment(id, {
    table: payload.table != null ? normalizeString(payload.table, "-") : undefined,
    orderIds: Array.isArray(payload.orderIds) ? payload.orderIds : undefined,
    subtotal: payload.subtotal != null ? toNumber(payload.subtotal, 0) : undefined,
    discountAmount: payload.discountAmount != null ? toNumber(payload.discountAmount, 0) : undefined,
    discountType: payload.discountType != null ? normalizeString(payload.discountType, "none") : undefined,
    discountReason: payload.discountReason != null ? normalizeString(payload.discountReason, "") : undefined,
    vatPercent: payload.vatPercent != null ? toNumber(payload.vatPercent, 0) : undefined,
    vatAmount: payload.vatAmount != null ? toNumber(payload.vatAmount, 0) : undefined,
    total: payload.total != null ? toNumber(payload.total, 0) : undefined,
    paymentMethod: payload.paymentMethod != null ? normalizeString(payload.paymentMethod, "unknown") : undefined,
    amountReceived: payload.amountReceived != null ? toNumber(payload.amountReceived, 0) : undefined,
    changeAmount: payload.changeAmount != null ? toNumber(payload.changeAmount, 0) : undefined,
    covers: payload.covers != null ? toNumber(payload.covers, 0) : undefined,
    operator: payload.operator != null ? normalizeString(payload.operator, "") : undefined,
    note: payload.note != null ? normalizeString(payload.note, "") : undefined,
    customerName: payload.customerName != null ? normalizeString(payload.customerName, "") : undefined,
    customerId: payload.customerId != null ? normalizeString(payload.customerId, "") : undefined,
    companyName: payload.companyName != null ? normalizeString(payload.companyName, "") : undefined,
    vatNumber: payload.vatNumber != null ? normalizeString(payload.vatNumber, "") : undefined,
    status: payload.status != null ? normalizeString(payload.status, "closed") : undefined,
    closedAt: payload.closedAt != null ? payload.closedAt : undefined
  });

  if (!updated) {
    return res.status(404).json({ error: "Pagamento non trovato" });
  }

  res.json(updated);
}

// DELETE /api/payments/:id
async function deletePayment(req, res) {
  const { id } = req.params;

  const existing = await paymentsRepository.getPaymentById(id);
  if (!existing) {
    return res.status(404).json({ error: "Pagamento non trovato" });
  }
  const paymentDateStr = getPaymentDateStr(existing);
  if (paymentDateStr) {
    const dayClosed = await closuresRepository.isDayClosed(paymentDateStr);
    if (dayClosed) {
      return res.status(409).json({
        error: "Giornata chiusa",
        message: "La giornata di questo pagamento risulta già chiusa. Modifiche non consentite."
      });
    }
  }

  const removed = await paymentsRepository.deletePayment(id);
  if (!removed) {
    return res.status(404).json({ error: "Pagamento non trovato" });
  }

  res.json({ ok: true });
}

// =============================
// POS SHIFT CONTROLLERS
// =============================

async function openShift(req, res) {
  const body = req.body || {};
  const result = await paymentsService.openShift({
    opening_float: toNumber(body.opening_float, 0),
    operator: normalizeString(body.operator, ""),
    opened_at: body.opened_at,
  });

  if (!result.ok) {
    return res.status(409).json({
      error: result.error,
      message: result.message,
      openShift: result.openShift,
    });
  }

  broadcastSupervisorSyncFromData();
  res.status(201).json(result.shift);
}

async function shiftChange(req, res) {
  const body = req.body || {};
  const result = await paymentsService.shiftChange({
    counted_cash: toNumber(body.counted_cash, 0),
    new_opening_float: body.new_opening_float,
    operator: normalizeString(body.operator, ""),
  });

  if (!result.ok) {
    return res.status(400).json({
      error: result.error,
      message: result.message,
    });
  }

  broadcastSupervisorSyncFromData();
  res.status(200).json({
    closedShift: result.closedShift,
    newShift: result.newShift,
  });
}

async function partialClose(req, res) {
  const result = await paymentsService.partialClose(req.body || {});
  res.status(200).json(result.report);
}

async function zReport(req, res) {
  const body = req.body || {};
  const result = await paymentsService.zReport({
    date: normalizeString(body.date),
    counted_cash: toNumber(body.counted_cash, 0),
    closed_by: normalizeString(body.closed_by, ""),
    notes: normalizeString(body.notes, ""),
  });

  if (!result.ok) {
    return res.status(409).json({
      error: result.error,
      message: result.message,
      closure: result.closure,
    });
  }

  broadcastSupervisorSyncFromData();
  res.status(201).json({
    closure: result.closure,
    shiftsCount: result.shiftsCount,
  });
}

async function getCurrentShift(req, res) {
  const result = await paymentsService.getCurrentShift();
  res.json(result);
}

module.exports = {
  listPayments,
  getPaymentsSummary,
  getPaymentById,
  createPayment,
  updatePayment,
  deletePayment,
  openShift,
  shiftChange,
  partialClose,
  zReport,
  getCurrentShift,
};