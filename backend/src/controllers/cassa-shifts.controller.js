// backend/src/controllers/cassa-shifts.controller.js
// Cash register shift: open, shift-change, z-report

const cassaShiftsService = require("../service/cassa-shifts.service");
const { broadcastSupervisorSyncFromData } = require("../service/websocket.service");

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeString(v, fallback = "") {
  if (v == null) return fallback;
  return String(v).trim();
}

// POST /api/payments/open – Apri Cassa (nuova apertura)
async function openShift(req, res) {
  const body = req.body || {};
  const result = await cassaShiftsService.openShift({
    opening_float: toNumber(body.opening_float, 0),
    opened_at: body.opened_at || new Date().toISOString(),
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

// POST /api/payments/shift-change – Cambio Turno (conteggio cassa)
async function shiftChange(req, res) {
  const body = req.body || {};
  const result = await cassaShiftsService.shiftChange({
    counted_cash: toNumber(body.counted_cash, 0),
    new_opening_float: body.new_opening_float != null ? toNumber(body.new_opening_float) : undefined,
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

// POST /api/payments/z-report – Chiusura Z (chiusura definitiva giornata)
async function zReport(req, res) {
  const body = req.body || {};
  const result = await cassaShiftsService.zReport({
    date: normalizeString(body.date) || undefined,
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

// GET /api/payments/shift-status – Stato turno (per frontend)
async function getShiftStatus(req, res) {
  const status = await cassaShiftsService.getShiftStatus();
  res.json(status);
}

module.exports = {
  openShift,
  shiftChange,
  zReport,
  getShiftStatus,
};
