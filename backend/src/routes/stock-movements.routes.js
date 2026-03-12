const router = require("express").Router();
const asyncHandler = require("../utils/asyncHandler");
const stockMovementsController = require("../controllers/stock-movements.controller");

// GET /api/stock-movements
router.get("/", asyncHandler(stockMovementsController.listStockMovements));

module.exports = router;