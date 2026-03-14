// backend/src/middleware/requireLicense.middleware.js
// Block access if license not activated. Skip for login, license API, QR.

const { getLicense } = require("../config/license");

const SKIP_PATHS = ["/login", "/api/auth", "/api/license", "/api/setup", "/license", "/setup", "/api/system/health", "/api/health", "/api/qr", "/qr", "/change-password"];

function shouldSkipLicenseCheck(path) {
  const p = (path || "").split("?")[0];
  return SKIP_PATHS.some((prefix) => p === prefix || p.startsWith(prefix + "/"));
}

async function requireLicense(req, res, next) {
  if (shouldSkipLicenseCheck(req.path)) {
    return next();
  }
  try {
    const license = await getLicense();
    const status = license && license.status;
    if (status === "active" || status === "grace") {
      return next();
    }
    if (status === "expired") {
      if (req.xhr || req.headers.accept === "application/json" || req.path.startsWith("/api/")) {
        return res.status(403).json({ error: "Licenza scaduta", message: "Rinnovare la licenza per continuare." });
      }
      return res.redirect("/license/license.html?expired=1");
    }
    if (!license || status === "unlicensed") {
      if (req.xhr || req.headers.accept === "application/json" || req.path.startsWith("/api/")) {
        return res.status(403).json({ error: "Licenza non attivata", message: "Attivare la licenza per accedere." });
      }
      return res.redirect("/license/license.html");
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireLicense };