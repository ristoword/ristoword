// backend/src/middleware/stripeDevRoutes.middleware.js
// Delega a stripe.routes.js (Blocco 3): 404 se STRIPE_ALLOW_DEV_ROUTES !== 'true'

const { stripeDevRoutesGuard } = require("../routes/stripe.routes");

function stripeDevRoutesOnly(req, res, next) {
  return stripeDevRoutesGuard(req, res, next);
}

module.exports = { stripeDevRoutesOnly };
