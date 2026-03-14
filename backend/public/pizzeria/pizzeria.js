// =============================
//   UTILITA' BASE
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

// Un ordine è "della pizzeria" se:
// - area principale è pizzeria
// - oppure contiene almeno un item con area "pizzeria"
function isPizzeriaOrder(order) {
  if (order.area === "pizzeria") return true;
  if (Array.isArray(order.items)) {
    return order.items.some((it) => it.area === "pizzeria");
  }
  return false;
}

// Ritorna solo le righe pizza, se ci sono
function extractPizzaItems(order) {
  if (!Array.isArray(order.items)) return [];
  return order.items.filter(
    (it) => !it.area || it.area === "pizzeria" // di default pizza o marcate pizzeria
  );
}

// =============================
//   API ORDINI
// =============================

async function apiGetOrders() {
  const res = await fetch("/api/orders?active=true", { credentials: "same-origin" });
  if (!res.ok) throw new Error("Errore caricamento ordini");
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
//   RENDER KDS
// =============================

function renderKpi(orders) {
  const prep = orders.filter(
    (o) => isPizzeriaOrder(o) && o.status === "in_preparazione"
  );
  const ready = orders.filter(
    (o) => isPizzeriaOrder(o) && o.status === "pronto"
  );
  const late = orders.filter((o) => {
    if (!isPizzeriaOrder(o)) return false;
    const m = minutesFrom(o.createdAt);
    return (
      (o.status === "in_preparazione" || o.status === "in_attesa") &&
      m != null &&
      m >= 20
    );
  });

  document.getElementById("kpi-prep").textContent = prep.length || "0";
  document.getElementById("kpi-ready").textContent = ready.length || "0";
  document.getElementById("kpi-late").textContent = late.length || "0";
}

function renderKdsColumns(orders) {
  const colPending = document.getElementById("col-pending");
  const colPrep = document.getElementById("col-prep");
  const colReady = document.getElementById("col-ready");

  colPending.innerHTML = "";
  colPrep.innerHTML = "";
  colReady.innerHTML = "";

  const relevant = orders.filter(
    (o) =>
      isPizzeriaOrder(o) &&
      o.status !== "chiuso" &&
      o.status !== "annullato"
  );

  if (!relevant.length) {
    colPending.innerHTML = "<em>Nessuna comanda pizza al momento.</em>";
    return;
  }

  relevant.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });

  relevant.forEach((order) => {
    const ageMin = minutesFrom(order.createdAt);
    const timeLabel = formatTime(order.createdAt);

    const div = document.createElement("div");
    div.className = "order-card";

    if (ageMin != null && ageMin >= 20) {
      div.classList.add("late");
    }

    const pizzaItems = extractPizzaItems(order);
    const itemsHtml = pizzaItems.length
      ? pizzaItems
          .map((it) => `${it.name || "Pizza"} x${it.qty || 1}`)
          .join("<br>")
      : "(Dettagli pizza non disponibili)";

    const statusClass = "status-" + (order.status || "in_attesa");
    const statusLabel =
      order.status === "in_preparazione"
        ? "IN PREPARAZIONE"
        : order.status === "pronto"
        ? "PRONTA"
        : order.status === "servito"
        ? "SERVITA"
        : order.status === "in_attesa"
        ? "IN ATTESA"
        : (order.status || "").toUpperCase();

    div.innerHTML = `
      <div class="order-title">Tavolo ${order.table ?? "-"}</div>
      <div class="order-meta">
        ${itemsHtml}
      </div>
      <div class="order-time">
        ${timeLabel ? timeLabel : ""} ${
      ageMin != null ? `• ${ageMin} min` : ""
    }
      </div>
      <span class="order-status-badge ${statusClass}">
        ${statusLabel}
      </span>
      <div class="order-actions">
        <button class="btn-xs warning" data-action="set-status" data-status="in_preparazione" data-id="${
          order.id
        }">
          PREP.
        </button>
        <button class="btn-xs success" data-action="set-status" data-status="pronto" data-id="${
          order.id
        }">
          PRONTA
        </button>
        <button class="btn-xs info" data-action="set-status" data-status="servito" data-id="${
          order.id
        }">
          SERVITA
        </button>
      </div>
    `;

    div.querySelectorAll("[data-action='set-status']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const status = btn.getAttribute("data-status");
        try {
          await apiSetStatus(id, status);
          await loadAndRenderKds();
        } catch (err) {
          console.error(err);
          alert("Errore cambio stato pizza.");
        }
      });
    });

    if (order.status === "in_attesa") {
      colPending.appendChild(div);
    } else if (order.status === "in_preparazione") {
      colPrep.appendChild(div);
    } else if (order.status === "pronto" || order.status === "servito") {
      colReady.appendChild(div);
    } else {
      colPending.appendChild(div);
    }
  });

  if (!colPending.children.length) {
    colPending.innerHTML = "<em>Nessuna comanda in attesa.</em>";
  }
  if (!colPrep.children.length) {
    colPrep.innerHTML = "<em>Nessuna comanda in preparazione.</em>";
  }
  if (!colReady.children.length) {
    colReady.innerHTML = "<em>Nessuna pizza pronta.</em>";
  }
}

