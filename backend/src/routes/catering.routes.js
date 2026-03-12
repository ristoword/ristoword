const router = require("express").Router();
const asyncHandler = require("../utils/asyncHandler");
const cateringController = require("../controllers/catering.controller");

// GET /api/catering
router.get("/", asyncHandler(cateringController.listCatering));

// GET /api/catering/:id
router.get("/:id", asyncHandler(cateringController.getCateringById));

// POST /api/catering
router.post("/", asyncHandler(cateringController.createCatering));

// PATCH /api/catering/:id
router.patch("/:id", asyncHandler(cateringController.updateCatering));

// DELETE /api/catering/:id
router.delete("/:id", asyncHandler(cateringController.deleteCatering));

module.exports = router;