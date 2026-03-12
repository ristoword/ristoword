// =======================================
//   CONFIG COSTANTI
// =======================================

const ORDERS_API = "/api/orders";

const LS_RECIPES_KEY = "ristoword_cucina_recipes";
const LS_HACCP_KEY = "ristoword_cucina_haccp";
const LS_SHOPPING_KEY = "ristoword_cucina_shopping";
const LS_SHIFTS_KEY = "ristoword_cucina_turni";
const LS_VOICE_NOTES_KEY = "ristoword_cucina_voice_notes";

// =======================================
//   STATO IN MEMORIA
// =======================================

let ordersCache = [];
let shoppingItems = [];
let haccpEntries = [];
let recipes = [];
let shifts = [];

// =======================================
//   UTILITÀ GENERICHE
// =======================================

function safeJSONParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

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

// =======================================
//   VIEW SWITCHER (nav in alto)
// =======================================

function showView(viewName) {
  const map = {
    comande: "view-comande",
    ricette: "view-ricette",
    spesa: "view-spesa",
    haccp: "view-haccp",
    turni: "view-turni",
    vocale: "view-vocale",
  };

  const targetId = map[viewName];
  if (!targetId) return;

  // bottone attivo
  document.querySelectorAll(".kitchen-nav .nav-btn[data-view]").forEach((btn) => {
    if (btn.dataset.view === viewName) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // sezioni
  document.querySelectorAll("main .view").forEach((section) => {
    if (section.id === targetId) {
      section.classList.add("active-view");
    } else {
      section.classList.remove("active-view");
    }
  });
}

function initViewSwitcher() {
  document.querySelectorAll(".kitchen-nav .nav-btn[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      showView(view);
    });
  });

  // vista di default
  showView("comande");
}

// =======================================
//   API ORDINI
// =======================================

async function fetchOrders() {
  const res = await fetch(ORDERS_API, { credentials: "same-origin" });
  if (!res.ok) {
    throw new Error("Errore caricamento ordini dalla cucina");
  }
  return await res.json();
}

async function updateOrderStatus(id, status) {
  const res = await fetch(`${ORDERS_API}/${id}/status`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error("Errore cambio stato: " + text);
  }
  return await res.json();
}

// =======================================
//   RENDER KDS (COMANDE)
// =======================================

function renderKpi(orders) {
  const prep = orders.filter((o) => o.status === "in_preparazione").length;
  const ready = orders.filter((o) => o.status === "pronto").length;
  const late = orders.filter((o) => {
    if (o.status === "pronto" || o.status === "servito") return false;
    const m = minutesFrom(o.createdAt);
    return m !== null && m >= 20;
  }).length;

  const p = document.getElementById("kpi-prep");
  const r = document.getElementById("kpi-ready");
  const l = document.getElementById("kpi-late");
  if (p) p.textContent = prep;
  if (r) r.textContent = ready;
  if (l) l.textContent = late;
}

