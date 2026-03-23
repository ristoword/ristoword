const stripeMockRepository = require("./stripeMock.repository");
const stripeLiveWebhookDedup = require("./stripeLiveWebhookDedup");
const { syncLicenseFromPaidSession } = require("./stripeLicenseSync.service");
const { provisionDbTenantAndLicenseFromStripeSession } = require("./stripeProvisionDb.service");

function normalizeRestaurantId(id) {
  return String(id || "").trim();
}

/**
 * After Stripe signature verification: process mock store or live checkout.session.completed.
 * @param {object} event – Stripe.Event
 */
async function processVerifiedStripeEvent(event) {
  const id = String(event.id || "").trim();
  if (!id) throw new Error("eventId_obbligatorio");

  const state = stripeMockRepository.readState();
  const mockEvent = (state.events || []).find((e) => String(e.id) === id) || null;
  if (mockEvent) {
    return processWebhookEvent({ eventId: id });
  }

  if (event.type === "checkout.session.completed") {
    if (stripeLiveWebhookDedup.hasProcessedStripeEvent(id)) {
      return {
        processed: true,
        skipped: true,
        duplicate: true,
        eventId: id,
        source: "stripe_live",
      };
    }

    const session = event.data && event.data.object;
    if (!session) throw new Error("session_non_trovata");

    const meta = session.metadata && typeof session.metadata === "object" ? session.metadata : {};
    const rid =
      meta.restaurantId ||
      meta.tenantId ||
      session.client_reference_id ||
      null;

    const paid = String(session.payment_status || "").toLowerCase() === "paid";
    if (!paid) {
      return { processed: true, skipped: true, reason: "not_paid", eventId: id };
    }

    if (!rid) {
      const disableAuto =
        String(process.env.STRIPE_AUTO_PROVISION_DB || "").toLowerCase() === "false";
      if (disableAuto) {
        throw new Error("stripe_session_missing_restaurant_metadata");
      }
      const paidMeta = await provisionDbTenantAndLicenseFromStripeSession({
        session,
        eventId: id,
      });
      stripeLiveWebhookDedup.markStripeEventProcessed(id);
      return {
        processed: true,
        eventId: id,
        source: "stripe_live_db_provision",
        ...paidMeta,
      };
    }

    const modeFromMeta = String(meta.mode || "").toLowerCase();
    const syntheticSession = {
      id: session.id,
      restaurantId: String(rid).trim(),
      plan: meta.plan || "ristoword_pro",
      mode: modeFromMeta === "trial" ? "trial" : "subscription",
      customerEmail: session.customer_email || (session.customer_details && session.customer_details.email) || null,
      customerName: (session.customer_details && session.customer_details.name) || null,
    };

    const syntheticEvent = {
      id: event.id,
      restaurantId: syntheticSession.restaurantId,
      sessionId: session.id,
      paymentStatus: "paid",
    };

    const paidMeta = await syncLicenseFromPaidSession({
      session: syntheticSession,
      event: syntheticEvent,
      restaurantName: syntheticSession.customerName || syntheticSession.restaurantId,
      source: "stripe_webhook",
    });

    stripeLiveWebhookDedup.markStripeEventProcessed(id);

    return {
      processed: true,
      eventId: id,
      source: "stripe_live",
      ...paidMeta,
    };
  }

  throw new Error("event_non_trovato");
}

async function processWebhookEvent({ eventId } = {}) {
  const id = String(eventId || "").trim();
  if (!id) throw new Error("eventId_obbligatorio");

  const state = stripeMockRepository.readState();
  const event = (state.events || []).find((e) => String(e.id) === id) || null;
  if (!event) {
    throw new Error("event_non_trovato");
  }

  if (event.processedAt) {
    return { processed: true, event };
  }

  const session = (state.sessions || []).find((s) => String(s.id) === String(event.sessionId)) || null;

  let paidMeta = {};
  // Only on paid events we update licenses.
  if (String(event.paymentStatus || "").toLowerCase() === "paid") {
    paidMeta = await syncLicenseFromPaidSession({
      session,
      event,
      restaurantName: session?.customerName || event.restaurantId,
      source: "stripe_webhook",
    });
  }

  stripeMockRepository.markEventProcessed({ eventId: id });

  return {
    processed: true,
    eventId: id,
    paymentStatus: event.paymentStatus || null,
    ...paidMeta,
  };
}

async function syncPendingWebhooks({ tenantId = null } = {}) {
  const rid = tenantId ? normalizeRestaurantId(tenantId) : null;
  const state = stripeMockRepository.readState();
  const unprocessed = stripeMockRepository.listUnprocessedEvents(state);

  const toProcess = rid
    ? unprocessed.filter((e) => normalizeRestaurantId(e.restaurantId) === rid)
    : unprocessed;

  const results = [];
  for (const e of toProcess) {
    try {
      const r = await processWebhookEvent({ eventId: e.id });
      results.push({ ok: true, ...r });
    } catch (err) {
      results.push({ ok: false, eventId: e.id, error: err && err.message ? err.message : String(err) });
    }
  }

  const after = stripeMockRepository.readState();
  return {
    processed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    pendingRemaining: stripeMockRepository.listUnprocessedEvents(after).length,
  };
}

function getWebhookStatus() {
  const state = stripeMockRepository.readState();
  return state.webhook || {};
}

module.exports = {
  processWebhookEvent,
  processVerifiedStripeEvent,
  syncPendingWebhooks,
  getWebhookStatus,
};

