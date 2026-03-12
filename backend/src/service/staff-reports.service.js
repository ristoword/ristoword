// backend/src/service/staff-reports.service.js
// Supervisor reports: department summary, monthly hours, overtime, vacation, contracts
// Prepared for: personnel cost, contract alerts, cost per service

const staffRepository = require("../repositories/staff.repository");
const shiftsRepository = require("../repositories/shifts.repository");
const staffRequestsRepository = require("../repositories/staff-requests.repository");
const staffHoursService = require("./staff-hours.service");
const { DEPARTMENTS } = require("../constants/departments");

async function getStaffSummaryByDepartment() {
  const staff = await staffRepository.getAll();
  const byDept = {};
  for (const d of DEPARTMENTS) {
    byDept[d] = staff.filter((s) => s.department === d && s.active !== false);
  }
  return {
    departments: DEPARTMENTS,
    byDepartment: byDept,
    total: staff.filter((s) => s.active !== false).length,
  };
}

async function getMonthlyHoursReport(year, month) {
  const staff = await staffRepository.getAll();
  const dateFrom = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const dateTo = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const results = [];
  for (const s of staff) {
    if (s.active === false) continue;
    const worked = await staffHoursService.getWorkedHoursFromShifts(
      s.id,
      dateFrom,
      dateTo
    );
    const summary = await staffHoursService.getSummary(s.id);
    results.push({
      staffId: s.id,
      name: s.name,
      department: s.department,
      workedHours: worked,
      overtime: summary.overtime || 0,
      contractHours: s.work?.monthlyContractHours ?? null,
      remaining: summary.monthlyHoursRemaining ?? null,
      contractExceeded: summary.contractExceeded || false,
    });
  }
  return {
    year,
    month,
    dateFrom,
    dateTo,
    staff: results,
    totalWorked: results.reduce((s, r) => s + r.workedHours, 0),
    totalOvertime: results.reduce((s, r) => s + (r.overtime || 0), 0),
  };
}

async function getOvertimeTotals(year, month) {
  const report = await getMonthlyHoursReport(year, month);
  return {
    year,
    month,
    totalOvertime: report.totalOvertime,
    byStaff: report.staff
      .filter((s) => (s.overtime || 0) > 0)
      .map((s) => ({ staffId: s.staffId, name: s.name, overtime: s.overtime })),
  };
}

async function getRemainingVacationReport() {
  const staff = await staffRepository.getAll();
  return staff
    .filter((s) => s.active !== false)
    .map((s) => ({
      staffId: s.id,
      name: s.name,
      department: s.department,
      earned: s.vacations?.earned ?? null,
      used: s.vacations?.used ?? null,
      remaining: s.vacations?.remaining ?? null,
    }));
}

async function getContractHoursCompletion(year, month) {
  const report = await getMonthlyHoursReport(year, month);
  return {
    year,
    month,
    staff: report.staff.map((s) => ({
      staffId: s.staffId,
      name: s.name,
      department: s.department,
      contractHours: s.contractHours,
      workedHours: s.workedHours,
      completionPercent:
        s.contractHours > 0
          ? Math.min(100, Math.round((s.workedHours / s.contractHours) * 100))
          : null,
      exceeded: s.contractExceeded,
    })),
  };
}

async function getPersonnelCostSummary(year, month, day) {
  const staff = await staffRepository.getAll();
  const dateFrom = day
    ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : `${year}-${String(month).padStart(2, "0")}-01`;
  const dateTo = day
    ? dateFrom
    : `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;

  let totalCost = 0;
  const byStaff = [];
  for (const s of staff) {
    if (s.active === false) continue;
    const worked = await staffHoursService.getWorkedHoursFromShifts(
      s.id,
      dateFrom,
      dateTo
    );
    const rate = s.salary?.hourlyRate ?? 0;
    const cost = worked * (rate || 0);
    totalCost += cost;
    byStaff.push({
      staffId: s.id,
      name: s.name,
      department: s.department,
      hours: worked,
      hourlyRate: rate,
      cost,
    });
  }
  return {
    dateFrom,
    dateTo,
    totalCost,
    byStaff,
  };
}

module.exports = {
  getStaffSummaryByDepartment,
  getMonthlyHoursReport,
  getOvertimeTotals,
  getRemainingVacationReport,
  getContractHoursCompletion,
  getPersonnelCostSummary,
};
