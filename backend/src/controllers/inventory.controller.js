const inventoryRepository = require("../repositories/inventory.repository");

// GET /api/inventory
exports.listInventory = async (req, res) => {
  const data = inventoryRepository.getAll();
  res.json(data);
};

// GET /api/inventory/:id
exports.getInventoryById = async (req, res) => {
  const item = inventoryRepository.getById(req.params.id);
  if (!item) {
    return res.status(404).json({ error: "Prodotto magazzino non trovato" });
  }
  res.json(item);
};

// POST /api/inventory
exports.createInventory = async (req, res) => {
  const { name, unit, quantity, cost, threshold } = req.body || {};
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Nome obbligatorio" });
  }
  if (!unit || typeof unit !== "string") {
    return res.status(400).json({ error: "Unità obbligatoria" });
  }
  const item = inventoryRepository.create({ name, unit, quantity, cost, threshold });
  res.status(201).json(item);
};

// PATCH /api/inventory/:id
exports.updateInventory = async (req, res) => {
  const item = inventoryRepository.update(req.params.id, req.body);
  if (!item) {
    return res.status(404).json({ error: "Prodotto magazzino non trovato" });
  }
  res.json(item);
};

// PATCH /api/inventory/:id/adjust
exports.adjustInventory = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { delta } = req.body || {};
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "ID non valido" });
  }
  const safeDelta = Number.isFinite(Number(delta)) ? Number(delta) : 0;
  const existing = inventoryRepository.getById(id);
  if (!existing) {
    return res.status(404).json({ error: "Prodotto non trovato" });
  }
  const currentQty = Number(existing.quantity) || 0;
  const newQty = currentQty + safeDelta;
  if (newQty < 0) {
    return res.status(400).json({
      error: "quantita_negativa",
      message: "La quantità non può essere inferiore a zero.",
    });
  }
  const item = inventoryRepository.adjustQuantity(id, safeDelta);
  res.json(item);
};

// DELETE /api/inventory/:id
exports.deleteInventory = async (req, res) => {
  const ok = inventoryRepository.remove(req.params.id);
  if (!ok) {
    return res.status(404).json({ error: "Prodotto magazzino non trovato" });
  }
  res.json({ success: true });
};

