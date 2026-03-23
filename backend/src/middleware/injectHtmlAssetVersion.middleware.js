/**
 * Sostituisce __RW_ASSET_VERSION__ negli HTML serviti da public/.
 * Così ogni deploy (commit Railway, deployment id, o env) genera URL JS/CSS diversi
 * senza bump manuale — la cache browser/CDN non può tenere file vecchi all’infinito.
 */
const fs = require("fs");
const path = require("path");

const PLACEHOLDER = "__RW_ASSET_VERSION__";

function resolveAssetVersion() {
  const v =
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.RAILWAY_DEPLOYMENT_ID ||
    process.env.HEROKU_SLUG_COMMIT ||
    process.env.RISTOWORD_ASSET_VERSION ||
    process.env.RISTOWORD_VERSION;
  if (v && String(v).trim()) return String(v).trim().slice(0, 64);
  return String(Date.now());
}

/**
 * @param {string} publicRoot - path assoluto a backend/public
 */
function injectHtmlAssetVersion(publicRoot) {
  const rootResolved = path.resolve(publicRoot);

  return function injectHtmlAssetVersionMiddleware(req, res, next) {
    if (req.method !== "GET") return next();
    const p = req.path || "";
    if (!p.endsWith(".html")) return next();

    const rel = p.replace(/^\/+/, "");
    if (!rel || rel.includes("..")) return next();

    const full = path.join(rootResolved, rel);
    if (!full.startsWith(rootResolved)) return next();

    fs.readFile(full, "utf8", (err, html) => {
      if (err) {
        if (err.code === "ENOENT") return next();
        return next(err);
      }
      const v = resolveAssetVersion();
      const out = html.split(PLACEHOLDER).join(v);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("X-RW-Asset-Version", v);
      res.type("html; charset=utf-8");
      res.send(out);
    });
  };
}

module.exports = { injectHtmlAssetVersion, resolveAssetVersion };
