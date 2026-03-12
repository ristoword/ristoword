// backend/src/middleware/requireRole.middleware.js
// Requires req.session.user.role to be in allowedRoles. owner always allowed.

function requireRole(allowedRoles) {
  const set = new Set(Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]);
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: "Non autenticato", message: "Effettua il login." });
    }
    const role = req.session.user.role;
    if (role === "owner" || set.has(role)) {
      return next();
    }
    return res.status(403).json({ error: "Accesso negato", message: "Non hai permesso per questa risorsa." });
  };
}

module.exports = { requireRole };
