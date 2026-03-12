// backend/public/shared/websocket.js
// Connessione WebSocket per aggiornamenti ordini in tempo reale

(function () {
  const RECONNECT_DELAY = 3000;
  const MAX_RECONNECT_DELAY = 30000;
  let ws = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;

  function getWsUrl() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    return `${protocol}//${host}/ws`;
  }

  function connect() {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    ws = new WebSocket(getWsUrl());

    ws.onopen = () => {
      reconnectAttempts = 0;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "orders_update" && Array.isArray(data.orders)) {
          window.dispatchEvent(
            new CustomEvent("rw:orders-update", { detail: { orders: data.orders } })
          );
        }
        if (data.type === "supervisor_sync") {
          window.dispatchEvent(
            new CustomEvent("rw:supervisor-sync", {
              detail: {
                revenue: data.revenue,
                covers: data.covers,
                paymentCount: data.paymentCount,
                averageReceipt: data.averageReceipt,
                closedOrdersCount: data.closedOrdersCount,
                openOrdersCount: data.openOrdersCount,
                openTablesCount: data.openTablesCount,
                readyOrdersCount: data.readyOrdersCount,
                ordersInPreparationCount: data.ordersInPreparationCount,
                lateOrdersCount: data.lateOrdersCount,
                cashStatus: data.cashStatus || null,
                byMethod: data.byMethod || {},
              },
            })
          );
        }
      } catch (_) {}
    };

    ws.onclose = () => {
      ws = null;
      const delay = Math.min(
        RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
        MAX_RECONNECT_DELAY
      );
      reconnectAttempts++;
      reconnectTimer = setTimeout(connect, delay);
    };

    ws.onerror = () => {};
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
  }

  window.RW_WS = {
    connect,
    disconnect,
    isConnected: () => ws && ws.readyState === WebSocket.OPEN,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", connect);
  } else {
    connect();
  }
})();
