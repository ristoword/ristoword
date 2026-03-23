#!/usr/bin/env node
/**
 * Migrazione dati JSON → MySQL (app_users, restaurants_registry, subscription_licenses, tenant_json_store).
 * Prerequisiti: backup (npm run backup:data), .env con DB, tabelle create (ensureOperationalSchema).
 */
const fs = require("fs");
const path = require("path");

const backendRoot = path.resolve(__dirname, "..");
const dataDir = path.join(backendRoot, "data");

require("dotenv").config({ path: path.join(backendRoot, ".env") });

const { getDbPool } = require("../src/config/dbPool");
const { ensureOperationalSchema } = require("../src/utils/ensureOperationalSchema");
const { safeReadJson } = require("../src/utils/safeFileIO");

function normalizeUsername(u) {
  return String(u || "").trim().toLowerCase();
}

async function migrateUsers(pool) {
  const fp = path.join(dataDir, "users.json");
  const data = safeReadJson(fp, { users: [] });
  const users = Array.isArray(data.users) ? data.users : [];
  let n = 0;
  for (const u of users) {
    const id = String(u.id || "").trim();
    if (!id) continue;
    const un = normalizeUsername(u.username);
    const lb = u.leaveBalances && typeof u.leaveBalances === "object"
      ? JSON.stringify(u.leaveBalances)
      : JSON.stringify({
          ferieMaturate: 0,
          ferieUsate: 0,
          permessiUsati: 0,
          malattiaGiorni: 0,
        });
    // eslint-disable-next-line no-await-in-loop
    await pool.query(
      `INSERT INTO app_users (id, username, username_norm, password_hash, name, surname, email, role,
        restaurant_id, is_active, must_change_password, hourly_rate, employment_type, leave_balances, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CAST(? AS JSON),?)
       ON DUPLICATE KEY UPDATE
        username=VALUES(username), username_norm=VALUES(username_norm), password_hash=VALUES(password_hash),
        name=VALUES(name), surname=VALUES(surname), email=VALUES(email), role=VALUES(role),
        restaurant_id=VALUES(restaurant_id), is_active=VALUES(is_active), must_change_password=VALUES(must_change_password),
        hourly_rate=VALUES(hourly_rate), employment_type=VALUES(employment_type),
        leave_balances=VALUES(leave_balances), created_at=VALUES(created_at)`,
      [
        id,
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
    n += 1;
  }
  console.log("[migrate] app_users:", n);
}

async function migrateRestaurants(pool) {
  const fp = path.join(dataDir, "restaurants.json");
  const data = safeReadJson(fp, { restaurants: [] });
  const list = Array.isArray(data.restaurants) ? data.restaurants : [];
  let n = 0;
  for (const r of list) {
    const id = String(r.id || "").trim();
    if (!id) continue;
    const payload = JSON.stringify(r);
    // eslint-disable-next-line no-await-in-loop
    await pool.query(
      `INSERT INTO restaurants_registry (id, slug, admin_email, payload, created_at)
       VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE slug=VALUES(slug), admin_email=VALUES(admin_email), payload=VALUES(payload)`,
      [
        id,
        r.slug || null,
        r.adminEmail || null,
        payload,
        r.createdAt ? new Date(r.createdAt) : new Date(),
      ]
    );
    n += 1;
  }
  console.log("[migrate] restaurants_registry:", n);
}

async function migrateSubscriptionLicenses(pool) {
  const fp = path.join(dataDir, "licenses.json");
  const data = safeReadJson(fp, { licenses: [] });
  const list = Array.isArray(data.licenses) ? data.licenses : [];
  let n = 0;
  for (const lic of list) {
    const rid = String(lic.restaurantId || "").trim();
    if (!rid) continue;
    const payload = JSON.stringify(lic);
    // eslint-disable-next-line no-await-in-loop
    await pool.query(
      `INSERT INTO subscription_licenses (restaurant_id, activation_code, plan, status, expires_at, source, payload)
       VALUES (?,?,?,?,?,?,CAST(? AS JSON))
       ON DUPLICATE KEY UPDATE
        activation_code=VALUES(activation_code), plan=VALUES(plan), status=VALUES(status),
        expires_at=VALUES(expires_at), source=VALUES(source), payload=VALUES(payload)`,
      [
        rid,
        lic.activationCode || null,
        lic.plan || null,
        lic.status || null,
        lic.expiresAt ? new Date(lic.expiresAt) : null,
        lic.source || null,
        payload,
      ]
    );
    n += 1;
  }
  console.log("[migrate] subscription_licenses:", n);
}

async function migrateTenantFiles(pool) {
  const tenantsRoot = path.join(dataDir, "tenants");
  if (!fs.existsSync(tenantsRoot)) {
    console.log("[migrate] tenant_json_store: nessuna cartella tenants");
    return;
  }
  const dirs = fs.readdirSync(tenantsRoot, { withFileTypes: true }).filter((d) => d.isDirectory());
  let total = 0;
  for (const d of dirs) {
    const tenantId = d.name;
    const dirPath = path.join(tenantsRoot, tenantId);
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".json"));
    for (const f of files) {
      const key = f.replace(/\.json$/i, "");
      const full = path.join(dirPath, f);
      let raw;
      try {
        raw = fs.readFileSync(full, "utf8");
      } catch {
        continue;
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = raw;
      }
      const jsonStr = typeof parsed === "string" ? JSON.stringify(parsed) : JSON.stringify(parsed);
      // eslint-disable-next-line no-await-in-loop
      await pool.query(
        `INSERT INTO tenant_json_store (tenant_id, store_key, payload)
         VALUES (?,?,CAST(? AS JSON))
         ON DUPLICATE KEY UPDATE payload = CAST(? AS JSON), updated_at = CURRENT_TIMESTAMP`,
        [tenantId, key, jsonStr, jsonStr]
      );
      total += 1;
    }
  }
  console.log("[migrate] tenant_json_store files:", total);
}

async function main() {
  await ensureOperationalSchema();
  const pool = getDbPool();
  console.log("[migrate] Inizio migrazione JSON → MySQL");
  await migrateUsers(pool);
  await migrateRestaurants(pool);
  await migrateSubscriptionLicenses(pool);
  await migrateTenantFiles(pool);
  console.log("[migrate] Completato.");
  process.exit(0);
}

main().catch((e) => {
  console.error("[migrate] ERRORE:", e);
  process.exit(1);
});
