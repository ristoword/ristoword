// backend/src/dev-access/services/dev-access.service.js
//
// Owner Core DEV area: servizi di lettura/sicurezza/operatività.
// Tutto deve restare isolato sotto /dev-access.

const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const crypto = require("crypto");

const tenantContext = require("../../context/tenantContext");
const { safeReadJson } = require("../../utils/safeFileIO");

const licensesRepository = require("../../repositories/licenses.repository");
const usersRepository = require("../../repositories/users.repository");
const ordersRepository = require("../../repositories/orders.repository");
const paymentsRepository = require("../../repositories/payments.repository");
const inventoryRepository = require("../../repositories/inventory.repository");
const reportsRepository = require("../../repositories/reports.repository");
const closuresRepository = require("../../repositories/closures.repository");
const menuRepository = require("../../repositories/menu.repository");

const { getLicense, saveLicense } = require("../../config/license");
const storniRepository = require("../../repositories/storni.repository");

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const DATA_DIR = path.join(REPO_ROOT, "data");
const DEV_LOG_DIR = path.join(DATA_DIR, "dev-access");
const DEV_LOG_PATH = path.join(DEV_LOG_DIR, "dev-access-logs.json");

function isDevEnabled() {
  return String(process.env.DEV_OWNER_ENABLED || "").toLowerCase() === "true";
}

function sha256Hex(input) {
  return crypto.createHash("sha256").update(String(input || ""), "utf8").digest("hex");
}

function normalizeTenantId(v) {
  const id = v == null ? "" : String(v).trim();
  if (!id) return null;
  return id;
}

function getTenantDir(tenantId) {
  if (!tenantId) return path.join(DATA_DIR, "tenants", "default");
  return path.join(DATA_DIR, "tenants", String(tenantId));
}

async function probeJsonFile(filePath) {
  try {
    const exists = fs.existsSync(filePath);
    if (!exists) {
      return { exists: false, ok: false, error: "missing" };
    }
    const raw = await fsp.readFile(filePath, "utf8");
    if (!raw.trim()) {
      return { exists: true, ok: false, error: "empty" };
    }
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return { exists: true, ok: false, error: "json_parse_error" };
    }
    const keys =
      parsed && typeof parsed === "object"
        ? Array.isArray(parsed)
          ? ["<array>", "length=" + parsed.length]
          : Object.keys(parsed).slice(0, 8)
        : typeof parsed;
    return { exists: true, ok: true, keys };
  } catch (err) {
    return { exists: fs.existsSync(filePath), ok: false, error: err.message };
  }
}

async function readJsonArrayFile(filePath) {
  const fallback = [];
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
  const data = safeReadJson(filePath, fallback);
  return Array.isArray(data) ? data : fallback;
}

function withTenant(tenantId, fn) {
  const tid = tenantId ? String(tenantId) : tenantContext.DEFAULT_TENANT;
  return tenantContext.run(tid, () => Promise.resolve(fn()));
}

async function listTenants() {
  const tenantsDir = path.join(DATA_DIR, "tenants");
  try {
    const exists = fs.existsSync(tenantsDir);
    if (!exists) return ["default"];
    const ids = (await fsp.readdir(tenantsDir)).filter((x) => x && x.trim()).slice(0, 200);
    return ids.length ? ids : ["default"];
  } catch (_) {
    return ["default"];
  }
}

async function getTenantModulesConfig(tenantId) {
  // File opzionale solo per dev: “stato moduli” per diagnosticare toggling.
  const fp = path.join(getTenantDir(tenantId), "dev-modules.json");
  const raw = safeReadJson(fp, { modules: {} });
  if (!raw || typeof raw !== "object") return { modules: {} };
  return raw;
}

async function setTenantModulesConfig(tenantId, next) {
  const fp = path.join(getTenantDir(tenantId), "dev-modules.json");
  const dir = path.dirname(fp);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(fp, JSON.stringify(next || { modules: {} }, null, 2), "utf8");
}

