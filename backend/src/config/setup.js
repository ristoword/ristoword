// Restaurant setup configuration – single-restaurant, no multi-tenant
const path = require("path");
const fs = require("fs");
const paths = require("./paths");

const CONFIG_PATH = path.join(paths.DATA, "restaurant-config.json");

function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeConfig(config) {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

async function isSetupComplete() {
  const c = readConfig();
  if (c && c.setupComplete === true) return true;
  // Backward compat: existing installs without config file
  const legacyMenu = path.join(paths.DATA, "menu.json");
  const tenantMenu = path.join(paths.DATA, "tenants", "default", "menu.json");
  try {
    for (const p of [legacyMenu, tenantMenu]) {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf8");
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length > 0) return true;
      }
    }
  } catch (_) {}
  return false;
}

module.exports = {
  readConfig,
  writeConfig,
  isSetupComplete,
  CONFIG_PATH,
};
