const haccpRepository = require("../repositories/haccp.repository");

// GET /api/haccp
exports.listChecks = async (req, res) => {
  const data = await haccpRepository.getAll();
  res.json(data);
};

// GET /api/haccp/:id
exports.getCheckById = async (req, res) => {
  const check = await haccpRepository.getById(req.params.id);

  if (!check) {
    return res.status(404).json({ error: "Controllo HACCP non trovato" });
  }

  res.json(check);
};

// POST /api/haccp
exports.createCheck = async (req, res) => {
  const check = await haccpRepository.create(req.body);
  res.status(201).json(check);
};

// PATCH /api/haccp/:id
exports.updateCheck = async (req, res) => {
  const check = await haccpRepository.update(req.params.id, req.body);

  if (!check) {
    return res.status(404).json({ error: "Controllo HACCP non trovato" });
  }

  res.json(check);
};

// DELETE /api/haccp/:id
exports.deleteCheck = async (req, res) => {
  const ok = await haccpRepository.remove(req.params.id);

  if (!ok) {
    return res.status(404).json({ error: "Controllo HACCP non trovato" });
  }

  res.json({ success: true });
};
