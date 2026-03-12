// backend/public/supervisor/staff/staff.js

const DEPARTMENTS = ["cassa", "cucina", "sala", "bar", "supervisor", "pizzeria", "magazzino", "altro"];
const CONTRACT_TYPES = ["indeterminato", "determinato", "apprendistato", "part-time", "collaborazione", "stage", "altro"];

let currentStaff = null;
let isEditMode = false;

function safeText(s) {
  return s == null || s === "" ? "—" : String(s);
}

function toMoney(val) {
  const n = Number(val);
  return Number.isFinite(n) ? "€ " + n.toFixed(2) : "—";
}

function formatDate(val) {
  if (!val) return "—";
  const d = new Date(val);
  return isNaN(d.getTime()) ? val : d.toLocaleDateString("it-IT");
}

function computeAge(birthDate) {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

async function apiGetStaff(filters = {}) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.department) params.set("department", filters.department);
  if (filters.active !== undefined && filters.active !== "") params.set("active", filters.active);
  const qs = params.toString();
  const url = qs ? `/api/staff?${qs}` : "/api/staff";
  const data = await (window.RW_API ? window.RW_API.get(url) : fetch(url, { credentials: "same-origin" }).then((r) => r.json()));
  return data;
}

async function apiGetStaffById(id) {
  if (window.RW_API) return window.RW_API.get(`/api/staff/${id}`);
  const r = await fetch(`/api/staff/${id}`, { credentials: "same-origin" });
  if (!r.ok) {
    const errData = await r.json().catch(() => ({}));
    throw new Error(errData.error || "Membro non trovato");
  }
  return r.json();
}

