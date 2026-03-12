// backend/src/utils/fileStore.js
const fs = require("fs");
const path = require("path");

function ensureFile(filePath, defaultContent = "[]") {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, defaultContent, "utf-8");
  }
}

function loadJsonArray(filePath) {
  try {
    ensureFile(filePath, "[]");
    const raw = fs.readFileSync(filePath, "utf-8").trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Errore lettura file:", filePath, err);
    return [];
  }
}

function saveJsonArray(filePath, arr) {
  try {
    ensureFile(filePath, "[]");
    fs.writeFileSync(filePath, JSON.stringify(arr, null, 2), "utf-8");
  } catch (err) {
    console.error("Errore salvataggio file:", filePath, err);
  }
}

function nextIdFrom(arr, field = "id") {
  const ids = arr
    .map((x) => Number(x && x[field]))
    .filter((n) => Number.isFinite(n) && n > 0);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

module.exports = {
  ensureFile,
  loadJsonArray,
  saveJsonArray,
  nextIdFrom,
};