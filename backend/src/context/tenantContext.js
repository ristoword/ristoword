// backend/src/context/tenantContext.js
// AsyncLocalStorage-based tenant context for multi-tenant data isolation.

const { AsyncLocalStorage } = require("async_hooks");

const tenantStorage = new AsyncLocalStorage();

const DEFAULT_TENANT = "default";

/**
 * Run callback with tenant context. Used by middleware.
 * @param {string|null} restaurantId - From session.restaurantId or "default"
 * @param {Function} callback - (req, res, next) or similar
 * @param {...any} args - Passed to callback
 */
function run(restaurantId, callback, ...args) {
  const id = restaurantId != null && String(restaurantId).trim() !== ""
    ? String(restaurantId).trim()
    : DEFAULT_TENANT;
  return tenantStorage.run({ restaurantId: id }, () => callback(...args));
}

/**
 * Get current restaurant ID from context. Falls back to DEFAULT_TENANT when outside request.
 * Use this in repositories to resolve tenant-aware paths.
 */
function getRestaurantId() {
  const store = tenantStorage.getStore();
  return store?.restaurantId ?? DEFAULT_TENANT;
}

/**
 * Get tenant ID from request. Use when you have req (e.g. in middleware).
 * Falls back to DEFAULT_TENANT when session has no restaurantId.
 */
function getTenantIdFromRequest(req) {
  const id = req?.session?.restaurantId;
  return id != null && String(id).trim() !== "" ? String(id).trim() : DEFAULT_TENANT;
}

module.exports = {
  run,
  getRestaurantId,
  getTenantIdFromRequest,
  DEFAULT_TENANT,
};
