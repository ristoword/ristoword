// =============================
//   STATO LOCALE
// =============================

let allOrders = [];
let activeFilters = {
  status: "",
  area: "",
  table: "",
};

let menuOfficial = [];     // Menù ufficiale (da Cassa, localStorage)
let selectedItems = [];    // Piatti dell'ordine corrente

// =============================
//   UTILITÀ GENERALI
// =============================

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function minutesFrom(iso) {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  const now = Date.now();
  const diff = (now - d) / 60000;
  return Math.floor(diff);
}

function statusLabel(status) {
  switch (status) {
    case "in_attesa":
      return "In attesa";
    case "in_preparazione":
      return "In preparazione";
    case "pronto":
      return "Pronto";
    case "servito":
      return "Servito";
    case "chiuso":
      return "Chiuso";
    case "annullato":
      return "Annullato";
    default:
      return status || "-";
  }
}

// mapping categoria menù → reparto di produzione
function inferAreaFromCategory(cat) {
  const c = (cat || "").toLowerCase();
  if (c === "pizzeria") return "pizzeria";
  if (c === "bar" || c === "vini" || c === "dessert") return "bar";
  if (c === "ristorante" || c === "altro") return "cucina";
  return "cucina";
}

// =============================
//   API ORDINI
// =============================

async function apiGetOrders() {
  const res = await fetch("/api/orders", { credentials: "same-origin" });
  if (!res.ok) throw new Error("Errore caricamento ordini");
  return await res.json();
}

async function apiCreateOrder(payload) {
  const res = await fetch("/api/orders", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error("Errore creazione ordine: " + txt);
  }
  return await res.json();
}

async function apiSetStatus(id, status) {
  const res = await fetch(`/api/orders/${id}/status`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error("Errore cambio stato: " + txt);
  }
  return await res.json();
}

// =============================
//   MENÙ UFFICIALE (localStorage + API fallback)
// =============================

async function loadOfficialMenu() {
  try {
    const raw = localStorage.getItem("rw_menu_official");
    if (raw) {
      const arr = JSON.parse(raw);
      menuOfficial = Array.isArray(arr) ? arr : [];
      return;
    }
    // Fallback: se localStorage vuoto, carica dal backend
    try {
      const res = await fetch("/api/menu/active", { credentials: "same-origin" });
      if (res.ok) {
        const arr = await res.json();
        menuOfficial = Array.isArray(arr) ? arr : [];
        if (menuOfficial.length) {
          localStorage.setItem("rw_menu_official", JSON.stringify(menuOfficial));
        }
        return;
      }
    } catch (apiErr) {
      console.warn("Fallback menù API non disponibile:", apiErr.message);
    }
    menuOfficial = [];
  } catch (err) {
    console.error("Errore lettura menù ufficiale:", err);
    menuOfficial = [];
  }
}

function getMenuByCategory(category) {
  if (!menuOfficial.length) return [];
  if (!category) return menuOfficial;

  const c = category.toLowerCase();
  return menuOfficial.filter((item) => {
    const cat = (item.category || item.type || "").toLowerCase();
    return cat === c;
  });
}

function populateMenuSelect() {
  const select = document.getElementById("menu-item");
  const categorySelect = document.getElementById("menu-category");
  if (!select || !categorySelect) return;

  const category = categorySelect.value;
  const items = getMenuByCategory(category);

  select.innerHTML = "";

  if (!items.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Menù non configurato o vuoto";
    select.appendChild(opt);
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Seleziona un piatto...";
  select.appendChild(placeholder);

  items.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = String(item.id ?? item.name);
    const price = item.price != null ? ` – € ${Number(item.price).toFixed(2)}` : "";
    opt.textContent = `${item.name}${price}`;
    opt.dataset.name = item.name;
    opt.dataset.category = item.category || item.type || "";
    opt.dataset.price = item.price != null ? String(item.price) : "";
    select.appendChild(opt);
  });
}

// =============================
//   PIATTI SELEZIONATI
// =============================

function resetSelectedItems() {
  selectedItems = [];
  renderSelectedItems();
}

function renderSelectedItems() {
  const box = document.getElementById("selected-items");
  if (!box) return;

  box.innerHTML = "";

  if (!selectedItems.length) {
    box.innerHTML = `<div class="order-meta">Nessun piatto inserito.</div>`;
    return;
  }

  selectedItems.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "selected-item-row";
    const notePart = item.note ? ` – <span class="selected-item-note">${item.note}</span>` : "";
    const areaPart = item.area ? ` • <span class="selected-item-area">${item.area}</span>` : "";
    div.innerHTML = `
      <span>
        ${item.name} x${item.qty}
        ${notePart}
        ${areaPart}
      </span>
      <button class="btn-xs danger" data-index="${index}">Rimuovi</button>
    `;
    box.appendChild(div);
  });

  box.querySelectorAll("button[data-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-index"));
      if (!Number.isNaN(idx)) {
        selectedItems.splice(idx, 1);
        renderSelectedItems();
      }
    });
  });
}

