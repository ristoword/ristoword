// backend/src/service/staff-shifts.service.js
// Shift planning, scheduling, rest days, vacations, sick leave, absences

const shiftsRepository = require("../repositories/shifts.repository");
const staffRepository = require("../repositories/staff.repository");
const staffRequestsRepository = require("../repositories/staff-requests.repository");

function parseTimeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = String(t).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToHours(min) {
  return Math.round(min * 100) / 6000;
}

async function getShiftHistory(staffId, dateFrom, dateTo) {
  const shifts = await shiftsRepository.getByStaffId(staffId, { dateFrom, dateTo });
  return shifts.map((s) => ({
    ...s,
    hours: minutesToHours(
      Math.max(0, parseTimeToMinutes(s.end) - parseTimeToMinutes(s.start))
    ),
  }));
}

async function getCurrentShift(staffId) {
  const today = new Date().toISOString().slice(0, 10);
  const shifts = await shiftsRepository.getByStaffId(staffId, {
    dateFrom: today,
    dateTo: today,
    status: "active",
  });
  if (shifts.length) return shifts[0];
  const scheduled = await shiftsRepository.getByStaffId(staffId, {
    dateFrom: today,
    dateTo: today,
    status: "scheduled",
  });
  return scheduled[0] || null;
}

async function getRestDays(staffId, dateFrom, dateTo) {
  const staff = await staffRepository.getById(staffId);
  const rest = (staff?.shifts?.restDays || []).filter((r) => {
    const d = r.date || r;
    return d >= dateFrom && d <= dateTo;
  });
  return rest;
}

async function getVacations(staffId, dateFrom, dateTo) {
  const requests = await staffRequestsRepository.getByStaffId(staffId);
  return requests.filter(
    (r) =>
      r.type === "vacation" &&
      r.status === "approved" &&
      r.dateFrom &&
      r.dateTo &&
      ((r.dateFrom >= dateFrom && r.dateFrom <= dateTo) ||
        (r.dateTo >= dateFrom && r.dateTo <= dateTo))
  );
}

async function getSickLeave(staffId, dateFrom, dateTo) {
  const staff = await staffRepository.getById(staffId);
  const sick = (staff?.shifts?.sickLeave || []).filter((s) => {
    const d = s.date || s;
    return d >= dateFrom && d <= dateTo;
  });
  return sick;
}

async function getAbsences(staffId, dateFrom, dateTo) {
  const staff = await staffRepository.getById(staffId);
  const abs = (staff?.shifts?.absences || []).filter((a) => {
    const d = a.date || a;
    return d >= dateFrom && d <= dateTo;
  });
  return abs;
}

module.exports = {
  getShiftHistory,
  getCurrentShift,
  getRestDays,
  getVacations,
  getSickLeave,
  getAbsences,
};
