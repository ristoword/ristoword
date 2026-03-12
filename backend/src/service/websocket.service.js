// backend/src/service/websocket.service.js
// WebSocket server per aggiornamenti ordini e sync supervisor in tempo reale

const { WebSocketServer } = require("ws");
const logger = require("../utils/logger");
const paymentsRepository = require("../repositories/payments.repository");
const ordersRepository = require("../repositories/orders.repository");
const paymentsService = require("./payments.service");

let wss = null;

function isSameDay(dateValue, targetDate) {
  const d = targetDate ? new Date(dateValue) : new Date(dateValue);
  const t = targetDate ? new Date(targetDate) : new Date();
  if (Number.isNaN(d.getTime()) || Number.isNaN(t.getTime())) return false;
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

async function computeSupervisorStats() {
  const today = new Date();
  const dateFrom = new Date(today);
  dateFrom.setHours(0, 0, 0, 0);
  const dateTo = new Date(today);
  dateTo.setHours(23, 59, 59, 999);

  const allOrders = ordersRepository.getAllOrders();
  const payments = await paymentsRepository.listPayments({
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString(),
  });

  const dailyOrders = allOrders.filter((o) =>
    isSameDay(o.updatedAt || o.createdAt, today)
  );
  const dailyPayments = payments.filter((p) =>
    isSameDay(p.closedAt || p.createdAt, today)
  );

  let revenue = 0;
  let covers = 0;
  const byMethod = {};
  for (const p of dailyPayments) {
    const total = Number(p.total) || 0;
    revenue += total;
    covers += Number(p.covers) || 0;
    const method = String(p.paymentMethod || "other").toLowerCase();
    byMethod[method] = (byMethod[method] || 0) + total;
  }

  let closedOrders = 0;
  let openOrders = 0;
  let readyOrders = 0;
  let ordersInPreparation = 0;
  let lateOrders = 0;
  const openTables = new Set();
  const now = Date.now();
  const LATE_MINUTES = 15;

  for (const o of dailyOrders) {
    const status = String(o.status || "").toLowerCase();
    const ts = o.updatedAt || o.createdAt;
    const minsOld = ts ? Math.floor((now - new Date(ts).getTime()) / 60000) : 0;
    const isLate = minsOld >= LATE_MINUTES;

    if (status === "chiuso") closedOrders += 1;
    else if (status === "pronto") {
      openOrders += 1;
      readyOrders += 1;
      openTables.add(String(o.table || "-"));
    } else if (status !== "annullato") {
      openOrders += 1;
      openTables.add(String(o.table || "-"));
      if (["in_attesa", "in_preparazione"].includes(status)) {
        ordersInPreparation += 1;
        if (isLate) lateOrders += 1;
      }
    }
  }

  const averageReceipt = dailyPayments.length > 0 ? revenue / dailyPayments.length : 0;
  const cashStatus = await paymentsService.getCurrentShift();

  return {
    revenue,
    covers,
    paymentCount: dailyPayments.length,
    averageReceipt,
    closedOrdersCount: closedOrders,
    openOrdersCount: openOrders,
    openTablesCount: openTables.size,
    readyOrdersCount: readyOrders,
    ordersInPreparationCount: ordersInPreparation,
    lateOrdersCount: lateOrders,
    cashStatus: { hasOpenShift: cashStatus.hasOpenShift, shift: cashStatus.shift },
    byMethod,
  };
}

function broadcastSupervisorSync(payload) {
  if (!wss) return;
  const data = payload || {};
  const message = JSON.stringify({
    type: "supervisor_sync",
    ...data,
  });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(message);
  });
}

async function broadcastSupervisorSyncFromData() {
  try {
    const stats = await computeSupervisorStats();
    broadcastSupervisorSync(stats);
  } catch (err) {
    logger.error("WebSocket supervisor sync error", { message: err.message });
  }
}

let pingInterval = null;

function initWebSocket(httpServer, sessionMiddleware) {
  if (wss) return;
  wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    verifyClient: (info, callback) => {
      if (!sessionMiddleware) {
        return callback(true);
      }
      const req = info.req;
      const res = { end: () => {}, getHeader: () => undefined };
      sessionMiddleware(req, res, (err) => {
        if (err) return callback(false, 500, "Session error");
        if (req.session && req.session.user) {
          return callback(true);
        }
        callback(false, 401, "Unauthorized");
      });
    },
  });

  wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });
  });

  pingInterval = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((client) => {
      if (client.isAlive === false) {
        client.terminate();
        return;
      }
      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  wss.on("close", () => {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    wss = null;
  });
}

function broadcastOrders(orders) {
  if (!wss) return;
  const payload = JSON.stringify({ type: "orders_update", orders });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(payload);
    }
  });
}

module.exports = {
  initWebSocket,
  broadcastOrders,
  broadcastSupervisorSync,
  broadcastSupervisorSyncFromData,
  computeSupervisorStats,
};
