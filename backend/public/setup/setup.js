const form = document.getElementById("setup-form");
const messageEl = document.getElementById("setup-message");
const btnSetup = document.getElementById("btn-setup");

function showMessage(text, type) {
  messageEl.textContent = text || "";
  messageEl.className = "login-message" + (type ? " " + type : "");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const restaurantName = document.getElementById("restaurantName").value.trim();
  const numTables = Number(document.getElementById("numTables").value) || 20;
  const departments = {
    sala: document.getElementById("dept-sala").checked,
    cucina: document.getElementById("dept-cucina").checked,
    pizzeria: document.getElementById("dept-pizzeria").checked,
    bar: document.getElementById("dept-bar").checked,
  };
  const seedMenu = document.getElementById("seedMenu").checked;

  if (!restaurantName) {
    showMessage("Inserisci il nome del ristorante.", "error");
    return;
  }

  btnSetup.disabled = true;
  showMessage("Configurazione in corso...");

  try {
    const res = await fetch("/api/setup", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantName,
        numTables,
        departments,
        seedMenu,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showMessage(data.error || "Errore durante la configurazione.", "error");
      btnSetup.disabled = false;
      return;
    }

    showMessage("Configurazione completata. Reindirizzamento al login...", "success");
    setTimeout(() => {
      window.location.href = "/login/login.html";
    }, 1500);
  } catch (err) {
    showMessage("Errore di rete. Riprova.", "error");
    btnSetup.disabled = false;
  }
});
