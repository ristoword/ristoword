// Atomic writes and safe reads for JSON data files.
const fs = require("fs");
const path = require("path");

/**
 * Safely read JSON file. Returns fallback on missing/corrupted.
 */
function safeReadJson(filePath, fallback = null) {
  const def = fallback !== undefined ? fallback : [];
  try {
    if (!fs.existsSync(filePath)) return def;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return def;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (err) {
    if (err.code === "ENOENT") return def;
    console.error(`[Ristoword] safeReadJson error ${filePath}:`, err.message);
    return def;
  }
}

/**
 * Atomic write: write to .tmp then rename. Fallback to direct write if rename fails.
 */
function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  const tmpPath = filePath + "." + Date.now() + ".tmp";
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (_) {}
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = { safeReadJson, atomicWriteJson };
