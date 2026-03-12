const staffDisciplineService = require("../service/staff-discipline.service");

exports.getDiscipline = async (req, res) => {
  const discipline = await staffDisciplineService.getDiscipline(req.params.id);
  if (!discipline) return res.status(404).json({ error: "Staff non trovato" });
  res.json(discipline);
};

exports.addWarning = async (req, res) => {
  const staff = await staffDisciplineService.addWarning(req.params.id, req.body);
  if (!staff) return res.status(404).json({ error: "Staff non trovato" });
  res.status(201).json(staff);
};

exports.addManagerNote = async (req, res) => {
  const staff = await staffDisciplineService.addManagerNote(req.params.id, req.body);
  if (!staff) return res.status(404).json({ error: "Staff non trovato" });
  res.status(201).json(staff);
};

exports.addStaffNote = async (req, res) => {
  const staff = await staffDisciplineService.addStaffNote(req.params.id, req.body);
  if (!staff) return res.status(404).json({ error: "Staff non trovato" });
  res.status(201).json(staff);
};

exports.addImportantEvent = async (req, res) => {
  const staff = await staffDisciplineService.addImportantEvent(req.params.id, req.body);
  if (!staff) return res.status(404).json({ error: "Staff non trovato" });
  res.status(201).json(staff);
};
