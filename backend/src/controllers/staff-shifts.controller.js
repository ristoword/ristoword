const shiftsRepository = require("../repositories/shifts.repository");
const staffShiftsService = require("../service/staff-shifts.service");

exports.listByStaff = async (req, res) => {
  const { id } = req.params;
  const { dateFrom, dateTo, status } = req.query;
  const shifts = await shiftsRepository.getByStaffId(id, { dateFrom, dateTo, status });
  res.json(shifts);
};

exports.listByDateRange = async (req, res) => {
  const { dateFrom, dateTo } = req.query;
  if (!dateFrom || !dateTo) {
    return res.status(400).json({ error: "dateFrom e dateTo obbligatori" });
  }
  const shifts = await shiftsRepository.getByDateRange(dateFrom, dateTo, req.query);
  res.json(shifts);
};

exports.getCurrentShift = async (req, res) => {
  const { id } = req.params;
  const current = await staffShiftsService.getCurrentShift(id);
  res.json(current);
};

exports.getHistory = async (req, res) => {
  const { id } = req.params;
  const { dateFrom, dateTo } = req.query;
  const now = new Date();
  const from = dateFrom || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const to = dateTo || now.toISOString().slice(0, 10);
  const history = await staffShiftsService.getShiftHistory(id, from, to);
  res.json(history);
};

exports.getRestDays = async (req, res) => {
  const { id } = req.params;
  const { dateFrom, dateTo } = req.query;
  const now = new Date();
  const from = dateFrom || now.toISOString().slice(0, 10);
  const to = dateTo || from;
  const rest = await staffShiftsService.getRestDays(id, from, to);
  res.json(rest);
};

exports.getVacations = async (req, res) => {
  const { id } = req.params;
  const { dateFrom, dateTo } = req.query;
  const now = new Date();
  const from = dateFrom || `${now.getFullYear()}-01-01`;
  const to = dateTo || `${now.getFullYear()}-12-31`;
  const vacations = await staffShiftsService.getVacations(id, from, to);
  res.json(vacations);
};

exports.getSickLeave = async (req, res) => {
  const { id } = req.params;
  const { dateFrom, dateTo } = req.query;
  const now = new Date();
  const from = dateFrom || now.toISOString().slice(0, 10);
  const to = dateTo || from;
  const sick = await staffShiftsService.getSickLeave(id, from, to);
  res.json(sick);
};

exports.getAbsences = async (req, res) => {
  const { id } = req.params;
  const { dateFrom, dateTo } = req.query;
  const now = new Date();
  const from = dateFrom || now.toISOString().slice(0, 10);
  const to = dateTo || from;
  const absences = await staffShiftsService.getAbsences(id, from, to);
  res.json(absences);
};

exports.createShift = async (req, res) => {
  const shift = await shiftsRepository.create(req.body);
  res.status(201).json(shift);
};

exports.createShiftsBulk = async (req, res) => {
  const { shifts } = req.body;
  if (!Array.isArray(shifts) || shifts.length === 0) {
    return res.status(400).json({ error: "shifts array obbligatoria" });
  }
  const created = await shiftsRepository.createMany(shifts);
  res.status(201).json(created);
};

exports.updateShift = async (req, res) => {
  const shift = await shiftsRepository.update(req.params.shiftId, req.body);
  if (!shift) return res.status(404).json({ error: "Turno non trovato" });
  res.json(shift);
};

exports.deleteShift = async (req, res) => {
  const ok = await shiftsRepository.remove(req.params.shiftId);
  if (!ok) return res.status(404).json({ error: "Turno non trovato" });
  res.json({ success: true });
};
