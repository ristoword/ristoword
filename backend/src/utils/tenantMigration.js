// backend/src/utils/tenantMigration.js
// One-time migration: copy legacy data/ files to data/tenants/default/ when tenant dir is empty.

const fs = require("fs");
const path = require("path");
const paths = require("../config/paths");

const TENANT_FILES = [
  "orders.json",
  "inventory.json",
  "payments.json",
  "recipes.json",
  "stock-movements.json",
  "staff.json",
  "customers.json",
  "bookings.json",
  "order-food-costs.json",
  "menu.json",
  "closures.json",
  "cassa-shifts.json",
  "pos-shifts.json",
  "shifts.json",
  "staff-shifts.json",
  "staff-requests.json",
  "haccp-checks.json",
  "catering-events.json",
  "sessions.json",
  "daily-menu.json",
  "inventory-transfers.json",
];

let migrated = false;

function ensureTenantMigration() {
  if (migrated) return;
  migrated = true;

  const defaultDir = path.join(paths.DATA, "tenants", "default");
  fs.mkdirSync(defaultDir, { recursive: true });

  for (const fileName of TENANT_FILES) {
    const legacyPath = path.join(paths.DATA, fileName);
    const tenantPath = path.join(defaultDir, fileName);
    if (fs.existsSync(legacyPath) && !fs.existsSync(tenantPath)) {
      try {
        fs.copyFileSync(legacyPath, tenantPath);
        console.log(`[Tenant] Migrated ${fileName} to tenants/default/`);
      } catch (err) {
        console.warn(`[Tenant] Migration failed for ${fileName}:`, err.message);
      }
    }
  }
}

module.exports = { ensureTenantMigration };