function safeSlice(arr, n = 50) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, n);
}

async function appendDevLog(entry) {
  try {
    await fsp.mkdir(DEV_LOG_DIR, { recursive: true });
    const current = await readJsonArrayFile(DEV_LOG_PATH);
    current.push(entry);
    // keep last 500 entries
    const next = current.slice(-500);
    await fsp.writeFile(DEV_LOG_PATH, JSON.stringify(next, null, 2), "utf8");
  } catch (_) {
    // best-effort: dev tool, never break login
  }
}

async function listDevLogs(limit = 50) {
  try {
    const list = await readJsonArrayFile(DEV_LOG_PATH);
    return limit ? list.slice(-limit) : list;
  } catch (_) {
    return [];
  }
}

async function getFileProbesForTenant(tenantId) {
  const tid = tenantId || "default";
  const tDir = getTenantDir(tid);
  const files = [
    { key: "users.json (global)", fp: path.join(DATA_DIR, "users.json") },
    { key: "licenses.json (global)", fp: path.join(DATA_DIR, "licenses.json") },
    { key: "license.json (global)", fp: path.join(DATA_DIR, "license.json") },
    { key: "tenant/orders.json", fp: path.join(tDir, "orders.json") },
    { key: "tenant/payments.json", fp: path.join(tDir, "payments.json") },
    { key: "tenant/inventory.json", fp: path.join(tDir, "inventory.json") },
    { key: "tenant/reports.json", fp: path.join(tDir, "reports.json") },
    { key: "tenant/closures.json", fp: path.join(tDir, "closures.json") },
    { key: "tenant/storni.json", fp: path.join(tDir, "storni.json") },
    { key: "tenant/menu.json", fp: path.join(tDir, "menu.json") },
  ];

  const out = {};
  for (const f of files) {
    out[f.key] = await probeJsonFile(f.fp);
  }
  return out;
}

async function getSystemSnapshot({ tenantId = null } = {}) {
  const tid = tenantId || tenantContext.DEFAULT_TENANT;
  const now = new Date();
  const uptimeMs = process.uptime() * 1000;
  const uptimeStr = `${Math.floor(uptimeMs / 3600000)}h ${Math.floor((uptimeMs % 3600000) / 60000)}m`;

  let localLicense = null;
  try {
    localLicense = await getLicense();
  } catch (_) {}

  // Module checks: best-effort read
  const moduleChecks = {};
  async function check(name, fn) {
    try {
      await withTenant(tid, fn);
      moduleChecks[name] = { ok: true };
    } catch (err) {
      moduleChecks[name] = { ok: false, error: err && err.message ? err.message : String(err) };
    }
  }

  await check("orders", () => ordersRepository.getAllOrders());
  await check("inventory", () => inventoryRepository.getAll());
  await check("reports", () => reportsRepository.getAll());
  await check("closures", () => closuresRepository.ensureClosuresFile && closuresRepository.ensureClosuresFile());
  await check("storni", () => storniRepository.getTotalByDate && storniRepository.getTotalByDate(new Date().toISOString().slice(0, 10)));
  await check("menu", () => menuRepository.getActive());

  // License module (non tenant aware)
  try {
    const licenses = await licensesRepository.readLicenses();
    moduleChecks.license = { ok: true, licensesCount: Array.isArray(licenses) ? licenses.length : 0 };
  } catch (err) {
    moduleChecks.license = { ok: false, error: err.message };
  }

  // AI + checkout (env based)
  moduleChecks.ai = { ok: String(process.env.AI_ENABLED || "false").toLowerCase() === "true" };

  const stripeEnvKeys = Object.keys(process.env || {}).filter((k) => k.toUpperCase().includes("STRIPE"));
  moduleChecks.checkout = { ok: stripeEnvKeys.length > 0 };

  const fileProbes = await getFileProbesForTenant(tid);

  return {
    serverTime: now.toISOString(),
    uptime: uptimeStr,
    environment: process.env.NODE_ENV || "unknown",
    version: process.env.RISTOWORD_VERSION || "ristoword-dev",
    node: { version: process.version, platform: process.platform },
    modules: moduleChecks,
    localLicense,
    fileProbes,
    stripe: {
      stripeEnvKeys: safeSlice(stripeEnvKeys, 25),
      hasAnyStripeConfig: stripeEnvKeys.length > 0,
    },
    tenant: { tenantId: tid },
  };
}

