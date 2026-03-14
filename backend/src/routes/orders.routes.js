// backend/src/routes/orders.routes.js
const express = require("express");
const OrdersController = require("../controllers/orders.controller");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

// elenco ordini (Sala, Cucina, Supervisor) — ?active=true esclude chiusi di giornate già chiuse con Z
router.get("/", asyncHandler(OrdersController.listOrders));

// storico comande per giorno (Supervisor)
router.get("/history", asyncHandler(OrdersController.listOrdersHistory));

// creazione ordine (Sala)
router.post("/", asyncHandler(OrdersController.createOrder));

// cambio stato ordine (Sala, Cucina)
router.patch("/:id/status", asyncHandler(OrdersController.setStatus));

module.exports = router;