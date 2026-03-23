const crypto = require("crypto");
const db = require("../config/db");

/**
 * Dopo pagamento Stripe senza restaurantId in metadata: crea riga tenants + licenses (MySQL).
 * Slug cartella tenant non viene creato qui (owner-activate / provisioning successivo).
 */
async function provisionDbTenantAndLicenseFromStripeSession({ session, eventId } = {}) {
  const nameFromStripe =
    (session.customer_details && session.customer_details.name) ||
    session.customer_email ||
    "Nuovo Cliente";
  const name = String(nameFromStripe).trim().slice(0, 100) || "Nuovo Cliente";

  const code = `RISTO-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;

  const [tenantIns] = await db.query("INSERT INTO tenants (name) VALUES (?)", [name]);
  const tenantNumericId = tenantIns && tenantIns.insertId;

  if (!tenantNumericId) {
    throw new Error("tenant_insert_failed");
  }

  await db.query(
    "INSERT INTO licenses (code, tenant_id, status, expires_at) VALUES (?, ?, 'active', NULL)",
    [code, tenantNumericId]
  );

  // eslint-disable-next-line no-console
  console.log("[Stripe] Licenza DB creata:", code, "tenant_id", tenantNumericId, "event", eventId);

  return {
    activationCode: code,
    tenantNumericId,
    stripeSessionId: session.id,
    customerEmail: session.customer_email || null,
  };
}

module.exports = {
  provisionDbTenantAndLicenseFromStripeSession,
};
