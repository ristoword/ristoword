let menuPortate = [];
let cateringEvents = [];

// --- API ---
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    if (res.status === 401) {
      try { localStorage.removeItem("rw_auth"); } catch (_) {}
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = "/login/login.html" + (returnTo ? "?return=" + returnTo : "");
      return;
    }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function loadEventsFromAPI() {
  try {
    cateringEvents = await fetchJSON("/api/catering");
    if (!Array.isArray(cateringEvents)) cateringEvents = [];
  } catch (err) {
    console.error("Catering load error:", err);
    cateringEvents = [];
  }
}

function renderEventList() {
  const container = document.getElementById("event-list");
  if (!container) return;

  if (!cateringEvents.length) {
    container.innerHTML = '<div class="event-empty">Nessun evento salvato.</div>';
    return;
  }

  container.innerHTML = cateringEvents
    .slice()
    .reverse()
    .map(
      (e) => `
    <div class="event-item" data-id="${e.id}">
      <div class="event-item-info">
        <strong>${escapeHtml(e.customer || "Senza nome")}</strong> – ${e.date || "-"} – ${e.people || 0} pax – € ${Number(e.price || 0).toFixed(2)}
        ${e.note ? `<br><small>${escapeHtml(e.note)}</small>` : ""}
      </div>
      <button class="btn-delete" data-id="${e.id}">Elimina</button>
    </div>
  `
    )
    .join("");

  container.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      if (!id || !confirm("Eliminare questo evento?")) return;
      try {
        await fetchJSON(`/api/catering/${id}`, { method: "DELETE" });
        cateringEvents = cateringEvents.filter((x) => x.id !== id);
        renderEventList();
      } catch (err) {
        alert("Errore eliminazione: " + err.message);
      }
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function initCateringEvents() {
  await loadEventsFromAPI();
  renderEventList();

  const btnSave = document.getElementById("btn-save-event");
  const btnRefresh = document.getElementById("btn-refresh-events");

  if (btnSave) {
    btnSave.addEventListener("click", async () => {
      const customer = document.getElementById("cliente")?.value?.trim() || "";
      const date = document.getElementById("dataEvento")?.value || "";
      const people = Number(document.getElementById("personeEffettive")?.value) || Number(document.getElementById("personePreviste")?.value) || 0;
      const price = Number(document.getElementById("prezzoPersona")?.value) || 0;
      const incasso = price * people;
      const note = `Incasso: € ${incasso.toFixed(2)}`;

      if (!date || !customer) {
        alert("Inserisci almeno cliente e data evento.");
        return;
      }

      try {
        const created = await fetchJSON("/api/catering", {
          method: "POST",
          body: JSON.stringify({
            customer,
            date,
            people,
            price: incasso,
            note,
          }),
        });
        cateringEvents.push(created);
        renderEventList();
      } catch (err) {
        alert("Errore salvataggio: " + err.message);
      }
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener("click", async () => {
      await loadEventsFromAPI();
      renderEventList();
    });
  }
}

// --- Calcolatore menu ---
function setMenuType(tipo) {
  const container = document.getElementById("menuContainer");
  container.innerHTML = "";
  menuPortate = [];

  let numero = tipo === "degustazione" ? 6 : tipo;

  for (let i = 1; i <= numero; i++) {
    const div = document.createElement("div");
    div.innerHTML = `
      <label>Portata ${i}
        <input type="text" placeholder="Nome piatto">
      </label>
      <label>Costo per porzione €
        <input type="number" value="5">
      </label>
      <hr>
    `;
    container.appendChild(div);
  }
}

function calcolaCatering() {
  const personePreviste = Number(document.getElementById("personePreviste").value);
  const personeEffettive = Number(document.getElementById("personeEffettive").value);
  const prezzoPersona = Number(document.getElementById("prezzoPersona").value);

  const inputs = document.querySelectorAll("#menuContainer input[type='number']");
  let costoPerPersona = 0;

  inputs.forEach(i => costoPerPersona += Number(i.value));

  const costoPrevisto = costoPerPersona * personePreviste;
  const costoReale = costoPerPersona * personeEffettive;

  const incasso = prezzoPersona * personeEffettive;

  const speseExtra =
    Number(document.getElementById("spesaNoleggio").value) +
    Number(document.getElementById("spesaPersonale").value) +
    Number(document.getElementById("spesaTrasporto").value) +
    Number(document.getElementById("spesaAltro").value);

  const margine = incasso - (costoReale + speseExtra);
  const foodCostPerc = ((costoReale / incasso) * 100).toFixed(2);

  document.getElementById("risultati").innerHTML = `
    Costo previsto (teorico): € ${costoPrevisto.toFixed(2)}<br>
    Costo reale: € ${costoReale.toFixed(2)}<br>
    Incasso: € ${incasso.toFixed(2)}<br>
    Spese extra: € ${speseExtra.toFixed(2)}<br>
    Margine reale: € ${margine.toFixed(2)}<br>
    Food Cost: ${foodCostPerc}%
  `;
}

function aggiungiIncassoGiornaliero() {
  const incasso = Number(document.getElementById("prezzoPersona").value) *
                  Number(document.getElementById("personeEffettive").value);

  let totale = Number(localStorage.getItem("incassoGiornaliero") || 0);
  totale += incasso;

  localStorage.setItem("incassoGiornaliero", totale);

  alert("Incasso aggiunto alla giornata.");
}

document.addEventListener("DOMContentLoaded", initCateringEvents);