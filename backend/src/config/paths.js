// backend/src/config/paths.js

const path = require("path");

// root progetto
const ROOT = path.resolve(__dirname, "../../");

/** Consente slug tipo baia-verde, risto1, Boss_risto3; blocca .. e path traversal. */
const SAFE_TENANT_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

function sanitizeTenantId(raw) {
  if (raw == null) return null;
  const id = String(raw).trim();
  if (!id) return null;
  if (!SAFE_TENANT_ID_RE.test(id)) return null;
  return id;
}

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
    const id = sanitizeTenantId(restaurantId);
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
    const id = sanitizeTenantId(tenantId) || "default";
    return path.join(paths.DATA, "tenants", id, fileName);
  },

  /**
   * Legacy (pre-tenant) path for a file in data/
   */
  legacy(fileName) {
    return path.join(paths.DATA, fileName);
  },
};

paths.sanitizeTenantId = sanitizeTenantId;
module.exports = paths;