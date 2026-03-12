// backend/src/repositories/sessions.repository.js
// Persistent staff access sessions – tenant-aware, uses data/tenants/{tenantId}/sessions.json

const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const paths = require("../config/paths");
const tenantContext = require("../context/tenantContext");

function getDataDir() {
  return path.join(paths.DATA, "tenants", tenantContext.getRestaurantId());
}

function getSessionsFilePath() {
  return paths.tenantDataPath(tenantContext.getRestaurantId(), "sessions.json");
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `sess_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function normalizeString(v, fallback = "") {
  if (v == null) return fallback;
  return String(v).trim();
}

async function ensureSessionsFile() {
  const SESSIONS_FILE = getSessionsFilePath();
  const legacyPath = paths.legacy("sessions.json");

  await fsp.mkdir(getDataDir(), { recursive: true });
  if (!fs.existsSync(SESSIONS_FILE)) {
    if (fs.existsSync(legacyPath)) {
      await fsp.copyFile(legacyPath, SESSIONS_FILE);
    } else {
      await fsp.writeFile(SESSIONS_FILE, "[]", "utf8");
    }
    return;
  }
  const raw = await fsp.readFile(SESSIONS_FILE, "utf8");
  if (!raw.trim()) {
    await fsp.writeFile(SESSIONS_FILE, "[]", "utf8");
  }
}

async function readAllSessions() {
  await ensureSessionsFile();
  const raw = await fsp.readFile(getSessionsFilePath(), "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    throw new Error("sessions.json non valido");
  }
}

async function writeAllSessions(sessions) {
  await ensureSessionsFile();
  await fsp.writeFile(getSessionsFilePath(), JSON.stringify(sessions, null, 2), "utf8");
}

async function createSession(payload) {
  const sessions = await readAllSessions();
  const nowIso = new Date().toISOString();
  const session = {
    id: payload.id || createId(),
    userId: normalizeString(payload.userId, ""),
    name: normalizeString(payload.name, ""),
    department: normalizeString(payload.department, ""),
    loginTime: payload.loginTime || nowIso,
    logoutTime: payload.logoutTime || null,
    authorizedBy: payload.authorizedBy != null ? normalizeString(payload.authorizedBy, "") : null,
    source: normalizeString(payload.source, "module"),
  };
  sessions.push(session);
  await writeAllSessions(sessions);
  return session;
}

async function endSession(sessionId) {
  const sessions = await readAllSessions();
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx === -1) return null;
  sessions[idx].logoutTime = new Date().toISOString();
  await writeAllSessions(sessions);
  return sessions[idx];
}

async function endSessionByUserId(userId) {
  const sessions = await readAllSessions();
  const idx = sessions.findIndex((s) => s.userId === userId && !s.logoutTime);
  if (idx === -1) return null;
  sessions[idx].logoutTime = new Date().toISOString();
  await writeAllSessions(sessions);
  return sessions[idx];
}

async function getActiveSessions(department = null) {
  const sessions = await readAllSessions();
  let active = sessions.filter((s) => !s.logoutTime);
  if (department) {
    active = active.filter((s) => s.department === department);
  }
  return active;
}

module.exports = {
  SESSIONS_FILE: getSessionsFilePath,
  readAllSessions,
  createSession,
  endSession,
  endSessionByUserId,
  getActiveSessions,
};
