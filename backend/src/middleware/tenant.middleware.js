/**
 * Middleware leggero: espone req.tenantId numerico (default 1) per compatibilità / futuro SaaS.
 * L’isolamento dati su MySQL resta su tenant_id VARCHAR via sessione + override header in
 * tenantContext.middleware (x-tenant-id → slug ristorante).
 */
function getTenantId(req) {
  if (req.headers["x-tenant-id"]) {
    const n = parseInt(String(req.headers["x-tenant-id"]).trim(), 10);
    return Number.isFinite(n) ? n : 1;
  }
  return 1;
}

function tenantMiddleware(req, res, next) {
  req.tenantId = getTenantId(req);
  next();
}

module.exports = tenantMiddleware;
