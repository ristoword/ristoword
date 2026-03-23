// backend/src/repositories/users.repository.js
// Router: users.json (default) oppure MySQL (MYSQL_DATA_PRIMARY=1). Mirror JSON opzionale.

const file = require("./users.repository.file");
const sql = require("./users.repository.sql");
const { isMysqlPrimary, isJsonMirror } = require("../utils/mysqlPrimary");

async function mirrorFileFromSqlIfNeeded() {
  if (!isMysqlPrimary() || !isJsonMirror()) return;
  const all = await sql.readUsers();
  file.writeUsers(all);
}

async function readUsers() {
  if (!isMysqlPrimary()) return file.readUsers();
  return sql.readUsers();
}

async function writeUsers(users) {
  if (!isMysqlPrimary()) {
    file.writeUsers(users);
    return;
  }
  await sql.writeUsers(users);
  await mirrorFileFromSqlIfNeeded();
}

async function findByCredentials(username, password) {
  if (!isMysqlPrimary()) return file.findByCredentials(username, password);
  const u = await sql.findByCredentials(username, password);
  if (u && isJsonMirror()) await mirrorFileFromSqlIfNeeded();
  return u;
}

async function findByUsername(username) {
  if (!isMysqlPrimary()) return file.findByUsername(username);
  return sql.findByUsername(username);
}

async function findById(id) {
  if (!isMysqlPrimary()) return file.findById(id);
  return sql.findById(id);
}

async function findByRestaurantId(restaurantId) {
  if (!isMysqlPrimary()) return file.findByRestaurantId(restaurantId);
  return sql.findByRestaurantId(restaurantId);
}

async function createUser(userData) {
  if (!isMysqlPrimary()) return file.createUser(userData);
  const r = await sql.createUser(userData);
  if (r && isJsonMirror()) await mirrorFileFromSqlIfNeeded();
  return r;
}

async function updateUser(id, patch) {
  if (!isMysqlPrimary()) return file.updateUser(id, patch);
  const r = await sql.updateUser(id, patch);
  if (r && isJsonMirror()) await mirrorFileFromSqlIfNeeded();
  return r;
}

async function findOwnerByRestaurantId(restaurantId) {
  if (!isMysqlPrimary()) return file.findOwnerByRestaurantId(restaurantId);
  return sql.findOwnerByRestaurantId(restaurantId);
}

async function setUserPassword(userId, hashedPassword, opts = {}) {
  if (!isMysqlPrimary()) return file.setUserPassword(userId, hashedPassword, opts);
  const ok = await sql.setUserPassword(userId, hashedPassword, opts);
  if (ok && isJsonMirror()) await mirrorFileFromSqlIfNeeded();
  return ok;
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
  ensureLeaveBalances: file.ensureLeaveBalances,
  DEFAULT_LEAVE_BALANCES: file.DEFAULT_LEAVE_BALANCES,
};