function createOrderCard(order) {
  const card = document.createElement("div");
  card.className = "order-card";

  const age = minutesFrom(order.createdAt);
  if (age !== null && age >= 20 && order.status !== "pronto") {
    card.classList.add("late");
  }

  const timeStr = formatTime(order.createdAt);

  const itemsHtml = Array.isArray(order.items) && order.items.length
    ? order.items.map((i) => `${i.name} x${i.qty}`).join("<br>")
    : `<span style="font-size:14px;color:#b7bccd;">Dettaglio piatti non disponibile</span>`;

  const statusClass = `status-${order.status || "in_preparazione"}`;

  card.innerHTML = `
    <div>
      <div class="order-title">Tavolo ${order.table ?? "-"}</div>
      <div class="order-meta">
        Coperti: ${order.covers ?? "-"} • Reparto: ${order.area || "-"} • Cameriere: ${order.waiter || "-"}
      </div>
      <div class="order-meta" style="margin-top:4px;">
        ${itemsHtml}
      </div>
    </div>
    <div>
      <div class="order-time">
        ${timeStr ? timeStr : ""}${age !== null ? ` • ${age} min` : ""}
      </div>
      <span class="order-status-badge ${statusClass}">
        ${statusLabel(order.status)}
      </span>
    </div>
    <div class="order-actions">
      <button class="btn-xs warning" data-action="to-prep">In prep</button>
      <button class="btn-xs success" data-action="to-ready">Pronto</button>
      <button class="btn-xs info" data-action="to-served">Servito</button>
      <button class="btn-xs danger" data-action="to-cancel">Annulla</button>
    </div>
  `;

  // Eventi pulsanti
  const id = order.id;

  card.querySelector("[data-action='to-prep']").addEventListener("click", async () => {
    try {
      await updateOrderStatus(id, "in_preparazione");
      await loadAndRenderOrders();
    } catch (e) {
      console.error(e);
      alert("Errore nel cambio stato.");
    }
  });

  card.querySelector("[data-action='to-ready']").addEventListener("click", async () => {
    try {
      await updateOrderStatus(id, "pronto");
      await loadAndRenderOrders();
    } catch (e) {
      console.error(e);
      alert("Errore nel cambio stato.");
    }
  });

  card.querySelector("[data-action='to-served']").addEventListener("click", async () => {
    try {
      await updateOrderStatus(id, "servito");
      await loadAndRenderOrders();
    } catch (e) {
      console.error(e);
      alert("Errore nel cambio stato.");
    }
  });

  card.querySelector("[data-action='to-cancel']").addEventListener("click", async () => {
    const ok = confirm("Confermi l'annullamento di questa comanda?");
    if (!ok) return;
    try {
      await updateOrderStatus(id, "annullato");
      await loadAndRenderOrders();
    } catch (e) {
      console.error(e);
      alert("Errore nel cambio stato.");
    }
  });

  return card;
}

function renderKdsColumns(orders) {
  const colPending = document.getElementById("col-pending");
  const colPrep = document.getElementById("col-prep");
  const colReady = document.getElementById("col-ready");
  if (!colPending || !colPrep || !colReady) return;

  colPending.innerHTML = "";
  colPrep.innerHTML = "";
  colReady.innerHTML = "";

  // escludo chiusi/annullati e serviti (in cucina non servono più)
  const active = orders.filter(
    (o) => o.status !== "chiuso" && o.status !== "annullato" && o.status !== "servito"
  );

  // ordino per orario
  active.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });

  active.forEach((order) => {
    let column = colPending;

    if (order.status === "in_preparazione") {
      column = colPrep;
    } else if (order.status === "pronto") {
      column = colReady;
    } else if (!order.status || order.status === "in_attesa") {
      column = colPending;
    }

    const card = createOrderCard(order);
    column.appendChild(card);
  });

  if (!colPending.children.length) {
    colPending.innerHTML =
      '<div style="color:#b7bccd;font-size:14px;">Nessuna nuova comanda.</div>';
  }
  if (!colPrep.children.length) {
    colPrep.innerHTML =
      '<div style="color:#b7bccd;font-size:14px;">Nessuna comanda in preparazione.</div>';
  }
  if (!colReady.children.length) {
    colReady.innerHTML =
      '<div style="color:#b7bccd;font-size:14px;">Nessuna comanda pronta.</div>';
  }
}

async function loadAndRenderOrders() {
  try {
    const orders = await fetchOrders();
    ordersCache = orders || [];
    renderKpi(ordersCache);
    renderKdsColumns(ordersCache);
  } catch (err) {
    console.error(err);
    alert("Errore caricando le comande in cucina.");
  }
}

function initKds() {
  const btn = document.getElementById("btn-refresh");
  if (btn) {
    btn.addEventListener("click", loadAndRenderOrders);
  }

  window.addEventListener("rw:orders-update", (ev) => {
    if (ev.detail?.orders) {
      ordersCache = ev.detail.orders;
      renderKpi(ordersCache);
      renderKdsColumns(ordersCache);
    }
  });

  loadAndRenderOrders();
  setInterval(loadAndRenderOrders, 10000); // fallback polling
}

// =======================================
//   RICETTE (localStorage)
// =======================================

function loadRecipesFromStorage() {
  recipes = safeJSONParse(localStorage.getItem(LS_RECIPES_KEY), []);
}

