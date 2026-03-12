// backend/src/utils/tenantData.js
// Tenant-aware path and migration helpers

const fs = require("fs");
const path = require("path");
const paths = require("../config/paths");
const tenantContext = require("../context/tenantContext");

/**
 * Get path for tenant data file. Uses current tenant from context.
 */
function tenantDataPath(tenantId, fileName) {
  const id = tenantId ?? tenantContext.getRestaurantId();
  return paths.tenantDataPath(id, fileName);
}

/**
 * Ensure tenant file exists; if not, copy from legacy path.
 * Returns the tenant file path.
 */
function ensureTenantFileWithLegacyFallback(fileName, defaultContent = "[]") {
  const tenantId = tenantContext.getRestaurantId();
  const tenantPath = paths.tenantDataPath(tenantId, fileName);
  const legacyPath = paths.legacy(fileName);
  const defaultDir = path.dirname(tenantPath);

  if (!fs.existsSync(defaultDir)) {
    fs.mkdirSync(defaultDir, { recursive: true });
  }

  if (!fs.existsSync(tenantPath)) {
    if (fs.existsSync(legacyPath)) {
      try {
        fs.copyFileSync(legacyPath, tenantPath);
      } catch (err) {
        fs.writeFileSync(tenantPath, defaultContent, "utf8");
      }
    } else {
      fs.writeFileSync(tenantPath, defaultContent, "utf8");
    }
  }

  return tenantPath;
}

module.exports = {
  tenantDataPath,
  ensureTenantFileWithLegacyFallback,
};
