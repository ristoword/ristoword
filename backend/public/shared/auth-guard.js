/**
 * Auth guard – session-based page protection.
 * Uses /api/auth/me (backend express-session) as single source of truth.
 * No localStorage auth check; session cookie is validated server-side.
 *
 * Usage: <script src="/shared/auth-guard.js" data-allowed-roles="owner,sala,cucina,cassa"></script>
 * Role variants are mapped: kitchen->cucina, cashier->cassa, etc.
 */
(function () {
  "use strict";

  const LOGIN_PATH = "/login/login.html";

  function getPathRoles() {
    const script = document.currentScript;
    if (!script) return null;
    const roles = script.getAttribute("data-allowed-roles");
    if (!roles) return null;
    return roles.split(",").map((r) => r.trim().toLowerCase()).filter(Boolean);
  }

  function roleMatchesAllowed(allowedRoles, userRole) {
    if (!allowedRoles || allowedRoles.length === 0) return true;
    const role = String(userRole || "").toLowerCase();
    if (allowedRoles.includes(role)) return true;
    const equivalents = {
      kitchen: ["cucina"],
      cucina: ["kitchen"],
      cashier: ["cassa"],
      cassa: ["cashier"],
      cash_manager: ["cassa"],
      kitchen_manager: ["cucina"],
      sala_manager: ["sala"],
      bar_manager: ["bar"],
      bar: ["bar_manager"],
    };
    const equiv = equivalents[role];
    if (equiv && equiv.some((e) => allowedRoles.includes(e))) return true;
    if (role === "owner") return true;
    return false;
  }

  function redirectToLogin(denied) {
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    const qs = denied ? "?denied=1" : (returnTo ? "?return=" + returnTo : "");
    window.location.replace(LOGIN_PATH + qs);
  }

  async function run() {
    const allowedRoles = getPathRoles();

    const overlay = document.createElement("div");
    overlay.id = "rw-auth-overlay";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(5,7,18,0.95);display:flex;align-items:center;justify-content:center;z-index:99999;color:#f8f8fb;font-family:system-ui,sans-serif;font-size:14px;";
    overlay.textContent = "Verifica accesso...";
    document.body.prepend(overlay);

    try {
      const res = await fetch("/api/auth/me", { credentials: "same-origin" });

      if (!res.ok) {
        overlay.remove();
        redirectToLogin(false);
        return;
      }

      const user = await res.json();
      const role = user.role || "";
      const username = user.username || "";

      if (allowedRoles && allowedRoles.length > 0 && !roleMatchesAllowed(allowedRoles, role)) {
        overlay.remove();
        redirectToLogin(true);
        return;
      }

      try {
        localStorage.setItem(
          "rw_auth",
          JSON.stringify({
            user: username,
            role: role,
            department: user.department || null,
            loginAt: new Date().toISOString(),
          })
        );
      } catch (_) {}

      overlay.remove();
      if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent("rw:auth-ready", { detail: user }));
      }
    } catch (err) {
      console.warn("Auth guard:", err);
      overlay.remove();
      redirectToLogin(false);
    }
  }

  window.RW_AuthGuard = {
    run,
    getStoredAuth: function () {
      try {
        const raw = localStorage.getItem("rw_auth");
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
