// backend/src/controllers/orders.controller.js
const ordersService = require("../service/orders.service");
const logger = require("../utils/logger");
const { orderHasFoodInventoryItems } = require("../utils/orderInventoryHelpers");
const { deductIngredients } = require("../services/inventory.service");
const { calculateOrderCost } = require("../services/foodcost.service");

// IMPORTANT CORE PROTECTION
// This controller serves /api/orders for Sala, Cucina, Pizzeria, Cassa, Supervisor.
// It MUST stay resilient even if optional modules (inventory, recipes, food cost,
// reports, AI) are broken or temporarily unavailable.
//
// Therefore:
// - We lazy-require optional services only inside the endpoints that need them.
// - /api/orders list endpoints must never import or depend on optional modules.

function getInventoryServiceSafe() {
  try {
    // Optional: used only for stock validation and deduction on status changes.
    // If this fails, we log and behave as if inventory integration is disabled.
    // This MUST NOT break order listing.
    // eslint-disable-next-line global-require
    return require("../service/inventory.service");
  } catch (err) {
    logger.error("Inventory service load failed (orders flow continues without it)", {
      message: err.message,
    });
    return null;
  }
}

function getWebsocketServiceSafe() {
  try {
    // Optional: real-time sync only; UI can fall back to polling.
    // eslint-disable-next-line global-require
    return require("../service/websocket.service");
  } catch (err) {
    logger.error("WebSocket service load failed (orders flow continues without it)", {
      message: err.message,
    });
    return {
      broadcastOrders: () => {},
      broadcastSupervisorSyncFromData: () => {},
    };
  }
}

async function broadcastOrderUpdates() {
  try {
    const orders = await ordersService.listActiveOrders();
    const { broadcastOrders } = getWebsocketServiceSafe();
    broadcastOrders(orders);
  } catch (err) {
    logger.error("WebSocket broadcast error", { message: err.message });
  }
}

async function listOrders(req, res, next) {
  try {
    const active = String(req.query.active || "").toLowerCase() === "true";
    let orders = [];

    // CORE: listing must never throw – we guard around service calls and normalise to an array.
    try {
      orders = active ? await ordersService.listActiveOrders() : await ordersService.listOrders();
    } catch (err) {
      logger.error("Order listing failed – returning empty array for resilience", {
        message: err.message,
      });
      orders = [];
    }

    if (!Array.isArray(orders)) {
      orders = [];
    }

    res.json(orders);
  } catch (err) {
    next(err);
  }
}

async function listOrdersHistory(req, res, next) {
  try {
    const dateStr = req.query.date || "";
    let orders = [];
    try {
      orders = await ordersService.listOrdersByDate(dateStr);
    } catch (err) {
      logger.error("Order history listing failed – returning empty array for resilience", {
        message: err.message,
      });
      orders = [];
    }

    if (!Array.isArray(orders)) {
      orders = [];
    }

    res.json(orders);
  } catch (err) {
    next(err);
  }
}

async function createOrder(req, res, next) {
  try {
    const order = await ordersService.createOrder(req.body || {});
    try {
      await deductIngredients(order.items || []);
      // eslint-disable-next-line no-console
      console.log("Magazzino aggiornato per ordine:", order.id);
    } catch (invErr) {
      logger.warn("Inventory deduct (DB) non applicato", {
        orderId: order.id,
        message: invErr && invErr.message ? invErr.message : String(invErr),
      });
    }

    let orderToRespond = order;
    try {
      const totalCost = await calculateOrderCost(order.items || []);
      const totalPrice = (order.items || []).reduce(
        (sum, i) => sum + (Number(i.price) || 0) * (Number(i.qty) || 1),
        0
      );
      const margin = totalPrice - totalCost;
      // eslint-disable-next-line no-console
      console.log("FOOD COST:", totalCost);
      // eslint-disable-next-line no-console
      console.log("RICAVO:", totalPrice);
      // eslint-disable-next-line no-console
      console.log("MARGINE:", margin);
      const patched = await ordersService.patchOrderFoodCost(order.id, {
        totalCost,
        totalPrice,
        margin,
      });
      if (patched) orderToRespond = patched;
    } catch (fcErr) {
      logger.warn("Food cost / margin non persistito (ordine salvato)", {
        orderId: order.id,
        message: fcErr && fcErr.message ? fcErr.message : String(fcErr),
      });
    }

    await broadcastOrderUpdates();

    // Auto-route print jobs by department
    try {
      // Optional, do not break core order creation if print routing fails to load or execute.
      // eslint-disable-next-line global-require
      const printService = require("../service/print.service");
      const printResults = await printService.submitOrderTickets(orderToRespond);
      if (printResults.length > 0) {
        orderToRespond._printJobs = printResults.map((r) => ({
          department: r.department,
          jobId: r.job.id,
          routed: r.routed,
          device: r.device,
          warning: r.warning,
        }));
      }
    } catch (printErr) {
      logger.warn("Print job creation failed (order still saved)", { orderId: order.id, message: printErr.message });
    }

    res.status(201).json(orderToRespond);
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

    const isFinalState = ["servito", "chiuso"].includes(String(status || "").toLowerCase());

    // Inventory check before final status: warn only — never block servito/chiuso
    if (isFinalState) {
      const inventoryService = getInventoryServiceSafe();
      if (inventoryService) {
        try {
          const order = await ordersService.getOrderById(id);
          if (order && Array.isArray(order.items) && order.items.length > 0 && orderHasFoodInventoryItems(order)) {
            const check = await inventoryService.validateOrderConsumption(order);
            if (!check.valid) {
              console.warn("Inventory warning:", check);
            }
          }
        } catch (invErr) {
          console.warn("Inventory warning (validateOrderConsumption):", invErr?.message || invErr);
        }
      }
    }

    const updated = await ordersService.setStatus(id, status);

    await broadcastOrderUpdates();

    if (updated && isFinalState) {
      const inventoryService = getInventoryServiceSafe();
      if (inventoryService) {
        const shouldDeduct = await ordersService.tryMarkOrderInventoryProcessed(updated.id);
        if (shouldDeduct) {
          logger.info("Order final state (inventory sync)", {
            orderId: updated.id,
            status: updated.status,
            table: updated.table,
          });
          const result = await inventoryService.onOrderFinalized(updated);
          if (result && result.blocked) {
            logger.error("Inventory deduction blocked after status save (race?)", {
              orderId: updated.id,
              error: result.error,
            });
          }
        }
      }

      const { broadcastSupervisorSyncFromData } = getWebsocketServiceSafe();
      broadcastSupervisorSyncFromData();
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

async function patchActiveCourse(req, res, next) {
  try {
    const { id } = req.params;
    const { activeCourse } = req.body || {};
    const updated = await ordersService.setActiveCourse(id, activeCourse);
    await broadcastOrderUpdates();
    res.json({ success: true, order: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listOrders,
  listOrdersHistory,
  createOrder,
  setStatus,
  patchActiveCourse,
};