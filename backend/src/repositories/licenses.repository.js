// backend/src/repositories/licenses.repository.js
// Per-restaurant license/subscription records.

const path = require("path");
const { safeReadJson, atomicWriteJson } = require("../utils/safeFileIO");

const DATA_FILE = path.join(__dirname, "..", "..", "data", "licenses.json");

function readLicenses() {
  const data = safeReadJson(DATA_FILE, { licenses: [] });
  return Array.isArray(data.licenses) ? data.licenses : [];
}

function writeLicenses(licenses) {
  const dir = path.dirname(DATA_FILE);
  require("fs").mkdirSync(dir, { recursive: true });
  atomicWriteJson(DATA_FILE, { licenses });
}

function findByRestaurantId(restaurantId) {
  const id = String(restaurantId || "").trim();
  return readLicenses().find((l) => l.restaurantId === id);
}

function create(license) {
  const licenses = readLicenses();
  const record = {
    restaurantId: license.restaurantId,
    plan: license.plan || "ristoword_pro",
    status: license.status || "active",
    source: license.source || "manual_onboarding",
    createdAt: license.createdAt || new Date().toISOString(),
  };
  licenses.push(record);
  writeLicenses(licenses);
  return record;
}

module.exports = {
  readLicenses,
  findByRestaurantId,
  create,
};
