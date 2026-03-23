/**
 * Stripe hardening (Blocco 3): webhook gate, dev-route guard, startup log.
 * Non contiene logica checkout né handler webhook interni.
 */

const sk = process.env.STRIPE_SECRET_KEY && String(process.env.STRIPE_SECRET_KEY).trim();
if (!sk) {
  console.warn("[Stripe] SECRET KEY missing → Stripe disabled");
}

/**
 * Se STRIPE_WEBHOOK_SECRET manca: niente 503 — risponde 200 e non invoca il controller.
 */
function stripeWebhookDisabledIfNoSecret(req, res, next) {
  const wh = process.env.STRIPE_WEBHOOK_SECRET && String(process.env.STRIPE_WEBHOOK_SECRET).trim();
  if (!wh) {
    console.warn("[Stripe] webhook disabled (missing secret)");
    return res.status(200).json({ ok: true, received: true, webhook: "disabled" });
  }
  return next();
}

/**
 * Route di test/mock Stripe: consentite solo se STRIPE_ALLOW_DEV_ROUTES === 'true'.
 * Altrimenti 404 (nessuna informazione su esistenza della route).
 */
function stripeDevRoutesGuard(req, res, next) {
  if (String(process.env.STRIPE_ALLOW_DEV_ROUTES || "").toLowerCase() !== "true") {
    return res.sendStatus(404);
  }
  return next();
}

module.exports = {
  stripeWebhookDisabledIfNoSecret,
  stripeDevRoutesGuard,
};
