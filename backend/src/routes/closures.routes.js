// backend/src/routes/closures.routes.js

const router = require("express").Router();
const asyncHandler = require("../utils/asyncHandler");
const closuresController = require("../controllers/closures.controller");

// POST /api/closures – create daily Z closure
router.post("/", asyncHandler(closuresController.createClosure));

// GET /api/closures – list closures (query: dateFrom, dateTo)
router.get("/", asyncHandler(closuresController.listClosures));

// GET /api/closures/check/:date – check if day is closed
router.get("/check/:date", asyncHandler(closuresController.checkDateClosed));

// GET /api/closures/preview/:date – preview totals before closing
router.get("/preview/:date", asyncHandler(closuresController.getClosurePreview));

// GET /api/closures/:date/export?format=csv|excel – export closure
router.get("/:date/export", asyncHandler(closuresController.exportClosure));

// GET /api/closures/:date – get closure by date
router.get("/:date", asyncHandler(closuresController.getClosureByDate));

module.exports = router;
