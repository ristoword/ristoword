const staffHoursService = require("../service/staff-hours.service");

exports.getWorkedHours = async (req, res) => {
  const { id } = req.params;
  const { period } = req.query;
  const hours = await staffHoursService.getWorkedHoursByPeriod(id, period || "month");
  res.json({ staffId: id, period: period || "month", hours });
};

exports.getSummary = async (req, res) => {
  const { id } = req.params;
  const summary = await staffHoursService.getSummary(id);
  res.json(summary);
};
