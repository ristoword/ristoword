/**
 * Utenti su MySQL (tabella app_users).
 */
const bcrypt = require("bcrypt");
const { getDbPool } = require("../config/dbPool");
const { ensureOperationalSchema } = require("../utils/ensureOperationalSchema");

const BCRYPT_ROUNDS = 10;

const DEFAULT_LEAVE_BALANCES = {
  ferieMaturate: 0,
  ferieUsate: 0,
  permessiUsati: 0,
  malattiaGiorni: 0,
};

function normalizeUsername(u) {
  return String(u || "").trim().toLowerCase();
}

function isBcryptHash(str) {
  return typeof str === "string" && (str.startsWith("$2a$") || str.startsWith("$2b$") || str.startsWith("$2y$"));
}

function ensureLeaveBalances(user) {
  if (!user) return user;
  if (user.leaveBalances && typeof user.leaveBalances === "object") return user;
  return { ...user, leaveBalances: { ...DEFAULT_LEAVE_BALANCES } };
}

function rowToUserFull(row) {
  if (!row) return null;
  let leaveBalances = { ...DEFAULT_LEAVE_BALANCES };
  if (row.leave_balances != null) {
    try {
      const o = typeof row.leave_balances === "string" ? JSON.parse(row.leave_balances) : row.leave_balances;
      if (o && typeof o === "object") leaveBalances = { ...DEFAULT_LEAVE_BALANCES, ...o };
    } catch (_) {}
  }
  return {
    id: String(row.id),
    name: row.name || "",
    surname: row.surname || "",
    username: row.username,
    email: row.email || undefined,
    password: row.password_hash || "",
    role: row.role || "staff",
    is_active: row.is_active !== 0,
    restaurantId: row.restaurant_id || null,
    mustChangePassword: row.must_change_password === 1,
    hourlyRate: row.hourly_rate != null ? Number(row.hourly_rate) : undefined,
    employmentType: row.employment_type || undefined,
    leaveBalances,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  };
}

async function readUsers() {
  await ensureOperationalSchema();
  const pool = getDbPool();
  const [rows] = await pool.query("SELECT * FROM app_users ORDER BY id ASC");
  return rows.map((r) => ensureLeaveBalances(rowToUserFull(r)));
}

async function writeUsers(users) {
  await ensureOperationalSchema();
  const pool = getDbPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM app_users");
    const list = Array.isArray(users) ? users : [];
    for (const u of list) {
      const un = normalizeUsername(u.username);
      const lb = u.leaveBalances && typeof u.leaveBalances === "object"
        ? JSON.stringify(u.leaveBalances)
        : JSON.stringify(DEFAULT_LEAVE_BALANCES);
      // eslint-disable-next-line no-await-in-loop
      await conn.query(
        `INSERT INTO app_users (id, username, username_norm, password_hash, name, surname, email, role,
          restaurant_id, is_active, must_change_password, hourly_rate, employment_type, leave_balances, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          String(u.id),
          u.username,
          un,
          u.password || "",
          u.name || "",
          u.surname || "",
          u.email || null,
          u.role || "staff",
          u.restaurantId || null,
          u.is_active !== false ? 1 : 0,
          u.mustChangePassword === true ? 1 : 0,
          u.hourlyRate != null ? Number(u.hourlyRate) : null,
          u.employmentType || null,
          lb,
          u.createdAt ? new Date(u.createdAt) : new Date(),
        ]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function findByCredentials(username, password) {
  const users = await readUsers();
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
      x.id === user.id ? { ...x, password: hash } : x
    );
    await writeUsers(updated);
    return { ...user, password: hash };
  }
  return null;
}

async function findByUsername(username) {
  await ensureOperationalSchema();
  const pool = getDbPool();
  const un = normalizeUsername(username);
  const [rows] = await pool.query(
    "SELECT * FROM app_users WHERE username_norm = ? AND is_active = 1 LIMIT 1",
    [un]
  );
  if (!rows.length) return null;
  const row = rows[0];
  const u = rowToUserFull(row);
  const { password, ...safe } = u;
  return safe;
}

async function findById(id) {
  await ensureOperationalSchema();
  const pool = getDbPool();
  const [rows] = await pool.query("SELECT * FROM app_users WHERE id = ? LIMIT 1", [String(id)]);
  if (!rows.length) return null;
  return ensureLeaveBalances(rowToUserFull(rows[0]));
}

async function findByRestaurantId(restaurantId) {
  const rid = String(restaurantId || "").trim();
  if (!rid) return [];
  await ensureOperationalSchema();
  const pool = getDbPool();
  const [rows] = await pool.query(
    "SELECT * FROM app_users WHERE restaurant_id = ? ORDER BY username_norm",
    [rid]
  );
  return rows.map((r) => ensureLeaveBalances(rowToUserFull(r)));
}

async function createUser(userData) {
  const users = await readUsers();
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
    leaveBalances: userData.leaveBalances && typeof userData.leaveBalances === "object"
      ? { ...DEFAULT_LEAVE_BALANCES, ...userData.leaveBalances }
      : { ...DEFAULT_LEAVE_BALANCES },
    createdAt: userData.createdAt || now,
  };
  users.push(record);
  await writeUsers(users);
  return record;
}

async function updateUser(id, patch) {
  const users = await readUsers();
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
  await writeUsers(users);
  const { password, ...out } = users[idx];
  return out;
}

async function findOwnerByRestaurantId(restaurantId) {
  const rid = String(restaurantId || "").trim();
  if (!rid) return null;
  await ensureOperationalSchema();
  const pool = getDbPool();
  const [rows] = await pool.query(
    "SELECT * FROM app_users WHERE restaurant_id = ? AND role = ? AND is_active = 1 LIMIT 1",
    [rid, "owner"]
  );
  if (!rows.length) return null;
  return rowToUserFull(rows[0]);
}

async function setUserPassword(userId, hashedPassword, opts = {}) {
  const users = await readUsers();
  const idx = users.findIndex((x) => String(x.id) === String(userId));
  if (idx === -1) return false;
  users[idx].password = hashedPassword;
  if (opts && Object.prototype.hasOwnProperty.call(opts, "mustChangePassword")) {
    users[idx].mustChangePassword = opts.mustChangePassword === true;
  } else {
    users[idx].mustChangePassword = false;
  }
  await writeUsers(users);
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
