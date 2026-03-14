// backend/src/repositories/restaurants.repository.js
// JSON-based restaurant (tenant) storage for onboarding.

const path = require("path");
const { safeReadJson, atomicWriteJson } = require("../utils/safeFileIO");
const { v4: uuidv4 } = require("uuid");

const DATA_FILE = path.join(__dirname, "..", "..", "data", "restaurants.json");

function readRestaurants() {
  const data = safeReadJson(DATA_FILE, { restaurants: [] });
  return Array.isArray(data.restaurants) ? data.restaurants : [];
}

function writeRestaurants(restaurants) {
  const dir = path.dirname(DATA_FILE);
  require("fs").mkdirSync(dir, { recursive: true });
  const data = { restaurants: Array.isArray(restaurants) ? restaurants : [] };
  atomicWriteJson(DATA_FILE, data);
}

function generateId() {
  return uuidv4().replace(/-/g, "").slice(0, 12);
}

function findBySlug(slug) {
  const s = String(slug || "").trim().toLowerCase();
  return readRestaurants().find((r) => (r.slug || "").toLowerCase() === s);
}

function findById(id) {
  const restaurants = readRestaurants();
  return restaurants.find((r) => r.id === id);
}

function findByAdminEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  return readRestaurants().find((r) => (r.adminEmail || "").toLowerCase() === e);
}

function create(restaurant) {
  const restaurants = readRestaurants();
  const id = restaurant.id || generateId();
  const record = {
    id,
    slug: restaurant.slug,
    restaurantName: restaurant.restaurantName,
    companyName: restaurant.companyName || "",
    vatNumber: restaurant.vatNumber || "",
    address: restaurant.address || "",
    city: restaurant.city || "",
    postalCode: restaurant.postalCode || "",
    country: restaurant.country || "IT",
    adminEmail: restaurant.adminEmail || "",
    phone: restaurant.phone || "",
    contactName: restaurant.contactName || "",
    plan: restaurant.plan || "ristoword_pro",
    language: restaurant.language || "it",
    currency: restaurant.currency || "EUR",
    status: restaurant.status || "active",
    tablesCount: restaurant.tablesCount ?? 20,
    createdAt: restaurant.createdAt || new Date().toISOString(),
  };
  restaurants.push(record);
  writeRestaurants(restaurants);
  return record;
}

module.exports = {
  readRestaurants,
  writeRestaurants,
  findBySlug,
  findById,
  findByAdminEmail,
  create,
  generateId,
};