function setupAddFromMenu() {
  const btn = document.getElementById("btn-add-from-menu");
  const categorySelect = document.getElementById("menu-category");
  const itemSelect = document.getElementById("menu-item");
  const qtyInput = document.getElementById("menu-qty");

  if (!btn || !categorySelect || !itemSelect || !qtyInput) return;

  categorySelect.addEventListener("change", () => {
    populateMenuSelect();
  });

  btn.addEventListener("click", () => {
    const selectedOption = itemSelect.options[itemSelect.selectedIndex];
    if (!selectedOption || !selectedOption.value) return;

    const qty = Number(qtyInput.value) || 1;
    const name = selectedOption.dataset.name || selectedOption.textContent;
    const cat = selectedOption.dataset.category || "";
    const priceStr = selectedOption.dataset.price;
    const price = priceStr ? Number(priceStr) : null;
    const area = inferAreaFromCategory(cat);

    selectedItems.push({
      source: "menu",
      menuId: selectedOption.value,
      name,
      qty,
      category: cat,
      area,
      price,
      note: "", // niente note extra qui
    });

    renderSelectedItems();
  });
}

function setupAddCustom() {
  const btn = document.getElementById("btn-add-custom");
  const nameInput = document.getElementById("custom-name");
  const qtyInput = document.getElementById("custom-qty");
  const notesInput = document.getElementById("custom-notes");
  const areaSelect = document.getElementById("custom-area");

  if (!btn || !nameInput || !qtyInput || !notesInput || !areaSelect) return;

  btn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (!name) return;

    const qty = Number(qtyInput.value) || 1;
    const note = notesInput.value.trim();
    const customArea = areaSelect.value;
    const orderArea = document.getElementById("field-area").value || "cucina";

    selectedItems.push({
      source: "custom",
      name,
      qty,
      category: "fuori_menu",
      area: customArea || orderArea,
      price: null,
      note,
    });

    nameInput.value = "";
    qtyInput.value = "1";
    notesInput.value = "";
    areaSelect.value = "";

    renderSelectedItems();
  });
}

// =============================
//   FILTRI E KPI
// =============================

function applyFilters(orders) {
  let filtered = [...orders];

  if (activeFilters.status) {
    filtered = filtered.filter((o) => o.status === activeFilters.status);
  }
  if (activeFilters.area) {
    filtered = filtered.filter((o) => o.area === activeFilters.area);
  }
  if (activeFilters.table) {
    const t = Number(activeFilters.table);
    filtered = filtered.filter((o) => Number(o.table) === t);
  }

  return filtered;
}

function renderKpi(orders) {
  const active = orders.filter(
    (o) => o.status !== "chiuso" && o.status !== "annullato"
  );
  const awaitingBill = orders.filter((o) => o.status === "servito");

  const tablesSet = new Set(
    active
      .map((o) => o.table)
      .filter((t) => t !== undefined && t !== null && t !== "")
  );

  document.getElementById("kpi-tables").textContent = tablesSet.size || "0";
  document.getElementById("kpi-open-orders").textContent = active.length || "0";
  document.getElementById("kpi-awaiting-bill").textContent =
    awaitingBill.length || "0";
}

// =============================
//   GRIGLIA TAVOLI
// =============================

function renderTablesGrid(orders) {
  const container = document.getElementById("tables-grid");
  container.innerHTML = "";

  const active = orders.filter(
    (o) => o.status !== "chiuso" && o.status !== "annullato"
  );

  if (!active.length) {
    container.innerHTML =
      '<div class="table-meta">Nessun tavolo attivo al momento.</div>';
    return;
  }

  const byTable = new Map();
  for (const o of active) {
    const key = o.table ?? "-";
    if (!byTable.has(key)) byTable.set(key, []);
    byTable.get(key).push(o);
  }

  for (const [table, list] of byTable.entries()) {
    let status = "in_attesa";
    let label = "Aperto";

    if (list.some((o) => o.status === "servito")) {
      status = "servito";
      label = "In attesa conto";
    } else if (list.some((o) => o.status === "pronto")) {
      status = "pronto";
      label = "Piatti pronti";
    } else if (list.some((o) => o.status === "in_preparazione")) {
      status = "in_preparazione";
      label = "In preparazione";
    }

    const ages = list
      .map((o) => minutesFrom(o.createdAt))
      .filter((m) => m !== null && Number.isFinite(m));
    const minAge = ages.length ? Math.min(...ages) : null;

    const div = document.createElement("div");
    let statusClass = "table-status-open";
    if (status === "servito") statusClass = "table-status-awaiting";
    if (minAge != null && minAge >= 45) statusClass = "table-status-warning";

    div.className = `table-tile ${statusClass}`;
    div.addEventListener("click", () => {
      activeFilters.table = table;
      document.getElementById("filter-table").value = table;
      renderOrdersList(allOrders);
    });

    div.innerHTML = `
      <div class="table-tile-header">
        <div class="table-number">Tavolo ${table}</div>
        <div class="table-status">${label}</div>
      </div>
      <div class="table-meta">
        Ordini: ${list.length}${
          minAge != null ? " • " + minAge + " min" : ""
        }
      </div>
    `;

    container.appendChild(div);
  }
}

