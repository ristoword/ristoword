const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const tenantContext = require("../../context/tenantContext");
const paths = require("../../config/paths");
const { safeReadJson } = require("../../utils/safeFileIO");

const usersRepository = require("../../repositories/users.repository");
const licensesRepository = require("../../repositories/licenses.repository");
const sessionsRepository = require("../../repositories/sessions.repository");
const paymentsRepository = require("../../repositories/payments.repository");
const stripeMockRepository = require("../../stripe/stripeMock.repository");

const maintenanceService = require("../system/maintenance.service");
const superAdminRepository = require("./super-admin.repository");
const gsCodesMirror = require("../../repositories/gsCodesMirror.repository");
const { pushCodesBatchToGs } = require("../../service/gsMasterSync.service");
const bcrypt = require("bcrypt");

const BCRYPT_USER_ROUNDS = 10;

function normalizeTenantId(id) {
  const rid = id == null ? "" : String(id).trim();
  return rid || null;
}

function nowIso() {
  return new Date().toISOString();
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function createActivationCode(prefix = "SA") {
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

function computeSubscriptionBucket(plan) {
  const p = String(plan || "").toLowerCase();
  if (p.includes("annual") || p.includes("annuale")) return "annual";
  if (p.includes("monthly") || p.includes("mensile")) return "monthly";
  return "unknown";
}

function computeLicenseCounts(licenses) {
  const now = Date.now();
  const list = Array.isArray(licenses) ? licenses : [];

  let active = 0;
  let expired = 0;
  let used = 0;
  let trialLike = 0;

  for (const l of list) {
    const status = String(l.status || "active").toLowerCase();
    const exp = l.expiresAt ? new Date(l.expiresAt).getTime() : null;
    const isExpired = status === "expired" || (Number.isFinite(exp) && exp <= now);

    if (isExpired) {
      expired += 1;
      continue;
    }
    if (status === "used") {
      used += 1;
      active += 1;
    } else if (status === "active" || status === "grace") {
      active += 1;
    } else {
      // other states are ignored for counting
    }
    // Trial doesn't really exist in licenses.json in current project; kept for dashboard compatibility.
    if (String(l.plan || "").toLowerCase().includes("trial")) trialLike += 1;
  }

  return { active, expired, used, trialLike, total: list.length };
}

function upsertTenantLicenseFile({ tenantId, licenseRecord }) {
  const rid = normalizeTenantId(tenantId);
  if (!rid) return null;
  const tenantLicensePath = paths.tenantDataPath(rid, "license.json");
  const payload = {
    restaurantId: rid,
    plan: licenseRecord.plan || "",
    status: licenseRecord.status || "active",
    activationCode: licenseRecord.activationCode || null,
    expiresAt: licenseRecord.expiresAt || null,
    // optional fields for debugging / future UI
    source: licenseRecord.source || "",
    activatedAt: licenseRecord.activatedAt || null,
    updatedAt: licenseRecord.updatedAt || nowIso(),
  };
  const dir = path.dirname(tenantLicensePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tenantLicensePath, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

function getAllTenants() {
  const base = path.join(paths.DATA, "tenants");
  try {
    if (!fs.existsSync(base)) return ["default"];
    const ids = fs.readdirSync(base).filter((x) => x && x.trim());
    return ids.length ? ids : ["default"];
  } catch (_) {
    return ["default"];
  }
}

async function listStripeSessionsSummary() {
  const state = stripeMockRepository.readState();
  const sessions = Array.isArray(state.sessions) ? state.sessions : [];

  const byStatus = { paid: 0, failed: 0, created: 0 };
  const trials = { active: 0, paid: 0, created: 0, failed: 0 };
  const subscriptions = { monthly: 0, annual: 0, unknown: 0 };

  for (const s of sessions) {
    const status = String(s.status || "created").toLowerCase();
    if (status in byStatus) byStatus[status] += 1;
    else byStatus.created += 1;

    const mode = String(s.mode || "").toLowerCase();
    if (mode === "trial") {
      trials.created += status === "created" ? 1 : 0;
      trials.paid += status === "paid" ? 1 : 0;
      trials.failed += status === "failed" ? 1 : 0;
      // Treat trial "active" if created/paid (webhook processing may not complete yet)
      if (status === "created" || status === "paid") trials.active += 1;
    } else {
      const bucket = computeSubscriptionBucket(s.plan);
      if (bucket in subscriptions) subscriptions[bucket] += 1;
      else subscriptions.unknown += 1;
    }
  }

  const unprocessedEvents = stripeMockRepository.listUnprocessedEvents(state);
  return {
    sessionsTotal: sessions.length,
    byStatus,
    trials,
    subscriptions,
    stripeMock: {
      pendingEvents: unprocessedEvents.length,
      lastProcessedEventId: state.webhook?.lastProcessedEventId || null,
      lastProcessedAt: state.webhook?.lastProcessedAt || null,
      processedCount: state.webhook?.processedCount || 0,
      eventsTotal: Array.isArray(state.events) ? state.events.length : 0,
    },
    sessionsSample: sessions
      .slice()
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 50)
      .map((s) => ({
        id: s.id,
        restaurantId: s.restaurantId,
        plan: s.plan || "",
        mode: s.mode || "subscription",
        status: s.status || "created",
        createdAt: s.createdAt || null,
        paidAt: s.paidAt || null,
        failedAt: s.failedAt || null,
      })),
    unprocessedEventsSample: unprocessedEvents
      .slice()
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 30),
  };
}

async function listCrossTenantCustomers({ q } = {}) {
  const query = String(q || "").trim().toLowerCase();
  const tenants = getAllTenants();
  const out = [];

  for (const tid of tenants) {
    const filePath = paths.tenantDataPath(tid, "customers.json");
    const list = safeReadJson(filePath, []);
    const customers = Array.isArray(list) ? list : [];

    for (const c of customers) {
      if (query) {
        const full = `${c.name || ""} ${c.surname || ""}`.toLowerCase();
        const phone = String(c.phone || "");
        const email = String(c.email || "");
        const nat = String(c.nationality || c.nazione || "");
        const vat = String(c.vat || c.partitaIva || "");
        if (
          !full.includes(query) &&
          !phone.includes(query) &&
          !email.includes(query) &&
          !nat.includes(query) &&
          !vat.includes(query)
        ) {
          continue;
        }
      }
      out.push({
        restaurantId: tid,
        id: c.id,
        name: c.name || "",
        surname: c.surname || "",
        phone: c.phone || "",
        email: c.email || "",
        nationality: c.nationality || c.nazione || "",
        vat: c.vat || c.partitaIva || c.piva || c.partita_iva || "",
        fiscalCode: c.fiscalCode || c.codiceFiscale || c.cf || "",
        address: c.address || c.indirizzo || "",
        category: c.category || "normal",
        notes: c.notes || "",
        createdAt: c.createdAt || null,
        updatedAt: c.updatedAt || null,
      });
    }
  }

  // Simple sort: newest first if updatedAt exists.
  out.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
  return out.slice(0, 300);
}

async function listCrossTenantPaymentsSummary() {
  const tenants = getAllTenants();
  let totalPayments = 0;
  let succeeded = 0;
  let failed = 0;
  let gross = 0;

  for (const tid of tenants) {
    // paymentsRepository is tenant-aware
    const tenantSummary = await tenantContext.run(tid, async () => {
      const payments = await paymentsRepository.listPayments({});
      const list = Array.isArray(payments) ? payments : [];
      let localCount = 0;
      let localSucceeded = 0;
      let localFailed = 0;
      let localGross = 0;
      for (const p of list) {
        localCount += 1;
        localGross += Number(p.total) || 0;
        const status = String(p.paymentStatus || p.status || "closed").toLowerCase();
        if (status.includes("failed")) localFailed += 1;
        else localSucceeded += 1;
      }
      return { localCount, localSucceeded, localFailed, localGross };
    });

    totalPayments += tenantSummary.localCount;
    succeeded += tenantSummary.localSucceeded;
    failed += tenantSummary.localFailed;
    gross += tenantSummary.localGross;
  }

  return { totalPayments, succeeded, failed, gross };
}

async function listAllUsersSummary() {
  const users = await usersRepository.readUsers();
  const list = Array.isArray(users) ? users : [];
  return {
    usersCount: list.length,
    users: list.slice(0, 400).map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      department: u.department,
      restaurantId: u.restaurantId || null,
      is_active: u.is_active !== false,
      mustChangePassword: u.mustChangePassword === true,
    })),
  };
}

