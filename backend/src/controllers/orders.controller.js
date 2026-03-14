// backend/src/controllers/orders.controller.js
const ordersService = require("../service/orders.service");
const inventoryService = require("../service/inventory.service");
const { broadcastOrders, broadcastSupervisorSyncFromData } = require("../service/websocket.service");
const logger = require("../utils/logger");

async function broadcastOrderUpdates() {
  try {
    const orders = await ordersService.listActiveOrders();
    broadcastOrders(orders);
  } catch (err) {
    logger.error("WebSocket broadcast error", { message: err.message });
  }
}

async function listOrders(req, res, next) {
  try {
    const active = String(req.query.active || "").toLowerCase() === "true";
    const orders = active ? await ordersService.listActiveOrders() : await ordersService.listOrders();
    res.json(orders);
  } catch (err) {
    next(err);
  }
}

async function listOrdersHistory(req, res, next) {
  try {
    const dateStr = req.query.date || "";
    const orders = await ordersService.listOrdersByDate(dateStr);
    res.json(orders);
  } catch (err) {
    next(err);
  }
}

async function createOrder(req, res, next) {
  try {
    const order = await ordersService.createOrder(req.body || {});
    await broadcastOrderUpdates();
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
}

async function setStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!status) {
      return res.status(400).json({ error: "Campo 'status' obbligatorio" });
    }
    const updated = await ordersService.setStatus(id, status);

    await broadcastOrderUpdates();

    const isFinalState = ["servito", "chiuso"].includes(String(updated?.status || "").toLowerCase());
    if (updated && isFinalState) {
      const shouldDeduct = ordersService.tryMarkOrderInventoryProcessed(updated.id);
      if (shouldDeduct) {
        logger.info("Order final state (inventory sync)", { orderId: updated.id, status: updated.status, table: updated.table });
        inventoryService.onOrderFinalized(updated).catch((err) => {
          logger.error("Inventory deduction on order finalized", { orderId: updated.id, message: err.message });
        });
      }
      broadcastSupervisorSyncFromData();
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listOrders,
  listOrdersHistory,
  createOrder,
  setStatus,
};