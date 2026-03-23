const router = require("express").Router();
const checkoutController = require("../controllers/checkout.controller");
const { stripeDevRoutesOnly } = require("../middleware/stripeDevRoutes.middleware");

// POST /api/checkout
router.post("/", checkoutController.startCheckout);

// POST /api/checkout/create-session — Stripe Live (subscription); webhook crea tenant+licenza in DB
router.post("/create-session", checkoutController.createStripeSubscriptionSession);

// POST /api/checkout/mock/complete — solo dev o STRIPE_ALLOW_DEV_ROUTES=true in produzione
router.post("/mock/complete", stripeDevRoutesOnly, checkoutController.mockCompleteCheckout);

module.exports = router;