async function listAllLicensesDecorated() {
  const all = await licensesRepository.readLicenses();
  const list = Array.isArray(all) ? all : [];
  const byId = new Map(list.map((l) => [String(l.restaurantId || "").trim(), l]));

  // Include tenants that have data/tenants/{id}/license.json but no row in global licenses.json
  const tenantIds = getAllTenants();
  for (const tid of tenantIds) {
    const rid = String(tid || "").trim();
    if (!rid || byId.has(rid)) continue;
    const fp = paths.tenantDataPath(rid, "license.json");
    if (!fs.existsSync(fp)) continue;
    const raw = safeReadJson(fp, null);
    if (!raw || typeof raw !== "object") continue;
    const fileRid = String(raw.restaurantId || rid).trim();
    if (byId.has(fileRid)) continue;
    byId.set(fileRid, {
      restaurantId: fileRid,
      plan: raw.plan || "",
      status: raw.status || "active",
      activationCode: raw.activationCode || null,
      suspicious: !!raw.suspicious,
      suspiciousReason: raw.suspiciousReason || null,
      expiresAt: raw.expiresAt || null,
      activatedAt: raw.activatedAt || null,
      createdAt: raw.createdAt || null,
      updatedAt: raw.updatedAt || null,
      source: raw.source || "tenant_license.json",
      onlyInTenantFile: true,
    });
  }

  return Array.from(byId.values())
    .map((l) => ({
      restaurantId: l.restaurantId,
      plan: l.plan || "",
      status: l.status || "active",
      // Super-admin API only: full activation code (no masking)
      activationCode: l.activationCode != null && l.activationCode !== "" ? String(l.activationCode) : null,
      suspicious: !!l.suspicious,
      suspiciousReason: l.suspiciousReason || null,
      expiresAt: l.expiresAt || null,
      activatedAt: l.activatedAt || null,
      createdAt: l.createdAt || null,
      updatedAt: l.updatedAt || null,
      source: l.source || "",
      onlyInTenantFile: !!l.onlyInTenantFile,
      revokedAt: l.revokedAt || null,
    }))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
}

