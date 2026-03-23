// backend/src/middleware/tenantContext.middleware.js
// Resolves restaurantId from session and runs request in tenant context.

const tenantContext = require("../context/tenantContext");
const { getRestaurantIdFromNumericTenantId } = require("../config/tenantNumericMap");

/**
 * Sets req.restaurantId and runs next within tenant AsyncLocalStorage.
 * restaurantId = session.restaurantId if user logged in, else "default".
 * Se è presente l'header x-tenant-id e il valore è mappato (es. 1 → baia-verde), sovrascrive
 * il tenant per quella richiesta (test / futuro SaaS).
 */
function setTenantContext(req, res, next) {
  let restaurantId = req.session?.restaurantId ?? tenantContext.DEFAULT_TENANT;

  const rawHeader = req.headers["x-tenant-id"];
  if (rawHeader != null && String(rawHeader).trim() !== "") {
    const n = parseInt(String(rawHeader).trim(), 10);
    const mapped = getRestaurantIdFromNumericTenantId(n);
    if (mapped) {
      restaurantId = mapped;
    }
  } else if (req.licenseRestaurantId) {
    restaurantId = req.licenseRestaurantId;
  }

  req.restaurantId = restaurantId;

  tenantContext.run(restaurantId, () => {
    next();
  });
}

module.exports = { setTenantContext };
