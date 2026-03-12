// backend/src/service/staff-hours.service.js
// Worked hours, contract remaining, overtime, delays, early exits

const shiftsRepository = require("../repositories/shifts.repository");
const staffRepository = require("../repositories/staff.repository");
const sessionsRepository = require("../repositories/sessions.repository");

function parseTimeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = String(t).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToHours(min) {
  return Math.round(min * 100) / 6000;
}

async function getWorkedHoursFromShifts(staffId, dateFrom, dateTo) {
  const shifts = await shiftsRepository.getByStaffId(staffId, {
    dateFrom,
    dateTo,
    status: "completed",
  });
  let total = 0;
  for (const s of shifts) {
    total += Math.max(0, parseTimeToMinutes(s.end) - parseTimeToMinutes(s.start));
  }
  return minutesToHours(total);
}

async function getWorkedHoursByPeriod(staffId, period) {
  const now = new Date();
  let dateFrom, dateTo;
  if (period === "day") {
    dateFrom = dateTo = now.toISOString().slice(0, 10);
  } else if (period === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - d.getDay());
    dateFrom = d.toISOString().slice(0, 10);
    dateTo = now.toISOString().slice(0, 10);
  } else {
    dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    dateTo = now.toISOString().slice(0, 10);
  }
  return getWorkedHoursFromShifts(staffId, dateFrom, dateTo);
}

async function getSummary(staffId) {
  const staff = await staffRepository.getById(staffId);
  const monthlyHours = staff?.work?.monthlyContractHours;
  const today = new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  const dateFrom = `${year}-${String(month).padStart(2, "0")}-01`;
  const dateTo = today;

  const workedMonth = await getWorkedHoursFromShifts(staffId, dateFrom, dateTo);
  const remaining = monthlyHours != null ? Math.max(0, Number(monthlyHours) - workedMonth) : null;
  const overtime = remaining != null && remaining === 0 && workedMonth > (monthlyHours || 0)
    ? workedMonth - (monthlyHours || 0)
    : staff?.attendance?.overtime ?? 0;

  const att = staff?.attendance || {};
  return {
    hoursToday: att.hoursToday ?? null,
    hoursWeek: att.hoursWeek ?? null,
    hoursMonth: workedMonth,
    monthlyContractHours: monthlyHours ?? null,
    monthlyHoursRemaining: remaining,
    overtime: overtime,
    delays: att.delays ?? null,
    earlyExits: att.earlyExits ?? null,
    absences: att.absences ?? null,
    contractExceeded: remaining != null && remaining <= 0 && workedMonth > (monthlyHours || 0),
  };
}

async function getWorkedHoursFromSessions(staffId) {
  const sessions = await sessionsRepository.readAllSessions();
  const staff = await staffRepository.getById(staffId);
  const userId = staff?.id;
  const userSessions = sessions.filter(
    (s) => (s.userId === userId || s.staffId === userId) && s.logoutTime
  );
  let totalMs = 0;
  for (const s of userSessions) {
    const start = new Date(s.loginTime).getTime();
    const end = new Date(s.logoutTime).getTime();
    totalMs += end - start;
  }
  return Math.round(totalMs / 3600000 * 100) / 100;
}

module.exports = {
  getWorkedHoursFromShifts,
  getWorkedHoursByPeriod,
  getSummary,
  getWorkedHoursFromSessions,
};
