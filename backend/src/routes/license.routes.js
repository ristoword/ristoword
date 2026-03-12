const router = require("express").Router();
const asyncHandler = require("../utils/asyncHandler");
const licenseController = require("../controllers/license.controller");

// GET /api/license
router.get("/", asyncHandler(licenseController.getLicense));

// POST /api/license/activate
router.post("/activate", asyncHandler(licenseController.activateLicense));

// POST /api/license/deactivate
router.post("/deactivate", asyncHandler(licenseController.deactivateLicense));

// GET /api/license/status
router.get("/status", asyncHandler(licenseController.getStatus));

module.exports = router;