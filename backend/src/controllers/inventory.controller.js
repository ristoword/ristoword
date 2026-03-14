const inventoryRepository = require("../repositories/inventory.repository");
const inventoryTransfersRepository = require("../repositories/inventory-transfers.repository");

// GET /api/inventory (query: ?location=central|cucina|sala)
exports.listInventory = async (req, res) => {
  const location = (req.query.location || "").toLowerCase();
  if (location && ["central", "cucina", "sala"].includes(location)) {
    const data = inventoryRepository.getByLocation(location);
    return res.json(data);
  }
  const data = inventoryRepository.getAll();
  res.json(data);
};

// GET /api/inventory/transfers
exports.listTransfers = async (req, res) => {
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
  const data = inventoryTransfersRepository.getRecentTransfers(limit);
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
  const { name, unit, quantity, cost, threshold, category, lot, notes } = req.body || {};
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Nome obbligatorio" });
  }
  if (!unit || typeof unit !== "string") {
    return res.status(400).json({ error: "Unità obbligatoria" });
  }
  const item = inventoryRepository.create({
    name,
    unit,
    quantity,
    cost,
    threshold,
    category,
    lot,
    notes,
  });
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

// POST /api/inventory/transfer
exports.transferInventory = async (req, res) => {
  const { productId, toDepartment, quantity, note, operator } = req.body || {};
  if (!productId) {
    return res.status(400).json({ error: "productId obbligatorio" });
  }
  if (!toDepartment || typeof toDepartment !== "string") {
    return res.status(400).json({ error: "toDepartment obbligatorio (cucina o sala)" });
  }
  const result = inventoryRepository.transfer(
    productId,
    toDepartment.trim().toLowerCase(),
    quantity,
    note || "",
    operator || ""
  );
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  inventoryTransfersRepository.addTransfer({
    type: "transfer_to_department",
    productId: result.transfer.productId,
    productName: result.transfer.productName,
    unit: result.transfer.unit,
    quantity: result.transfer.quantity,
    from: result.transfer.from,
    to: result.transfer.to,
    note: result.transfer.note,
    operator: result.transfer.operator,
  });
  res.json({ success: true, item: result.item, transfer: result.transfer });
};

// POST /api/inventory/return
exports.returnToCentral = async (req, res) => {
  const { productId, fromDepartment, quantity, note, operator } = req.body || {};
  if (!productId) {
    return res.status(400).json({ error: "productId obbligatorio" });
  }
  if (!fromDepartment || typeof fromDepartment !== "string") {
    return res.status(400).json({ error: "fromDepartment obbligatorio (cucina o sala)" });
  }
  const result = inventoryRepository.returnToCentral(
    productId,
    fromDepartment.trim().toLowerCase(),
    quantity,
    note || "",
    operator || ""
  );
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  inventoryTransfersRepository.addTransfer({
    type: "return_to_central",
    productId: result.return.productId,
    productName: result.return.productName,
    unit: result.return.unit,
    quantity: result.return.quantity,
    from: result.return.from,
    to: result.return.to,
    note: result.return.note,
    operator: result.return.operator,
  });
  res.json({ success: true, item: result.item, return: result.return });
};

// DELETE /api/inventory/:id
exports.deleteInventory = async (req, res) => {
  const ok = inventoryRepository.remove(req.params.id);
  if (!ok) {
    return res.status(404).json({ error: "Prodotto magazzino non trovato" });
  }
  res.json({ success: true });
};
