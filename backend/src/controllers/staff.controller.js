const staffRepository = require("../repositories/staff.repository");

// GET /api/staff
exports.listStaff = async (req, res) => {
  const q = req.query.q;
  const department = req.query.department;
  const active = req.query.active;

  if (q != null || department != null || active != null) {
    const filters = {};
    if (q != null) filters.q = q;
    if (department != null) filters.department = department;
    if (active != null) filters.active = active;
    const data = await staffRepository.getAllFiltered(filters);
    return res.json(data);
  }

  const data = await staffRepository.getAll();
  res.json(data);
};

// GET /api/staff/:id
exports.getStaffById = async (req, res) => {
  const member = await staffRepository.getById(req.params.id);

  if (!member) {
    return res.status(404).json({ error: "Membro staff non trovato" });
  }

  res.json(member);
};

// POST /api/staff
exports.createStaff = async (req, res) => {
  const member = await staffRepository.create(req.body);
  res.status(201).json(member);
};

// PATCH /api/staff/:id
exports.updateStaff = async (req, res) => {
  const member = await staffRepository.update(req.params.id, req.body);

  if (!member) {
    return res.status(404).json({ error: "Membro staff non trovato" });
  }

  res.json(member);
};

// DELETE /api/staff/:id
exports.deleteStaff = async (req, res) => {
  const ok = await staffRepository.remove(req.params.id);

  if (!ok) {
    return res.status(404).json({ error: "Membro staff non trovato" });
  }

  res.json({ success: true });
};
