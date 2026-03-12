const fs = require("fs");
const path = require("path");

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJson(filePath, fallback = []) {
  try {
    ensureDir(filePath);

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), "utf8");
      return fallback;
    }

    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return fallback;

    return JSON.parse(raw);
  } catch (err) {
    console.error("Errore lettura file JSON:", filePath, err);
    return fallback;
  }
}

function writeJson(filePath, data) {
  try {
    ensureDir(filePath);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("Errore scrittura file JSON:", filePath, err);
    return false;
  }
}

module.exports = {
  readJson,
  writeJson
};