function saveRecipesToStorage() {
  localStorage.setItem(LS_RECIPES_KEY, JSON.stringify(recipes));
}

function renderRecipesList() {
  const container = document.getElementById("recipes-list");
  if (!container) return;

  container.innerHTML = "";

  if (!recipes.length) {
    container.innerHTML =
      '<div class="list-item">Nessuna ricetta salvata.</div>';
    return;
  }

  recipes.forEach((r, idx) => {
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `
      <div class="list-item-header">
        <div class="list-item-title">${r.name || "Senza titolo"}</div>
        <button data-index="${idx}" class="btn-xs danger">Elimina</button>
      </div>
      <div class="list-item-meta">
        Categoria: ${r.category || "-"} • Porzioni: ${r.servings || "-"}
      </div>
      <div style="margin-top:4px;font-size:12px;">
        ${r.notes ? r.notes.replace(/\n/g, "<br>") : ""}
      </div>
      ${
        r.photo
          ? `<div style="margin-top:4px;font-size:11px;color:#b7bccd;">Foto: ${r.photo}</div>`
          : ""
      }
    `;
    container.appendChild(div);
  });

  container.querySelectorAll("button.btn-xs.danger").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      recipes.splice(idx, 1);
      saveRecipesToStorage();
      renderRecipesList();
    });
  });
}

function initRecipes() {
  loadRecipesFromStorage();

  const btnSave = document.getElementById("btn-save-recipe");
  if (!btnSave) return;

  btnSave.addEventListener("click", () => {
    const name = document.getElementById("recipe-name").value.trim();
    const category = document.getElementById("recipe-category").value.trim();
    const servings = Number(
      document.getElementById("recipe-servings").value.trim()
    );
    const notes = document.getElementById("recipe-notes").value.trim();
    const photo = document.getElementById("recipe-photo").value.trim();

    if (!name) {
      alert("Inserisci il nome della ricetta.");
      return;
    }

    const rec = {
      name,
      category,
      servings: Number.isFinite(servings) && servings > 0 ? servings : "",
      notes,
      photo,
      createdAt: new Date().toISOString(),
    };

    recipes.push(rec);
    saveRecipesToStorage();
    renderRecipesList();

    document.getElementById("recipe-name").value = "";
    document.getElementById("recipe-category").value = "";
    document.getElementById("recipe-servings").value = "";
    document.getElementById("recipe-notes").value = "";
    document.getElementById("recipe-photo").value = "";
  });

  renderRecipesList();
}

// =======================================
//   LISTA SPESA VOCALE
// =======================================

let recognition = null;
let recognizing = false;

function initSpeechRecognition() {
  const SpeechRec =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    const status = document.getElementById("voice-status");
    if (status) {
      status.textContent = "Riconoscimento vocale non supportato in questo browser.";
    }
    return;
  }

  recognition = new SpeechRec();
  recognition.lang = "it-IT";
  recognition.interimResults = true;
  recognition.continuous = true;

  const status = document.getElementById("voice-status");
  const textarea = document.getElementById("voice-raw");

  recognition.onstart = () => {
    recognizing = true;
    if (status) status.textContent = "Ascolto in corso...";
  };

  recognition.onerror = (e) => {
    console.error("SpeechRecognition error:", e);
    recognizing = false;
    if (status) status.textContent = "Errore nel riconoscimento.";
  };

  recognition.onend = () => {
    recognizing = false;
    if (status) status.textContent = "Pronto";
  };

  recognition.onresult = (event) => {
    let finalTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) {
        finalTranscript += res[0].transcript;
      }
    }
    if (finalTranscript && textarea) {
      textarea.value += (textarea.value ? " " : "") + finalTranscript.trim();
    }
  };
}

function loadShoppingFromStorage() {
  shoppingItems = safeJSONParse(localStorage.getItem(LS_SHOPPING_KEY), []);
}

function saveShoppingToStorage() {
  localStorage.setItem(LS_SHOPPING_KEY, JSON.stringify(shoppingItems));
}

