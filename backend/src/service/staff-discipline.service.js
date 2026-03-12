// backend/src/service/staff-discipline.service.js
// Warnings, manager notes, important staff events

const staffRepository = require("../repositories/staff.repository");

async function getDiscipline(staffId) {
  const staff = await staffRepository.getById(staffId);
  if (!staff) return null;
  return staff.discipline || {
    warnings: [],
    managerNotes: [],
    staffNotes: [],
    importantEvents: [],
  };
}

async function addWarning(staffId, data) {
  return staffRepository.addDiscipline(staffId, "warning", {
    ...data,
    severity: data.severity || "warning",
  });
}

async function addManagerNote(staffId, data) {
  return staffRepository.addDiscipline(staffId, "managerNote", data);
}

async function addStaffNote(staffId, data) {
  return staffRepository.addDiscipline(staffId, "staffNote", data);
}

async function addImportantEvent(staffId, data) {
  return staffRepository.addDiscipline(staffId, "importantEvent", {
    ...data,
    type: data.type || "event",
  });
}

module.exports = {
  getDiscipline,
  addWarning,
  addManagerNote,
  addStaffNote,
  addImportantEvent,
};
