// License activation page
const form = document.getElementById("license-form");
const messageEl = document.getElementById("license-message");
const btnActivate = document.getElementById("btn-activate");

function showMessage(text, type) {
  messageEl.textContent = text || "";
  messageEl.className = "login-message" + (type ? " " + type : "");
}

const params = new URLSearchParams(window.location.search);
if (params.get("expired") === "1") {
  showMessage("La licenza è scaduta. Inserisci un nuovo codice per continuare.", "error");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const restaurantName = document.getElementById("restaurantName").value.trim();
  const licenseCode = document.getElementById("licenseCode").value.trim();

  if (!restaurantName || !licenseCode) {
    showMessage("Compila tutti i campi.", "error");
    return;
  }

  btnActivate.disabled = true;
  showMessage("Attivazione in corso...");

  try {
    const res = await fetch("/api/license/activate", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: licenseCode, restaurantName }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showMessage(data.error || "Attivazione fallita.", "error");
      btnActivate.disabled = false;
      return;
    }

    showMessage("Licenza attivata. Reindirizzamento al login...", "success");
    setTimeout(() => {
      window.location.href = "/login/login.html";
    }, 1500);
  } catch (err) {
    showMessage("Errore di rete. Riprova.", "error");
    btnActivate.disabled = false;
  }
});
