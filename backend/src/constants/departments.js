// backend/src/constants/departments.js
// Department/role constants for staff access. Prepared for future shift scheduling.

const DEPARTMENTS = ["cassa", "cucina", "sala", "bar", "supervisor", "pizzeria", "magazzino", "altro"];

const MANAGER_ROLES = {
  supervisor: { department: "supervisor", module: "supervisor", redirectTo: "/supervisor/supervisor.html" },
  cash_manager: { department: "cassa", module: "cassa", redirectTo: "/cassa/cassa.html" },
  kitchen_manager: { department: "cucina", module: "cucina", redirectTo: "/cucina/cucina.html" },
  sala_manager: { department: "sala", module: "sala", redirectTo: "/sala/sala.html" },
  bar_manager: { department: "bar", module: "bar", redirectTo: "/bar/bar.html" },
};

function getDepartmentForModule(moduleName) {
  const entry = Object.values(MANAGER_ROLES).find((m) => m.module === moduleName);
  return entry ? entry.department : null;
}

function getManagerRoleForDepartment(department) {
  const entry = Object.entries(MANAGER_ROLES).find(([, v]) => v.department === department);
  return entry ? entry[0] : null;
}

module.exports = {
  DEPARTMENTS,
  MANAGER_ROLES,
  getDepartmentForModule,
  getManagerRoleForDepartment,
};
