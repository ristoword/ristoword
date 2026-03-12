const router = require("express").Router();
const asyncHandler = require("../utils/asyncHandler");
const reportsController = require("../controllers/reports.controller");

// GET /api/reports
router.get("/", asyncHandler(reportsController.listReports));
router.get("/daily/summary", asyncHandler(reportsController.getDailySummary));
router.get("/daily-summary", asyncHandler(reportsController.getDailySummary));
router.get("/dashboard-summary", asyncHandler(reportsController.getDashboardSummary));
router.get("/accountant", asyncHandler(reportsController.getAccountantReport));
// GET /api/reports/:id
router.get("/:id", asyncHandler(reportsController.getReportById));

// POST /api/reports
router.post("/", asyncHandler(reportsController.createReport));

// DELETE /api/reports/:id
router.delete("/:id", asyncHandler(reportsController.deleteReport));

module.exports = router;