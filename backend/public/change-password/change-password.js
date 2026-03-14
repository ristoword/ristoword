// change-password.js – Cambio password obbligatorio al primo accesso

const form = document.getElementById("change-form");
const messageBox = document.getElementById("change-message");
const btnSubmit = document.getElementById("btn-submit");

function showMessage(text, type = "") {
  messageBox.textContent = text || "";
  messageBox.className = "login-message";
  if (type) messageBox.classList.add(type);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const currentPassword = document.getElementById("current-password").value;
  const newPassword = document.getElementById("new-password").value;
  const confirmPassword = document.getElementById("confirm-password").value;

  if (!currentPassword || !newPassword) {
    showMessage("Compila tutti i campi.", "error");
    return;
  }

  if (newPassword.length < 8) {
    showMessage("La nuova password deve essere di almeno 8 caratteri.", "error");
    return;
  }

  if (newPassword !== confirmPassword) {
    showMessage("Le due password non coincidono.", "error");
    return;
  }

  btnSubmit.disabled = true;
  showMessage("Aggiornamento in corso...");

  try {
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword,
        newPassword,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showMessage(data.message || "Errore durante l'aggiornamento.", "error");
      btnSubmit.disabled = false;
      return;
    }

    showMessage("Password aggiornata. Reindirizzamento...", "success");
    setTimeout(() => {
      window.location.href = "/dashboard/dashboard.html";
    }, 800);
  } catch (err) {
    console.error("Errore cambio password:", err);
    showMessage("Errore di connessione. Riprova.", "error");
    btnSubmit.disabled = false;
  }
});