async function loadAndRenderKds() {
  try {
    const orders = await apiGetOrders();
    renderKpi(orders);
    renderKdsColumns(orders);
  } catch (err) {
    console.error(err);
    alert("Errore caricamento comande pizzeria.");
  }
}

// =============================
//   RICETTE (LOCAL STORAGE)
// =============================

function loadRecipes() {
  try {
    const raw = localStorage.getItem("pizzeria_recipes");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecipes(recipes) {
  localStorage.setItem("pizzeria_recipes", JSON.stringify(recipes));
}

function renderRecipes() {
  const listEl = document.getElementById("recipes-list");
  if (!listEl) return;

  const recipes = loadRecipes();
  listEl.innerHTML = "";

  if (!recipes.length) {
    listEl.innerHTML = "<em>Nessuna ricetta salvata.</em>";
    return;
  }

  recipes.forEach((r, idx) => {
    const div = document.createElement("div");
    div.className = "list-item";

    div.innerHTML = `
      <div class="list-item-header">
        <div class="list-item-title">${r.name || "Pizza senza nome"}</div>
        <button data-idx="${idx}" class="btn-xs danger">X</button>
      </div>
      <div class="list-item-meta">
        ${r.category ? "Categoria: " + r.category + " • " : ""}
        ${r.size ? "Dimensione: " + r.size : ""}
      </div>
      ${
        r.notes
          ? `<div class="list-item-notes">${r.notes
              .replace(/\n/g, "<br>")
              .trim()}</div>`
          : ""
      }
    `;

    const btnDelete = div.querySelector("button");
    btnDelete.addEventListener("click", () => {
      const current = loadRecipes();
      current.splice(idx, 1);
      saveRecipes(current);
      renderRecipes();
    });

    listEl.appendChild(div);
  });
}

function setupRecipeForm() {
  const btn = document.getElementById("btn-save-recipe");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const name = document.getElementById("recipe-name").value.trim();
    const category = document
      .getElementById("recipe-category")
      .value.trim();
    const size = document.getElementById("recipe-size").value.trim();
    const notes = document.getElementById("recipe-notes").value.trim();
    const photo = document.getElementById("recipe-photo").value.trim();

    if (!name) {
      alert("Inserisci il nome della pizza.");
      return;
    }

    const recipes = loadRecipes();
    recipes.push({
      name,
      category,
      size,
      notes,
      photo,
      createdAt: new Date().toISOString(),
    });
    saveRecipes(recipes);
    renderRecipes();

    document.getElementById("recipe-name").value = "";
    document.getElementById("recipe-category").value = "";
    document.getElementById("recipe-size").value = "";
    document.getElementById("recipe-notes").value = "";
    document.getElementById("recipe-photo").value = "";
  });
}

// =============================
//   NOTE VOCALI (LOCAL STORAGE)
// =============================

function loadVoiceNotes() {
  try {
    return localStorage.getItem("pizzeria_voice_notes") || "";
  } catch {
    return "";
  }
}

function saveVoiceNotes(text) {
  localStorage.setItem("pizzeria_voice_notes", text || "");
}

function setupVoiceNotes() {
  const txt = document.getElementById("voice-notes");
  const btnSave = document.getElementById("btn-save-voice-notes");
  const btnClear = document.getElementById("btn-clear-voice-notes");

  if (!txt || !btnSave || !btnClear) return;

  txt.value = loadVoiceNotes();

  btnSave.addEventListener("click", () => {
    saveVoiceNotes(txt.value);
    alert("Appunti salvati in questo dispositivo.");
  });

  btnClear.addEventListener("click", () => {
    if (!confirm("Svuotare gli appunti della pizzeria?")) return;
    txt.value = "";
    saveVoiceNotes("");
  });
}

// =============================
//   NAV VIEW
// =============================

function setupViewNav() {
  const buttons = document.querySelectorAll(".nav-btn[data-view]");
  const views = document.querySelectorAll(".view");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-view");

      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      views.forEach((v) => {
        if (v.id === "view-" + target) {
          v.classList.add("active-view");
        } else {
          v.classList.remove("active-view");
        }
      });
    });
  });
}

// =============================
//   INIT
// =============================

document.addEventListener("DOMContentLoaded", () => {
  // KDS
  document
    .getElementById("btn-refresh")
    .addEventListener("click", loadAndRenderKds);

  window.addEventListener("rw:orders-update", (ev) => {
    if (ev.detail?.orders) {
      renderKpi(ev.detail.orders);
      renderKdsColumns(ev.detail.orders);
    }
  });

  loadAndRenderKds();
  setInterval(loadAndRenderKds, 10000); // fallback polling

  // Ricette
  setupRecipeForm();
  renderRecipes();

  // Note vocali
  setupVoiceNotes();

  // Nav viste
  setupViewNav();
});