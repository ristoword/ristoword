const router = require("express").Router();
const asyncHandler = require("../utils/asyncHandler");
const staffController = require("../controllers/staff.controller");
const staffShiftsController = require("../controllers/staff-shifts.controller");
const staffHoursController = require("../controllers/staff-hours.controller");
const staffRequestsController = require("../controllers/staff-requests.controller");
const staffDisciplineController = require("../controllers/staff-discipline.controller");
const staffReportsController = require("../controllers/staff-reports.controller");

// ========== STAFF CRUD ==========
router.get("/", asyncHandler(staffController.listStaff));
router.post("/", asyncHandler(staffController.createStaff));

// ========== REQUESTS (static path before :id) ==========
router.get("/requests", asyncHandler(staffRequestsController.listAll));
router.get("/requests/pending", asyncHandler(staffRequestsController.listPending));
router.get("/requests/:requestId", asyncHandler(staffRequestsController.getById));
router.patch("/requests/:requestId/approve", asyncHandler(staffRequestsController.approve));
router.patch("/requests/:requestId/reject", asyncHandler(staffRequestsController.reject));
router.patch("/requests/:requestId/notes", asyncHandler(staffRequestsController.addNotes));

// ========== SHIFTS (static path before :id) ==========
router.get("/shifts/by-range", asyncHandler(staffShiftsController.listByDateRange));
router.post("/shifts/bulk", asyncHandler(staffShiftsController.createShiftsBulk));
router.post("/shifts", asyncHandler(staffShiftsController.createShift));
router.patch("/shifts/:shiftId", asyncHandler(staffShiftsController.updateShift));
router.delete("/shifts/:shiftId", asyncHandler(staffShiftsController.deleteShift));

// ========== REPORTS (static path before :id) ==========
router.get("/reports/summary", asyncHandler(staffReportsController.summaryByDepartment));
router.get("/reports/hours", asyncHandler(staffReportsController.monthlyHours));
router.get("/reports/overtime", asyncHandler(staffReportsController.overtimeTotals));
router.get("/reports/vacation", asyncHandler(staffReportsController.remainingVacation));
router.get("/reports/contracts", asyncHandler(staffReportsController.contractCompletion));
router.get("/reports/personnel-cost", asyncHandler(staffReportsController.personnelCost));

// ========== STAFF BY ID (must be after static paths) ==========
router.get("/:id", asyncHandler(staffController.getStaffById));
router.patch("/:id", asyncHandler(staffController.updateStaff));
router.delete("/:id", asyncHandler(staffController.deleteStaff));

// Shifts by staff
router.get("/:id/shifts", asyncHandler(staffShiftsController.listByStaff));
router.get("/:id/shifts/current", asyncHandler(staffShiftsController.getCurrentShift));
router.get("/:id/shifts/history", asyncHandler(staffShiftsController.getHistory));
router.get("/:id/shifts/rest-days", asyncHandler(staffShiftsController.getRestDays));
router.get("/:id/shifts/vacations", asyncHandler(staffShiftsController.getVacations));
router.get("/:id/shifts/sick-leave", asyncHandler(staffShiftsController.getSickLeave));
router.get("/:id/shifts/absences", asyncHandler(staffShiftsController.getAbsences));

// Hours by staff
router.get("/:id/hours", asyncHandler(staffHoursController.getWorkedHours));
router.get("/:id/hours/summary", asyncHandler(staffHoursController.getSummary));

// Requests by staff
router.get("/:id/requests", asyncHandler(staffRequestsController.listByStaff));
router.post("/:id/requests", asyncHandler(staffRequestsController.create));

// Discipline
router.get("/:id/discipline", asyncHandler(staffDisciplineController.getDiscipline));
router.post("/:id/discipline/warnings", asyncHandler(staffDisciplineController.addWarning));
router.post("/:id/discipline/manager-notes", asyncHandler(staffDisciplineController.addManagerNote));
router.post("/:id/discipline/staff-notes", asyncHandler(staffDisciplineController.addStaffNote));
router.post("/:id/discipline/events", asyncHandler(staffDisciplineController.addImportantEvent));

module.exports = router;
