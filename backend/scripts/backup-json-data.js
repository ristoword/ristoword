#!/usr/bin/env node
/**
 * Copia backend/data → backend/backups/pre-mysql-<timestamp>-data
 * Eseguire prima di migrate-json-to-mysql.js
 */
const fs = require("fs");
const path = require("path");

const backendRoot = path.resolve(__dirname, "..");
const dataDir = path.join(backendRoot, "data");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dest = path.join(backendRoot, "backups", `pre-mysql-${stamp}-data`);

if (!fs.existsSync(dataDir)) {
  console.error("[backup] Cartella data non trovata:", dataDir);
  process.exit(1);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.cpSync(dataDir, dest, { recursive: true });
console.log("[backup] OK →", dest);
