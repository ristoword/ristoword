// backend/src/repositories/users.repository.js
// JSON-based user storage for login/roles. Passwords hashed with bcrypt.

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

module.exports = {
  readUsers,
  writeUsers,
  findByCredentials,
  findByUsername,
};
