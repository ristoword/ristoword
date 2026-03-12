// backend/src/routes/inventory.routes.js
// Route -> controller -> repository. No direct file access.

const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const inventoryController = require("../controllers/inventory.controller");

const router = express.Router();

router.get("/", asyncHandler(inventoryController.listInventory));
router.post("/", asyncHandler(inventoryController.createInventory));
router.patch("/:id/adjust", asyncHandler(inventoryController.adjustInventory));
router.get("/:id", asyncHandler(inventoryController.getInventoryById));
router.patch("/:id", asyncHandler(inventoryController.updateInventory));
router.delete("/:id", asyncHandler(inventoryController.deleteInventory));

module.exports = router;
