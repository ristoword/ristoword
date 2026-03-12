// =============================
//   STORAGE LOCALE STAFF
// =============================

const STORAGE_KEY = "rw_staff";

function loadStaff() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Errore caricamento staff:", err);
    return [];
  }
}

function saveStaff(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error("Errore salvataggio staff:", err);
  }
}

let staffList = [];
let filters = {
  department: "",
  status: "",
  search: ""
};

// =============================
//   KPI
// =============================

function renderKpi() {
  const total = staffList.length;
  const active = staffList.filter(p => p.active).length;
  const extra = staffList.filter(p => p.contract === "extra").length;

  document.getElementById("kpi-total").textContent = total;
  document.getElementById("kpi-active").textContent = active;
  document.getElementById("kpi-extra").textContent = extra;
}

// =============================
//   FILTRI
// =============================

function applyFilters(list) {
  let result = [...list];

  if (filters.department) {
    result = result.filter(p => p.department === filters.department);
  }

  if (filters.status === "attivo") {
    result = result.filter(p => p.active);
  } else if (filters.status === "non_attivo") {
    result = result.filter(p => !p.active);
  } else if (filters.status === "extra") {
    result = result.filter(p => p.contract === "extra");
  }

  if (filters.search) {
    const s = filters.search.toLowerCase();
    result = result.filter(p => {
      const full = `${p.firstname || ""} ${p.lastname || ""}`.toLowerCase();
      return full.includes(s);
    });
  }

  return result;
}

// =============================
//   RENDER LISTA STAFF
// =============================

function renderStaffList() {
  const container = document.getElementById("staff-list");
  container.innerHTML = "";

  const filtered = applyFilters(staffList);

  if (!filtered.length) {
    container.innerHTML =
      '<div class="staff-card"><div class="staff-notes">Nessun membro staff con i filtri attuali.</div></div>';
    return;
  }

  // Ordina per reparto / ruolo / nome
  filtered.sort((a, b) => {
    const da = (a.department || "").localeCompare(b.department || "");
    if (da !== 0) return da;
    const ra = (a.role || "").localeCompare(b.role || "");
    if (ra !== 0) return ra;
    const na = (a.lastname || "").localeCompare(b.lastname || "");
    return na;
  });

  filtered.forEach(person => {
    const card = document.createElement("div");
    card.className = "staff-card";

    const name = `${person.firstname || ""} ${person.lastname || ""}`.trim();

    const deptLabel = person.department
      ? person.department.charAt(0).toUpperCase() + person.department.slice(1)
      : "N/D";

    const contractLabel = (() => {
      switch (person.contract) {
        case "full-time":
          return "Full-time";
        case "part-time":
          return "Part-time";
        case "extra":
          return "Extra";
        default:
          return "Altro";
      }
    })();

    card.innerHTML = `
      <div class="staff-card-header">
        <div>
          <div class="staff-name">${name || "(senza nome)"}</div>
          <div class="staff-role">
            ${person.role || "Ruolo non indicato"} • ${deptLabel}
          </div>
        </div>
      </div>

      <div class="staff-tags">
        <span class="tag ${person.active ? "active" : "inactive"}">
          ${person.active ? "Attivo" : "Non attivo"}
        </span>
        <span class="tag contract-tag">${contractLabel}</span>
        ${
          person.hours
            ? `<span class="tag">${person.hours} h/settimana</span>`
            : ""
        }
      </div>

      ${
        person.notes
          ? `<div class="staff-notes">${person.notes}</div>`
          : ""
      }

      <div class="staff-actions">
        <button class="btn-xs" data-action="toggle-active" data-id="${
          person.id
        }">
          ${person.active ? "Metti non attivo" : "Metti attivo"}
        </button>
        <button class="btn-xs danger" data-action="delete" data-id="${
          person.id
        }">
          Elimina
        </button>
      </div>
    `;

    // Azioni
    card.querySelectorAll("button[data-action]").forEach(btn => {
      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");

      btn.addEventListener("click", () => {
        if (action === "toggle-active") {
          toggleActive(id);
        } else if (action === "delete") {
          deleteStaff(id);
        }
      });
    });

    container.appendChild(card);
  });
}

// =============================
//   AZIONI STAFF
// =============================

function addStaff() {
  const firstname = document.getElementById("field-firstname").value.trim();
  const lastname = document.getElementById("field-lastname").value.trim();
  const role = document.getElementById("field-role").value.trim();
  const department = document.getElementById("field-department").value;
  const contract = document.getElementById("field-contract").value;
  const hoursRaw = document.getElementById("field-hours").value;
  const notes = document.getElementById("field-notes").value.trim();
  const active = document.getElementById("field-active").checked;

  if (!firstname && !lastname) {
    alert("Inserisci almeno nome o cognome.");
    return;
  }

  const hours = hoursRaw ? Number(hoursRaw) : null;

  const newStaff = {
    id: Date.now().toString(),
    firstname,
    lastname,
    role,
    department,
    contract,
    hours: Number.isFinite(hours) ? hours : null,
    notes,
    active
  };

  staffList.push(newStaff);
  saveStaff(staffList);
  clearForm();
  renderKpi();
  renderStaffList();
}

function clearForm() {
  document.getElementById("field-firstname").value = "";
  document.getElementById("field-lastname").value = "";
  document.getElementById("field-role").value = "";
  document.getElementById("field-department").value = "";
  document.getElementById("field-contract").value = "full-time";
  document.getElementById("field-hours").value = "";
  document.getElementById("field-notes").value = "";
  document.getElementById("field-active").checked = true;
}

function toggleActive(id) {
  const idx = staffList.findIndex(p => p.id === id);
  if (idx === -1) return;
  staffList[idx].active = !staffList[idx].active;
  saveStaff(staffList);
  renderKpi();
  renderStaffList();
}

function deleteStaff(id) {
  const person = staffList.find(p => p.id === id);
  const name = person
    ? `${person.firstname || ""} ${person.lastname || ""}`.trim()
    : "";

  const ok = confirm(
    name
      ? `Vuoi davvero eliminare ${name} dallo staff?`
      : "Vuoi davvero eliminare questo membro staff?"
  );
  if (!ok) return;

  staffList = staffList.filter(p => p.id !== id);
  saveStaff(staffList);
  renderKpi();
  renderStaffList();
}

// =============================
//   SETUP FILTRI
// =============================

function setupFilters() {
  const depSel = document.getElementById("filter-department");
  const statusSel = document.getElementById("filter-status");
  const searchInput = document.getElementById("filter-search");
  const resetBtn = document.getElementById("btn-reset-filters");

  depSel.addEventListener("change", () => {
    filters.department = depSel.value;
    renderStaffList();
  });

  statusSel.addEventListener("change", () => {
    filters.status = statusSel.value;
    renderStaffList();
  });

  searchInput.addEventListener("input", () => {
    filters.search = searchInput.value.trim();
    renderStaffList();
  });

  resetBtn.addEventListener("click", () => {
    filters = { department: "", status: "", search: "" };
    depSel.value = "";
    statusSel.value = "";
    searchInput.value = "";
    renderStaffList();
  });
}

// =============================
//   INIT
// =============================

document.addEventListener("DOMContentLoaded", () => {
  staffList = loadStaff();
  renderKpi();
  renderStaffList();
  setupFilters();

  document
    .getElementById("btn-add-staff")
    .addEventListener("click", addStaff);

  document
    .getElementById("btn-refresh")
    .addEventListener("click", () => {
      staffList = loadStaff();
      renderKpi();
      renderStaffList();
    });
});