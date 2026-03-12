const cateringRepository = require("../repositories/catering.repository");

// GET /api/catering
exports.listCatering = async (req, res) => {
  const data = await cateringRepository.getAll();
  res.json(data);
};

// GET /api/catering/:id
exports.getCateringById = async (req, res) => {
  const catering = await cateringRepository.getById(req.params.id);

  if (!catering) {
    return res.status(404).json({ error: "Evento catering non trovato" });
  }

  res.json(catering);
};

// POST /api/catering
exports.createCatering = async (req, res) => {
  const catering = await cateringRepository.create(req.body);
  res.status(201).json(catering);
};

// PATCH /api/catering/:id
exports.updateCatering = async (req, res) => {
  const catering = await cateringRepository.update(req.params.id, req.body);

  if (!catering) {
    return res.status(404).json({ error: "Evento catering non trovato" });
  }

  res.json(catering);
};

// DELETE /api/catering/:id
exports.deleteCatering = async (req, res) => {
  const ok = await cateringRepository.remove(req.params.id);

  if (!ok) {
    return res.status(404).json({ error: "Evento catering non trovato" });
  }

  res.json({ success: true });
};