// =============================
//   LISTA ORDINI
// =============================

function renderOrdersList(orders) {
  const container = document.getElementById("orders-list");
  container.innerHTML = "";

  const filtered = applyFilters(orders);

  if (!filtered.length) {
    container.innerHTML =
      '<div class="order-meta">Nessun ordine con i filtri attuali.</div>';
    return;
  }

  filtered.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });

  for (const o of filtered) {
    const div = document.createElement("div");
    div.className = "order-card";

    const age = minutesFrom(o.createdAt);
    const timeStr = formatTime(o.createdAt);
    const statusClass = "status-" + (o.status || "in_attesa");

    const itemsHtml = (o.items && o.items.length)
      ? o.items
          .map((i) => {
            const base = `${i.name || "-"} x${i.qty ?? 1}`;
            const area = i.area ? ` • ${i.area}` : "";
            return `• ${base}${area}`;
          })
          .join("<br>")
      : "";

    div.innerHTML = `
      <div class="order-top">
        <div class="order-main">
          <div class="order-table">
            Tavolo ${o.table ?? "-"} • Coperti: ${o.covers ?? "-"}
          </div>
          <div class="order-meta">
            Reparto: ${o.area || "-"} • Cameriere: ${o.waiter || "-"}
            ${
              timeStr
                ? `• Aperto alle ${timeStr}${
                    age != null ? " (" + age + " min)" : ""
                  }`
                : ""
            }
          </div>
        </div>
        <div>
          <span class="order-status-badge ${statusClass}">
            ${statusLabel(o.status)}
          </span>
        </div>
      </div>
      ${
        itemsHtml
          ? `<div class="order-items">${itemsHtml}</div>`
          : ""
      }
      <div class="order-actions">
        <button class="btn-xs" data-action="set-status" data-status="in_attesa" data-id="${
          o.id
        }">Attesa</button>
        <button class="btn-xs" data-action="set-status" data-status="in_preparazione" data-id="${
          o.id
        }">Prep.</button>
        <button class="btn-xs" data-action="set-status" data-status="pronto" data-id="${
          o.id
        }">Pronto</button>
        <button class="btn-xs" data-action="set-status" data-status="servito" data-id="${
          o.id
        }">Servito</button>
        <button class="btn-xs" data-action="set-status" data-status="chiuso" data-id="${
          o.id
        }">Chiudi</button>
        <button class="btn-xs danger" data-action="set-status" data-status="annullato" data-id="${
          o.id
        }">Annulla</button>
      </div>
    `;

    div.querySelectorAll("[data-action='set-status']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const status = btn.getAttribute("data-status");

        if (status === "annullato") {
          const ok = confirm(
            "Confermi l'annullamento di questo ordine? Verrà segnalato come annullato."
          );
          if (!ok) return;
        }
        if (status === "chiuso") {
          const ok = confirm(
            "Chiudere l'ordine? Dopo la chiusura potrà essere solo consultato."
          );
          if (!ok) return;
        }

        try {
          await apiSetStatus(id, status);
          await loadOrdersAndRender();
        } catch (err) {
          console.error(err);
          alert("Errore nel cambio stato.");
        }
      });
    });

    container.appendChild(div);
  }
}

// =============================
//   CARICAMENTO ORDINI
// =============================

async function loadOrdersAndRender() {
  try {
    const orders = await apiGetOrders();
    allOrders = orders || [];
    renderKpi(allOrders);
    renderTablesGrid(allOrders);
    renderOrdersList(allOrders);
  } catch (err) {
    console.error(err);
    alert("Errore caricamento ordini dalla sala.");
  }
}

// =============================
//   CREAZIONE ORDINE
// =============================