async function getSystemStatusForAdmin() {
  const maintenanceEnabled = await maintenanceService.isMaintenanceEnabled();

  const stripeKeys = [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_RISTOWORD_MONTHLY",
    "STRIPE_PRICE_RISTOWORD_ANNUAL",
  ];
  const stripePresence = {};
  for (const k of stripeKeys) {
    const v = process.env[k];
    stripePresence[k] = !!(v && String(v).trim().length > 0);
  }

  const masked = superAdminRepository.listStripeMaskedConfig((await superAdminRepository.getStripeConfig()) || {});

  const stripeSessions = await listStripeSessionsSummary();
  const paymentsSummary = await listCrossTenantPaymentsSummary();

  const licenses = await licensesRepository.readLicenses();
  const licenseCounts = computeLicenseCounts(licenses);

  const customers = await listCrossTenantCustomers({});
  const supportNotesRaw = safeReadJson(path.join(paths.DATA, "super-admin", "support-notes.json"), { notes: [] });
  const supportNotes = Array.isArray(supportNotesRaw.notes) ? supportNotesRaw.notes : [];

  return {
    ok: true,
    server: {
      serverTime: nowIso(),
      uptimeSeconds: Math.floor(process.uptime()),
      version: process.env.RISTOWORD_VERSION || "ristoword-dev",
    },
    maintenance: {
      enabled: maintenanceEnabled,
    },
    stripe: {
      keysPresence: stripePresence,
      masked,
      stripeMock: stripeSessions.stripeMock,
    },
    kpis: {
      customersCount: customers.length,
      licensesActive: licenseCounts.active,
      licensesExpired: licenseCounts.expired,
      trialActive: stripeSessions.trials.active,
      paymentsSucceeded: stripeSessions.byStatus.paid,
      paymentsFailed: stripeSessions.byStatus.failed,
      subscriptionsMonthly: stripeSessions.subscriptions.monthly,
      subscriptionsAnnual: stripeSessions.subscriptions.annual,
      supportOpen: supportNotes.length,
    },
    // For dashboard tables
    tables: {
      paymentsSummary,
      supportNotesSample: supportNotes
        .slice()
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, 30),
    },
  };
}