function renderShoppingList() {
  const container = document.getElementById("shopping-list");
  if (!container) return;

  container.innerHTML = "";

  if (!shoppingItems.length) {
    container.innerHTML =
      '<div class="shopping-item">Lista vuota.</div>';
    return;
  }

  shoppingItems.forEach((txt, idx) => {
    const div = document.createElement("div");
    div.className = "shopping-item";
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <span>${txt}</span>
        <button data-index="${idx}" class="btn-xs danger">X</button>
      </div>
    `;
    container.appendChild(div);
  });

  container.querySelectorAll("button.btn-xs.danger").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      shoppingItems.splice(idx, 1);
      saveShoppingToStorage();
      renderShoppingList();
    });
  });
}

function initShopping() {
  loadShoppingFromStorage();
  renderShoppingList();
  initSpeechRecognition();

  const btnStart = document.getElementById("btn-voice-start");
  const btnStop = document.getElementById("btn-voice-stop");
  const status = document.getElementById("voice-status");
  const textarea = document.getElementById("voice-raw");
  const btnAdd = document.getElementById("btn-add-shopping-items");
  const btnClear = document.getElementById("btn-clear-shopping");

  if (btnStart && recognition) {
    btnStart.addEventListener("click", () => {
      if (!recognition || recognizing) return;
      recognition.start();
    });
  }

  if (btnStop && recognition) {
    btnStop.addEventListener("click", () => {
      if (recognition && recognizing) recognition.stop();
    });
  }

  if (btnAdd) {
    btnAdd.addEventListener("click", () => {
      if (!textarea) return;
      const raw = textarea.value.trim();
      if (!raw) return;

      // divido per virgola per avere voci separate
      const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
      if (!parts.length) return;

      shoppingItems.push(...parts);
      saveShoppingToStorage();
      renderShoppingList();
      textarea.value = "";
    });
  }

  if (btnClear) {
    btnClear.addEventListener("click", () => {
      const ok = confirm("Svuotare tutta la lista spesa?");
      if (!ok) return;
      shoppingItems = [];
      saveShoppingToStorage();
      renderShoppingList();
    });
  }
}

// =======================================
//   HACCP (API)
// =======================================

async function fetchHaccpJSON(url, options = {}) {
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

async function loadHaccpFromAPI() {
  try {
    haccpEntries = await fetchHaccpJSON("/api/haccp");
    if (!Array.isArray(haccpEntries)) haccpEntries = [];
  } catch (err) {
    console.error("HACCP load error:", err);
    haccpEntries = [];
  }
}

function renderHaccpList() {
  const container = document.getElementById("haccp-list");
  if (!container) return;

  container.innerHTML = "";

  if (!haccpEntries.length) {
    container.innerHTML =
      '<div class="list-item">Nessun record HACCP salvato.</div>';
    return;
  }

  haccpEntries
    .slice()
    .reverse()
    .forEach((e) => {
      const div = document.createElement("div");
      div.className = "list-item";
      const tempVal = e.temp ?? e.value ?? "-";
      const notesVal = e.notes ?? e.note ?? "";
      div.innerHTML = `
        <div class="list-item-header">
          <div class="list-item-title">
            ${e.date || ""} ${e.time || ""} – ${e.unit || ""}
          </div>
          <button data-id="${e.id}" class="btn-xs danger">X</button>
        </div>
        <div class="list-item-meta">
          Tipo: ${e.type || "-"} • Temp: ${tempVal} °C • Operatore: ${e.operator || "-"}
        </div>
        <div style="margin-top:4px;font-size:12px;">
          ${notesVal ? String(notesVal).replace(/\n/g, "<br>") : ""}
        </div>
      `;
      container.appendChild(div);
    });

  container.querySelectorAll("button.btn-xs.danger").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      if (!id) return;
      try {
        await fetchHaccpJSON(`/api/haccp/${id}`, { method: "DELETE" });
        haccpEntries = haccpEntries.filter((x) => x.id !== id);
        renderHaccpList();
      } catch (err) {
        alert("Errore eliminazione HACCP: " + err.message);
      }
    });
  });
}

async function initHaccp() {
  await loadHaccpFromAPI();
  renderHaccpList();

  const btnSave = document.getElementById("btn-save-haccp");
  if (!btnSave) return;

  btnSave.addEventListener("click", async () => {
    const date = document.getElementById("haccp-date").value;
    const time = document.getElementById("haccp-time").value;
    const type = document.getElementById("haccp-type").value;
    const unit = document.getElementById("haccp-unit").value.trim();
    const temp = document.getElementById("haccp-temp").value.trim();
    const operator = document.getElementById("haccp-operator").value.trim();
    const notes = document.getElementById("haccp-notes").value.trim();

    if (!date || !time || !unit || !operator) {
      alert("Compila almeno data, ora, unità e operatore.");
      return;
    }

    const payload = {
      date,
      time,
      type,
      unit,
      temp: temp ? Number(temp) : "",
      operator,
      notes,
      createdAt: new Date().toISOString(),
    };

    try {
      const created = await fetchHaccpJSON("/api/haccp", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      haccpEntries.push(created);
      renderHaccpList();
      document.getElementById("haccp-temp").value = "";
      document.getElementById("haccp-notes").value = "";
    } catch (err) {
      alert("Errore salvataggio HACCP: " + err.message);
    }
  });
}

// =======================================
//   TURNI CUCINA (localStorage)
// =======================================

function loadShiftsFromStorage() {
  shifts = safeJSONParse(localStorage.getItem(LS_SHIFTS_KEY), []);
}

function saveShiftsToStorage() {
  localStorage.setItem(LS_SHIFTS_KEY, JSON.stringify(shifts));
}

function renderShifts() {
  const container = document.getElementById("turni-list");
  if (!container) return;

  container.innerHTML = "";

  if (!shifts.length) {
    container.innerHTML =
      '<div class="list-item">Nessun turno inserito.</div>';
    return;
  }

  shifts.forEach((s, idx) => {
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `
      <div class="list-item-header">
        <div class="list-item-title">
          ${s.day || ""} – ${s.name || ""}
        </div>
        <button data-index="${idx}" class="btn-xs danger">X</button>
      </div>
      <div class="list-item-meta">
        Orario: ${s.hours || "-"} • Ruolo: ${s.role || "-"}
      </div>
    `;
    container.appendChild(div);
  });

  container.querySelectorAll("button.btn-xs.danger").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      shifts.splice(idx, 1);
      saveShiftsToStorage();
      renderShifts();
    });
  });
}

function initShifts() {
  loadShiftsFromStorage();
  renderShifts();

  const btnAdd = document.getElementById("btn-add-shift");
  const btnClear = document.getElementById("btn-clear-shifts");
  if (btnAdd) {
    btnAdd.addEventListener("click", () => {
      const day = document.getElementById("turni-day").value;
      const name = document.getElementById("turni-name").value.trim();
      const hours = document.getElementById("turni-hours").value.trim();
      const role = document.getElementById("turni-role").value.trim();

      if (!name || !hours) {
        alert("Inserisci almeno nome e orario.");
        return;
      }

      shifts.push({ day, name, hours, role });
      saveShiftsToStorage();
      renderShifts();

      document.getElementById("turni-name").value = "";
      document.getElementById("turni-hours").value = "";
      document.getElementById("turni-role").value = "";
    });
  }

  if (btnClear) {
    btnClear.addEventListener("click", () => {
      const ok = confirm("Svuotare tutti i turni?");
      if (!ok) return;
      shifts = [];
      saveShiftsToStorage();
      renderShifts();
    });
  }
}

// =======================================
//   KITCHEN AI ASSISTANT (Comandi vocali)
// =======================================

const KITCHEN_WAKE_REGEX = /^ehi\s+risto[,\s]*/i;

function renderKitchenMenu(summary, menu) {
  const escapeHtml = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const formatDish = (d) => {
    if (!d) return "";
    const name = escapeHtml(d.dishName || "-");
    const desc = escapeHtml(d.description || "");
    const ings = Array.isArray(d.mainIngredients) && d.mainIngredients.length > 0
      ? d.mainIngredients.map(escapeHtml).join(", ")
      : "disponibili in magazzino";
    const why = escapeHtml(d.whySuggested || "");
    return `<div class="menu-dish"><strong class="menu-dish-name">${name}</strong><br><span class="menu-dish-desc">${desc}</span><br><span class="menu-dish-ingredients">Ingredienti: ${ings}</span><br><span class="menu-dish-why">${why}</span></div>`;
  };
  const parts = [
    summary ? `<p class="kitchen-menu-summary">${escapeHtml(summary)}</p>` : "",
    '<div class="kitchen-menu-courses">',
    menu.starter ? `<div class="menu-course"><span class="menu-course-label">Antipasto</span>${formatDish(menu.starter)}</div>` : "",
    menu.first ? `<div class="menu-course"><span class="menu-course-label">Primo</span>${formatDish(menu.first)}</div>` : "",
    menu.main ? `<div class="menu-course"><span class="menu-course-label">Secondo</span>${formatDish(menu.main)}</div>` : "",
    menu.dessert ? `<div class="menu-course"><span class="menu-course-label">Dolce</span>${formatDish(menu.dessert)}</div>` : "",
    "</div>"
  ];
  return parts.join("");
}

function parseKitchenCommand(raw) {
  const text = String(raw || "").trim();
  if (!KITCHEN_WAKE_REGEX.test(text)) {
    return { hasWakeWord: false, command: "" };
  }
  const command = text.replace(KITCHEN_WAKE_REGEX, "").trim();
  return { hasWakeWord: true, command };
}

let kitchenRecognition = null;
let kitchenRecognizing = false;

function initKitchenSpeechRecognition() {
  const SpeechRec =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) return null;

  const rec = new SpeechRec();
  rec.lang = "it-IT";
  rec.interimResults = true;
  rec.continuous = false;

  return rec;
}

function initKitchenAssistant() {
  const input = document.getElementById("kitchen-command-input");
  const micBtn = document.getElementById("kitchen-command-mic");
  const sendBtn = document.getElementById("kitchen-command-send");
  const statusEl = document.getElementById("kitchen-command-status");
  const responseEl = document.getElementById("kitchen-ai-response");

  if (!input || !sendBtn || !responseEl) return;

  kitchenRecognition = initKitchenSpeechRecognition();

  if (micBtn && kitchenRecognition) {
    micBtn.addEventListener("click", () => {
      if (kitchenRecognizing) {
        kitchenRecognition.stop();
        return;
      }
      kitchenRecognition.onstart = () => {
        kitchenRecognizing = true;
        if (statusEl) statusEl.textContent = "Ascolto...";
        micBtn?.classList.add("listening");
      };
      kitchenRecognition.onend = () => {
        kitchenRecognizing = false;
        if (statusEl) statusEl.textContent = "";
        micBtn?.classList.remove("listening");
      };
      kitchenRecognition.onerror = () => {
        kitchenRecognizing = false;
        if (statusEl) statusEl.textContent = "Errore riconoscimento vocale.";
        micBtn?.classList.remove("listening");
      };
      kitchenRecognition.onresult = (event) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          transcript += res[0].transcript;
        }
        if (transcript.trim()) {
          const current = input.value.trim();
          input.value = current ? current + " " + transcript.trim() : transcript.trim();
        }
      };
      kitchenRecognition.start();
    });
  } else if (micBtn) {
    micBtn.disabled = true;
    micBtn.title = "Riconoscimento vocale non supportato";
  }

  const sentEl = document.getElementById("kitchen-command-sent");

  async function sendKitchenCommand() {
    const raw = input.value.trim();
    if (!raw) {
      if (sentEl) sentEl.textContent = "";
      if (responseEl) {
        responseEl.innerHTML =
          '<span class="kitchen-ai-placeholder">Inserisci un comando. Es: "Ehi Risto, aggiungi 5 kg di entrecôte alla lista ordine carne."</span>';
      }
      return;
    }

    const { hasWakeWord, command } = parseKitchenCommand(raw);
    if (!hasWakeWord) {
      if (sentEl) sentEl.textContent = "";
      if (responseEl) {
        responseEl.innerHTML =
          '<span style="color:var(--accent-warning);">Devi iniziare il comando con \'Ehi Risto\'.</span>';
      }
      return;
    }

    if (!command) {
      if (sentEl) sentEl.textContent = "";
      if (responseEl) {
        responseEl.innerHTML =
          '<span class="kitchen-ai-placeholder">Dopo "Ehi Risto" aggiungi il comando (es. aggiungi 5 kg di entrecôte alla lista ordine).</span>';
      }
      return;
    }

    if (statusEl) statusEl.textContent = "Invio comando...";
    if (sentEl) sentEl.textContent = "Comando inviato: «" + command + "»";
    responseEl.innerHTML = '<span class="kitchen-ai-placeholder">Caricamento...</span>';

    try {
      const res = await fetch("/api/ai/kitchen", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errMsg = (typeof data?.error === "string" ? data.error : null) || data?.message || "Errore server. Riprova.";
        throw new Error(errMsg);
      }

      if (data?.success === false && data?.error) {
        throw new Error(typeof data.error === "string" ? data.error : String(data.error));
      }

      if (data?.type === "menu" && data?.menu) {
        responseEl.innerHTML = renderKitchenMenu(data.message || data.response, data.menu);
      } else {
        const message =
          data?.response || data?.message || data?.answer || data?.text ||
          (typeof data === "string" ? data : JSON.stringify(data));
        responseEl.innerHTML = String(message || "Nessuna risposta.").replace(/\n/g, "<br>");
      }
      if (statusEl) statusEl.textContent = "";
      input.value = "";
    } catch (err) {
      console.error(err);
      const errText = err.message || "Errore di connessione. Riprova.";
      responseEl.innerHTML =
        '<span style="color:var(--accent-danger);" role="alert">' +
        (errText.replace(/</g, "&lt;").replace(/>/g, "&gt;")) +
        "</span>";
      if (statusEl) statusEl.textContent = "Errore";
    }
  }

  sendBtn.addEventListener("click", sendKitchenCommand);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendKitchenCommand();
    }
  });
}

// =======================================
//   NOTE VOCALI (testo, localStorage)
// =======================================

function initVoiceNotes() {
  const textarea = document.getElementById("voice-notes");
  const btnSave = document.getElementById("btn-save-voice-notes");
  const btnClear = document.getElementById("btn-clear-voice-notes");
  if (!textarea) return;

  // carica da localStorage
  const saved = localStorage.getItem(LS_VOICE_NOTES_KEY);
  if (saved) {
    textarea.value = saved;
  }

  if (btnSave) {
    btnSave.addEventListener("click", () => {
      localStorage.setItem(LS_VOICE_NOTES_KEY, textarea.value || "");
    });
  }

  if (btnClear) {
    btnClear.addEventListener("click", () => {
      const ok = confirm("Svuotare tutti gli appunti?");
      if (!ok) return;
      textarea.value = "";
      localStorage.removeItem(LS_VOICE_NOTES_KEY);
    });
  }
}

// =======================================
//   INIT GLOBALE
// =======================================

function initStaffAccess() {
  if (!window.RW_StaffAccess) return;
  RW_StaffAccess.init({ module: "cucina", department: "cucina" });

  function refreshStaffUI() {
    const sess = RW_StaffAccess.getCurrentSession();
    const mgrVal = document.getElementById("rw-manager-value");
    const btnLogin = document.getElementById("rw-btn-manager-login");
    const btnLogout = document.getElementById("rw-btn-manager-logout");
    if (mgrVal) mgrVal.textContent = sess ? sess.name : "—";
    if (btnLogin) btnLogin.style.display = sess ? "none" : "";
    if (btnLogout) btnLogout.style.display = sess ? "" : "none";
    const chip = document.getElementById("rw-cucina-manager-chip");
    if (chip) chip.classList.toggle("logged-in", !!sess);

    RW_StaffAccess.renderActiveStaff("rw-cucina-active-staff", "cucina");
  }

  document.getElementById("rw-btn-manager-login")?.addEventListener("click", () => {
    RW_StaffAccess.showManagerLoginModal(refreshStaffUI, "kitchen_manager");
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
  initViewSwitcher();
  initKds();
  initRecipes();
  initShopping();
  initHaccp();
  initShifts();
  initKitchenAssistant();
  initVoiceNotes();
  initStaffAccess();
});