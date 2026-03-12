// backend/src/controllers/sessions.controller.js
const sessionsRepository = require("../repositories/sessions.repository");

// POST /api/sessions/login
exports.login = async (req, res) => {
  const { userId, name, department, authorizedBy, source } = req.body || {};

  if (!userId || !name || !department) {
    return res.status(400).json({
      error: true,
      message: "userId, name e department obbligatori",
    });
  }

  const session = await sessionsRepository.createSession({
    userId,
    name,
    department,
    authorizedBy: source === "cassa" ? (authorizedBy || "") : null,
    source: source || "module",
  });

  res.status(201).json(session);
};

// POST /api/sessions/logout
exports.logout = async (req, res) => {
  const { sessionId, userId } = req.body || {};

  let session = null;
  if (sessionId) {
    session = await sessionsRepository.endSession(sessionId);
  } else if (userId) {
    session = await sessionsRepository.endSessionByUserId(userId);
  }

  if (!session) {
    return res.status(404).json({
      error: true,
      message: "Sessione non trovata o già chiusa",
    });
  }

  res.json({ success: true, session });
};

// GET /api/sessions/active
// GET /api/sessions/active/:department
exports.getActive = async (req, res) => {
  const department = req.params.department || null;
  const sessions = await sessionsRepository.getActiveSessions(department);
  res.json(sessions);
};
