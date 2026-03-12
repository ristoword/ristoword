const staffRequestsRepository = require("../repositories/staff-requests.repository");
const staffRequestsService = require("../service/staff-requests.service");

exports.listAll = async (req, res) => {
  const filters = {};
  if (req.query.staffId) filters.staffId = req.query.staffId;
  if (req.query.type) filters.type = req.query.type;
  if (req.query.status) filters.status = req.query.status;
  const requests = await staffRequestsRepository.getAll(filters);
  res.json(requests);
};

exports.listByStaff = async (req, res) => {
  const requests = await staffRequestsService.getRequestsByStaff(req.params.id);
  res.json(requests);
};

exports.listPending = async (req, res) => {
  const requests = await staffRequestsService.getPendingRequests();
  res.json(requests);
};

exports.create = async (req, res) => {
  const { id } = req.params;
  const request = await staffRequestsService.createRequest(id, req.body);
  if (!request) return res.status(404).json({ error: "Staff non trovato" });
  res.status(201).json(request);
};

exports.getById = async (req, res) => {
  const request = await staffRequestsRepository.getById(req.params.requestId);
  if (!request) return res.status(404).json({ error: "Richiesta non trovata" });
  res.json(request);
};

exports.approve = async (req, res) => {
  const { requestId } = req.params;
  const { approvedBy } = req.body;
  const request = await staffRequestsService.approveRequest(requestId, approvedBy || "supervisor");
  if (!request) return res.status(404).json({ error: "Richiesta non trovata" });
  res.json(request);
};

exports.reject = async (req, res) => {
  const { requestId } = req.params;
  const { rejectedBy, reason } = req.body;
  const request = await staffRequestsService.rejectRequest(
    requestId,
    rejectedBy || "supervisor",
    reason
  );
  if (!request) return res.status(404).json({ error: "Richiesta non trovata" });
  res.json(request);
};

exports.addNotes = async (req, res) => {
  const { requestId } = req.params;
  const { notes } = req.body;
  const request = await staffRequestsRepository.update(requestId, {
    requestNotes: notes,
    notes,
  });
  if (!request) return res.status(404).json({ error: "Richiesta non trovata" });
  res.json(request);
};
