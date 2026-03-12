function sum(values = []) {
  return values.reduce((acc, n) => acc + (Number(n) || 0), 0);
}

function calculateRevenueFromOrders(orders = []) {
  return sum(
    orders.flatMap((order) =>
      (Array.isArray(order.items) ? order.items : []).map(
        (item) => (Number(item.price) || 0) * (Number(item.qty) || 1)
      )
    )
  );
}

function calculateCoversFromOrders(orders = []) {
  return sum(orders.map((order) => Number(order.covers) || 0));
}

function groupRevenueByArea(orders = []) {
  const result = {
    cucina: 0,
    pizzeria: 0,
    bar: 0,
    altro: 0
  };

  orders.forEach((order) => {
    const items = Array.isArray(order.items) ? order.items : [];
    items.forEach((item) => {
      const area = item.area || order.area || "altro";
      const total = (Number(item.price) || 0) * (Number(item.qty) || 1);

      if (!result[area]) result[area] = 0;
      result[area] += total;
    });
  });

  return result;
}

function getTopSellingItems(orders = [], limit = 5) {
  const map = new Map();

  orders.forEach((order) => {
    const items = Array.isArray(order.items) ? order.items : [];
    items.forEach((item) => {
      const name = item.name || "Senza nome";
      const qty = Number(item.qty) || 1;
      const revenue = (Number(item.price) || 0) * qty;

      if (!map.has(name)) {
        map.set(name, { name, qty: 0, revenue: 0 });
      }

      const current = map.get(name);
      current.qty += qty;
      current.revenue += revenue;
    });
  });

  return [...map.values()]
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);
}

function buildDailyAnalytics({ orders = [], reports = [] } = {}) {
  return {
    totalOrders: orders.length,
    totalRevenue: calculateRevenueFromOrders(orders),
    totalCovers: calculateCoversFromOrders(orders),
    revenueByArea: groupRevenueByArea(orders),
    topItems: getTopSellingItems(orders, 5),
    totalReports: reports.length
  };
}

module.exports = {
  calculateRevenueFromOrders,
  calculateCoversFromOrders,
  groupRevenueByArea,
  getTopSellingItems,
  buildDailyAnalytics
};