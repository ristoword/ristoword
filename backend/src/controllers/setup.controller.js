const setupConfig = require("../config/setup");
const paths = require("../config/paths");
const path = require("path");
const fs = require("fs");

// GET /api/setup/status
async function getStatus(req, res) {
  const config = setupConfig.readConfig();
  const complete = !!(config && config.setupComplete);
  return res.json({
    setupComplete: complete,
    restaurantName: config?.restaurantName || "",
    numTables: config?.numTables ?? 0,
    departments: config?.departments || { sala: true, cucina: true, pizzeria: true, bar: true },
  });
}

// POST /api/setup
async function runSetup(req, res) {
  const { restaurantName, numTables, departments, seedMenu } = req.body || {};

  const name = (restaurantName || "").trim();
  if (!name) {
    return res.status(400).json({ ok: false, error: "Nome ristorante obbligatorio." });
  }

  const tables = Math.max(0, Math.min(999, Number(numTables) || 20));
  const depts = {
    sala: departments?.sala !== false,
    cucina: departments?.cucina !== false,
    pizzeria: departments?.pizzeria !== false,
    bar: departments?.bar !== false,
  };

  const defaultDir = path.join(paths.DATA, "tenants", "default");
  fs.mkdirSync(defaultDir, { recursive: true });

  if (seedMenu !== false) {
    const menuPath = path.join(defaultDir, "menu.json");
    let menu = [];
    try {
      if (fs.existsSync(menuPath)) {
        const raw = fs.readFileSync(menuPath, "utf8");
        const parsed = JSON.parse(raw);
        menu = Array.isArray(parsed) ? parsed : [];
      }
    } catch (_) {}

    if (menu.length === 0) {
      const seed = [
        { id: 1, name: "Acqua", category: "Bevande", price: 2.5, active: true, area: "bar" },
        { id: 2, name: "Caffè", category: "Bevande", price: 1.5, active: true, area: "bar" },
        { id: 3, name: "Margherita", category: "Pizze", price: 8, active: depts.pizzeria, area: "pizzeria" },
        { id: 4, name: "Pasta al pomodoro", category: "Primi", price: 10, active: depts.cucina, area: "cucina" },
        { id: 5, name: "Insalata mista", category: "Contorni", price: 6, active: depts.cucina, area: "cucina" },
      ];
      fs.writeFileSync(menuPath, JSON.stringify(seed, null, 2), "utf8");
    }
  }

  const TENANT_FILES = [
    "orders.json", "inventory.json", "payments.json", "bookings.json",
    "menu.json", "closures.json", "catering-events.json", "haccp-checks.json",
  ];
  for (const f of TENANT_FILES) {
    const p = path.join(defaultDir, f);
    if (!fs.existsSync(p)) {
      fs.writeFileSync(p, f === "menu.json" ? "[]" : "[]", "utf8");
    }
  }

  setupConfig.writeConfig({
    restaurantName: name,
    numTables: tables,
    departments: depts,
    setupComplete: true,
    completedAt: new Date().toISOString(),
  });

  return res.json({
    ok: true,
    message: "Configurazione completata.",
    restaurantName: name,
    numTables: tables,
    departments: depts,
  });
}

module.exports = {
  getStatus,
  runSetup,
};
