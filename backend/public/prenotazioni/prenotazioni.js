// =============================
//   PRENOTAZIONI – wired to /api/bookings
// =============================

let allBookings = [];
let activeFilters = {
  date: "",
  status: "",
  search: "",
};

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options,
  });
  if (!res.ok) {
    if (res.status === 401) {
      try { localStorage.removeItem("rw_auth"); } catch (_) {}
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = "/login/login.html" + (returnTo ? "?return=" + returnTo : "");
      return;
    }
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// =============================
//   API
// =============================

async function loadFromAPI() {
  const data = await fetchJSON("/api/bookings");
  return Array.isArray(data) ? data : [];
}

async function saveBookingAPI(payload) {
  return fetchJSON("/api/bookings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function updateBookingAPI(id, payload) {
  return fetchJSON(`/api/bookings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

async function deleteBookingAPI(id) {
  return fetchJSON(`/api/bookings/${id}`, { method: "DELETE" });
}

// =============================
//   UTILITY
// =============================

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("it-IT");
}

function formatTime(timeStr) {
  if (!timeStr) return "";
  return String(timeStr).substring(0, 5);
}

function statusLabel(status) {
  switch (status) {
    case "nuova": return "Nuova";
    case "confermata": return "Confermata";
    case "arrivato": return "Arrivato";
    case "no_show": return "No-show";
    case "cancellata": return "Cancellata";
    default: return status || "-";
  }
}

// =============================
//   KPI
// =============================

function renderKpi() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayList = allBookings.filter((b) => (b.date || "").slice(0, 10) === todayStr);
  const confirmed = todayList.filter((b) => b.status === "confermata");
  const arrived = todayList.filter((b) => b.status === "arrivato");

  document.getElementById("kpi-today").textContent = todayList.length || 0;
  document.getElementById("kpi-confirmed").textContent = confirmed.length || 0;
  document.getElementById("kpi-arrived").textContent = arrived.length || 0;
}

// =============================
//   FILTRI
// =============================

function applyFilters(bookings) {
  let filtered = [...bookings];
  if (activeFilters.date) {
    filtered = filtered.filter((b) => (b.date || "").slice(0, 10) === activeFilters.date);
  }
  if (activeFilters.status) {
    filtered = filtered.filter((b) => b.status === activeFilters.status);
  }
  if (activeFilters.search) {
    const s = activeFilters.search.toLowerCase();
    filtered = filtered.filter(
      (b) =>
        (b.name && b.name.toLowerCase().includes(s)) ||
        (b.phone && b.phone.toLowerCase().includes(s))
    );
  }
  filtered.sort((a, b) => {
    const aKey = (a.date || "") + " " + (a.time || "");
    const bKey = (b.date || "") + " " + (b.time || "");
    return aKey.localeCompare(bKey);
  });
  return filtered;
}

function setupFilters() {
  const dateInput = document.getElementById("filter-date");
  const statusSel = document.getElementById("filter-status");
  const searchInput = document.getElementById("filter-search");
  const resetBtn = document.getElementById("btn-reset-filters");

  dateInput.addEventListener("change", () => {
    activeFilters.date = dateInput.value || "";
    renderBookingsList();
  });
  statusSel.addEventListener("change", () => {
    activeFilters.status = statusSel.value || "";
    renderBookingsList();
  });
  searchInput.addEventListener("input", () => {
    activeFilters.search = searchInput.value.trim();
    renderBookingsList();
  });
  resetBtn.addEventListener("click", () => {
    activeFilters = { date: "", status: "", search: "" };
    dateInput.value = "";
    statusSel.value = "";
    searchInput.value = "";
    renderBookingsList();
  });
}

// =============================
//   RENDER LISTA
// =============================

function renderBookingsList() {
  const container = document.getElementById("bookings-list");
  container.innerHTML = "";

  const filtered = applyFilters(allBookings);

  if (!filtered.length) {
    container.innerHTML =
      '<div class="booking-meta">Nessuna prenotazione con i filtri attuali.</div>';
    renderKpi();
    return;
  }

  filtered.forEach((b) => {
    const div = document.createElement("div");
    const statusClass = "status-" + (b.status || "nuova");
    const guests = b.people ?? b.guests ?? "-";

    div.className = "booking-card";
    div.innerHTML = `
      <div class="booking-top">
        <div class="booking-main">
          <div class="booking-name">
            ${(b.name || "Senza nome").replace(/</g, "&lt;")} • ${guests} pers.
          </div>
          <div class="booking-meta">
            ${formatDate(b.date)} • ${formatTime(b.time) || "-"} • Tel: ${(b.phone || "-").replace(/</g, "&lt;")}
            ${b.area ? " • Area: " + b.area : ""}
          </div>
          ${b.note || b.notes ? `<div class="booking-meta">Note: ${String(b.note || b.notes).replace(/</g, "&lt;")}</div>` : ""}
        </div>
        <div>
          <span class="booking-status-badge ${statusClass}">${statusLabel(b.status)}</span>
        </div>
      </div>
      <div class="booking-actions">
        <button class="btn-xs" data-action="set-status" data-status="nuova" data-id="${b.id}">Nuova</button>
        <button class="btn-xs" data-action="set-status" data-status="confermata" data-id="${b.id}">Conferma</button>
        <button class="btn-xs" data-action="set-status" data-status="arrivato" data-id="${b.id}">Arrivato</button>
        <button class="btn-xs" data-action="set-status" data-status="no_show" data-id="${b.id}">No-show</button>
        <button class="btn-xs danger" data-action="set-status" data-status="cancellata" data-id="${b.id}">Cancella</button>
      </div>
    `;

    div.querySelectorAll("[data-action='set-status']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const status = btn.getAttribute("data-status");
        updateBookingStatus(id, status);
      });
    });

    container.appendChild(div);
  });

  renderKpi();
}

// =============================
//   CREAZIONE PRENOTAZIONE
// =============================

async function handleSaveBooking() {
  const date = document.getElementById("field-date").value;
  const time = document.getElementById("field-time").value;
  const name = document.getElementById("field-name").value.trim();
  const phone = document.getElementById("field-phone").value.trim();
  const guests = Number(document.getElementById("field-guests").value);
  const area = document.getElementById("field-area").value;
  const notes = document.getElementById("field-notes").value.trim();

  if (!date) {
    alert("Inserisci la data della prenotazione.");
    return;
  }
  if (!time) {
    alert("Inserisci l'ora della prenotazione.");
    return;
  }
  if (!name) {
    alert("Inserisci il nome del cliente.");
    return;
  }
  if (!guests || guests <= 0) {
    alert("Inserisci il numero di persone.");
    return;
  }

  try {
    const created = await saveBookingAPI({
      date,
      time,
      name,
      phone,
      people: guests,
      area,
      notes,
      status: "nuova",
    });
    allBookings.push(created);

    document.getElementById("field-name").value = "";
    document.getElementById("field-phone").value = "";
    document.getElementById("field-guests").value = "";
    document.getElementById("field-notes").value = "";

    renderBookingsList();
  } catch (err) {
    console.error("Errore salvataggio prenotazione:", err);
    alert("Errore: " + (err.message || "Salvataggio fallito."));
  }
}

// =============================
//   UPDATE STATO
// =============================

async function updateBookingStatus(id, status) {
  try {
    const updated = await updateBookingAPI(id, { status });
    const idx = allBookings.findIndex((b) => String(b.id) === String(id));
    if (idx >= 0) allBookings[idx] = updated;
    else allBookings.push(updated);
    renderBookingsList();
  } catch (err) {
    console.error("Errore aggiornamento stato:", err);
    alert("Errore: " + (err.message || "Aggiornamento fallito."));
  }
}

// =============================
//   REFRESH
// =============================

async function refreshBookings() {
  const listEl = document.getElementById("bookings-list");
  listEl.innerHTML = "<div class='booking-meta'>Caricamento...</div>";

  try {
    allBookings = await loadFromAPI();
    renderBookingsList();
  } catch (err) {
    console.error("Errore caricamento prenotazioni:", err);
    listEl.innerHTML = "<div class='booking-meta error'>Errore caricamento. Riprova.</div>";
  }
}

// =============================
//   INIT
// =============================

document.addEventListener("DOMContentLoaded", async () => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const fieldDate = document.getElementById("field-date");
  const filterDate = document.getElementById("filter-date");
  if (fieldDate) fieldDate.value = todayStr;
  if (filterDate) {
    filterDate.value = todayStr;
    activeFilters.date = todayStr;
  }

  document.getElementById("btn-save-booking").addEventListener("click", handleSaveBooking);
  document.getElementById("btn-refresh").addEventListener("click", refreshBookings);

  setupFilters();
  await refreshBookings();
});
