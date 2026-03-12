// backend/src/repositories/staff.repository.js
// Staff users persisted in data/tenants/{restaurantId}/staff.json

const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const paths = require("../config/paths");
const tenantContext = require("../context/tenantContext");

function getDataDir() {
  const restaurantId = tenantContext.getRestaurantId();
  if (!restaurantId) return paths.DATA;
  return path.join(paths.DATA, "tenants", restaurantId);
}

function getStaffPath() {
  return path.join(getDataDir(), "staff.json");
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `st_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function normalizeString(v, fallback = "") {
  if (v == null) return fallback;
  return String(v).trim();
}

/** Default profile structure for backward compatibility */
function getDefaultProfile() {
  return {
    personal: {
      name: "",
      surname: "",
      birthDate: "",
      age: null,
      phone: "",
      email: "",
      address: "",
      employeeCode: "",
      hireDate: "",
    },
    work: {
      department: "",
      qualification: "",
      role: "",
      directManager: "",
      contractType: "",
      contractStart: "",
      contractEnd: "",
      weeklyHours: null,
      monthlyContractHours: null,
    },
    salary: {
      netSalary: null,
      grossSalary: null,
      hourlyRate: null,
      bonuses: null,
      overtime: null,
      deductions: null,
    },
    attendance: {
      hoursToday: null,
      hoursWeek: null,
      hoursMonth: null,
      monthlyHoursRemaining: null,
      overtime: null,
      absences: null,
      delays: null,
      earlyExits: null,
    },
    shifts: {
      assigned: [],
      completed: [],
      current: null,
      history: [],
      restDays: [],
      sickLeave: [],
      absences: [],
      vacations: [],
    },
    vacations: {
      earned: null,
      used: null,
      remaining: null,
      requestsSent: null,
      approved: null,
      rejected: null,
    },
    discipline: {
      warnings: [],
      managerNotes: [],
      staffNotes: [],
      importantEvents: [],
    },
  };
}

function mergeWithDefaults(member) {
  if (!member) return null;
  const def = getDefaultProfile();
  return {
    ...member,
    personal: { ...def.personal, ...(member.personal || {}) },
    work: { ...def.work, ...(member.work || {}) },
    salary: { ...def.salary, ...(member.salary || {}) },
    attendance: { ...def.attendance, ...(member.attendance || {}) },
    shifts: { ...def.shifts, ...(member.shifts || {}) },
    vacations: { ...def.vacations, ...(member.vacations || {}) },
    discipline: { ...def.discipline, ...(member.discipline || {}) },
  };
}

function sanitizeProfile(data) {
  const out = {};
  const sections = ["personal", "work", "salary", "attendance", "shifts", "vacations", "discipline"];
  for (const section of sections) {
    if (data[section] && typeof data[section] === "object") {
      out[section] = data[section];
    }
  }
  return out;
}

async function ensureStaffFile() {
  const staffPath = getStaffPath();
  await fsp.mkdir(getDataDir(), { recursive: true });
  if (!fs.existsSync(staffPath)) {
    await fsp.writeFile(staffPath, "[]", "utf8");
    return;
  }
}

async function readAllStaff() {
  await ensureStaffFile();
  const raw = await fsp.readFile(getStaffPath(), "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    throw new Error("staff.json non valido");
  }
}

async function writeAllStaff(staff) {
  await ensureStaffFile();
  await fsp.writeFile(getStaffPath(), JSON.stringify(staff, null, 2), "utf8");
}

exports.getAll = async () => readAllStaff();

exports.getAllFiltered = async (filters = {}) => {
  let staff = await readAllStaff();
  const q = (filters.q || "").trim().toLowerCase();
  const department = (filters.department || "").trim();
  const activeFilter = filters.active;

  if (q) {
    staff = staff.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.role || "").toLowerCase().includes(q) ||
        (s.department || "").toLowerCase().includes(q) ||
        (s.personal?.surname || "").toLowerCase().includes(q) ||
        (s.personal?.employeeCode || "").toLowerCase().includes(q)
    );
  }
  if (department) {
    staff = staff.filter((s) => (s.department || "") === department);
  }
  if (activeFilter === true || activeFilter === "true" || activeFilter === "1") {
    staff = staff.filter((s) => s.active !== false);
  } else if (activeFilter === false || activeFilter === "false" || activeFilter === "0") {
    staff = staff.filter((s) => s.active === false);
  }

  return staff;
};

exports.getById = async (id) => {
  const staff = await readAllStaff();
  const member = staff.find((s) => s.id === id) || null;
  return mergeWithDefaults(member);
};

exports.getByDepartment = async (department) => {
  const staff = await readAllStaff();
  return staff.filter((s) => s.department === department && s.active !== false);
};

exports.getManagers = async () => {
  const staff = await readAllStaff();
  return staff.filter((s) => s.roleType === "manager" && s.active !== false);
};

exports.getOperational = async (department = null) => {
  const staff = await readAllStaff();
  let result = staff.filter((s) => s.roleType !== "manager" && s.active !== false);
  if (department) {
    result = result.filter((s) => s.department === department);
  }
  return result;
};

exports.create = async (data) => {
  const staff = await readAllStaff();
  const profile = sanitizeProfile(data);
  const member = {
    id: data.id || createId(),
    name: normalizeString(data.name, ""),
    role: normalizeString(data.role, ""),
    department: normalizeString(data.department, ""),
    roleType: data.roleType || "operational",
    pinCode: normalizeString(data.pinCode, ""),
    active: data.active !== false,
    ...profile,
  };
  staff.push(member);
  await writeAllStaff(staff);
  return mergeWithDefaults(member);
};

exports.update = async (id, data) => {
  const staff = await readAllStaff();
  const idx = staff.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const profile = sanitizeProfile(data);
  const base = {
    name: data.name !== undefined ? normalizeString(data.name) : staff[idx].name,
    role: data.role !== undefined ? normalizeString(data.role) : staff[idx].role,
    department: data.department !== undefined ? normalizeString(data.department) : staff[idx].department,
    roleType: data.roleType !== undefined ? data.roleType : staff[idx].roleType,
    pinCode: data.pinCode !== undefined ? normalizeString(data.pinCode) : staff[idx].pinCode,
    active: data.active !== undefined ? data.active !== false : staff[idx].active,
  };
  for (const [key, val] of Object.entries(profile)) {
    staff[idx][key] = { ...(staff[idx][key] || {}), ...val };
  }
  Object.assign(staff[idx], base);
  await writeAllStaff(staff);
  return mergeWithDefaults(staff[idx]);
};

exports.remove = async (id) => {
  const staff = await readAllStaff();
  const idx = staff.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  staff.splice(idx, 1);
  await writeAllStaff(staff);
  return true;
};

exports.addDiscipline = async (staffId, type, data) => {
  const staff = await readAllStaff();
  const idx = staff.findIndex((s) => s.id === staffId);
  if (idx === -1) return null;
  staff[idx].discipline = staff[idx].discipline || { warnings: [], managerNotes: [], staffNotes: [], importantEvents: [] };
  const item = {
    id: data.id || (crypto.randomUUID ? crypto.randomUUID() : `ev_${Date.now()}_${Math.floor(Math.random() * 1000)}`),
    date: data.date || new Date().toISOString().slice(0, 10),
    text: data.text || data.note || "",
    author: data.author || "",
    severity: data.severity || "info",
    ...data,
  };
  const key = type === "warning" ? "warnings" : type === "managerNote" ? "managerNotes" : type === "staffNote" ? "staffNotes" : "importantEvents";
  if (!Array.isArray(staff[idx].discipline[key])) staff[idx].discipline[key] = [];
  staff[idx].discipline[key].push(item);
  await writeAllStaff(staff);
  return mergeWithDefaults(staff[idx]);
};
