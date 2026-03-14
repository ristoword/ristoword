// =============================
//  UTIL
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
  return Math.floor((now - d) / 60000);
}

function createElement(tag, className, html) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (html !== undefined) el.innerHTML = html;
  return el;
}

// =============================
//  API ORDERS – filtro area "bar"
// =============================

async function fetchBarOrders() {
  const res = await fetch("/api/orders?active=true", { credentials: "same-origin" });
  if (!res.ok) throw new Error("Errore caricamento ordini bar");
  const all = await res.json();
  return all.filter((o) => o.area === "bar");
}

async function setOrderStatus(id, status) {
  const res = await fetch(`/api/orders/${id}/status`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Errore cambio stato");
  return res.json();
}

// =============================
//  RENDER KDS
// =============================

function buildOrderCard(order) {
  const card = createElement("div", "order-card");

  const age = minutesFrom(order.createdAt);
  const timeStr = formatTime(order.createdAt);

  // late if >= 10 minuti
  if (age != null && age >= 10 && order.status !== "servito") {
    card.classList.add("late");
  }

  const header = createElement("div", "order-header");
  const title = createElement(
    "div",
    "order-title",
    `Tavolo ${order.table ?? "-"}`
  );
  const meta = createElement(
    "div",
    "order-meta",
    `Coperti: ${order.covers ?? "-"} • Cameriere: ${
      order.waiter || "-"
    } • Reparto: ${order.area || "-"}`
  );
  header.appendChild(title);
  header.appendChild(meta);

  const itemsDiv = createElement("div", "order-meta");
  const items = order.items || [];
  if (items.length) {
    itemsDiv.innerHTML = items
      .map((i) => `${i.name} x${i.qty || 1}`)
      .join("<br>");
  } else {
    itemsDiv.textContent = "Nessun drink specificato.";
  }

  const timeDiv = createElement(
    "div",
    "order-time",
    age != null && timeStr
      ? `${timeStr} • ${age} min`
      : timeStr || "&nbsp;"
  );

  const status = order.status || "in_attesa";
  const badge = createElement(
    "span",
    "order-status-badge " +
      (status === "in_preparazione"
        ? "status-in_preparazione"
        : status === "pronto"
        ? "status-pronto"
        : status === "servito"
        ? "status-servito"
        : ""),
    status.toUpperCase().replaceAll("_", " ")
  );

  const actions = createElement("div", "order-actions");
  const btnPrep = createElement(
    "button",
    "btn-xs warning",
    "IN PREP"
  );
  const btnReady = createElement("button", "btn-xs success", "PRONTO");
  const btnServ = createElement("button", "btn-xs info", "SERVITO");
  const btnCancel = createElement("button", "btn-xs danger", "ANNULLA");

  btnPrep.addEventListener("click", () =>
    handleStatusClick(order.id, "in_preparazione")
  );
  btnReady.addEventListener("click", () =>
    handleStatusClick(order.id, "pronto")
  );
  btnServ.addEventListener("click", () =>
    handleStatusClick(order.id, "servito")
  );
  btnCancel.addEventListener("click", () =>
    handleStatusClick(order.id, "annullato")
  );

  actions.append(btnPrep, btnReady, btnServ, btnCancel);

  const topRow = createElement("div");
  topRow.append(header, badge);

  card.append(topRow, itemsDiv, timeDiv, actions);
  return card;
}

async function handleStatusClick(id, status) {
  try {
    await setOrderStatus(id, status);
    await loadAndRenderBarOrders();
  } catch (e) {
    console.error(e);
    alert("Errore aggiornando lo stato.");
  }
}

function renderBarOrders(orders) {
  const colPending = document.getElementById("col-pending");
  const colPrep = document.getElementById("col-prep");
  const colReady = document.getElementById("col-ready");
  if (!colPending || !colPrep || !colReady) return;

  colPending.innerHTML = "";
  colPrep.innerHTML = "";
  colReady.innerHTML = "";

  const barOrders = Array.isArray(orders) ? orders.filter((o) => o.area === "bar") : [];

  // KPI
  const prepCount = barOrders.filter((o) => o.status === "in_preparazione").length;
  const readyCount = barOrders.filter((o) => o.status === "pronto").length;
  const lateCount = barOrders.filter((o) => {
    const age = minutesFrom(o.createdAt);
    return age != null && age >= 10 && o.status !== "servito";
  }).length;

  document.getElementById("kpi-prep").textContent = prepCount;
  document.getElementById("kpi-ready").textContent = readyCount;
  document.getElementById("kpi-late").textContent = lateCount;

  // ordini senza chiusi/annullati
  const visible = barOrders.filter(
      (o) => o.status !== "chiuso" && o.status !== "annullato"
    );

  visible.forEach((order) => {
    const card = buildOrderCard(order);
    if (order.status === "pronto") {
      colReady.appendChild(card);
    } else if (order.status === "in_preparazione") {
      colPrep.appendChild(card);
    } else {
      colPending.appendChild(card);
    }
  });

  if (!colPending.children.length) {
    colPending.innerHTML =
      '<div class="table-meta">Nessuna nuova comanda bar.</div>';
  }
  if (!colPrep.children.length) {
    colPrep.innerHTML =
      '<div class="table-meta">Nessuna comanda in preparazione.</div>';
  }
  if (!colReady.children.length) {
    colReady.innerHTML =
      '<div class="table-meta">Nessuna comanda pronta.</div>';
  }
}

async function loadAndRenderBarOrders() {
  try {
    const orders = await fetchBarOrders();
    renderBarOrders(orders);
  } catch (e) {
    console.error(e);
    const col = document.getElementById("col-pending");
    if (col) col.innerHTML =
      '<div class="table-meta">Errore caricando le comande bar.</div>';
  }
}

// =============================
//  RICETTE BAR (localStorage)
// =============================

const LS_BAR_RECIPES = "rw_bar_recipes";
const LS_BAR_NOTES = "rw_bar_voice_notes";

function loadBarRecipes() {
  try {
    return JSON.parse(localStorage.getItem(LS_BAR_RECIPES)) || [];
  } catch {
    return [];
  }
}

function saveBarRecipes(list) {
  localStorage.setItem(LS_BAR_RECIPES, JSON.stringify(list));
}

function renderBarRecipes() {
  const container = document.getElementById("recipes-list");
  if (!container) return;

  const recipes = loadBarRecipes();
  container.innerHTML = "";

  if (!recipes.length) {
    container.innerHTML =
      '<div class="list-item">Nessuna ricetta bar salvata.</div>';
    return;
  }

  recipes.forEach((r, idx) => {
    const item = createElement("div", "list-item");
    item.innerHTML = `
      <div class="list-item-header">
        <div class="list-item-title">${r.name}</div>
        <button data-idx="${idx}" class="btn-xs danger">Elimina</button>
      </div>
      <div class="list-item-meta">
        Categoria: ${r.category || "-"} • Bicchiere: ${r.glass || "-"}
      </div>
      <div class="list-item-meta">${r.notes || ""}</div>
    `;
    container.appendChild(item);
  });

  container.querySelectorAll("button.btn-xs.danger").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-idx"));
      const list = loadBarRecipes();
      list.splice(idx, 1);
      saveBarRecipes(list);
      renderBarRecipes();
    });
  });
}

