// backend/src/config/paths.js

const path = require("path");

// root progetto
const ROOT = path.resolve(__dirname, "../../");

const paths = {
  ROOT,

  // cartelle principali
  DATA: path.join(ROOT, "data"),
  PUBLIC: path.join(ROOT, "public"),
  SRC: path.join(ROOT, "src"),

  // moduli backend
  CONFIG: path.join(ROOT, "src/config"),
  CONTROLLERS: path.join(ROOT, "src/controllers"),
  ROUTES: path.join(ROOT, "src/routes"),
  REPOSITORIES: path.join(ROOT, "src/repositories"),
  MIDDLEWARE: path.join(ROOT, "src/middleware"),
  SERVICE: path.join(ROOT, "src/service"),
  UTILS: path.join(ROOT, "src/utils"),

  // frontend
  DASHBOARD: path.join(ROOT, "public/dashboard"),
  SALA: path.join(ROOT, "public/sala"),
  CUCINA: path.join(ROOT, "public/cucina"),
  CASSA: path.join(ROOT, "public/cassa"),
  MAGAZZINO: path.join(ROOT, "public/magazzino"),
  PIZZERIA: path.join(ROOT, "public/pizzeria"),
  LOGIN: path.join(ROOT, "public/login"),

  /**
   * Tenant-aware data path.
   * @param {string|null|undefined} restaurantId - Tenant ID. If missing, uses legacy path for backward compat.
   * @param {string} fileName - e.g. "orders.json"
   * @returns {string} Full path: data/tenants/{restaurantId}/{fileName} or data/{fileName} when no tenant
   */
  tenant(restaurantId, fileName) {
    const id = restaurantId != null && String(restaurantId).trim() !== "" ? String(restaurantId).trim() : null;
    if (!id) {
      return path.join(paths.DATA, fileName);
    }
    return path.join(paths.DATA, "tenants", id, fileName);
  },

  /**
   * Alias for tenant() - get full path for tenant data file.
   * Falls back to default tenant when id is missing.
   */
  tenantDataPath(tenantId, fileName) {
    const id = tenantId != null && String(tenantId).trim() !== "" ? String(tenantId).trim() : "default";
    return path.join(paths.DATA, "tenants", id, fileName);
  },

  /**
   * Legacy (pre-tenant) path for a file in data/
   */
  legacy(fileName) {
    return path.join(paths.DATA, fileName);
  },
};

module.exports = paths;