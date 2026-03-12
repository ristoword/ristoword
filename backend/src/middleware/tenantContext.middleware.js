// backend/src/middleware/tenantContext.middleware.js
// Resolves restaurantId from session and runs request in tenant context.

const tenantContext = require("../context/tenantContext");

/**
 * Sets req.restaurantId and runs next within tenant AsyncLocalStorage.
 * restaurantId = session.restaurantId if user logged in, else "default".
 */
function setTenantContext(req, res, next) {
  const restaurantId = req.session?.restaurantId ?? tenantContext.DEFAULT_TENANT;
  req.restaurantId = restaurantId;

  tenantContext.run(restaurantId, () => {
    next();
  });
}

module.exports = { setTenantContext };
