const fs = require("fs");
const path = require("path");

function getLicensePath() {
  // cartella dati dentro backend (semplice e stabile)
  return path.join(__dirname, "../../data/license.json");
}

function readLicense() {
  try {
    const p = getLicensePath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

function isLicenseValid(lic) {
  if (!lic) return false;
  if (lic.active !== true) return false;
  // opzionale: scadenza
  if (lic.expiresAt) {
    const exp = new Date(lic.expiresAt).getTime();
    if (!Number.isFinite(exp)) return false;
    if (Date.now() > exp) return false;
  }
  return true;
}

// Gate globale: se non licenziato -> solo /activate + /api/license* + /login + /api/auth*
function licenseGate(req, res, next) {
  const url = req.path;

  const allowPrefixes = [
    "/activate",
    "/login",
    "/api/license",
    "/api/auth",
  ];

  if (allowPrefixes.some((p) => url === p || url.startsWith(p + "/"))) {
    return next();
  }

  // consenti asset generici (css/js/icons) anche prima licenza
  // (se vuoi bloccarli, togli questa parte)
  if (url.startsWith("/icons/") || url.endsWith(".css") || url.endsWith(".js") || url.endsWith(".png") || url.endsWith(".svg")) {
    return next();
  }

  const lic = readLicense();
  if (!isLicenseValid(lic)) {
    return res.redirect("/activate");
  }

  req.license = lic;
  next();
}

module.exports = { licenseGate, readLicense, isLicenseValid, getLicensePath };