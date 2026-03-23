// backend/src/repositories/users.repository.file.js
// Persistenza utenti su users.json (fallback / mirror).

const path = require("path");
const bcrypt = require("bcrypt");
const { safeReadJson, atomicWriteJson } = require("../utils/safeFileIO");

const DATA_FILE = path.join(__dirname, "..", "..", "data", "users.json");
const BCRYPT_ROUNDS = 10;

function readUsers() {
  const data = safeReadJson(DATA_FILE, { users: [] });
  return Array.isArray(data.users) ? data.users : [];
}

function writeUsers(users) {
  const data = safeReadJson(DATA_FILE, { users: [] });
  data.users = Array.isArray(users) ? users : [];
  atomicWriteJson(DATA_FILE, data);
}

function normalizeUsername(u) {
  return String(u || "").trim().toLowerCase();
}

function isBcryptHash(str) {
  return typeof str === "string" && (str.startsWith("$2a$") || str.startsWith("$2b$") || str.startsWith("$2y$"));
}

async function findByCredentials(username, password) {
  const users = readUsers();
  const u = normalizeUsername(username);
  const p = String(password || "");
  const user = users.find((x) => x.is_active !== false && normalizeUsername(x.username) === u);
  if (!user) return null;

  const stored = user.password || "";
  if (isBcryptHash(stored)) {
    const match = await bcrypt.compare(p, stored);
    if (match) return { ...user };
    return null;
  }
  if (stored === p) {
    const hash = await bcrypt.hash(p, BCRYPT_ROUNDS);
    const updated = users.map((x) =>
      x === user ? { ...x, password: hash } : x
    );
    writeUsers(updated);
    return { ...user };
  }
  return null;
}

function findByUsername(username) {
  const users = readUsers();
  const u = normalizeUsername(username);
  const user = users.find((x) => x.is_active !== false && normalizeUsername(x.username) === u);
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}

const DEFAULT_LEAVE_BALANCES = {
  ferieMaturate: 0,
  ferieUsate: 0,
  permessiUsati: 0,
  malattiaGiorni: 0,
};

function ensureLeaveBalances(user) {
  if (!user) return user;
  if (user.leaveBalances && typeof user.leaveBalances === "object") return user;
  return { ...user, leaveBalances: { ...DEFAULT_LEAVE_BALANCES } };
}

function findById(id) {
  const users = readUsers();
  const sid = String(id || "").trim();
  const user = users.find((x) => String(x.id) === sid) || null;
  return user ? ensureLeaveBalances(user) : null;
}

function findByRestaurantId(restaurantId) {
  const rid = String(restaurantId || "").trim();
  if (!rid) return [];
  return readUsers().filter((x) => x.restaurantId === rid).map(ensureLeaveBalances);
}

async function createUser(userData) {
  const users = readUsers();
  const username = normalizeUsername(userData.username);
  if (users.some((x) => normalizeUsername(x.username) === username)) {
    return null;
  }
  const nextId = users.length > 0
    ? Math.max(...users.map((x) => parseInt(x.id, 10) || 0)) + 1
    : 1;
  const id = String(nextId);
  const now = new Date().toISOString();
  const record = {
    id,
    name: userData.name != null ? String(userData.name).trim() : "",
    surname: userData.surname != null ? String(userData.surname).trim() : "",
    username: userData.username,
    email: userData.email != null ? String(userData.email).trim() : undefined,
    password: userData.password,
    role: userData.role || "staff",
    is_active: userData.is_active !== false,
    restaurantId: userData.restaurantId || null,
    mustChangePassword: userData.mustChangePassword === true,
    hourlyRate: userData.hourlyRate != null ? Number(userData.hourlyRate) : undefined,
    employmentType: userData.employmentType != null ? String(userData.employmentType).trim() : undefined,
    leaveBalances: userData.leaveBalances && typeof userData.leaveBalances === "object" ? { ...DEFAULT_LEAVE_BALANCES, ...userData.leaveBalances } : { ...DEFAULT_LEAVE_BALANCES },
    createdAt: userData.createdAt || now,
  };
  users.push(record);
  writeUsers(users);
  return record;
}

function updateUser(id, patch) {
  const users = readUsers();
  const sid = String(id || "").trim();
  const idx = users.findIndex((x) => String(x.id) === sid);
  if (idx === -1) return null;
  const allowed = ["name", "surname", "role", "is_active", "mustChangePassword", "hourlyRate", "employmentType"];
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      if (key === "is_active") users[idx].is_active = patch[key] !== false;
      else if (key === "hourlyRate") users[idx].hourlyRate = patch[key] != null ? Number(patch[key]) : undefined;
      else users[idx][key] = patch[key];
    }
  }
  writeUsers(users);
  const { password, ...out } = users[idx];
  return out;
}

function findOwnerByRestaurantId(restaurantId) {
  const rid = String(restaurantId || "").trim();
  if (!rid) return null;
  return readUsers().find((u) => u.role === "owner" && String(u.restaurantId || "").trim() === rid) || null;
}

function setUserPassword(userId, hashedPassword, opts = {}) {
  const users = readUsers();
  const idx = users.findIndex((x) => String(x.id) === String(userId));
  if (idx === -1) return false;
  users[idx].password = hashedPassword;
  if (opts && Object.prototype.hasOwnProperty.call(opts, "mustChangePassword")) {
    users[idx].mustChangePassword = opts.mustChangePassword === true;
  } else {
    users[idx].mustChangePassword = false;
  }
  writeUsers(users);
  return true;
}

module.exports = {
  readUsers,
  writeUsers,
  findByCredentials,
  findByUsername,
  findById,
  findByRestaurantId,
  createUser,
  updateUser,
  findOwnerByRestaurantId,
  setUserPassword,
  ensureLeaveBalances,
  DEFAULT_LEAVE_BALANCES,
};