async function apiUpdateStaff(id, body) {
  if (window.RW_API) return window.RW_API.patch(`/api/staff/${id}`, body);
  const r = await fetch(`/api/staff/${id}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const errData = await r.json().catch(() => ({}));
    throw new Error(errData.error || "Update failed");
  }
  return r.json();
}

async function api(uri, opts = {}) {
  const url = uri.startsWith("/") ? uri : "/api/staff/" + uri;
  const r = await fetch(url, { credentials: "same-origin", headers: { "Content-Type": "application/json", ...opts.headers }, ...opts });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || err.message || "Errore");
  }
  return r.json();
}

function getFilters() {
  return {
    q: document.getElementById("f-search").value.trim(),
    department: document.getElementById("f-department").value.trim(),
    active: document.getElementById("f-status").value,
  };
}

function renderStaffList(items) {
  const el = document.getElementById("staff-list");
  el.innerHTML = "";

  if (!items || items.length === 0) {
    el.innerHTML = '<div class="staff-empty">Nessun membro trovato.</div>';
    return;
  }

  for (const s of items) {
    const row = document.createElement("div");
    row.className = "trow staff-trow staff-row";
    const fullName = s.name || (s.personal?.name && s.personal?.surname
      ? `${s.personal.name} ${s.personal.surname}`.trim()
      : s.personal?.name || s.name || "—");
    const dept = s.department || s.work?.department || "—";
    const role = s.role || s.work?.role || "—";
    const code = s.personal?.employeeCode || "—";
    const status = s.active !== false ? "Attivo" : "Non attivo";
    const statusClass = s.active !== false ? "status-active" : "status-inactive";

    row.innerHTML = `
      <span class="staff-name">${escapeHtml(fullName)}</span>
      <span>${escapeHtml(dept)}</span>
      <span>${escapeHtml(role)}</span>
      <span>${escapeHtml(code)}</span>
      <span class="${statusClass}">${status}</span>
      <span><a href="#" class="link-profile" data-id="${escapeHtml(s.id)}">Apri profilo</a></span>
    `;
    row.addEventListener("click", (e) => {
      e.preventDefault();
      showProfile(s.id);
    });
    el.appendChild(row);
  }
}

function escapeHtml(s) {
  if (s == null) return "";
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

async function loadAndRenderList() {
  try {
    const filters = getFilters();
    const data = await apiGetStaff(filters);
    renderStaffList(Array.isArray(data) ? data : []);
  } catch (err) {
    console.error("Errore caricamento staff:", err);
    document.getElementById("staff-list").innerHTML =
      '<div class="staff-empty error">Errore caricamento: ' + escapeHtml(err.message || "Sconosciuto") + "</div>";
  }
}

function showList() {
  document.getElementById("staff-list-view").style.display = "";
  document.getElementById("staff-profile-view").style.display = "none";
  document.getElementById("staff-reports-view").style.display = "none";
  loadAndRenderList();
}

function showReportsView() {
  document.getElementById("staff-list-view").style.display = "none";
  document.getElementById("staff-profile-view").style.display = "none";
  document.getElementById("staff-reports-view").style.display = "";
  loadReports();
}

async function showProfile(id) {
  window.history.replaceState({}, "", `/supervisor/staff/staff.html?id=${encodeURIComponent(id)}`);
  try {
    isEditMode = false;
    currentStaff = await apiGetStaffById(id);
    if (!currentStaff) {
      alert("Membro non trovato.");
      return;
    }
    document.getElementById("staff-list-view").style.display = "none";
    document.getElementById("staff-profile-view").style.display = "";
    document.getElementById("staff-reports-view").style.display = "none";
    document.getElementById("profile-title").textContent = currentStaff.name || "Profilo staff";
    renderProfile(currentStaff);
  } catch (err) {
    console.error("Errore caricamento profilo:", err);
    alert("Errore: " + (err.message || "Impossibile caricare il profilo"));
  }
}

function fieldRow(label, valueOrInput, edit) {
  if (edit) {
    return `<label>${escapeHtml(label)} ${valueOrInput}</label>`;
  }
  return `<div class="profile-row"><span class="profile-label">${escapeHtml(label)}</span><span class="profile-value">${valueOrInput}</span></div>`;
}

function renderProfile(s) {
  const p = s.personal || {};
  const w = s.work || {};
  const sal = s.salary || {};
  const att = s.attendance || {};
  const vac = s.vacations || {};
  const disc = s.discipline || {};

  const age = computeAge(p.birthDate);
  const ageDisplay = age != null ? age : (p.age != null ? p.age : "—");
  const edit = isEditMode;

  const content = document.getElementById("profile-content");
  const activeTab = document.querySelector(".profile-tab.active")?.dataset.tab || "dati";

  const personalBlock = edit
    ? `<div class="card-body form-grid">
        <label>Nome <input type="text" data-section="personal" data-field="name" value="${escapeHtml(p.name || s.name || "")}" /></label>
        <label>Cognome <input type="text" data-section="personal" data-field="surname" value="${escapeHtml(p.surname || "")}" /></label>
        <label>Data di nascita <input type="date" data-section="personal" data-field="birthDate" value="${escapeHtml(p.birthDate || "")}" /></label>
        <label>Età <input type="text" value="${ageDisplay}" readonly disabled /></label>
        <label>Telefono <input type="text" data-section="personal" data-field="phone" value="${escapeHtml(p.phone || "")}" /></label>
        <label>Email <input type="email" data-section="personal" data-field="email" value="${escapeHtml(p.email || "")}" /></label>
        <label class="full">Indirizzo <input type="text" data-section="personal" data-field="address" value="${escapeHtml(p.address || "")}" /></label>
        <label>Codice dipendente <input type="text" data-section="personal" data-field="employeeCode" value="${escapeHtml(p.employeeCode || "")}" /></label>
        <label>Data assunzione <input type="date" data-section="personal" data-field="hireDate" value="${escapeHtml(p.hireDate || "")}" /></label>
      </div>`
    : `<div class="card-body profile-readonly form-grid">
        ${fieldRow("Nome", safeText(p.name || s.name), false)}
        ${fieldRow("Cognome", safeText(p.surname), false)}
        ${fieldRow("Data di nascita", formatDate(p.birthDate), false)}
        ${fieldRow("Età", ageDisplay, false)}
        ${fieldRow("Telefono", safeText(p.phone), false)}
        ${fieldRow("Email", safeText(p.email), false)}
        ${fieldRow("Indirizzo", safeText(p.address), false)}
        ${fieldRow("Codice dipendente", safeText(p.employeeCode), false)}
        ${fieldRow("Data assunzione", formatDate(p.hireDate), false)}
      </div>`;

  const workBlock = edit
    ? `<div class="card-body form-grid">
        <label>Stato <input type="checkbox" data-section="root" data-field="active" ${s.active !== false ? "checked" : ""} /></label>
        <label>Reparto <select data-section="work" data-field="department">${DEPARTMENTS.map((d) => `<option value="${d}" ${(w.department || s.department || "") === d ? "selected" : ""}>${d}</option>`).join("")}</select></label>
        <label>Qualifica <input type="text" data-section="work" data-field="qualification" value="${escapeHtml(w.qualification || "")}" /></label>
        <label>Ruolo <input type="text" data-section="work" data-field="role" value="${escapeHtml(w.role || s.role || "")}" /></label>
        <label>Manager diretto <input type="text" data-section="work" data-field="directManager" value="${escapeHtml(w.directManager || "")}" /></label>
        <label>Tipo contratto <select data-section="work" data-field="contractType">${CONTRACT_TYPES.map((c) => `<option value="${c}" ${(w.contractType || "") === c ? "selected" : ""}>${c}</option>`).join("")}</select></label>
        <label>Inizio contratto <input type="date" data-section="work" data-field="contractStart" value="${escapeHtml(w.contractStart || "")}" /></label>
        <label>Fine contratto <input type="date" data-section="work" data-field="contractEnd" value="${escapeHtml(w.contractEnd || "")}" /></label>
        <label>Ore settimanali <input type="number" data-section="work" data-field="weeklyHours" step="0.5" value="${escapeHtml(w.weeklyHours != null ? w.weeklyHours : "")}" /></label>
        <label>Ore mensili contratto <input type="number" data-section="work" data-field="monthlyContractHours" step="0.5" value="${escapeHtml(w.monthlyContractHours != null ? w.monthlyContractHours : "")}" /></label>
      </div>`
    : `<div class="card-body profile-readonly form-grid">
        ${fieldRow("Stato", s.active !== false ? "Attivo" : "Non attivo", false)}
        ${fieldRow("Reparto", safeText(w.department || s.department), false)}
        ${fieldRow("Qualifica", safeText(w.qualification), false)}
        ${fieldRow("Ruolo", safeText(w.role || s.role), false)}
        ${fieldRow("Manager diretto", safeText(w.directManager), false)}
        ${fieldRow("Tipo contratto", safeText(w.contractType), false)}
        ${fieldRow("Inizio contratto", formatDate(w.contractStart), false)}
        ${fieldRow("Fine contratto", formatDate(w.contractEnd), false)}
        ${fieldRow("Ore settimanali", w.weeklyHours != null ? w.weeklyHours : "—", false)}
        ${fieldRow("Ore mensili contratto", w.monthlyContractHours != null ? w.monthlyContractHours : "—", false)}
      </div>`;

  const salaryBlock = edit
    ? `<div class="card-body form-grid">
        <label>Stipendio netto € <input type="number" data-section="salary" data-field="netSalary" step="0.01" value="${escapeHtml(sal.netSalary != null ? sal.netSalary : "")}" /></label>
        <label>Stipendio lordo € <input type="number" data-section="salary" data-field="grossSalary" step="0.01" value="${escapeHtml(sal.grossSalary != null ? sal.grossSalary : "")}" /></label>
        <label>Paga oraria € <input type="number" data-section="salary" data-field="hourlyRate" step="0.01" value="${escapeHtml(sal.hourlyRate != null ? sal.hourlyRate : "")}" /></label>
        <label>Bonus € <input type="number" data-section="salary" data-field="bonuses" step="0.01" value="${escapeHtml(sal.bonuses != null ? sal.bonuses : "")}" /></label>
        <label>Straordinari € <input type="number" data-section="salary" data-field="overtime" step="0.01" value="${escapeHtml(sal.overtime != null ? sal.overtime : "")}" /></label>
        <label>Deduzioni € <input type="number" data-section="salary" data-field="deductions" step="0.01" value="${escapeHtml(sal.deductions != null ? sal.deductions : "")}" /></label>
      </div>`
    : `<div class="card-body profile-readonly form-grid">
        ${fieldRow("Stipendio netto", toMoney(sal.netSalary), false)}
        ${fieldRow("Stipendio lordo", toMoney(sal.grossSalary), false)}
        ${fieldRow("Paga oraria", toMoney(sal.hourlyRate), false)}
        ${fieldRow("Bonus", toMoney(sal.bonuses), false)}
        ${fieldRow("Straordinari", toMoney(sal.overtime), false)}
        ${fieldRow("Deduzioni", toMoney(sal.deductions), false)}
      </div>`;

  const attendanceBlock = edit
    ? `<div class="card-body form-grid">
        <label>Ore oggi <input type="number" data-section="attendance" data-field="hoursToday" step="0.25" value="${escapeHtml(att.hoursToday != null ? att.hoursToday : "")}" /></label>
        <label>Ore settimana <input type="number" data-section="attendance" data-field="hoursWeek" step="0.25" value="${escapeHtml(att.hoursWeek != null ? att.hoursWeek : "")}" /></label>
        <label>Ore mese <input type="number" data-section="attendance" data-field="hoursMonth" step="0.25" value="${escapeHtml(att.hoursMonth != null ? att.hoursMonth : "")}" /></label>
        <label>Ore mensili rimanenti <input type="number" data-section="attendance" data-field="monthlyHoursRemaining" step="0.25" value="${escapeHtml(att.monthlyHoursRemaining != null ? att.monthlyHoursRemaining : "")}" /></label>
        <label>Straordinari (ore) <input type="number" data-section="attendance" data-field="overtime" step="0.25" value="${escapeHtml(att.overtime != null ? att.overtime : "")}" /></label>
        <label>Assenze <input type="number" data-section="attendance" data-field="absences" value="${escapeHtml(att.absences != null ? att.absences : "")}" /></label>
        <label>Ritardi <input type="number" data-section="attendance" data-field="delays" value="${escapeHtml(att.delays != null ? att.delays : "")}" /></label>
        <label>Uscite anticipate <input type="number" data-section="attendance" data-field="earlyExits" value="${escapeHtml(att.earlyExits != null ? att.earlyExits : "")}" /></label>
      </div>`
    : `<div class="card-body profile-readonly form-grid">
        ${fieldRow("Ore oggi", att.hoursToday != null ? att.hoursToday : "—", false)}
        ${fieldRow("Ore settimana", att.hoursWeek != null ? att.hoursWeek : "—", false)}
        ${fieldRow("Ore mese", att.hoursMonth != null ? att.hoursMonth : "—", false)}
        ${fieldRow("Ore mensili rimanenti", att.monthlyHoursRemaining != null ? att.monthlyHoursRemaining : "—", false)}
        ${fieldRow("Straordinari (ore)", att.overtime != null ? att.overtime : "—", false)}
        ${fieldRow("Assenze", att.absences != null ? att.absences : "—", false)}
        ${fieldRow("Ritardi", att.delays != null ? att.delays : "—", false)}
        ${fieldRow("Uscite anticipate", att.earlyExits != null ? att.earlyExits : "—", false)}
      </div>`;

  const vacationsBlock = edit
    ? `<div class="card-body form-grid">
        <label>Giorni maturati <input type="number" data-section="vacations" data-field="earned" value="${escapeHtml(vac.earned != null ? vac.earned : "")}" /></label>
        <label>Giorni usati <input type="number" data-section="vacations" data-field="used" value="${escapeHtml(vac.used != null ? vac.used : "")}" /></label>
        <label>Giorni rimanenti <input type="number" data-section="vacations" data-field="remaining" value="${escapeHtml(vac.remaining != null ? vac.remaining : "")}" /></label>
        <label>Richieste inviate <input type="number" data-section="vacations" data-field="requestsSent" value="${escapeHtml(vac.requestsSent != null ? vac.requestsSent : "")}" /></label>
        <label>Approvate <input type="number" data-section="vacations" data-field="approved" value="${escapeHtml(vac.approved != null ? vac.approved : "")}" /></label>
        <label>Rifiutate <input type="number" data-section="vacations" data-field="rejected" value="${escapeHtml(vac.rejected != null ? vac.rejected : "")}" /></label>
      </div>`
    : `<div class="card-body profile-readonly form-grid">
        ${fieldRow("Giorni maturati", vac.earned != null ? vac.earned : "—", false)}
        ${fieldRow("Giorni usati", vac.used != null ? vac.used : "—", false)}
        ${fieldRow("Giorni rimanenti", vac.remaining != null ? vac.remaining : "—", false)}
        ${fieldRow("Richieste inviate", vac.requestsSent != null ? vac.requestsSent : "—", false)}
        ${fieldRow("Approvate", vac.approved != null ? vac.approved : "—", false)}
        ${fieldRow("Rifiutate", vac.rejected != null ? vac.rejected : "—", false)}
      </div>`;

  const warnings = Array.isArray(disc.warnings) ? disc.warnings : [];
  const managerNotes = Array.isArray(disc.managerNotes) ? disc.managerNotes : [];
  const disciplineBlock = edit
    ? `<div class="card-body">
        <div class="discipline-list">
          <h3>Richiami (${warnings.length})</h3>
          ${warnings.map((w) => `<div class="discipline-item"><span class="date">${formatDate(w.date)}</span> ${escapeHtml(w.text || w.note || "")}</div>`).join("")}
          <div class="discipline-add">
            <input type="date" id="new-warning-date" value="${new Date().toISOString().slice(0, 10)}" />
            <input type="text" id="new-warning-text" placeholder="Testo richiamo" />
            <button type="button" class="btn ghost btn-sm" id="btn-add-warning">Aggiungi richiamo</button>
          </div>
        </div>
        <div class="discipline-list">
          <h3>Note manager (${managerNotes.length})</h3>
          ${managerNotes.map((n) => `<div class="discipline-item"><span class="date">${formatDate(n.date)}</span> ${escapeHtml(n.text || n.note || "")}</div>`).join("")}
          <div class="discipline-add">
            <input type="date" id="new-manager-note-date" value="${new Date().toISOString().slice(0, 10)}" />
            <input type="text" id="new-manager-note-text" placeholder="Nota manager" />
            <button type="button" class="btn ghost btn-sm" id="btn-add-manager-note">Aggiungi nota</button>
          </div>
        </div>
      </div>`
    : `<div class="card-body profile-readonly">
        <div class="discipline-list">
          <div class="mini-row"><span>Richiami</span><span>${warnings.length}</span></div>
          ${warnings.length ? warnings.slice(0, 5).map((w) => `<div class="discipline-item"><span class="date">${formatDate(w.date)}</span> ${escapeHtml((w.text || w.note || "").slice(0, 80))}${(w.text || w.note || "").length > 80 ? "…" : ""}</div>`).join("") : ""}
          <div class="mini-row"><span>Note manager</span><span>${managerNotes.length}</span></div>
          ${managerNotes.length ? managerNotes.slice(0, 5).map((n) => `<div class="discipline-item"><span class="date">${formatDate(n.date)}</span> ${escapeHtml((n.text || n.note || "").slice(0, 80))}${(n.text || n.note || "").length > 80 ? "…" : ""}</div>`).join("") : ""}
        </div>
      </div>`;

  content.innerHTML = `
    <div class="tab-panel ${activeTab === "dati" ? "" : "hidden"}" data-panel="dati">
    <section class="profile-card">
      <header class="card-header"><h2>Dati personali</h2></header>
      ${personalBlock}
    </section>
    <section class="profile-card">
      <header class="card-header"><h2>Dati di lavoro</h2></header>
      ${workBlock}
    </section>
    <section class="profile-card">
      <header class="card-header"><h2>Dati stipendio</h2></header>
      ${salaryBlock}
    </section>
    <section class="profile-card">
      <header class="card-header"><h2>Presenze e orari</h2></header>
      ${attendanceBlock}
    </section>
    <section class="profile-card">
      <header class="card-header"><h2>Ferie e permessi</h2></header>
      ${vacationsBlock}
    </section>
    <section class="profile-card full">
      <header class="card-header"><h2>Disciplina e note manager</h2></header>
      ${disciplineBlock}
    </section>
    </div>
    <div class="tab-panel hidden" data-panel="turni" id="panel-turni"><div class="panel-loading">Caricamento turni...</div></div>
    <div class="tab-panel hidden" data-panel="ore" id="panel-ore"><div class="panel-loading">Caricamento ore...</div></div>
    <div class="tab-panel hidden" data-panel="richieste" id="panel-richieste"><div class="panel-loading">Caricamento richieste...</div></div>
    <div class="tab-panel hidden" data-panel="disciplina" id="panel-disciplina"><div class="panel-loading">Caricamento disciplina...</div></div>
  `;

  document.querySelectorAll(".profile-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === activeTab));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== activeTab));

  updateProfileActionsVisibility();
  if (edit) bindDisciplineAddButtons();
  if (activeTab !== "dati") loadTabPanel(activeTab);
}

async function loadTabPanel(tab) {
  if (!currentStaff || !currentStaff.id) return;
  const panelMap = {
    turni: { id: "panel-turni", api: () => fetch(`/api/staff/${currentStaff.id}/shifts`, { credentials: "same-origin" }).then((r) => r.json()) },
    ore: { id: "panel-ore", api: () => fetch(`/api/staff/${currentStaff.id}/hours/summary`, { credentials: "same-origin" }).then((r) => r.json()) },
    richieste: { id: "panel-richieste", api: () => fetch(`/api/staff/${currentStaff.id}/requests`, { credentials: "same-origin" }).then((r) => r.json()) },
    disciplina: { id: "panel-disciplina", api: () => fetch(`/api/staff/${currentStaff.id}/discipline`, { credentials: "same-origin" }).then((r) => r.json()) },
  };
  const cfg = panelMap[tab];
  if (!cfg) return;
  const panel = document.getElementById(cfg.id);
  if (!panel) return;
  panel.innerHTML = '<div class="panel-loading">Caricamento...</div>';
  try {
    const data = await cfg.api();
    if (tab === "turni") {
      const shifts = Array.isArray(data) ? data : (data.shifts || data.history || []);
      panel.innerHTML = shifts.length
        ? `<div class="shift-list">${shifts.slice(0, 20).map((sh) => `<div class="mini-row">${formatDate(sh.date || sh.start)} – ${escapeHtml(sh.type || sh.role || "—")}</div>`).join("")}</div>`
        : '<div class="panel-loading">Nessun turno registrato</div>';
    } else if (tab === "ore") {
      const h = typeof data === "object" ? data : {};
      panel.innerHTML = `<div class="profile-readonly"><div class="mini-row"><span>Ore mese</span><span>${h.monthlyHours != null ? h.monthlyHours : "—"}</span></div><div class="mini-row"><span>Straordinari</span><span>${h.overtime != null ? h.overtime : "—"}</span></div></div>`;
    } else if (tab === "richieste") {
      const reqs = Array.isArray(data) ? data : (data.requests || []);
      panel.innerHTML = reqs.length
        ? `<div class="request-list">${reqs.slice(0, 15).map((r) => `<div class="request-item status-${(r.status || "").toLowerCase()}"><span>${formatDate(r.date)}</span> <span class="badge">${escapeHtml(r.status || "—")}</span> ${escapeHtml((r.type || r.reason || "").slice(0, 40))}</div>`).join("")}</div>`
        : '<div class="panel-loading">Nessuna richiesta</div>';
    } else if (tab === "disciplina") {
      const d = typeof data === "object" ? data : {};
      const warnings = d.warnings || [];
      const notes = d.managerNotes || [];
      panel.innerHTML = `<div class="discipline-list"><h3>Richiami</h3>${warnings.map((w) => `<div class="discipline-item">${formatDate(w.date)} – ${escapeHtml(w.text || w.note || "")}</div>`).join("")}<h3>Note manager</h3>${notes.map((n) => `<div class="discipline-item">${formatDate(n.date)} – ${escapeHtml(n.text || n.note || "")}</div>`).join("")}</div>`;
    }
  } catch (e) {
    panel.innerHTML = '<div class="panel-loading error">' + escapeHtml(e.message || "Errore") + "</div>";
  }
}

async function loadReports() {
  const month = document.getElementById("report-month")?.value || new Date().getMonth() + 1;
  const year = document.getElementById("report-year")?.value || new Date().getFullYear();
  const container = document.getElementById("reports-content");
  container.innerHTML = '<div class="panel-loading">Caricamento report...</div>';
  try {
    const [summary, hours, vacation] = await Promise.all([
      api("/api/staff/reports/summary"),
      api(`/api/staff/reports/hours?year=${year}&month=${month}`),
      api("/api/staff/reports/vacation"),
    ]);
    const deptRows = (summary.byDepartment && typeof summary.byDepartment === "object")
      ? Object.entries(summary.byDepartment).map(([dept, list]) => `<tr><td>${escapeHtml(dept)}</td><td>${Array.isArray(list) ? list.length : 0}</td></tr>`).join("")
      : "";
    container.innerHTML = `
      <section class="profile-card">
        <header class="card-header"><h2>Staff per reparto</h2></header>
        <div class="card-body"><table class="report-table"><thead><tr><th>Reparto</th><th>N.</th></tr></thead><tbody>${deptRows}</tbody></table></div>
      </section>
      <section class="profile-card">
        <header class="card-header"><h2>Ore mensili (${month}/${year})</h2></header>
        <div class="card-body"><p>Totale ore lavorate: <strong>${(hours.totalWorked || 0).toFixed(1)}</strong></p><p>Straordinari: <strong>${(hours.totalOvertime || 0).toFixed(1)}</strong> h</p></div>
      </section>
      <section class="profile-card">
        <header class="card-header"><h2>Ferie rimanenti</h2></header>
        <div class="card-body"><table class="report-table"><thead><tr><th>Nome</th><th>Reparto</th><th>Rimanenti</th></tr></thead><tbody>${(vacation || []).map((v) => `<tr><td>${escapeHtml(v.name)}</td><td>${escapeHtml(v.department)}</td><td>${v.remaining != null ? v.remaining : "—"}</td></tr>`).join("")}</tbody></table></div>
      </section>
    `;
  } catch (e) {
    container.innerHTML = '<div class="panel-loading error">' + escapeHtml(e.message) + "</div>";
  }
}

function setupReportFilters() {
  const now = new Date();
  const monthEl = document.getElementById("report-month");
  const yearEl = document.getElementById("report-year");
  if (monthEl) {
    for (let m = 1; m <= 12; m++) {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = String(m).padStart(2, "0");
      if (m === now.getMonth() + 1) o.selected = true;
      monthEl.appendChild(o);
    }
  }
  if (yearEl) {
    for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) {
      const o = document.createElement("option");
      o.value = y;
      o.textContent = y;
      yearEl.appendChild(o);
    }
  }
}

function updateProfileActionsVisibility() {
  const editBtn = document.getElementById("btn-edit-profile");
  const saveBtn = document.getElementById("btn-save-profile");
  const cancelBtn = document.getElementById("btn-cancel-profile");
  if (editBtn) editBtn.style.display = isEditMode ? "none" : "";
  if (saveBtn) saveBtn.style.display = isEditMode ? "" : "none";
  if (cancelBtn) cancelBtn.style.display = isEditMode ? "" : "none";
}

function enterEditMode() {
  isEditMode = true;
  // Switch to Dati tab so user sees the editable form
  document.querySelectorAll(".profile-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === "dati"));
  document.querySelectorAll(".tab-panel").forEach((p) => {
    const show = p.dataset.panel === "dati";
    p.classList.toggle("hidden", !show);
  });
  updateProfileActionsVisibility();
  if (currentStaff) renderProfile(currentStaff);
}

function cancelEdit() {
  isEditMode = false;
  updateProfileActionsVisibility();
  if (currentStaff) renderProfile(currentStaff);
}

function bindDisciplineAddButtons() {
  const addWarning = document.getElementById("btn-add-warning");
  const addNote = document.getElementById("btn-add-manager-note");
  if (addWarning) {
    addWarning.onclick = async () => {
      const date = document.getElementById("new-warning-date")?.value || new Date().toISOString().slice(0, 10);
      const text = document.getElementById("new-warning-text")?.value?.trim();
      if (!text) { alert("Inserisci il testo del richiamo."); return; }
      try {
        await fetch(`/api/staff/${currentStaff.id}/discipline/warnings`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, text }),
        });
        currentStaff = await apiGetStaffById(currentStaff.id);
        renderProfile(currentStaff);
        document.getElementById("new-warning-text").value = "";
      } catch (e) {
        alert("Errore: " + (e.message || "Impossibile aggiungere richiamo"));
      }
    };
  }
  if (addNote) {
    addNote.onclick = async () => {
      const date = document.getElementById("new-manager-note-date")?.value || new Date().toISOString().slice(0, 10);
      const text = document.getElementById("new-manager-note-text")?.value?.trim();
      if (!text) { alert("Inserisci il testo della nota."); return; }
      try {
        await fetch(`/api/staff/${currentStaff.id}/discipline/manager-notes`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, text }),
        });
        currentStaff = await apiGetStaffById(currentStaff.id);
        renderProfile(currentStaff);
        document.getElementById("new-manager-note-text").value = "";
      } catch (e) {
        alert("Errore: " + (e.message || "Impossibile aggiungere nota"));
      }
    };
  }
}

function collectProfileFromForm() {
  if (!currentStaff) return null;
  const content = document.getElementById("profile-content");
  if (!content) return null;
  const payload = {
    name: currentStaff.name,
    role: currentStaff.role,
    department: currentStaff.department,
    roleType: currentStaff.roleType,
    pinCode: currentStaff.pinCode,
    active: currentStaff.active,
  };

  const sections = ["root", "personal", "work", "salary", "attendance", "vacations"];
  for (const section of sections) {
    const inputs = content.querySelectorAll(`[data-section="${section}"]`);
    if (inputs.length) {
      if (section !== "root") payload[section] = payload[section] || {};
      inputs.forEach((inp) => {
        const field = inp.dataset.field;
        if (!field) return;
        let val;
        if (inp.type === "checkbox") val = inp.checked;
        else {
          val = inp.value;
          if (inp.type === "number") val = val === "" ? null : Number(val);
        }
        if (section === "root") payload[field] = val;
        else payload[section][field] = val;
      });
    }
  }

  if (payload.personal) {
    const p = payload.personal;
    const fullName = [p.name, p.surname].filter(Boolean).join(" ").trim();
    if (fullName) payload.name = fullName;
  }
  if (payload.work) {
    const w = payload.work;
    if (w.role != null) payload.role = w.role;
    if (w.department != null) payload.department = w.department;
  }

  return payload;
}

async function saveProfile() {
  if (!currentStaff || !currentStaff.id) return;
  const payload = collectProfileFromForm();
  if (!payload) {
    if (typeof alert === "function") alert("Nessun dato da salvare. Assicurati di essere in modalità modifica.");
    return;
  }
  try {
    await apiUpdateStaff(currentStaff.id, payload);
    currentStaff = await apiGetStaffById(currentStaff.id);
    isEditMode = false;
    renderProfile(currentStaff);
    updateProfileActionsVisibility();
    if (typeof alert === "function") alert("Profilo salvato.");
  } catch (err) {
    console.error("Errore salvataggio:", err);
    if (typeof alert === "function") alert("Errore: " + (err.message || "Impossibile salvare"));
  }
}

function initFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (id) {
    showProfile(id);
  } else {
    showList();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-refresh-staff").addEventListener("click", loadAndRenderList);
  document.getElementById("btn-show-reports")?.addEventListener("click", showReportsView);
  document.getElementById("btn-back-reports")?.addEventListener("click", showList);
  document.getElementById("btn-refresh-reports")?.addEventListener("click", loadReports);
  document.getElementById("report-month")?.addEventListener("change", loadReports);
  document.getElementById("report-year")?.addEventListener("change", loadReports);
  setupReportFilters();
  document.getElementById("profile-tabs")?.addEventListener("click", (e) => {
    const tab = e.target.closest(".profile-tab");
    if (!tab) return;
    const t = tab.dataset.tab;
    document.querySelectorAll(".profile-tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === t));
    document.querySelectorAll(".tab-panel").forEach((p) => {
      const show = p.dataset.panel === t;
      p.classList.toggle("hidden", !show);
      if (show && t !== "dati") loadTabPanel(t);
    });
  });
  document.getElementById("btn-back-list").addEventListener("click", () => {
    window.history.replaceState({}, "", "/supervisor/staff/staff.html");
    showList();
  });
  document.getElementById("btn-edit-profile")?.addEventListener("click", enterEditMode);
  document.getElementById("btn-cancel-profile")?.addEventListener("click", cancelEdit);
  document.getElementById("btn-save-profile").addEventListener("click", saveProfile);

  let searchTimeout;
  document.getElementById("f-search").addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(loadAndRenderList, 300);
  });
  document.getElementById("f-department").addEventListener("change", () => loadAndRenderList());
  document.getElementById("f-status").addEventListener("change", () => loadAndRenderList());

  initFromUrl();
});
