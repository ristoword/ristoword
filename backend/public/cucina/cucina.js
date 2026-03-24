// =======================================
//   CONFIG COSTANTI
// =======================================

const ORDERS_API = "/api/orders";

const LS_RECIPES_KEY = "ristoword_cucina_recipes";
const LS_HACCP_KEY = "ristoword_cucina_haccp";
const LS_SHOPPING_KEY = "ristoword_cucina_shopping";
const LS_SUPPLIER_EMAIL = "ristoword_cucina_supplier_email";
const LS_SUPPLIER_SUBJECT = "ristoword_cucina_supplier_subject";
const LS_SUPPLIER_AUTO = "ristoword_cucina_supplier_auto_email";
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
    ricezione: "view-ricezione",
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
  const res = await fetch(ORDERS_API + "?active=true", { credentials: "same-origin" });
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
  const contentType = res.headers.get("content-type") || "";
  let data;
  if (contentType.includes("application/json")) {
    data = await res.json();
  } else {
    const text = await res.text();
    data = { message: text };
  }
  if (!res.ok) {
    const msg =
      (data && typeof data.message === "string" && data.message) ||
      (data && typeof data.error === "string" && data.error !== "true" && data.error) ||
      "Errore cambio stato";
    throw new Error(msg);
  }
  return data;
}

// =======================================
//   RENDER KDS (COMANDE)
// =======================================