async function handleCreateOrder() {
  const tableVal = document.getElementById("field-table").value.trim();
  const coversVal = document.getElementById("field-covers").value.trim();
  const area = document.getElementById("field-area").value;
  const waiter = document.getElementById("field-waiter").value.trim();
  const notes = document.getElementById("field-notes").value.trim();

  const tableNum = Number(tableVal);
  const coversNum = Number(coversVal);

  if (!Number.isFinite(tableNum) || tableNum <= 0) {
    alert("Inserisci un numero di tavolo valido.");
    return;
  }
  if (!Number.isFinite(coversNum) || coversNum <= 0) {
    alert("Inserisci un numero di coperti valido.");
    return;
  }
  if (!waiter) {
    alert("Inserisci il nome del cameriere.");
    return;
  }

  if (!selectedItems.length) {
    const ok = confirm(
      "Non hai inserito piatti. Creare comunque l'ordine solo per il tavolo?"
    );
    if (!ok) return;
  }

  const itemsPayload = selectedItems.map((i) => ({
    name: i.name,
    qty: i.qty,
    category: i.category || null,
    area: i.area || area,
    price: i.price != null ? Number(i.price) : null,
    note: i.note || null,
  }));

  const payload = {
    table: tableNum,
    covers: coversNum,
    area,
    waiter,
    notes,
    items: itemsPayload,
  };

  try {
    await apiCreateOrder(payload);

    document.getElementById("field-table").value = "";
    document.getElementById("field-covers").value = "";
    document.getElementById("field-waiter").value = "";
    document.getElementById("field-notes").value = "";
    resetSelectedItems();

    await loadOrdersAndRender();
  } catch (err) {
    console.error(err);
    alert("Errore nella creazione dell'ordine.");
  }
}

// =============================
//   FILTRI
// =============================

function setupFilters() {
  const statusSel = document.getElementById("filter-status");
  const areaSel = document.getElementById("filter-area");
  const tableInput = document.getElementById("filter-table");
  const resetBtn = document.getElementById("btn-reset-filters");

  statusSel.addEventListener("change", () => {
    activeFilters.status = statusSel.value;
    renderOrdersList(allOrders);
  });

  areaSel.addEventListener("change", () => {
    activeFilters.area = areaSel.value;
    renderOrdersList(allOrders);
  });

  tableInput.addEventListener("input", () => {
    activeFilters.table = tableInput.value.trim();
    renderOrdersList(allOrders);
  });

  resetBtn.addEventListener("click", () => {
    activeFilters = { status: "", area: "", table: "" };
    statusSel.value = "";
    areaSel.value = "";
    tableInput.value = "";
    renderOrdersList(allOrders);
  });
}

// =============================
//   INIT
// =============================

function initStaffAccess() {
  if (!window.RW_StaffAccess) return;
  RW_StaffAccess.init({ module: "sala", department: "sala" });

  function refreshStaffUI() {
    const sess = RW_StaffAccess.getCurrentSession();
    const mgrVal = document.getElementById("rw-manager-value");
    const btnLogin = document.getElementById("rw-btn-manager-login");
    const btnLogout = document.getElementById("rw-btn-manager-logout");
    if (mgrVal) mgrVal.textContent = sess ? sess.name : "—";
    if (btnLogin) btnLogin.style.display = sess ? "none" : "";
    if (btnLogout) btnLogout.style.display = sess ? "" : "none";
    const chip = document.getElementById("rw-sala-manager-chip");
    if (chip) chip.classList.toggle("logged-in", !!sess);
    RW_StaffAccess.renderActiveStaff("rw-sala-active-staff", "sala");
  }

  document.getElementById("rw-btn-manager-login")?.addEventListener("click", () => {
    RW_StaffAccess.showManagerLoginModal(refreshStaffUI, "sala_manager");
  });
  document.getElementById("rw-btn-manager-logout")?.addEventListener("click", async () => {
    const s = RW_StaffAccess.getCurrentSession();
    if (!s) return;
    try {
      await RW_StaffAccess.logout(s.id);
      refreshStaffUI();
    } catch (e) {
      console.error(e);
    }
  });
  refreshStaffUI();
}

document.addEventListener("DOMContentLoaded", async () => {
  // Menù ufficiale da localStorage o API
  await loadOfficialMenu();
  populateMenuSelect();

  // Piatti dell'ordine
  renderSelectedItems();
  setupAddFromMenu();
  setupAddCustom();

  // Ordini + KPI
  document
    .getElementById("btn-create-order")
    .addEventListener("click", handleCreateOrder);

  document
    .getElementById("btn-refresh")
    .addEventListener("click", loadOrdersAndRender);

  window.addEventListener("rw:orders-update", (ev) => {
    if (ev.detail?.orders) {
      allOrders = ev.detail.orders;
      renderKpi(allOrders);
      renderTablesGrid(allOrders);
      renderOrdersList(allOrders);
    }
  });

  setupFilters();
  initStaffAccess();
  loadOrdersAndRender();

  setInterval(loadOrdersAndRender, 15000); // fallback polling
});