async function apiUpdateStripeConfig({ values } = {}) {
  const allowedKeys = [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_RISTOWORD_MONTHLY",
    "STRIPE_PRICE_RISTOWORD_ANNUAL",
  ];
  const input = values && typeof values === "object" ? values : {};
  const next = {};
  for (const k of allowedKeys) {
    if (input[k] !== undefined) next[k] = String(input[k] || "").trim();
  }
  await superAdminRepository.setStripeConfig(next);
  const stripeConfig = await superAdminRepository.getStripeConfig();
  return {
    ok: true,
    masked: superAdminRepository.listStripeMaskedConfig(stripeConfig),
  };
}

async function apiLogin({ username, password }) {
  const check = await superAdminRepository.verifyLogin({ username, password });
  if (!check.ok) return check;

  const session = await superAdminRepository.createSessionToken({ username: username });
  return {
    ok: true,
    mustChangePassword: check.mustChangePassword,
    token: session.token,
    expiresAt: session.expiresAt,
  };
}

async function apiChangePassword({ token, newPassword }) {
  const session = await superAdminRepository.verifySessionToken(token);
  if (!session) return { ok: false, error: "non_autorizzato" };
  const result = await superAdminRepository.setNewPassword(newPassword);
  return result;
}

async function apiLogout({ token }) {
  const ok = await superAdminRepository.deleteSessionToken(token);
  return { ok: true, deleted: ok };
}

async function apiToggleMaintenance({ enabled }) {
  const next = await maintenanceService.setMaintenanceEnabled(enabled === true);
  return { ok: true, enabled: !!next.enabled, updatedAt: next.updatedAt };
}

async function apiCreateTempLicense({ restaurantId, plan, mode, expiresAt, extendDays, activateImmediately, note }) {
  const rid = normalizeTenantId(restaurantId);
  if (!rid) return { ok: false, error: "restaurantId_obbligatorio" };

  const type = String(mode || "emergency").toLowerCase();
  const activate = activateImmediately === true || type === "emergency";

  const baseExpIso = expiresAt ? new Date(expiresAt).toISOString() : null;
  const days = toNumber(extendDays, type === "trial" ? 7 : 30);
  const now = Date.now();
  let computedExpiresAt = baseExpIso;

  // If extending, use existing expiresAt as base.
  const existing = (await licensesRepository.readLicenses()).find((l) => String(l.restaurantId) === String(rid));
  if (extendDays != null && extendDays !== "") {
    const currentExp = existing?.expiresAt ? new Date(existing.expiresAt).getTime() : now;
    computedExpiresAt = new Date(Math.max(currentExp, now) + days * 24 * 60 * 60 * 1000).toISOString();
  } else if (!computedExpiresAt) {
    computedExpiresAt = new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
  }

  const activationCode = existing?.activationCode || createActivationCode("SA");
  const status = activate ? "used" : "active";
  const nowIsoStr = nowIso();

  const payload = {
    restaurantId: rid,
    plan: plan || existing?.plan || "ristoword_pro",
    activationCode,
    expiresAt: computedExpiresAt,
    status,
    // used => granted to owner immediately
    ...(status === "used" ? { activatedAt: nowIsoStr } : { activatedAt: null }),
    source: `super-admin:${type}`,
    updatedAt: nowIsoStr,
  };

  let updated = null;
  if (existing) {
    updated = licensesRepository.updateLicense(payload);
    // updateLicense returns merged record
  } else {
    updated = licensesRepository.create(payload);
  }

  upsertTenantLicenseFile({ tenantId: rid, licenseRecord: updated || payload });

  if (note) {
    await superAdminRepository.appendSupportNote({
      restaurantId: rid,
      createdBy: "super-admin",
      note,
    });
  }

  return { ok: true, updated: updated || payload };
}

