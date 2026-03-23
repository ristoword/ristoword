const db = require("../config/db");
const { getRestaurantIdFromNumericTenantId } = require("../config/tenantNumericMap");

/**
 * Richiede header x-license-key per le API /api (eccetto percorsi di bootstrap).
 * - Licenza attiva e non scaduta (expires_at NULL o futura).
 * - Se l’utente ha già sessione autenticata, consente l’accesso senza header (compatibilità UI esistente).
 * Nota: la chiave nel browser non è “segreta”; per SaaS stretto usare token server-side o binding dominio/IP.
 */
function shouldSkipLicensePath(p) {
  const pathname = String(p || "").split("?")[0];
  const prefixes = [
    "/auth",
    "/system/health",
    "/health",
    "/setup",
    "/stripe/webhook",
    "/stripe",
    "/menu/active",
    "/qr/orders",
    "/owner/complete-activation",
    "/owner/gs-import-codes",
    "/owner/gs-mirror-stats",
    "/checkout",
    "/licenses",
    "/license",
    "/super-admin",
  ];
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function apiPathAfterPrefix(req) {
  const u = (req.originalUrl || req.url || "").split("?")[0];
  if (u === "/api" || u === "/api/") return "/";
  if (u.startsWith("/api/")) return u.slice(4);
  return u;
}

async function licenseMiddleware(req, res, next) {
  if (req.method === "OPTIONS") return next();

  const p = apiPathAfterPrefix(req);
  if (shouldSkipLicensePath(p)) return next();

  if (req.devOwner === true) return next();

  if (req.session && req.session.user) {
    return next();
  }

  try {
    const code = req.headers["x-license-key"];

    if (!code) {
      return res.status(401).json({ error: "Licenza mancante" });
    }

    const [rows] = await db.query(
      `
      SELECT * FROM licenses
      WHERE code = ?
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > NOW())
      `,
      [code]
    );

    if (!rows || rows.length === 0) {
      return res.status(403).json({ error: "Licenza non valida o scaduta" });
    }

    const row = rows[0];
    req.license = row;
    req.tenantId = row.tenant_id;

    const mapped = getRestaurantIdFromNumericTenantId(row.tenant_id);
    if (mapped) {
      req.licenseRestaurantId = mapped;
    }

    next();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("LICENSE ERROR:", err);
    res.status(500).json({ error: "Errore licenza" });
  }
}

module.exports = licenseMiddleware;