async function renderKpi(orders) {
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

  const invEl = document.getElementById("kpi-inventory-value");
  if (invEl) {
    try {
      const res = await fetch("/api/inventory/value", { credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        invEl.textContent = data.formatted || "€ 0,00";
      } else {
        invEl.textContent = "–";
      }
    } catch {
      invEl.textContent = "–";
    }
  }
}

function buildCourseBlocksHtml(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const activeCourse = Number(order.activeCourse) >= 1 ? Number(order.activeCourse) : 1;
  const byCourse = new Map();
  items.forEach((i) => {
    const cn = Number(i.course) >= 1 ? Number(i.course) : 1;
    if (!byCourse.has(cn)) byCourse.set(cn, []);
    byCourse.get(cn).push(i);
  });
  const nums = [...byCourse.keys()].sort((a, b) => a - b);
  if (!nums.length) {
    return `<span style="font-size:14px;color:#b7bccd;">Dettaglio piatti non disponibile</span>`;
  }
  const blocks = nums
    .map((cn) => {
      let courseCls = "kds-course-future";
      if (cn === activeCourse) courseCls = "kds-course-active";
      else if (cn < activeCourse) courseCls = "kds-course-past";
      const cls = `kds-course-block ${courseCls}`;
      const rows = byCourse
        .get(cn)
        .map((i) => {
          const note = i.note
            ? ` <span class="kds-item-note">${escapeHtml(String(i.note))}</span>`
            : "";
          return `<div class="kds-course-line">${escapeHtml(i.name || "-")} x${i.qty ?? 1}${note}</div>`;
        })
        .join("");
      return `<div class="${cls}"><div class="kds-course-title">Corso ${cn}</div>${rows}</div>`;
    })
    .join("");
  return `
    <div class="kds-marca-hint">Marca corso (sala): <strong>${activeCourse}</strong> · blocchi separati per ogni uscita</div>
    <div class="kds-courses-wrap">${blocks}</div>
  `;
}

function createOrderCard(order) {
  const card = document.createElement("div");
  card.className = "order-card";

  const age = minutesFrom(order.createdAt);
  if (age !== null && age >= 20 && order.status !== "pronto") {
    card.classList.add("late");
  }

  const timeStr = formatTime(order.createdAt);

  const itemsHtml = buildCourseBlocksHtml(order);

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
      alert(e.message || "Errore nel cambio stato.");
      try {
        await loadAndRenderOrders();
      } catch (_) {}
    }
  });

  card.querySelector("[data-action='to-ready']").addEventListener("click", async () => {
    try {
      await updateOrderStatus(id, "pronto");
      await loadAndRenderOrders();
    } catch (e) {
      console.error(e);
      alert(e.message || "Errore nel cambio stato.");
      try {
        await loadAndRenderOrders();
      } catch (_) {}
    }
  });

  card.querySelector("[data-action='to-served']").addEventListener("click", async () => {
    try {
      await updateOrderStatus(id, "servito");
      await loadAndRenderOrders();
    } catch (e) {
      console.error(e);
      alert(e.message || "Errore nel cambio stato.");
      try {
        await loadAndRenderOrders();
      } catch (_) {}
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
      alert(e.message || "Errore nel cambio stato.");
      try {
        await loadAndRenderOrders();
      } catch (_) {}
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
//   RICETTE (API /api/recipes)
// =======================================

const RECIPES_API = "/api/recipes";
const INVENTORY_API = "/api/inventory";
const RECIPE_UNITS = ["g", "kg", "ml", "cl", "l", "pcs"];
let inventoryCache = [];

async function fetchRecipes() {
  const res = await fetch(RECIPES_API, { credentials: "same-origin" });
  if (!res.ok) throw new Error("Errore caricamento ricette");
  return res.json();
}

async function fetchInventory() {
  const res = await fetch(INVENTORY_API, { credentials: "same-origin" });
  if (!res.ok) return [];
  return res.json();
}

function getKitchenStock(productName) {
  const n = String(productName || "").trim().toLowerCase();
  const item = inventoryCache.find(
    (i) => String(i.name || "").trim().toLowerCase() === n
  );
  if (!item || !item.stocks) return null;
  return Number(item.stocks.cucina) || 0;
}

function getInventoryUnit(productName) {
  const n = String(productName || "").trim().toLowerCase();
  const item = inventoryCache.find(
    (i) => String(i.name || "").trim().toLowerCase() === n
  );
  return item ? (item.unit || "") : "";
}

function addIngredientRow(container, data = {}) {
  const tpl = document.getElementById("ingredient-row-tpl");
  if (!tpl || !container) return;
  const row = tpl.content.cloneNode(true);
  const ingRow = row.querySelector(".ingredient-row");
  ingRow.querySelector(".ing-name").value = data.name || data.ingredientName || "";
  ingRow.querySelector(".ing-qty").value = data.quantity ?? data.qty ?? "";
  const unitSel = ingRow.querySelector(".ing-unit");
  const u = (data.unit || "g").toLowerCase();
  unitSel.value = RECIPE_UNITS.includes(u) ? u : "g";
  ingRow.querySelector(".ing-remove").addEventListener("click", () => ingRow.remove());
  function updateStock() {
    const nm = ingRow.querySelector(".ing-name").value.trim();
    const st = getKitchenStock(nm);
    ingRow.querySelector(".ing-stock").textContent =
      nm && st !== null ? `Cucina: ${st}` : "";
  }
  ingRow.querySelector(".ing-name").addEventListener("blur", updateStock);
  container.appendChild(row);
  updateStock();
}

function collectIngredients() {
  const rows = document.querySelectorAll("#recipe-ingredients-list .ingredient-row");
  const ings = [];
  rows.forEach((r) => {
    const name = r.querySelector(".ing-name")?.value?.trim();
    const qty = parseFloat(r.querySelector(".ing-qty")?.value);
    const unit = r.querySelector(".ing-unit")?.value || "g";
    if (!name || !Number.isFinite(qty) || qty <= 0) return;
    ings.push({ name, ingredientName: name, quantity: qty, unit });
  });
  return ings;
}

function clearRecipeForm() {
  document.getElementById("recipe-id").value = "";
  document.getElementById("recipe-form-title").textContent = "Nuova ricetta";
  document.getElementById("recipe-name").value = "";
  document.getElementById("recipe-category").value = "";
  document.getElementById("recipe-department").value = "cucina";
  document.getElementById("recipe-yield").value = "";
  document.getElementById("recipe-selling-price").value = "";
  document.getElementById("recipe-target-fc").value = "";
  document.getElementById("recipe-description").value = "";
  document.getElementById("recipe-notes").value = "";
  const list = document.getElementById("recipe-ingredients-list");
  list.innerHTML = "";
  addIngredientRow(list);
  document.getElementById("recipe-food-cost-section").style.display = "none";
}

function loadRecipeIntoForm(r) {
  document.getElementById("recipe-id").value = r.id || "";
  document.getElementById("recipe-form-title").textContent = "Modifica ricetta";
  document.getElementById("recipe-name").value = r.menuItemName || r.name || "";
  document.getElementById("recipe-category").value = r.category || "";
  document.getElementById("recipe-department").value = r.department || r.area || "cucina";
  document.getElementById("recipe-yield").value = r.yieldPortions ?? r.yield_portions ?? r.servings ?? "";
  document.getElementById("recipe-selling-price").value = r.sellingPrice ?? r.selling_price ?? "";
  document.getElementById("recipe-target-fc").value = r.targetFoodCost ?? r.target_food_cost ?? "";
  document.getElementById("recipe-description").value = r.description || "";
  document.getElementById("recipe-notes").value = r.notes || r.note || "";
  const list = document.getElementById("recipe-ingredients-list");
  list.innerHTML = "";
  const ings = Array.isArray(r.ingredients) ? r.ingredients : [];
  if (ings.length === 0) {
    addIngredientRow(list);
  } else {
    ings.forEach((i) =>
      addIngredientRow(list, {
        name: i.name || i.ingredientName,
        quantity: i.quantity ?? i.qty,
        unit: i.unit || "g",
      })
    );
  }
  document.getElementById("recipe-food-cost-section").style.display = "block";
  refreshRecipeFoodCost(r.id);
}

async function refreshRecipeFoodCost(recipeId) {
  if (!recipeId) return;
  try {
    const res = await fetch(`${RECIPES_API}/${recipeId}/food-cost`, {
      credentials: "same-origin",
    });
    if (!res.ok) return;
    const fc = await res.json();
    document.getElementById("fc-total").textContent =
      "€ " + (Number(fc.recipeTotalCost) || 0).toFixed(2);
    document.getElementById("fc-portion").textContent =
      "€ " + (Number(fc.costPerPortion) || 0).toFixed(2);
    document.getElementById("fc-percent").textContent =
      fc.foodCostPercent != null ? (fc.foodCostPercent.toFixed(1) + " %") : "—";
    document.getElementById("fc-suggested").textContent =
      fc.suggestedPrice != null ? "€ " + fc.suggestedPrice.toFixed(2) : "—";
  } catch (_) {}
}

function renderRecipesList() {
  const container = document.getElementById("recipes-list");
  const loading = container?.querySelector(".recipes-loading");
  if (!container) return;
  if (loading) loading.remove();

  if (!recipes.length) {
    container.innerHTML = '<div class="list-item">Nessuna ricetta. Creane una dal form.</div>';
    return;
  }

  recipes.forEach((r) => {
    const div = document.createElement("div");
    div.className = "list-item";
    const name = r.menuItemName || r.name || "Senza titolo";
    div.innerHTML = `
      <div class="list-item-header">
        <div class="list-item-title">${escapeHtml(name)}</div>
        <div>
          <button data-id="${r.id}" class="btn-xs">Modifica</button>
          <button data-id="${r.id}" class="btn-xs danger">Elimina</button>
        </div>
      </div>
      <div class="list-item-meta">
        ${r.category ? escapeHtml(r.category) + " • " : ""}Porzioni: ${r.yieldPortions ?? r.yield_portions ?? "-"}
        ${r.sellingPrice ? " • € " + r.sellingPrice : ""}
      </div>
    `;
    container.appendChild(div);
  });

  container.querySelectorAll("button[data-id]").forEach((btn) => {
    const id = btn.dataset.id;
    if (btn.classList.contains("danger")) {
      btn.addEventListener("click", async () => {
        if (!confirm("Eliminare questa ricetta?")) return;
        try {
          const res = await fetch(`${RECIPES_API}/${id}`, {
            method: "DELETE",
            credentials: "same-origin",
          });
          if (res.ok) await loadRecipesAndRender();
          else alert("Errore eliminazione");
        } catch (e) {
          alert("Errore: " + (e.message || "Riprova"));
        }
      });
    } else {
      btn.addEventListener("click", () => {
        const r = recipes.find((x) => x.id === id);
        if (r) loadRecipeIntoForm(r);
      });
    }
  });
}

function escapeHtml(s) {
  if (s == null) return "";
  const div = document.createElement("div");
  div.textContent = String(s);
  return div.innerHTML;
}

async function loadRecipesAndRender() {
  const container = document.getElementById("recipes-list");
  if (container) {
    container.innerHTML = '<div class="recipes-loading">Caricamento...</div>';
  }
  try {
    recipes = await fetchRecipes();
    if (!Array.isArray(recipes)) recipes = [];
    inventoryCache = await fetchInventory();
    if (!Array.isArray(inventoryCache)) inventoryCache = [];
    renderRecipesList();
  } catch (err) {
    if (container) {
      container.innerHTML =
        '<div class="list-item" style="color:var(--accent-danger);">Errore caricamento ricette.</div>';
    }
    console.error(err);
  }
}

function initRecipes() {
  const btnSave = document.getElementById("btn-save-recipe");
  const btnClear = document.getElementById("btn-recipe-clear");
  const btnAddIng = document.getElementById("btn-add-ingredient");
  const ingredientsList = document.getElementById("recipe-ingredients-list");
  const btnUseAsDish = document.getElementById("btn-recipe-use-as-dish");

  if (btnAddIng && ingredientsList) {
    btnAddIng.addEventListener("click", () => addIngredientRow(ingredientsList));
    addIngredientRow(ingredientsList);
  }

  if (btnClear) {
    btnClear.addEventListener("click", clearRecipeForm);
  }

  if (btnSave) {
    btnSave.addEventListener("click", async () => {
      const name = document.getElementById("recipe-name").value.trim();
      const ings = collectIngredients();
      if (!name) {
        alert("Inserisci il nome della ricetta.");
        return;
      }
      if (ings.length < 1) {
        alert("Aggiungi almeno un ingrediente con quantità > 0.");
        return;
      }
      const payload = {
        name,
        menuItemName: name,
        category: document.getElementById("recipe-category").value.trim(),
        department: document.getElementById("recipe-department").value,
        description: document.getElementById("recipe-description").value.trim(),
        yieldPortions: Number(document.getElementById("recipe-yield").value) || 1,
        sellingPrice: Number(document.getElementById("recipe-selling-price").value) || 0,
        targetFoodCost: Number(document.getElementById("recipe-target-fc").value) || 0,
        notes: document.getElementById("recipe-notes").value.trim(),
        ingredients: ings,
      };
      const id = document.getElementById("recipe-id").value;
      try {
        const url = id ? `${RECIPES_API}/${id}` : RECIPES_API;
        const method = id ? "PATCH" : "POST";
        const res = await fetch(url, {
          method,
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(data.error || "Errore salvataggio");
          return;
        }
        // Aggiorna l'id nascosto con l'ID definitivo restituito dal backend
        if (data && data.id) {
          document.getElementById("recipe-id").value = data.id;
        }
        clearRecipeForm();
        await loadRecipesAndRender();
      } catch (e) {
        alert("Errore: " + (e.message || "Riprova"));
      }
    });
  }

  document.querySelector(".nav-btn[data-view='ricette']")?.addEventListener("click", () => {
    loadRecipesAndRender();
  });

  if (btnUseAsDish) {
    btnUseAsDish.addEventListener("click", () => {
      const id = document.getElementById("recipe-id").value;
      if (!id) {
        alert("Prima salva la ricetta per poterla usare come piatto.");
        return;
      }
      const name = document.getElementById("recipe-name").value.trim();
      const category = document.getElementById("recipe-category").value.trim();
      const department = document.getElementById("recipe-department").value;
      const yieldVal = document.getElementById("recipe-yield").value;
      const targetFcVal = document.getElementById("recipe-target-fc").value;
      const priceVal = document.getElementById("recipe-selling-price").value;

      const params = new URLSearchParams({
        fromRecipe: id,
        name,
        category,
        department,
        portions: String(yieldVal || ""),
        targetFc: String(targetFcVal || ""),
        price: String(priceVal || ""),
      });
      window.location.href = `/menu-admin/menu-admin.html?${params.toString()}`;
    });
  }
  loadRecipesAndRender();
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
  const parsed = safeJSONParse(localStorage.getItem(LS_SHOPPING_KEY), []);
  shoppingItems = Array.isArray(parsed) ? parsed : [];
}

function saveShoppingToStorage() {
  localStorage.setItem(LS_SHOPPING_KEY, JSON.stringify(shoppingItems));
}

function buildShoppingEmailBody() {
  const lines = [];
  lines.push("LISTA SPESA — RistoWord (Cucina)");
  lines.push("Data: " + new Date().toLocaleString("it-IT"));
  lines.push("");
  const items = Array.isArray(shoppingItems) ? shoppingItems : [];
  if (!items.length) return "";
  items.forEach((t) => lines.push("- " + String(t)));
  return lines.join("\n");
}

function setSupplierEmailStatus(msg, type) {
  const el = document.getElementById("supplier-email-status");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.remove("ok", "err");
  if (type === "ok") el.classList.add("ok");
  else if (type === "err") el.classList.add("err");
}

function persistSupplierEmailPrefs() {
  try {
    const em = document.getElementById("supplier-email-to")?.value?.trim() || "";
    const sub = document.getElementById("supplier-email-subject")?.value?.trim() || "";
    const auto = document.getElementById("supplier-email-after-add")?.checked === true;
    localStorage.setItem(LS_SUPPLIER_EMAIL, em);
    localStorage.setItem(LS_SUPPLIER_SUBJECT, sub);
    localStorage.setItem(LS_SUPPLIER_AUTO, auto ? "1" : "0");
  } catch (_) {
    /* ignore */
  }
}

function loadSupplierEmailPrefs() {
  try {
    const em = localStorage.getItem(LS_SUPPLIER_EMAIL) || "";
    const sub = localStorage.getItem(LS_SUPPLIER_SUBJECT) || "";
    const auto = localStorage.getItem(LS_SUPPLIER_AUTO) === "1";
    const elEm = document.getElementById("supplier-email-to");
    const elSub = document.getElementById("supplier-email-subject");
    const elAuto = document.getElementById("supplier-email-after-add");
    if (elEm) elEm.value = em;
    if (elSub) elSub.value = sub;
    if (elAuto) elAuto.checked = auto;
  } catch (_) {
    /* ignore */
  }
}

async function sendSupplierShoppingEmail(options = {}) {
  const { silent } = options;
  const to = document.getElementById("supplier-email-to")?.value?.trim();
  const subject =
    document.getElementById("supplier-email-subject")?.value?.trim() ||
    "Ordine lista spesa — Cucina";
  const message = buildShoppingEmailBody();

  if (!to) {
    const msg = "Inserisci l'email del fornitore.";
    setSupplierEmailStatus(msg, "err");
    if (!silent) window.alert(msg);
    return { ok: false };
  }
  if (!shoppingItems || !shoppingItems.length) {
    const msg = "La lista spesa è vuota. Aggiungi voci prima di inviare.";
    setSupplierEmailStatus(msg, "err");
    if (!silent) window.alert(msg);
    return { ok: false };
  }

  if (!silent) {
    setSupplierEmailStatus("Invio in corso...", "");
  }

  try {
    const res = await fetch("/api/inventory/email-supplier", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toEmail: to,
        subject,
        message,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = data.error || data.message || `HTTP ${res.status}`;
      const hint =
        res.status === 503
          ? "Configura l’email in Console owner (/owner-console) o SMTP sul server."
          : data.hint || "";
      const msg = "Invio non riuscito: " + err + (hint ? " — " + hint : "");
      setSupplierEmailStatus(msg, "err");
      if (!silent) window.alert(msg);
      return { ok: false };
    }
    setSupplierEmailStatus(
      silent ? "Lista inviata al fornitore." : "Email inviata al fornitore correttamente.",
      "ok"
    );
    return { ok: true };
  } catch (e) {
    const msg = "Errore: " + (e && e.message ? e.message : String(e));
    setSupplierEmailStatus(msg, "err");
    if (!silent) window.alert(msg);
    return { ok: false };
  }
}

function startEditShoppingItem(idx, divEl) {
  if (!Array.isArray(shoppingItems) || idx < 0 || idx >= shoppingItems.length) return;
  const current = String(shoppingItems[idx] ?? "");
  divEl.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "shopping-item-edit";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "shopping-item-input";
  input.value = current;
  input.setAttribute("aria-label", "Modifica voce lista spesa");

  const btnRow = document.createElement("div");
  btnRow.className = "shopping-item-edit-actions";

  const btnSave = document.createElement("button");
  btnSave.type = "button";
  btnSave.className = "btn-xs success";
  btnSave.textContent = "Salva";

  const btnCancel = document.createElement("button");
  btnCancel.type = "button";
  btnCancel.className = "btn-xs ghost";
  btnCancel.textContent = "Annulla";

  const save = () => {
    const v = input.value.trim();
    if (!v) {
      window.alert(
        "Il testo non può essere vuoto. Usa «Elimina» (X) per rimuovere la voce."
      );
      return;
    }
    shoppingItems[idx] = v;
    saveShoppingToStorage();
    renderShoppingList();
  };

  btnSave.addEventListener("click", save);
  btnCancel.addEventListener("click", () => {
    renderShoppingList();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      renderShoppingList();
    }
  });

  btnRow.appendChild(btnSave);
  btnRow.appendChild(btnCancel);
  wrap.appendChild(input);
  wrap.appendChild(btnRow);
  divEl.appendChild(wrap);
  input.focus();
  input.select();
}

function renderShoppingList() {
  const container = document.getElementById("shopping-list");
  if (!container) return;

  container.innerHTML = "";

  const items = Array.isArray(shoppingItems) ? shoppingItems : [];
  if (!items.length) {
    container.innerHTML =
      '<div class="shopping-item">Lista vuota.</div>';
    return;
  }

  items.forEach((txt, idx) => {
    const div = document.createElement("div");
    div.className = "shopping-item";

    const row = document.createElement("div");
    row.className = "shopping-item-row";

    const span = document.createElement("span");
    span.className = "shopping-item-text";
    span.textContent = txt;

    const actions = document.createElement("div");
    actions.className = "shopping-item-actions";

    const btnEdit = document.createElement("button");
    btnEdit.type = "button";
    btnEdit.className = "btn-xs";
    btnEdit.textContent = "Modifica";
    btnEdit.setAttribute("aria-label", "Modifica voce");

    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.className = "btn-xs danger";
    btnDel.textContent = "X";
    btnDel.setAttribute("aria-label", "Rimuovi voce");

    btnEdit.addEventListener("click", () => {
      startEditShoppingItem(idx, div);
    });
    btnDel.addEventListener("click", () => {
      if (!Array.isArray(shoppingItems)) {
        shoppingItems = [];
      }
      shoppingItems.splice(idx, 1);
      saveShoppingToStorage();
      renderShoppingList();
    });

    actions.appendChild(btnEdit);
    actions.appendChild(btnDel);
    row.appendChild(span);
    row.appendChild(actions);
    div.appendChild(row);
    container.appendChild(div);
  });
}

function initShopping() {
  loadShoppingFromStorage();
  loadSupplierEmailPrefs();
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
    btnAdd.addEventListener("click", async () => {
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
      persistSupplierEmailPrefs();
      const auto = document.getElementById("supplier-email-after-add")?.checked === true;
      const hasEmail = document.getElementById("supplier-email-to")?.value?.trim();
      if (auto && hasEmail) {
        await sendSupplierShoppingEmail({ silent: true });
      }
    });
  }

  document.getElementById("supplier-email-to")?.addEventListener("input", persistSupplierEmailPrefs);
  document.getElementById("supplier-email-subject")?.addEventListener("input", persistSupplierEmailPrefs);
  document.getElementById("supplier-email-after-add")?.addEventListener("change", persistSupplierEmailPrefs);

  document.getElementById("btn-send-supplier-email")?.addEventListener("click", () => {
    sendSupplierShoppingEmail({ silent: false });
  });

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
//   AI CUCINA
// =======================================

function escapeAiHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function initKitchenAssistant() {
  const input = document.getElementById("kitchen-command-input");
  const sendBtn = document.getElementById("kitchen-command-send");
  const statusEl = document.getElementById("kitchen-command-status");
  const responseEl = document.getElementById("kitchen-ai-response");
  const sentEl = document.getElementById("kitchen-command-sent");

  if (!input || !sendBtn || !responseEl) return;

  async function sendKitchenCommand() {
    const question = input.value.trim();
    if (!question) {
      if (sentEl) sentEl.textContent = "";
      responseEl.innerHTML = '<span class="kitchen-ai-placeholder">Scrivi una domanda (ordini, scorte, preparazioni, suggerimenti).</span>';
      return;
    }

    if (statusEl) statusEl.textContent = "Invio...";
    if (sentEl) sentEl.textContent = "Domanda: «" + question + "»";
    responseEl.innerHTML = '<span class="kitchen-ai-placeholder">Caricamento...</span>';

    try {
      const res = await fetch("/api/ai/query", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errMsg = (data?.message || data?.error) || "Errore server. Riprova.";
        throw new Error(errMsg);
      }

      const answer = data?.answer || data?.message || "Nessuna risposta.";
      const warnings = Array.isArray(data?.data?.warnings) ? data.data.warnings.filter(Boolean) : [];
      const actions = Array.isArray(data?.nextActions) ? data.nextActions.filter(Boolean) : [];

      let html = "<div class=\"ai-answer-text\">" + escapeAiHtml(answer).replace(/\n/g, "<br>") + "</div>";
      if (warnings.length) html += "<div class=\"ai-warnings\" style=\"color:var(--accent-warning);margin-top:8px;\">⚠ " + escapeAiHtml(warnings.join(" • ")) + "</div>";
      if (actions.length) html += "<div class=\"ai-actions\" style=\"color:var(--accent-ready);margin-top:6px;\">→ " + escapeAiHtml(actions.join(" • ")) + "</div>";

      responseEl.innerHTML = html;
      if (statusEl) statusEl.textContent = "";
      input.value = "";
    } catch (err) {
      console.error(err);
      const errText = err.message || "Errore di connessione. Riprova.";
      responseEl.innerHTML = '<span style="color:var(--accent-danger);" role="alert">' + escapeAiHtml(errText) + "</span>";
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
  const btnLogin = document.getElementById("rw-btn-manager-login");
  const btnLogout = document.getElementById("rw-btn-manager-logout");

  if (!window.RW_StaffAccess) {
    // Fallback: se il modulo staff access non è caricato, usa il login standard
    if (btnLogin) {
      btnLogin.addEventListener("click", () => {
        const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = "/login/login.html?return=" + returnTo;
      });
    }
    return;
  }

  RW_StaffAccess.init({ module: "cucina", department: "cucina" });

  function refreshStaffUI() {
    const sess = RW_StaffAccess.getCurrentSession();
    const mgrVal = document.getElementById("rw-manager-value");
    if (mgrVal) mgrVal.textContent = sess ? sess.name : "—";
    if (btnLogin) btnLogin.style.display = sess ? "none" : "";
    if (btnLogout) btnLogout.style.display = sess ? "" : "none";
    const chip = document.getElementById("rw-cucina-manager-chip");
    if (chip) chip.classList.toggle("logged-in", !!sess);

    RW_StaffAccess.renderActiveStaff("rw-cucina-active-staff", "cucina");
  }

  if (btnLogin) {
    btnLogin.addEventListener("click", () => {
      try {
        RW_StaffAccess.showManagerLoginModal(refreshStaffUI, "kitchen_manager");
      } catch (e) {
        const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = "/login/login.html?return=" + returnTo;
      }
    });
  }

  if (btnLogout) btnLogout.addEventListener("click", async () => {
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

// =======================================
//   RICEZIONE MERCE VOCALE (Cucina)
// =======================================

let receiveRecognition = null;
let receiveRecognizing = false;
let lastReceivePreview = null;

function initReceiveVoice() {
  const btnStart = document.getElementById("btn-voice-receive-start");
  const btnStop = document.getElementById("btn-voice-receive-stop");
  const statusEl = document.getElementById("voice-receive-status");
  const transcriptEl = document.getElementById("voice-receive-transcript");
  const previewSection = document.getElementById("receive-preview-section");
  const previewGrid = document.getElementById("receive-preview-grid");
  const btnConfirm = document.getElementById("btn-receive-confirm");
  const btnCancel = document.getElementById("btn-receive-cancel");

  if (!btnStart || !transcriptEl) return;

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    if (statusEl) statusEl.textContent = "Voce non supportata";
    return;
  }

  receiveRecognition = new SpeechRec();
  receiveRecognition.lang = "it-IT";
  receiveRecognition.continuous = false;
  receiveRecognition.interimResults = false;

  receiveRecognition.onresult = (e) => {
    const t = (e.results[0]?.[0]?.transcript || "").trim();
    if (!t) return;
    transcriptEl.value = t;
    if (statusEl) statusEl.textContent = "Elaborazione...";

    fetch(INVENTORY_API + "/receive/voice-preview", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: t }),
    })
      .then((r) => r.json())
      .then((data) => {
        lastReceivePreview = data.preview;
        if (data.preview?.parsed) {
          previewGrid.innerHTML = `
            <div><strong>Prodotto:</strong> ${escapeHtml(data.preview.productName || "-")}</div>
            <div><strong>Quantità:</strong> ${data.preview.quantity} ${data.preview.unit}</div>
            <div><strong>Destinazione:</strong> ${data.preview.destinationWarehouse === "cucina" ? "Cucina" : data.preview.destinationWarehouse}</div>
          `;
          previewSection.style.display = "block";
          if (statusEl) statusEl.textContent = "Verifica e conferma";
        } else {
          if (statusEl) statusEl.textContent = "Frase non riconosciuta. Riprova (es. aggiungi 2 kg mozzarella in cucina)";
        }
      })
      .catch(() => {
        if (statusEl) statusEl.textContent = "Errore elaborazione";
      });
  };

  receiveRecognition.onend = () => {
    receiveRecognizing = false;
    if (statusEl && statusEl.textContent === "Ascolto...") statusEl.textContent = "Pronto";
  };

  receiveRecognition.onerror = () => {
    receiveRecognizing = false;
    if (statusEl) statusEl.textContent = "Errore riconoscimento";
  };

  btnStart.addEventListener("click", () => {
    if (receiveRecognizing) return;
    transcriptEl.value = "";
    previewSection.style.display = "none";
    lastReceivePreview = null;
    receiveRecognizing = true;
    if (statusEl) statusEl.textContent = "Ascolto...";
    receiveRecognition.start();
  });

  if (btnStop) {
    btnStop.addEventListener("click", () => {
      if (receiveRecognizing) receiveRecognition.stop();
    });
  }

  if (btnConfirm) {
    btnConfirm.addEventListener("click", async () => {
      const p = lastReceivePreview;
      if (!p || !p.productName || !p.quantity || p.quantity <= 0) {
        alert("Dati insufficienti. Riprova a dettare.");
        return;
      }
      const username = (await fetch("/api/auth/me", { credentials: "same-origin" }).then((r) => r.ok ? r.json() : {}).catch(() => ({}))).username;
      try {
        const res = await fetch(INVENTORY_API + "/receive", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productName: p.productName,
            quantity: p.quantity,
            unit: p.unit,
            destinationWarehouse: p.destinationWarehouse || "cucina",
            receivedBy: username || "cucina",
            createIfUnknown: true,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Errore");
        previewSection.style.display = "none";
        transcriptEl.value = "";
        lastReceivePreview = null;
        if (statusEl) statusEl.textContent = "Ricevuta registrata!";
        setTimeout(() => { if (statusEl) statusEl.textContent = "Pronto"; }, 2000);
      } catch (err) {
        alert(err.message || "Errore registrazione ricevuta");
      }
    });
  }

  if (btnCancel) {
    btnCancel.addEventListener("click", () => {
      previewSection.style.display = "none";
      lastReceivePreview = null;
      if (statusEl) statusEl.textContent = "Pronto";
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initViewSwitcher();
  initKds();
  initRecipes();
  initReceiveVoice();
  initShopping();
  initHaccp();
  initShifts();
  initKitchenAssistant();
  initVoiceNotes();
  initStaffAccess();
});