// backend/src/service/staff-requests.service.js
// Staff requests: vacation, shift change, approval/rejection, notes

const staffRequestsRepository = require("../repositories/staff-requests.repository");
const staffRepository = require("../repositories/staff.repository");

async function createRequest(staffId, data) {
  const staff = await staffRepository.getById(staffId);
  if (!staff) return null;
  return staffRequestsRepository.create({
    ...data,
    staffId,
  });
}

async function approveRequest(id, approvedBy) {
  return staffRequestsRepository.update(id, {
    status: "approved",
    approvedBy,
    approvedAt: new Date().toISOString(),
    rejectedBy: null,
    rejectedAt: null,
    rejectionReason: "",
  });
}

async function rejectRequest(id, rejectedBy, reason = "") {
  return staffRequestsRepository.update(id, {
    status: "rejected",
    rejectedBy,
    rejectedAt: new Date().toISOString(),
    rejectionReason: reason,
    approvedBy: null,
    approvedAt: null,
  });
}

async function addRequestNotes(id, notes) {
  return staffRequestsRepository.update(id, { requestNotes: notes, notes });
}

async function getPendingRequests() {
  return staffRequestsRepository.getAll({ status: "pending" });
}

async function getRequestsByStaff(staffId) {
  return staffRequestsRepository.getByStaffId(staffId);
}

module.exports = {
  createRequest,
  approveRequest,
  rejectRequest,
  addRequestNotes,
  getPendingRequests,
  getRequestsByStaff,
};
