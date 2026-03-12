// Redirect to setup wizard if restaurant not configured
const { isSetupComplete } = require("../config/setup");

const SKIP_PATHS = [
  "/login", "/license", "/setup",
  "/api/auth", "/api/license", "/api/setup",
  "/api/system/health", "/api/health",
  "/qr", "/api/qr",
];

function shouldSkip(path) {
  const p = (path || "").split("?")[0];
  return SKIP_PATHS.some((prefix) => p === prefix || p.startsWith(prefix + "/"));
}

async function requireSetup(req, res, next) {
  if (shouldSkip(req.path)) return next();

  try {
    const complete = await isSetupComplete();
    if (complete) return next();

    if (req.xhr || req.headers.accept === "application/json" || req.path.startsWith("/api/")) {
      return res.status(403).json({
        error: "setup_required",
        message: "Completa la configurazione iniziale del ristorante.",
      });
    }
    return res.redirect("/setup/setup.html");
  } catch {
    return next();
  }
}

module.exports = { requireSetup };