async function getLicensesSnapshot({ tenantId = null } = {}) {
  const all = await licensesRepository.readLicenses();
  const list = Array.isArray(all) ? all : [];
  const tid = normalizeTenantId(tenantId);

  const filtered = tid ? list.filter((l) => String(l.restaurantId || "").trim() === String(tid)) : list;

  const decorated = filtered.map((r) => ({
    restaurantId: r.restaurantId,
    plan: r.plan || "",
    status: r.status || "active",
    source: r.source || "",
    activationCode: r.activationCode ? String(r.activationCode).slice(0, 4) + "-****" : null,
    activatedAt: r.activatedAt || null,
    expiresAt: r.expiresAt || null,
    createdAt: r.createdAt || null,
  }));

  return { licensesCount: decorated.length, licenses: decorated, totalLicenses: list.length };
}

async function getUsersSnapshot({ tenantId = null } = {}) {
  const all = await usersRepository.readUsers();
  const list = Array.isArray(all) ? all : [];
  const tid = normalizeTenantId(tenantId);
  const filtered = tid ? list.filter((u) => String(u.restaurantId || "").trim() === String(tid)) : list;

  return {
    usersCount: filtered.length,
    sample: filtered.slice(0, 50).map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      department: u.department,
      restaurantId: u.restaurantId,
      is_active: u.is_active !== false,
      mustChangePassword: u.mustChangePassword === true,
      hourlyRate: u.hourlyRate,
    })),
  };
}

async function getStripeStatus({ tenantId = null } = {}) {
  const tid = normalizeTenantId(tenantId) || tenantContext.DEFAULT_TENANT;
  const stripeEnvKeys = Object.keys(process.env || {}).filter((k) => k.toUpperCase().includes("STRIPE"));

  const keys = {};
  for (const k of stripeEnvKeys) {
    keys[k] = process.env[k] != null && String(process.env[k]).trim().length > 0 ? "present" : "missing";
  }

  // Local “comparison” – senza Stripe live non possiamo fare mismatch reale pagamenti.
  const localLic = await getLicensesSnapshot({ tenantId: tid });
  const tenantLic = localLic.licenses && localLic.licenses.length ? localLic.licenses[0] : null;
  const localStatus = tenantLic ? tenantLic.status : "none";

  const stripeConfigured = Object.values(keys).some((v) => v === "present");
  let mismatch = null;
  if (stripeConfigured && localStatus === "none") mismatch = "Stripe configurato ma licenza tenant non trovata";
  if (!stripeConfigured && localStatus !== "none" && localStatus !== "active") mismatch = "Licenze tenant presenti ma Stripe non configurato (checkout mismatch)";

  return {
    stripeEnvKeys: stripeEnvKeys.slice(0, 40),
    keys,
    stripeConfigured,
    localLicense: tenantLic,
    mismatch,
    stripePayments: null, // mock / non disponibile
  };
}

function orderStatusBuckets() {
  return {
    in_attesa: 0,
    in_preparazione: 0,
    pronto: 0,
    servito: 0,
    chiuso: 0,
    annullato: 0,
    altro: 0,
  };
}

async function getOperationsSnapshot({ tenantId = null } = {}) {
  const tid = normalizeTenantId(tenantId) || tenantContext.DEFAULT_TENANT;

  const orders = await withTenant(tid, () => ordersRepository.getAllOrders());
  const buckets = orderStatusBuckets();
  let totalClosedOrders = 0;
  let totalOrders = 0;

  for (const o of orders || []) {
    totalOrders += 1;
    const s = String(o.status || "").toLowerCase();
    if (s in buckets) buckets[s] += 1;
    else buckets.altro += 1;
    if (s === "chiuso") totalClosedOrders += 1;
  }

  // Payments summary (tenant)
  const payments = await withTenant(tid, () => paymentsRepository.listPayments({}));
  let paymentCount = 0;
  let paymentsGrandTotal = 0;
  for (const p of payments || []) {
    paymentCount += 1;
    paymentsGrandTotal += Number(p.total) || 0;
  }

  // “Module operational” (read only)
  const inventory = await withTenant(tid, () => inventoryRepository.getAll());
  const menuActive = await withTenant(tid, () => menuRepository.getActive());
  const reports = await withTenant(tid, () => reportsRepository.getAll());
  const closures = await withTenant(tid, () => closuresRepository.listClosures({}));

  return {
    tenantId: tid,
    orders: {
      total: totalOrders,
      buckets,
      closedOrders: totalClosedOrders,
    },
    payments: {
      count: paymentCount,
      gross: paymentsGrandTotal,
    },
    modules: {
      inventoryItems: Array.isArray(inventory) ? inventory.length : 0,
      menuActiveCount: Array.isArray(menuActive) ? menuActive.length : 0,
      reportsCount: Array.isArray(reports) ? reports.length : 0,
      closuresCount: Array.isArray(closures) ? closures.length : 0,
    },
    // cues for departments: derived from orders area (best effort)
    departments: {
      cucinaOrders: (orders || []).filter((o) => String(o.area || "").toLowerCase() === "cucina").length,
      salaOrders: (orders || []).filter((o) => String(o.area || "").toLowerCase() === "sala").length,
      cassaOrders: (orders || []).filter((o) => String(o.area || "").toLowerCase() === "cassa").length,
    },
  };
}

async function getBusinessSnapshot({ tenantId = null } = {}) {
  const tenants = await listTenants();
  const licenses = await licensesRepository.readLicenses();
  const listLic = Array.isArray(licenses) ? licenses : [];

  const byPlan = {};
  let totalActive = 0;
  let totalUsed = 0;
  let totalGrace = 0;

  for (const l of listLic) {
    const plan = l.plan || "starter";
    byPlan[plan] = (byPlan[plan] || 0) + 1;
    const st = l.status || "active";
    if (st === "used") totalUsed += 1;
    else if (st === "grace") totalGrace += 1;
    else totalActive += 1;
  }

  const conversion = totalUsed;

  const tid = normalizeTenantId(tenantId);
  // Optional: tenant-specific KPIs
  let tenantKPIs = null;
  try {
    const ops = await getOperationsSnapshot({ tenantId: tid || tenantContext.DEFAULT_TENANT });
    tenantKPIs = {
      ordersTotal: ops.orders.total,
      closedOrders: ops.orders.closedOrders,
      paymentsCount: ops.payments.count,
      paymentsGross: ops.payments.gross,
    };
  } catch (_) {}

  return {
    tenantsCount: tenants.length,
    clients: {
      active: totalActive + totalGrace,
      trial: totalGrace,
      used: totalUsed,
      conversionBase: conversion,
    },
    licensesByPlan: byPlan,
    modulesActiveBase: {
      tenantsWithOrders: tenants.length, // best-effort placeholder
      tenantsWithMenu: tenants.length,
    },
    tenantKPIs,
  };
}

async function listTenantsForUi() {
  const ids = await listTenants();
  return { tenants: ids };
}

async function performActionUnlockUser({ userId, username, tenantId }) {
  const tid = normalizeTenantId(tenantId);
  const users = await usersRepository.readUsers();
  const list = Array.isArray(users) ? users : [];
  let target = null;
  if (userId) target = list.find((u) => String(u.id) === String(userId));
  if (!target && username) target = list.find((u) => String(u.username).toLowerCase() === String(username).toLowerCase());
  if (!target) return { ok: false, error: "utente_non_trovato" };
  if (tid && String(target.restaurantId || "").trim() !== String(tid)) return { ok: false, error: "tenant_mismatch" };
  const updated = await usersRepository.updateUser(target.id, { is_active: true });
  return { ok: !!updated, updated: updated || null };
}

