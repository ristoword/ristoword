// Carica backend/.env in modo affidabile (cwd, monorepo, path con spazi).
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

/** Evita doppio caricamento quando server.js e env.js chiamano loadEnv(). */
let loadEnvDone = false;
let loadEnvResultPath = null;

/**
 * Risolve la cartella `backend/` (dove deve stare `.env`).
 * Questo file è in `backend/src/config/loadEnv.js`.
 */
function getBackendRoot() {
  return path.resolve(path.join(__dirname, "..", ".."));
}

/**
 * Prova più percorsi e carica il primo `.env` esistente.
 * @returns {string|null} path caricato o null
 */
function loadEnv() {
  if (loadEnvDone) return loadEnvResultPath;
  loadEnvDone = true;

  const backendRoot = getBackendRoot();
  const candidates = [
    path.join(backendRoot, ".env"),
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "backend", ".env"),
    // se cwd è già backend/
    path.join(process.cwd(), "..", ".env"),
  ];

  const tried = [];
  for (const p of candidates) {
    const abs = path.resolve(p);
    if (tried.includes(abs)) continue;
    tried.push(abs);
    try {
      if (fs.existsSync(abs)) {
        const r = dotenv.config({ path: abs });
        if (!r.error) {
          if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console
            console.info("[ENV] Caricato:", abs);
          }
          loadEnvResultPath = abs;
          return loadEnvResultPath;
        }
      }
    } catch (_) {
      /* continua */
    }
  }

  dotenv.config();
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(
      "[ENV] Nessun file .env trovato nei percorsi noti. Cerca backend/.env con SUPER_ADMIN_USERNAME e SUPER_ADMIN_PASSWORD."
    );
  }
  loadEnvResultPath = null;
  return loadEnvResultPath;
}

module.exports = { loadEnv, getBackendRoot };
