// backend/src/server.js
// Route registration is in ./app.js (orders, menu, reports, ai, recipes, tenant middleware, etc.)
require("./config/loadEnv").loadEnv();

/**
 * Hardening minimo (blocco 1): solo warning, nessuna modifica alla logica applicativa.
 * SESSION_SECRET resta obbligatorio per express-session (vedi config/session.js).
 */
function printStartupSecurityHints() {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn("[WARN] NODE_ENV non impostato su production");
  }

  const rawSecret = process.env.SESSION_SECRET;
  const sec = rawSecret != null ? String(rawSecret).trim() : "";
  if (!sec || sec.length < 20) {
    // eslint-disable-next-line no-console
    console.warn("[SECURITY] SESSION_SECRET mancante o troppo corto (< 20 caratteri)");
  }

  const base =
    (process.env.PUBLIC_APP_URL && String(process.env.PUBLIC_APP_URL).trim()) ||
    (process.env.BASE_URL && String(process.env.BASE_URL).trim()) ||
    (process.env.APP_URL && String(process.env.APP_URL).trim());
  if (!base) {
    // eslint-disable-next-line no-console
    console.warn("[CONFIG] PUBLIC_APP_URL mancante (definire anche BASE_URL o APP_URL se preferisci)");
  }
}

printStartupSecurityHints();

// Centralized configuration validation (env, secrets, optional integrations).
// This runs before loading the main app/session modules so that configuration
// errors are reported clearly and early.
try {
  const { validateConfig } = require("./config/validateConfig");
  validateConfig();
} catch (err) {
  // Fail fast with a clear, human‑readable message.
  // Never log secret values.
  // eslint-disable-next-line no-console
  console.error(err && err.message ? err.message : err);
  throw err;
}

const http = require("http");
const app = require("./app");
const sessionMiddleware = require("./config/session");
const { initWebSocket } = require("./service/websocket.service");
const logger = require("./utils/logger");
const { startAutoBackup, backupNow } = require("./utils/backup");

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
initWebSocket(server, sessionMiddleware);

async function maybeHydrateTenantJsonFromMysql() {
  try {
    const { isMysqlPrimary } = require("./utils/mysqlPrimary");
    if (!isMysqlPrimary()) return;
    const { hydrateTenantFilesFromMysql } = require("./utils/tenantJsonMysqlBridge");
    await hydrateTenantFilesFromMysql();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[mysql] hydrate tenant JSON (non bloccante):", e && e.message ? e.message : e);
  }
}

maybeHydrateTenantJsonFromMysql().then(() => {
  server.listen(PORT, () => {
    const mode = process.env.NODE_ENV === "production" ? "production" : "dev";
    const baseUrl =
      (process.env.PUBLIC_APP_URL && String(process.env.PUBLIC_APP_URL).trim()) ||
      (process.env.BASE_URL && String(process.env.BASE_URL).trim()) ||
      (process.env.APP_URL && String(process.env.APP_URL).trim()) ||
      "(non impostato)";
    // eslint-disable-next-line no-console
    console.log("RUNNING ON PORT:", PORT);
    // eslint-disable-next-line no-console
    console.log("[Ristoword] MODE:", mode);
    // eslint-disable-next-line no-console
    console.log("[Ristoword] PORT:", PORT);
    // eslint-disable-next-line no-console
    console.log("[Ristoword] BASE_URL:", baseUrl);
    // eslint-disable-next-line no-console
    console.log("[Ristoword] SECURITY: basic checks done");
    logger.info("Server started", { port: PORT, websocket: "/ws" });

    // BACKUP IMMEDIATO + AUTO
    backupNow();
    startAutoBackup();
  });
});