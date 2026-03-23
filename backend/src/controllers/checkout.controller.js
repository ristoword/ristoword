const Stripe = require("stripe");
const checkoutService = require("../stripe/checkout.service");
const { getWebhookStatus } = require("../stripe/stripeWebhook.service");

const STRIPE_API_VERSION = "2024-11-20.acacia";

// POST /api/checkout
// Starts a local mock checkout session.
// Body:
// - restaurantId (required) — stesso ID tenant usato in gestionale / GS
// - plan (optional, default ristoword_pro)
// - mode (optional: subscription|trial, default subscription)
// - customerEmail / email / adminEmail (optional) — per email con codice dopo pagamento
// - customerName (optional)
async function startCheckout(req, res) {
  const body = req.body || {};
  const restaurantId = body.restaurantId || body.tenantId;
  const plan = body.plan || body.product || "ristoword_pro";
  const mode = body.mode || body.checkoutMode || "subscription";
  const customerEmail = body.customerEmail || body.email || body.adminEmail || null;
  const customerName = body.customerName || body.name || null;
  const billingPeriod = body.billingPeriod || body.interval || "monthly";
  const licenseCode = body.licenseCode || body.activationCode || null;

  try {
    const { sessionId, session, url, checkoutMode } = await checkoutService.startCheckout({
      restaurantId,
      plan,
      mode,
      customerEmail,
      customerName,
      billingPeriod,
      licenseCode,
    });
    return res.json({
      ok: true,
      sessionId,
      checkoutMode: checkoutMode || "mock",
      url: url || null,
      status: session.status,
      restaurantId: session.restaurantId,
      mode: session.mode,
      customerEmail: session.customerEmail || null,
      webhookStatus: getWebhookStatus(),
    });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

// POST /api/checkout/mock/complete
// Marks the mock session as paid/failed and creates an unprocessed webhook event.
async function mockCompleteCheckout(req, res) {
  const body = req.body || {};
  const sessionId = body.sessionId || body.id;
  const outcome = body.outcome || body.paymentOutcome || (body.success === true ? "paid" : "failed");

  try {
    const result = await checkoutService.mockCompleteCheckout({ sessionId, outcome });
    return res.json({
      ok: true,
      outcome,
      sessionId,
      eventId: result?.event?.id || null,
      status: result?.session?.status || null,
      webhookStatus: getWebhookStatus(),
      restaurantId: result?.restaurantId || result?.session?.restaurantId || null,
      plan: result?.plan || result?.session?.plan || null,
      mode: result?.session?.mode || null,
      expiresAt: result?.expiresAt || null,
      activationCode: result?.activationCode || null,
      poolClaimed: !!result?.poolClaimed,
      ownerActivateUrl: result?.ownerActivateUrl || null,
      emailSent: !!result?.emailSent,
      emailError: result?.emailError || null,
      nextStep: result?.nextStep || null,
    });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

/**
 * POST /api/checkout/create-session
 * Checkout Stripe reale (subscription) senza restaurantId: il webhook crea tenant+licenza in DB.
 */
async function createStripeSubscriptionSession(req, res) {
  const sk = process.env.STRIPE_SECRET_KEY && String(process.env.STRIPE_SECRET_KEY).trim();
  if (!sk) {
    return res.status(503).json({ ok: false, error: "Stripe non configurato (STRIPE_SECRET_KEY)" });
  }
  const priceId =
    (process.env.STRIPE_PRICE_ID && String(process.env.STRIPE_PRICE_ID).trim()) ||
    (process.env.STRIPE_PRICE_RISTOWORD_MONTHLY && String(process.env.STRIPE_PRICE_RISTOWORD_MONTHLY).trim());
  if (!priceId) {
    return res.status(503).json({
      ok: false,
      error: "Imposta STRIPE_PRICE_ID o STRIPE_PRICE_RISTOWORD_MONTHLY",
    });
  }
  const base =
    (process.env.BASE_URL && String(process.env.BASE_URL).trim()) ||
    (process.env.PUBLIC_APP_URL && String(process.env.PUBLIC_APP_URL).trim()) ||
    "";
  if (!base) {
    return res.status(503).json({ ok: false, error: "Imposta BASE_URL o PUBLIC_APP_URL" });
  }
  const baseNoSlash = base.replace(/\/$/, "");
  const successPath =
    (process.env.STRIPE_CHECKOUT_SUCCESS_PATH && String(process.env.STRIPE_CHECKOUT_SUCCESS_PATH).trim()) ||
    "/owner-activate?checkout=success&session_id={CHECKOUT_SESSION_ID}";
  const cancelPath =
    (process.env.STRIPE_CHECKOUT_CANCEL_PATH && String(process.env.STRIPE_CHECKOUT_CANCEL_PATH).trim()) ||
    "/owner-activate?checkout=cancel";

  try {
    const stripe = new Stripe(sk, { apiVersion: STRIPE_API_VERSION });
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseNoSlash}${successPath.startsWith("/") ? "" : "/"}${successPath}`,
      cancel_url: `${baseNoSlash}${cancelPath.startsWith("/") ? "" : "/"}${cancelPath}`,
      metadata: {
        auto_provision: "true",
        source: "ristoword_create_session",
      },
    });
    return res.json({ ok: true, url: session.url, sessionId: session.id });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[checkout] create-session", err);
    return res.status(500).json({
      ok: false,
      error: "Stripe error",
      message: err && err.message ? err.message : String(err),
    });
  }
}

module.exports = {
  startCheckout,
  mockCompleteCheckout,
  createStripeSubscriptionSession,
};

