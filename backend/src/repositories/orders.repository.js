// backend/src/repositories/orders.repository.js
// Persistenza ordini: MySQL (implementazione in orders.repository.sql.js).
// Implementazione file JSON archiviata in orders.repository.file.js (solo riferimento).

const sql = require("./orders.repository.sql");

module.exports = {
  getAllOrders: () => sql.getAllOrders(),
  saveAllOrders: (orders) => sql.saveAllOrders(orders),
  getNextId: (orders) => sql.getNextId(orders),
  getOrderById: (id) => sql.getOrderById(id),
  createOrder: (order) => sql.createOrder(order),
  updateOrderStatus: (id, status) => sql.updateOrderStatus(id, status),
  addItems: (orderId, items) => sql.addItems(orderId, items),
};
