// backend/src/middleware/requirePageAuth.middleware.js
// Redirect to login if requesting a protected page without session.
// Use before express.static for HTML page requests.

const LOGIN_PATH = "/login/login.html";

const PROTECTED_PATTERNS = [
  /^\/change-password\/change-password\.html$/,
  /^\/dashboard\/dashboard\.html$/,
  /^\/sala\/sala\.html$/,
  /^\/cucina\/cucina\.html$/,
  /^\/pizzeria\/pizzeria\.html$/,
  /^\/bar\/bar\.html$/,
  /^\/magazzino\/magazzino\.html$/,
  /^\/cassa\/cassa\.html$/,
  /^\/cassa\/chiusura\.html$/,
  /^\/prenotazioni\/prenotazioni\.html$/,
  /^\/catering\/catering\.html$/,
  /^\/staff\/staff\.html$/,
  /^\/asporto\/asporto\.html$/,
  /^\/supervisor\/supervisor\.html$/,
  /^\/supervisor\/staff\/staff\.html$/,
  /^\/supervisor\/customers\/customers\.html$/,
  /^\/menu-admin\/menu-admin\.html$/,
  /^\/daily-menu\/daily-menu\.html$/,
];

function isProtectedPath(pathname) {
  const p = (pathname || "").split("?")[0];
  return PROTECTED_PATTERNS.some((re) => re.test(p));
}

function requirePageAuth(req, res, next) {
  if (req.method !== "GET") return next();
  if (!isProtectedPath(req.path)) return next();
  if (req.session && req.session.user) return next();
  const returnTo = encodeURIComponent(req.originalUrl || req.path);
  return res.redirect(LOGIN_PATH + (returnTo ? "?return=" + returnTo : ""));
}

module.exports = { requirePageAuth, isProtectedPath };
