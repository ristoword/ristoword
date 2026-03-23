/**
 * Mapping opzionale header x-tenant-id (numero) → restaurantId string usato in DB/cartelle.
 * Estendibile quando si aggiungono righe in tabella tenants.
 */
const NUMERIC_TENANT_TO_RESTAURANT_ID = {
  1: "baia-verde",
};

function getRestaurantIdFromNumericTenantId(n) {
  const id = Number(n);
  if (!Number.isFinite(id)) return null;
  return NUMERIC_TENANT_TO_RESTAURANT_ID[id] || null;
}

module.exports = {
  NUMERIC_TENANT_TO_RESTAURANT_ID,
  getRestaurantIdFromNumericTenantId,
};
