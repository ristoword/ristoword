// backend/src/repositories/auth.repository.js
const path = require("path");
const bcrypt = require("bcrypt");
const { MANAGER_ROLES } = require("../constants/departments");
const usersRepository = require("./users.repository");
const { safeReadJson } = require("../utils/safeFileIO");

const DEMO_HASHES_PATH = path.join(__dirname, "..", "..", "data", "demo-hashes.json");

const DEMO_USERS = [
  { id: 1, username: "supervisor", password: "1234", role: "supervisor", redirectTo: "/supervisor/supervisor.html" },
  { id: 2, username: "cassa", password: "1234", role: "cashier", redirectTo: "/cassa/cassa.html" },
  { id: 3, username: "cucina", password: "1234", role: "kitchen", redirectTo: "/cucina/cucina.html" },
  { id: 4, username: "staff", password: "1234", role: "staff", redirectTo: "/staff/staff.html" },
  { id: 5, username: "cliente", password: "1234", role: "customer", redirectTo: "/dashboard/dashboard.html" },
  { id: 6, username: "cash_manager", password: "5678", role: "cash_manager", department: "cassa", redirectTo: "/cassa/cassa.html" },
  { id: 7, username: "kitchen_manager", password: "6789", role: "kitchen_manager", department: "cucina", redirectTo: "/cucina/cucina.html" },
  { id: 8, username: "sala_manager", password: "7890", role: "sala_manager", department: "sala", redirectTo: "/sala/sala.html" },
  { id: 9, username: "bar_manager", password: "8901", role: "bar_manager", department: "bar", redirectTo: "/bar/bar.html" },
  { id: 10, username: "supervisor_mgr", password: "9012", role: "supervisor", department: "supervisor", redirectTo: "/supervisor/supervisor.html" },
];

const ROLE_REDIRECT = {
  owner: "/dashboard/dashboard.html",
  sala: "/sala/sala.html",
  cucina: "/cucina/cucina.html",
  cassa: "/cassa/cassa.html",
};

function buildToken(user) {
  return `rw_${user.role}_${user.username}_${Date.now()}`;
}

function normalize(user, token = true) {
  const redirectTo = user.redirectTo || ROLE_REDIRECT[user.role];
  const department = user.department || (MANAGER_ROLES[user.role] && MANAGER_ROLES[user.role].department);
  const out = { ...user, department, redirectTo };
  if (token) out.token = buildToken(user);
  return out;
}

exports.findByCredentials = async (username, password, role) => {
  const fromJson = await usersRepository.findByCredentials(username, password);
  if (fromJson) {
    const roleOk = !role || fromJson.role === role;
    if (roleOk) return normalize(fromJson);
  }
  const user = DEMO_USERS.find((u) => {
    const sameUser = u.username === String(username).trim().toLowerCase();
    const sameRole = role ? u.role === role : true;
    return sameUser && sameRole;
  });
  if (!user) return null;
  const demoHashes = safeReadJson(DEMO_HASHES_PATH, {});
  const hash = demoHashes[user.username];
  if (hash && (await bcrypt.compare(String(password), hash))) {
    return normalize(user);
  }
  if (!hash && user.password === String(password)) {
    return normalize(user);
  }
  return null;
};

exports.findByUsername = async (username) => {
  const fromJson = usersRepository.findByUsername(username);
  if (fromJson) return normalize(fromJson);
  const user = DEMO_USERS.find((u) => u.username === String(username).trim().toLowerCase());
  if (!user) return null;
  return normalize(user);
};

exports.findManagerByDepartment = async (department) => {
  const entry = Object.entries(MANAGER_ROLES).find(([, v]) => v.department === department);
  if (!entry) return null;
  return DEMO_USERS.find((u) => u.role === entry[0]) || null;
};
