// backend/src/service/onboarding.service.js
// Orchestrates restaurant onboarding after payment.

const bcrypt = require("bcrypt");
const path = require("path");
const fs = require("fs");
const restaurantsRepository = require("../repositories/restaurants.repository");
const usersRepository = require("../repositories/users.repository");
const licensesRepository = require("../repositories/licenses.repository");
const mailService = require("./mail.service");
const { generateSecurePassword } = require("../utils/generatePassword");
const paths = require("../config/paths");

const BCRYPT_ROUNDS = 10;

const TENANT_FILES = [
  "orders.json",
  "inventory.json",
  "payments.json",
  "recipes.json",
  "bookings.json",
  "menu.json",
  "closures.json",
  "cassa-shifts.json",
  "pos-shifts.json",
  "staff.json",
  "customers.json",
  "haccp-checks.json",
  "catering-events.json",
  "sessions.json",
  "daily-menu.json",
  "inventory-transfers.json",
];

function sanitizeSlug(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "restaurant";
}

function sanitizeInput(str, maxLen = 200) {
  return String(str || "").trim().slice(0, maxLen);
}

function createSlugFromName(restaurantName) {
  let name = String(restaurantName || "").trim();
  const prefixes = ["ristorante", "trattoria", "pizzeria", "osteria", "locanda"];
  for (const p of prefixes) {
    if (name.toLowerCase().startsWith(p + " ")) {
      name = name.slice(p.length + 1).trim();
      break;
    }
  }
  const base = sanitizeSlug(name) || "restaurant";
  let slug = base;
  let counter = 0;
  while (restaurantsRepository.findBySlug(slug)) {
    counter++;
    slug = base + "-" + counter;
  }
  return slug;
}

function generateOwnerUsername(slug) {
  const base = "risto_" + slug.replace(/-/g, "_") + "_owner";
  if (base.length <= 64) return base;
  return "risto_" + slug.replace(/-/g, "_").slice(0, 40) + "_owner";
}

async function onboardRestaurant(payload, req) {
  const restaurantName = sanitizeInput(payload.restaurantName, 100);
  const adminEmail = sanitizeInput(payload.adminEmail, 120);

  if (!restaurantName) {
    throw new Error("restaurantName is required");
  }
  if (!adminEmail) {
    throw new Error("adminEmail is required");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(adminEmail)) {
    throw new Error("Invalid adminEmail format");
  }

  const slug = createSlugFromName(restaurantName);
  const restaurantId = restaurantsRepository.generateId();

  const existingByEmail = restaurantsRepository.findByAdminEmail(adminEmail);
  if (existingByEmail) {
    throw new Error("A restaurant with this admin email already exists");
  }

  const ownerUsername = generateOwnerUsername(slug);
  const temporaryPassword = generateSecurePassword(14);
  const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);

  const restaurant = restaurantsRepository.create({
    id: restaurantId,
    slug,
    restaurantName,
    companyName: sanitizeInput(payload.companyName, 120),
    vatNumber: sanitizeInput(payload.vatNumber, 30),
    address: sanitizeInput(payload.address, 200),
    city: sanitizeInput(payload.city, 80),
    postalCode: sanitizeInput(payload.postalCode, 20),
    country: sanitizeInput(payload.country, 4) || "IT",
    adminEmail,
    phone: sanitizeInput(payload.phone, 30),
    contactName: sanitizeInput(payload.contactName, 80),
    plan: sanitizeInput(payload.plan, 50) || "ristoword_pro",
    language: sanitizeInput(payload.language, 10) || "it",
    currency: sanitizeInput(payload.currency, 5) || "EUR",
    status: "active",
    tablesCount: Math.max(1, Math.min(999, Number(payload.tablesCount) || 20)),
  });

  const ownerUser = await usersRepository.createUser({
    username: ownerUsername,
    password: passwordHash,
    role: "owner",
    restaurantId,
    mustChangePassword: true,
    is_active: true,
  });

  if (!ownerUser) {
    throw new Error("Failed to create owner user (username may already exist)");
  }

  licensesRepository.create({
    restaurantId,
    plan: restaurant.plan,
    status: "active",
    source: "manual_onboarding",
  });

  const tenantDir = path.join(paths.DATA, "tenants", restaurantId);
  fs.mkdirSync(tenantDir, { recursive: true });

  for (const fileName of TENANT_FILES) {
    const filePath = path.join(tenantDir, fileName);
    if (!fs.existsSync(filePath)) {
      let content = "[]";
      if (fileName === "menu.json") content = JSON.stringify(createDefaultMenu(), null, 2);
      if (fileName === "daily-menu.json") content = JSON.stringify({ menuActive: false, updatedAt: null, dishes: [] }, null, 2);
      fs.writeFileSync(filePath, content, "utf8");
    }
  }

  const settingsPath = path.join(tenantDir, "settings.json");
  if (!fs.existsSync(settingsPath)) {
    const tablesCount = restaurant.tablesCount || 20;
    const tables = Array.from({ length: tablesCount }, (_, i) => ({
      id: i + 1,
      number: i + 1,
      name: `Tavolo ${i + 1}`,
    }));
    const settings = {
      restaurantName,
      departments: { sala: true, cucina: true, cassa: true, magazzino: true, prenotazioni: true },
      tables,
      language: restaurant.language || "it",
      currency: restaurant.currency || "EUR",
    };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  }

  const menuPath = path.join(tenantDir, "menu.json");
  try {
    const menuRaw = fs.readFileSync(menuPath, "utf8");
    const menu = JSON.parse(menuRaw);
    if (Array.isArray(menu) && menu.length === 0) {
      fs.writeFileSync(menuPath, JSON.stringify(createDefaultMenu(), null, 2), "utf8");
    }
  } catch (_) {}

  const loginUrl = mailService.getLoginUrl(req);
  const emailResult = await mailService.sendWelcomeEmail({
    adminEmail,
    restaurantName,
    username: ownerUsername,
    temporaryPassword,
    loginUrl,
  });

  return {
    success: true,
    restaurant: {
      id: restaurant.id,
      slug: restaurant.slug,
      name: restaurant.restaurantName,
    },
    owner: {
      username: ownerUsername,
      temporaryPassword,
    },
    emailStatus: emailResult.sent ? "sent" : "not_sent",
  };
}

function createDefaultMenu() {
  return [
    { id: 1, name: "Acqua", category: "Bevande", price: 2.5, active: true, area: "bar" },
    { id: 2, name: "Caffè", category: "Bevande", price: 1.5, active: true, area: "bar" },
    { id: 3, name: "Margherita", category: "Pizze", price: 8, active: true, area: "pizzeria" },
    { id: 4, name: "Pasta al pomodoro", category: "Primi", price: 10, active: true, area: "cucina" },
    { id: 5, name: "Insalata mista", category: "Contorni", price: 6, active: true, area: "cucina" },
  ];
}

module.exports = { onboardRestaurant };
