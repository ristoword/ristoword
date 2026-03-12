#!/usr/bin/env node
/**
 * One-time migration: hash plain-text passwords in users.json and create demo-hashes.json.
 * Run: node scripts/migrate-passwords-to-bcrypt.js
 * Existing users.json is backed up to users.json.bak before modification.
 */
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcrypt");

const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const DEMO_HASHES_FILE = path.join(DATA_DIR, "demo-hashes.json");

const DEMO_USERS = [
  { username: "supervisor", password: "1234" },
  { username: "cassa", password: "1234" },
  { username: "cucina", password: "1234" },
  { username: "staff", password: "1234" },
  { username: "cliente", password: "1234" },
  { username: "cash_manager", password: "5678" },
  { username: "kitchen_manager", password: "6789" },
  { username: "sala_manager", password: "7890" },
  { username: "bar_manager", password: "8901" },
  { username: "supervisor_mgr", password: "9012" },
];

function isBcryptHash(str) {
  return typeof str === "string" && (str.startsWith("$2a$") || str.startsWith("$2b$") || str.startsWith("$2y$"));
}

async function main() {
  console.log("[Ristoword] Password migration to bcrypt");
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (fs.existsSync(USERS_FILE)) {
    const raw = fs.readFileSync(USERS_FILE, "utf8");
    const data = JSON.parse(raw);
    const users = Array.isArray(data.users) ? data.users : [];
    let changed = false;
    for (const u of users) {
      if (u.password && !isBcryptHash(u.password)) {
        u.password = await bcrypt.hash(u.password, 10);
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(USERS_FILE + ".bak", raw, "utf8");
      fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), "utf8");
      console.log("[OK] users.json migrated (backup: users.json.bak)");
    } else {
      console.log("[OK] users.json already hashed");
    }
  } else {
    console.log("[SKIP] users.json not found");
  }

  const demoHashes = {};
  for (const u of DEMO_USERS) {
    demoHashes[u.username] = await bcrypt.hash(u.password, 10);
  }
  fs.writeFileSync(DEMO_HASHES_FILE, JSON.stringify(demoHashes, null, 2), "utf8");
  console.log("[OK] demo-hashes.json created");
  console.log("[DONE] Migration complete.");
}

main().catch((err) => {
  console.error("[ERROR]", err.message);
  process.exit(1);
});
