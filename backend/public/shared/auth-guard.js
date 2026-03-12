/**
 * Auth guard – frontend role-based page protection.
 * Include on protected pages. Reads rw_auth from localStorage and path;
 * redirects to login if not authenticated or role not allowed.
 *
 * Usage: <script src="/shared/auth-guard.js" data-allowed-roles="owner,sala,cucina,cassa"></script>
 * Or: RW_AuthGuard.run({ allowedRoles: ["owner", "sala"] });
 */
(function () {
  const AUTH_KEY = "rw_auth";
  const LOGIN_PATH = "/login/login.html";

  function getStoredAuth() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function getPathRoles() {
    const script = document.currentScript;
    if (!script) return null;
    const roles = script.getAttribute("data-allowed-roles");
    if (!roles) return null;
    return roles.split(",").map((r) => r.trim()).filter(Boolean);
  }

  function run(options) {
    const allowedRoles = options && options.allowedRoles ? options.allowedRoles : getPathRoles();
    const path = window.location.pathname || "";

    const auth = getStoredAuth();
    if (!auth || !auth.user) {
      const returnTo = encodeURIComponent(path + window.location.search);
      window.location.replace(LOGIN_PATH + (returnTo ? "?return=" + returnTo : ""));
      return;
    }

    if (allowedRoles && allowedRoles.length) {
      const role = (auth.role || "").toLowerCase();
      const allowed = allowedRoles.some((r) => r.toLowerCase() === role);
      if (!allowed && role !== "owner") {
        window.location.replace(LOGIN_PATH + "?denied=1");
        return;
      }
    }
  }

  window.RW_AuthGuard = { run, getStoredAuth };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => run({}));
  } else {
    run({});
  }
})();
