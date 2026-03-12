// backend/public/shared/api.js
// Helper fetch unico per tutti i moduli (Sala/Cucina/Pizzeria/Cassa/Supervisor)
// + gestione login/licenza con token

(function () {

  const TOKEN_KEY = "rw_token";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  async function request(url, options = {}) {

    const token = getToken();

    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    // aggiunge token se presente
    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }

    const opts = {
      ...options,
      credentials: options.credentials ?? "same-origin",
      headers,
    };

    const res = await fetch(url, opts);

    let data = null;

    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      try {
        data = await res.json();
      } catch (_) {
        data = null;
      }
    } else {
      try {
        data = await res.text();
      } catch (_) {
        data = null;
      }
    }

    if (!res.ok) {

      // se non autorizzato torna al login
      if (res.status === 401) {
        clearToken();
        try { localStorage.removeItem("rw_auth"); } catch (_) {}
        const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = "/login/login.html" + (returnTo ? "?return=" + returnTo : "");
        return;
      }

      const msg =
        (data && data.error) ||
        (typeof data === "string" && data) ||
        `HTTP ${res.status}`;

      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  }

  const api = {

    get: (url) => request(url, { method: "GET" }),

    post: (url, body) =>
      request(url, {
        method: "POST",
        body: JSON.stringify(body || {})
      }),

    patch: (url, body) =>
      request(url, {
        method: "PATCH",
        body: JSON.stringify(body || {})
      }),

    del: (url) =>
      request(url, {
        method: "DELETE"
      }),

    setToken,
    clearToken,
    getToken
  };

  window.RW_API = api;

})();