async function performActionResetLicense({ tenantId }) {
  const tid = normalizeTenantId(tenantId);
  if (!tid) return { ok: false, error: "tenantId_obbligatorio" };
  // “Reset activation” => status back to active + remove usage timestamp fields if present.
  const all = await licensesRepository.readLicenses();
  const list = Array.isArray(all) ? all : [];
  const record = list.find((r) => String(r.restaurantId || "").trim() === String(tid));
  if (!record) {
    return { ok: false, error: "license_record_non_trovato" };
  }
  const next = await licensesRepository.updateLicense({
    restaurantId: tid,
    status: "active",
    activatedAt: null,
  });
  return { ok: !!next, updated: next };
}

async function performActionForceActivate({ tenantId, plan }) {
  const tid = normalizeTenantId(tenantId);
  if (!tid) return { ok: false, error: "tenantId_obbligatorio" };

  const all = await licensesRepository.readLicenses();
  const list = Array.isArray(all) ? all : [];
  let record = list.find((r) => String(r.restaurantId || "").trim() === String(tid));

  if (!record) {
    record = licensesRepository.create({
      restaurantId: tid,
      plan: plan || "ristoword_pro",
      status: "used",
      source: "dev-force-activate",
    });
  } else {
    record = licensesRepository.updateLicense({
      restaurantId: tid,
      status: "used",
      activatedAt: new Date().toISOString(),
      plan: plan || record.plan || "ristoword_pro",
      source: record.source || "dev-force-activate",
    });
  }

  return { ok: true, updated: record };
}

async function performActionClearTemp({ tenantId }) {
  const tid = normalizeTenantId(tenantId);
  if (!tid) return { ok: false, error: "tenantId_obbligatorio" };
  const fp = path.join(getTenantDir(tid), "dev-modules.json");
  try {
    await fsp.unlink(fp);
  } catch (_) {}
  return { ok: true };
}

async function performActionToggleModule({ tenantId, moduleName, enabled }) {
  const tid = normalizeTenantId(tenantId);
  if (!tid) return { ok: false, error: "tenantId_obbligatorio" };
  const name = String(moduleName || "").trim();
  if (!name) return { ok: false, error: "moduleName_obbligatorio" };

  const cfg = await getTenantModulesConfig(tid);
  const modules = cfg.modules || {};
  modules[name] = !!enabled;
  const next = { modules };
  await setTenantModulesConfig(tid, next);
  return { ok: true, modules: next.modules };
}

async function performActionExtendTrial({ tenantId, days = 30 }) {
  // Trial nel progetto sembra essere legato al file globale license.json (non per-tenant).
  // Nel DEV, estendiamo la scadenza globale per sbloccare rapidamente i flussi bloccati.
  const d = Number(days) || 30;
  const current = await getLicense();
  const now = Date.now();
  const baseExp = current && current.expiresAt ? new Date(current.expiresAt).getTime() : now;
  const nextExp = new Date(Math.max(baseExp, now) + d * 24 * 60 * 60 * 1000).toISOString();
  const updated = await saveLicense({ expiresAt: nextExp });
  return { ok: true, updated };
}

module.exports = {
  isDevEnabled,
  withTenant,
  listTenants,
  listTenantsForUi,
  getSystemSnapshot,
  getLicensesSnapshot,
  getUsersSnapshot,
  getStripeStatus,
  getOperationsSnapshot,
  getBusinessSnapshot,
  listDevLogs,
  appendDevLog,
  sha256Hex,
  performActionUnlockUser,
  performActionResetLicense,
  performActionForceActivate,
  performActionExtendTrial,
  performActionClearTemp,
  performActionToggleModule,
};

