const stockMovementsRepository = require("../repositories/stock-movements.repository");

// GET /api/stock-movements
exports.listStockMovements = async (req, res) => {
  const movements = await stockMovementsRepository.getAll();
  res.json(movements);
};