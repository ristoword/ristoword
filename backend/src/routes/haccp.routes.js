const router = require("express").Router();
const asyncHandler = require("../utils/asyncHandler");
const haccpController = require("../controllers/haccp.controller");

// GET /api/haccp
router.get("/", asyncHandler(haccpController.listChecks));

// GET /api/haccp/:id
router.get("/:id", asyncHandler(haccpController.getCheckById));

// POST /api/haccp
router.post("/", asyncHandler(haccpController.createCheck));

// PATCH /api/haccp/:id
router.patch("/:id", asyncHandler(haccpController.updateCheck));

// DELETE /api/haccp/:id
router.delete("/:id", asyncHandler(haccpController.deleteCheck));

module.exports = router;