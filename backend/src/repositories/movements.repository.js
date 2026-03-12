const reportsRepository = require("../repositories/reports.repository");
const reportsService = require("../service/reports.service");

// GET /api/reports
exports.listReports = async (req, res) => {
  const data = await reportsRepository.getAll();
  res.json(data);
};

// GET /api/reports/:id
exports.getReportById = async (req, res) => {
  const report = await reportsRepository.getById(req.params.id);

  if (!report) {
    return res.status(404).json({ error: "Report non trovato" });
  }

  res.json(report);
};

// POST /api/reports
exports.createReport = async (req, res) => {
  const report = await reportsRepository.create(req.body);
  res.status(201).json(report);
};

// DELETE /api/reports/:id
exports.deleteReport = async (req, res) => {
  const ok = await reportsRepository.remove(req.params.id);

  if (!ok) {
    return res.status(404).json({ error: "Report non trovato" });
  }

  res.json({ success: true });
};

// KPI giornalieri
exports.getDailySummary = async (req, res) => {
  const date = req.query.date ? new Date(req.query.date) : new Date();

  const summary = await reportsService.buildDailyReport(date);

  res.json(summary);
};