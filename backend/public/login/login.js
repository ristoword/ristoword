const form = document.getElementById("login-form");
const messageBox = document.getElementById("login-message");
const btnLogin = document.getElementById("btn-login");

function showMessage(text, type = "") {
  messageBox.textContent = text || "";
  messageBox.className = "login-message";
  if (type) messageBox.classList.add(type);
}

function getRedirectByRole(role) {
  const r = (role || "").toLowerCase();
  if (r === "owner") return "/dashboard/dashboard.html";
  if (r === "sala") return "/sala/sala.html";
  if (r === "cucina") return "/cucina/cucina.html";
  if (r === "cassa") return "/cassa/cassa.html";
  if (r === "supervisor") return "/supervisor/supervisor.html";
  if (r === "cashier") return "/cassa/cassa.html";
  if (r === "kitchen") return "/cucina/cucina.html";
  if (r === "staff") return "/staff/staff.html";
  if (r === "customer") return "/dashboard/dashboard.html";
  return "/dashboard/dashboard.html";
}

function getReturnUrl() {
  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get("return");
  if (returnTo && returnTo.startsWith("/")) return returnTo;
  return null;
}

async function submitLogin(payload) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json()
    : await res.text();

  if (!res.ok) {
    const msg =
      (data && data.message) ||
      (data && data.error) ||
      (typeof data === "string" && data) ||
      "Login non riuscito";
    throw new Error(msg);
  }

  return data;
}

const params = new URLSearchParams(window.location.search);
if (params.get("denied") === "1") showMessage("Accesso negato per questo ruolo.", "error");
if (params.get("license") === "required") {
  const msg = document.getElementById("login-message");
  if (msg) msg.innerHTML = 'Attivare la licenza per accedere. <a href="/license/license.html" style="color:var(--accent)">Attiva licenza</a>';
}
if (params.get("license") === "expired") {
  const msg = document.getElementById("login-message");
  if (msg) msg.innerHTML = 'Licenza scaduta. <a href="/license/license.html" style="color:var(--accent)">Rinnova licenza</a>';
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const role = document.getElementById("role").value;

  if (!username || !password) {
    showMessage("Inserisci utente e password.", "error");
    return;
  }

  btnLogin.disabled = true;
  showMessage("Accesso in corso...");

  try {
    const data = await submitLogin({ username, password, role });

    localStorage.setItem(
      "rw_auth",
      JSON.stringify({
        user: data.user || username,
        role: data.role || role,
        token: data.token || null,
        loginAt: new Date().toISOString()
      })
    );

    showMessage("Accesso effettuato.", "success");

    const redirectTo = getReturnUrl() || data.redirectTo || getRedirectByRole(data.role || role);

    setTimeout(() => {
      window.location.href = redirectTo;
    }, 500);
  } catch (error) {
    console.error("Errore login:", error);
    showMessage(error.message || "Errore di accesso.", "error");
  } finally {
    btnLogin.disabled = false;
  }
});