// backend/src/repositories/auth.repository.js
const path = require("path");
const bcrypt = require("bcrypt");
const { MANAGER_ROLES } = require("../constants/departments");
const usersRepository = require("./users.repository");
const { safeReadJson } = require("../utils/safeFileIO");

const DEMO_HASHES_PATH = path.join(__dirname, "..", "..", "data", "demo-hashes.json");

const DEFAULT_PASSWORD = "Gestionesemplificata1";

const DEMO_USERS = [
  { id: 1, username: "risto_owner", password: DEFAULT_PASSWORD, role: "owner", redirectTo: "/dashboard/dashboard.html" },
  { id: 2, username: "risto_supervisor", password: DEFAULT_PASSWORD, role: "supervisor", redirectTo: "/supervisor/supervisor.html" },
  { id: 3, username: "risto_sala", password: DEFAULT_PASSWORD, role: "sala", redirectTo: "/sala/sala.html" },
  { id: 4, username: "risto_cucina", password: DEFAULT_PASSWORD, role: "cucina", redirectTo: "/cucina/cucina.html" },
  { id: 5, username: "risto_cassa", password: DEFAULT_PASSWORD, role: "cassa", redirectTo: "/cassa/cassa.html" },
  { id: 6, username: "risto_bar", password: DEFAULT_PASSWORD, role: "bar", redirectTo: "/bar/bar.html" },
  { id: 7, username: "risto_pizzeria", password: DEFAULT_PASSWORD, role: "pizzeria", redirectTo: "/pizzeria/pizzeria.html" },
  { id: 8, username: "risto_magazzino", password: DEFAULT_PASSWORD, role: "magazzino", redirectTo: "/magazzino/magazzino.html" },
  { id: 9, username: "risto_staff", password: DEFAULT_PASSWORD, role: "staff", redirectTo: "/staff/staff.html" },
  { id: 10, username: "risto_cashier", password: DEFAULT_PASSWORD, role: "cashier", redirectTo: "/cassa/cassa.html" },
  { id: 11, username: "risto_kitchen", password: DEFAULT_PASSWORD, role: "kitchen", redirectTo: "/cucina/cucina.html" },
  { id: 12, username: "risto_customer", password: DEFAULT_PASSWORD, role: "customer", redirectTo: "/dashboard/dashboard.html" },
  { id: 13, username: "risto_cash_manager", password: DEFAULT_PASSWORD, role: "cash_manager", department: "cassa", redirectTo: "/cassa/cassa.html" },
  { id: 14, username: "risto_kitchen_manager", password: DEFAULT_PASSWORD, role: "kitchen_manager", department: "cucina", redirectTo: "/cucina/cucina.html" },
  { id: 15, username: "risto_sala_manager", password: DEFAULT_PASSWORD, role: "sala_manager", department: "sala", redirectTo: "/sala/sala.html" },
  { id: 16, username: "risto_bar_manager", password: DEFAULT_PASSWORD, role: "bar_manager", department: "bar", redirectTo: "/bar/bar.html" },
];

const ROLE_REDIRECT = {
  owner: "/dashboard/dashboard.html",
  supervisor: "/supervisor/supervisor.html",
  sala: "/sala/sala.html",
  cucina: "/cucina/cucina.html",
  cassa: "/cassa/cassa.html",
  bar: "/bar/bar.html",
  pizzeria: "/pizzeria/pizzeria.html",
  magazzino: "/magazzino/magazzino.html",
  staff: "/staff/staff.html",
  cashier: "/cassa/cassa.html",
  kitchen: "/cucina/cucina.html",
  customer: "/dashboard/dashboard.html",
};

function buildToken(user) {
  return `rw_${user.role}_${user.username}_${Date.now()}`;
}

function normalize(user, token = true) {
  const baseRedirect = user.redirectTo || ROLE_REDIRECT[user.role];
  const redirectTo = user.mustChangePassword === true ? "/change-password/change-password.html" : baseRedirect;
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