async function apiLicenseMarkTrusted({ restaurantId }) {
  const rid = normalizeTenantId(restaurantId);
  if (!rid) return { ok: false, error: "restaurantId_obbligatorio" };

  const all = await licensesRepository.readLicenses();
  const existing = (Array.isArray(all) ? all : []).find((l) => String(l.restaurantId) === String(rid));
  if (!existing) return { ok: false, error: "license_record_non_trovato" };

  const now = nowIso();
  const payload = {
    restaurantId: rid,
    suspicious: false,
    suspiciousReason: null,
    source: "super-admin:trusted",
    updatedAt: now,
  };

  const updated = licensesRepository.updateLicense({ ...existing, ...payload });
  if (updated) upsertTenantLicenseFile({ tenantId: rid, licenseRecord: updated });

  return { ok: true, updated };
}

async function apiRevokeLicense({ restaurantId, reason, suspicious }) {
  const rid = normalizeTenantId(restaurantId);
  if (!rid) return { ok: false, error: "restaurantId_obbligatorio" };

  const all = await licensesRepository.readLicenses();
  const existing = (Array.isArray(all) ? all : []).find((l) => String(l.restaurantId) === String(rid));
  if (!existing) return { ok: false, error: "license_record_non_trovato" };

  const now = nowIso();
  const nextStatus = "active"; // owner access depends on "used"

  const payload = {
    restaurantId: rid,
    status: nextStatus,
    activatedAt: null,
    suspicious: !!suspicious,
    suspiciousReason: reason ? String(reason).slice(0, 500) : existing.suspiciousReason || null,
    source: suspicious ? "super-admin:suspicious" : "super-admin:revoke",
    revokedAt: now,
    updatedAt: now,
  };

  const updated = licensesRepository.updateLicense(payload);
  if (updated) upsertTenantLicenseFile({ tenantId: rid, licenseRecord: updated });

  return { ok: true, updated };
}

async function apiBlockCustomer({ restaurantId }) {
  const rid = normalizeTenantId(restaurantId);
  if (!rid) return { ok: false, error: "restaurantId_obbligatorio" };
  const users = await usersRepository.readUsers();
  const list = Array.isArray(users) ? users : [];
  const next = list.map((u) => {
    if (String(u.restaurantId || "").trim() === rid) return { ...u, is_active: false };
    return u;
  });
  await usersRepository.writeUsers(next);
  return { ok: true };
}

async function apiUnblockCustomer({ restaurantId }) {
  const rid = normalizeTenantId(restaurantId);
  if (!rid) return { ok: false, error: "restaurantId_obbligatorio" };
  const users = await usersRepository.readUsers();
  const list = Array.isArray(users) ? users : [];
  const next = list.map((u) => {
    if (String(u.restaurantId || "").trim() === rid) return { ...u, is_active: true };
    return u;
  });
  await usersRepository.writeUsers(next);
  return { ok: true };
}

async function apiForceLogoutCustomer({ restaurantId }) {
  const rid = normalizeTenantId(restaurantId);
  if (!rid) return { ok: false, error: "restaurantId_obbligatorio" };

  const activeSessions = await tenantContext.run(rid, async () => {
    const list = await sessionsRepository.getActiveSessions();
    return Array.isArray(list) ? list : [];
  });

  let count = 0;
  for (const s of activeSessions) {
    await tenantContext.run(rid, async () => {
      if (s?.id) {
        await sessionsRepository.endSession(s.id);
        count += 1;
      }
    });
  }

  return { ok: true, forced: count };
}

async function apiGetCustomers({ q } = {}) {
  const customers = await listCrossTenantCustomers({ q });
  const users = await listAllUsersSummary();
  return { ok: true, customers, users };
}

async function apiGetLicenses() {
  const licenses = await listAllLicensesDecorated();
  return { ok: true, licenses };
}

