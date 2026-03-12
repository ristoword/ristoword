// backend/src/routes/orders.routes.js
const express = require("express");
const OrdersController = require("../controllers/orders.controller");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

// elenco ordini (Sala, Cucina, Supervisor)
router.get("/", asyncHandler(OrdersController.listOrders));

// creazione ordine (Sala)
router.post("/", asyncHandler(OrdersController.createOrder));

// cambio stato ordine (Sala, Cucina)
router.patch("/:id/status", asyncHandler(OrdersController.setStatus));

module.exports = router;