function setupBarRecipes() {
  const btn = document.getElementById("btn-save-recipe");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const name = document.getElementById("recipe-name").value.trim();
    const category = document
      .getElementById("recipe-category")
      .value.trim();
    const glass = document.getElementById("recipe-glass").value.trim();
    const notes = document.getElementById("recipe-notes").value.trim();

    if (!name) {
      alert("Inserisci il nome del drink.");
      return;
    }

    const list = loadBarRecipes();
    list.push({ name, category, glass, notes });
    saveBarRecipes(list);

    document.getElementById("recipe-name").value = "";
    document.getElementById("recipe-category").value = "";
    document.getElementById("recipe-glass").value = "";
    document.getElementById("recipe-notes").value = "";

    renderBarRecipes();
  });

  renderBarRecipes();
}

// =============================
//  NOTE VOCALI (semplice textarea)
// =============================

function setupBarNotes() {
  const txt = document.getElementById("voice-notes");
  const btnSave = document.getElementById("btn-save-voice-notes");
  const btnClear = document.getElementById("btn-clear-voice-notes");

  if (!txt || !btnSave || !btnClear) return;

  try {
    txt.value = localStorage.getItem(LS_BAR_NOTES) || "";
  } catch {
    // ignore
  }

  btnSave.addEventListener("click", () => {
    localStorage.setItem(LS_BAR_NOTES, txt.value || "");
    alert("Appunti bar salvati.");
  });

  btnClear.addEventListener("click", () => {
    txt.value = "";
    localStorage.removeItem(LS_BAR_NOTES);
  });
}

// =============================
//  VIEW SWITCH
// =============================

function setupViewSwitch() {
  const btns = document.querySelectorAll(".nav-btn[data-view]");
  const views = document.querySelectorAll(".view");

  btns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.getAttribute("data-view");
      btns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      views.forEach((v) => {
        v.classList.toggle(
          "active-view",
          v.id === `view-${view}`
        );
      });
    });
  });
}

// =============================
//  INIT
// =============================
// STAFF ACCESS
// =============================

function initStaffAccess() {
  if (!window.RW_StaffAccess) return;
  RW_StaffAccess.init({ module: "bar", department: "bar" });

  function refreshStaffUI() {
    const sess = RW_StaffAccess.getCurrentSession();
    const mgrVal = document.getElementById("rw-manager-value");
    const btnLogin = document.getElementById("rw-btn-manager-login");
    const btnLogout = document.getElementById("rw-btn-manager-logout");
    if (mgrVal) mgrVal.textContent = sess ? sess.name : "—";
    if (btnLogin) btnLogin.style.display = sess ? "none" : "";
    if (btnLogout) btnLogout.style.display = sess ? "" : "none";
    const chip = document.getElementById("rw-bar-manager-chip");
    if (chip) chip.classList.toggle("logged-in", !!sess);
    RW_StaffAccess.renderActiveStaff("rw-bar-active-staff", "bar");
  }

  document.getElementById("rw-btn-manager-login")?.addEventListener("click", () => {
    RW_StaffAccess.showManagerLoginModal(refreshStaffUI, "bar_manager");
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

document.addEventListener("DOMContentLoaded", () => {
  setupViewSwitch();
  setupBarRecipes();
  setupBarNotes();
  initStaffAccess();

  window.addEventListener("rw:orders-update", (ev) => {
    if (ev.detail?.orders) {
      renderBarOrders(ev.detail.orders);
    }
  });

  loadAndRenderBarOrders();
  setInterval(loadAndRenderBarOrders, 10000);

  const btnRefresh = document.getElementById("btn-refresh");
  if (btnRefresh) {
    btnRefresh.addEventListener("click", loadAndRenderBarOrders);
  }
});