const staffReportsService = require("../service/staff-reports.service");

exports.summaryByDepartment = async (req, res) => {
  const data = await staffReportsService.getStaffSummaryByDepartment();
  res.json(data);
};

exports.monthlyHours = async (req, res) => {
  const now = new Date();
  const year = parseInt(req.query.year || now.getFullYear(), 10);
  const month = parseInt(req.query.month || now.getMonth() + 1, 10);
  const data = await staffReportsService.getMonthlyHoursReport(year, month);
  res.json(data);
};

exports.overtimeTotals = async (req, res) => {
  const now = new Date();
  const year = parseInt(req.query.year || now.getFullYear(), 10);
  const month = parseInt(req.query.month || now.getMonth() + 1, 10);
  const data = await staffReportsService.getOvertimeTotals(year, month);
  res.json(data);
};

exports.remainingVacation = async (req, res) => {
  const data = await staffReportsService.getRemainingVacationReport();
  res.json(data);
};

exports.contractCompletion = async (req, res) => {
  const now = new Date();
  const year = parseInt(req.query.year || now.getFullYear(), 10);
  const month = parseInt(req.query.month || now.getMonth() + 1, 10);
  const data = await staffReportsService.getContractHoursCompletion(year, month);
  res.json(data);
};

exports.personnelCost = async (req, res) => {
  const now = new Date();
  const year = parseInt(req.query.year || now.getFullYear(), 10);
  const month = parseInt(req.query.month || now.getMonth() + 1, 10);
  const day = req.query.day ? parseInt(req.query.day, 10) : null;
  const data = await staffReportsService.getPersonnelCostSummary(year, month, day);
  res.json(data);
};
