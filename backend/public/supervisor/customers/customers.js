// backend/public/supervisor/customers/customers.js

let allCustomers = [];
let editingId = null;

function escapeHtml(s) {
  if (s == null) return "";
  const t = document.createElement("span");
  t.textContent = s;
  return t.innerHTML;
}

function safeText(s) {
  return s == null || s === "" ? "—" : String(s);
}

async function apiGetCustomers(filters = {}) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  const qs = params.toString();
  const url = qs ? `/api/customers?${qs}` : "/api/customers";
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error("Errore caricamento clienti");
  return r.json();
}

async function apiGetCustomerById(id) {
  const r = await fetch(`/api/customers/${id}`, { credentials: "same-origin" });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "Cliente non trovato");
  }
  return r.json();
}

async function apiCreateCustomer(body) {
  const r = await fetch("/api/customers", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "Errore creazione");
  }
  return r.json();
}

async function apiUpdateCustomer(id, body) {
  const r = await fetch(`/api/customers/${id}`, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "Errore aggiornamento");
  }
  return r.json();
}

function getFilters() {
  return {
    q: document.getElementById("f-search").value.trim(),
    category: document.getElementById("f-category").value.trim() || undefined,
  };
}

function categoryLabel(cat) {
  const map = { normal: "Normal", top: "Top", vip: "VIP" };
  return map[cat] || cat;
}

function renderList(items) {
  const el = document.getElementById("customer-list");
  el.innerHTML = "";

  if (!items || items.length === 0) {
    el.innerHTML = '<div class="customer-empty">Nessun cliente trovato.</div>';
    return;
  }

  for (const c of items) {
    const row = document.createElement("div");
    row.className = "trow customer-trow customer-row";
    const fullName = `${safeText(c.name)} ${safeText(c.surname)}`.trim() || "—";
    const catClass = `category-${c.category || "normal"}`;

    row.innerHTML = `
      <span class="customer-name">${escapeHtml(fullName)}</span>
      <span>${escapeHtml(safeText(c.phone))}</span>
      <span>${escapeHtml(safeText(c.email))}</span>
      <span class="${catClass}">${escapeHtml(categoryLabel(c.category))}</span>
      <span><a href="#" class="link-edit" data-id="${escapeHtml(c.id)}">Modifica</a></span>
    `;

    row.addEventListener("click", (e) => {
      e.preventDefault();
      openEdit(c.id);
    });

    el.appendChild(row);
  }
}

async function loadAndRender() {
  try {
    const filters = getFilters();
    allCustomers = await apiGetCustomers(filters);
    renderList(allCustomers);
  } catch (err) {
    console.error(err);
    alert(err.message || "Errore caricamento clienti");
  }
}

function openModal(title) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-customer").setAttribute("aria-hidden", "false");
  document.getElementById("modal-customer").classList.add("open");
}

function closeModal() {
  document.getElementById("modal-customer").setAttribute("aria-hidden", "true");
  document.getElementById("modal-customer").classList.remove("open");
  editingId = null;
}

function openAdd() {
  editingId = null;
  document.getElementById("form-customer").reset();
  document.getElementById("field-id").value = "";
  openModal("Nuovo cliente");
}

async function openEdit(id) {
  try {
    const c = await apiGetCustomerById(id);
    editingId = id;

    document.getElementById("field-id").value = c.id || "";
    document.getElementById("field-name").value = c.name || "";
    document.getElementById("field-surname").value = c.surname || "";
    document.getElementById("field-phone").value = c.phone || "";
    document.getElementById("field-email").value = c.email || "";
    document.getElementById("field-notes").value = c.notes || "";
    document.getElementById("field-birthday").value = c.birthday ? c.birthday.slice(0, 10) : "";
    document.getElementById("field-category").value = c.category || "normal";
    document.getElementById("field-allergies").value = Array.isArray(c.allergies) ? c.allergies.join(", ") : "";
    document.getElementById("field-intolerances").value = Array.isArray(c.intolerances) ? c.intolerances.join(", ") : "";
    document.getElementById("field-preferences").value = Array.isArray(c.preferences) ? c.preferences.join(", ") : "";

    openModal("Modifica cliente");
  } catch (err) {
    console.error(err);
    alert(err.message || "Errore caricamento cliente");
  }
}

function parseArray(val) {
  if (!val || typeof val !== "string") return [];
  return val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function handleSubmit(e) {
  e.preventDefault();

  const body = {
    name: document.getElementById("field-name").value.trim(),
    surname: document.getElementById("field-surname").value.trim(),
    phone: document.getElementById("field-phone").value.trim(),
    email: document.getElementById("field-email").value.trim(),
    notes: document.getElementById("field-notes").value.trim(),
    birthday: document.getElementById("field-birthday").value || undefined,
    category: document.getElementById("field-category").value || "normal",
    allergies: parseArray(document.getElementById("field-allergies").value),
    intolerances: parseArray(document.getElementById("field-intolerances").value),
    preferences: parseArray(document.getElementById("field-preferences").value),
  };

  try {
    if (editingId) {
      await apiUpdateCustomer(editingId, body);
    } else {
      await apiCreateCustomer(body);
    }
    closeModal();
    loadAndRender();
  } catch (err) {
    console.error(err);
    alert(err.message || "Errore salvataggio");
  }
}

function setup() {
  document.getElementById("btn-refresh").addEventListener("click", loadAndRender);
  document.getElementById("btn-add-customer").addEventListener("click", openAdd);
  document.getElementById("btn-modal-close").addEventListener("click", closeModal);
  document.getElementById("btn-form-cancel").addEventListener("click", closeModal);
  document.getElementById("form-customer").addEventListener("submit", handleSubmit);

  document.getElementById("f-search").addEventListener("input", loadAndRender);
  document.getElementById("f-search").addEventListener("change", loadAndRender);
  document.getElementById("f-category").addEventListener("change", loadAndRender);

  document.getElementById("modal-customer").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  loadAndRender();
}

document.addEventListener("DOMContentLoaded", setup);