async function apiGetPayments() {
  const stripeSessions = await listStripeSessionsSummary();
  const paymentsSummary = await listCrossTenantPaymentsSummary();
  // Also include last Stripe mock status from file.
  return {
    ok: true,
    stripe: stripeSessions,
    paymentsSummary,
  };
}

function randomPlainPassword(len = 18) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!#%&*";
  const n = Math.min(Math.max(parseInt(len, 10) || 18, 12), 64);
  const buf = crypto.randomBytes(n);
  let s = "";
  for (let i = 0; i < n; i += 1) s += chars[buf[i] % chars.length];
  return s;
}

function sanitizeUserForConsole(u) {
  if (!u || typeof u !== "object") return null;
  const { password: _pw, ...rest } = u;
  return rest;
}

async function apiGetGsMirrorConsole() {
  const state = gsCodesMirror.readState();
  const stats = gsCodesMirror.computeStats();
  const codes = (state.codes || []).slice().sort((a, b) => {
    const ta = new Date(b.rwSyncedAt || b.activatedAt || 0).getTime();
    const tb = new Date(a.rwSyncedAt || a.activatedAt || 0).getTime();
    return ta - tb;
  });
  return {
    ok: true,
    stats,
    importedAt: state.importedAt,
    lastSyncFromGsAt: state.lastSyncFromGsAt,
    lastNotifyToGsAt: state.lastNotifyToGsAt,
    codes,
  };
}

async function apiPostGenerateGsCodes({ count }) {
  const n = Number(count);
  if (!Number.isFinite(n) || n < 1 || n > 25) {
    return { ok: false, error: "count_invalido", message: "Usa un numero tra 1 e 25" };
  }
  const { added, count: gen } = gsCodesMirror.generateLocalCodes(Math.floor(n));
  let gsSync = null;
  try {
    gsSync = await pushCodesBatchToGs(added);
  } catch (e) {
    gsSync = { ok: false, error: e && e.message ? e.message : String(e) };
  }
  return {
    ok: true,
    generated: gen,
    codes: added,
    stats: gsCodesMirror.computeStats(),
    gsSync,
  };
}

async function apiGetConsoleContacts() {
  const contacts = await superAdminRepository.listConsoleContacts();
  return { ok: true, contacts };
}

async function apiPostConsoleContact(body = {}) {
  return superAdminRepository.appendConsoleContact({
    email: body.email,
    category: body.category,
    note: body.note,
  });
}

async function apiGetConsoleUsers() {
  const users = await usersRepository.readUsers();
  const list = Array.isArray(users) ? users : [];
  const safe = list.map((u) => sanitizeUserForConsole(u)).filter(Boolean);
  return { ok: true, users: safe };
}

async function apiPostResetUserPassword({ userId, forceMustChange } = {}) {
  const id = String(userId || "").trim();
  if (!id) return { ok: false, error: "userId_obbligatorio" };
  const user = await usersRepository.findById(id);
  if (!user) return { ok: false, error: "utente_non_trovato" };
  const plain = randomPlainPassword(18);
  const hash = await bcrypt.hash(plain, BCRYPT_USER_ROUNDS);
  const mustChange = forceMustChange !== false;
  await usersRepository.setUserPassword(id, hash, { mustChangePassword: mustChange });
  return {
    ok: true,
    userId: id,
    username: user.username,
    temporaryPassword: plain,
    mustChangePassword: mustChange,
  };
}

module.exports = {
  // Dashboard data
  getSystemStatusForAdmin,
  apiGetCustomers,
  apiGetLicenses,
  apiGetPayments,
  apiUpdateStripeConfig,

  // Auth
  apiLogin,
  apiChangePassword,
  apiLogout,

  // Maintenance
  apiToggleMaintenance,

  // Actions
  apiCreateTempLicense,
  apiLicenseMarkTrusted,
  apiRevokeLicense,
  apiBlockCustomer,
  apiUnblockCustomer,
  apiForceLogoutCustomer,

  // Console avanzata (codici mirror, contatti, utenti)
  apiGetGsMirrorConsole,
  apiPostGenerateGsCodes,
  apiGetConsoleContacts,
  apiPostConsoleContact,
  apiGetConsoleUsers,
  apiPostResetUserPassword,
};

