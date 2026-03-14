// daily-menu.js – Gestione Menu del Giorno (Cucina)

(function () {
  "use strict";

  const API = "/api/daily-menu";

  const CATEGORY_LABELS = {
    antipasto: "Antipasto",
    primo: "Primo",
    secondo: "Secondo",
    contorno: "Contorno",
    dolce: "Dolce",
    bevanda: "Bevanda",
    extra: "Extra",
  };

  const CATEGORY_ORDER = ["antipasto", "primo", "secondo", "contorno", "dolce", "bevanda", "extra"];

  async function apiGet(path) {
    const res = await fetch(API + path, { credentials: "same-origin" });
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  }

  async function apiPost(path, body) {
    const res = await fetch(API + path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.json();
  }

  async function apiPut(path, body) {
    const res = await fetch(API + path, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.json();
  }

  async function apiPatch(path, body) {
    const res = await fetch(API + path, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.json();
  }

  async function apiDel(path) {
    const res = await fetch(API + path, { method: "DELETE", credentials: "same-origin" });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  }

  function formatPrice(n) {
    return "€ " + (Number(n) || 0).toFixed(2);
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  async function loadData() {
    const data = await apiGet("");
    return data;
  }

  function renderDishes(dishes) {
    const container = document.getElementById("dishes-by-category");
    const loading = document.getElementById("dishes-loading");
    loading.style.display = "none";

    const byCat = {};
    (dishes || []).forEach((d) => {
      const c = d.category || "extra";
      if (!byCat[c]) byCat[c] = [];
      byCat[c].push(d);
    });

    let html = "";
    CATEGORY_ORDER.forEach((cat) => {
      const list = byCat[cat] || [];
      if (list.length === 0) return;
      const label = CATEGORY_LABELS[cat] || cat;
      html += `<div class="daily-category-block"><div class="daily-category-title">${escapeHtml(label)}</div><div class="daily-dish-list">`;
      list.forEach((dish) => {
        const inactive = dish.active === false ? " inactive" : "";
        html += `
          <div class="daily-dish-card${inactive}" data-id="${dish.id}" data-category="${escapeHtml(dish.category || "extra")}">
            <div class="daily-dish-info">
              <div class="daily-dish-name">${escapeHtml(dish.name)}</div>
              ${dish.description ? `<div class="daily-dish-desc">${escapeHtml(dish.description)}</div>` : ""}
              ${dish.allergens ? `<div class="daily-dish-allergens">⚠ ${escapeHtml(dish.allergens)}</div>` : ""}
            </div>
            <span class="daily-dish-price">${formatPrice(dish.price)}</span>
            <div class="daily-dish-actions">
              <button class="btn ghost btn-toggle" data-id="${dish.id}" title="Attiva/Disattiva">${dish.active !== false ? "✓" : "○"}</button>
              <button class="btn ghost btn-edit" data-id="${dish.id}">Modifica</button>
              <button class="btn ghost btn-delete" data-id="${dish.id}">Elimina</button>
            </div>
          </div>`;
      });
      html += "</div></div>";
    });

    if (!html) html = '<p class="loading-msg">Nessun piatto. Aggiungi il primo piatto del giorno.</p>';
    container.innerHTML = html;

    container.querySelectorAll(".btn-toggle").forEach((btn) => {
      btn.addEventListener("click", () => toggleDish(btn.dataset.id));
    });
    container.querySelectorAll(".btn-edit").forEach((btn) => {
      btn.addEventListener("click", () => openEditModal(btn.dataset.id));
    });
    container.querySelectorAll(".btn-delete").forEach((btn) => {
      btn.addEventListener("click", () => deleteDish(btn.dataset.id));
    });
  }

  function updateStatusUI(menuActive) {
    const chip = document.getElementById("menu-status-value");
    const btn = document.getElementById("btn-toggle-menu");
    if (menuActive) {
      chip.textContent = "Attivo";
      chip.parentElement.classList.add("active");
      btn.textContent = "Disattiva menu";
    } else {
      chip.textContent = "Spento";
      chip.parentElement.classList.remove("active");
      btn.textContent = "Attiva menu";
    }
  }

  async function refresh() {
    const loading = document.getElementById("dishes-loading");
    loading.style.display = "block";
    try {
      const data = await loadData();
      updateStatusUI(data.menuActive);
      renderDishes(data.dishes || []);
    } catch (err) {
      loading.textContent = "Errore: " + (err.message || "Caricamento fallito");
      console.error(err);
    }
  }

  async function addDish() {
    const name = document.getElementById("field-name").value.trim();
    if (!name) {
      alert("Inserisci il nome del piatto.");
      return;
    }
    const body = {
      name,
      description: document.getElementById("field-description").value.trim(),
      category: document.getElementById("field-category").value,
      price: Number(document.getElementById("field-price").value) || 0,
      allergens: document.getElementById("field-allergens").value.trim(),
    };
    try {
      await apiPost("", body);
      document.getElementById("field-name").value = "";
      document.getElementById("field-description").value = "";
      document.getElementById("field-price").value = "";
      document.getElementById("field-allergens").value = "";
      refresh();
    } catch (err) {
      alert("Errore: " + (err.message || "Operazione fallita"));
    }
  }

  async function toggleDish(id) {
    try {
      await apiPatch("/" + id + "/toggle");
      refresh();
    } catch (err) {
      alert("Errore: " + (err.message || "Operazione fallita"));
    }
  }

  async function deleteDish(id) {
    if (!confirm("Eliminare questo piatto dal menu del giorno?")) return;
    try {
      await apiDel("/" + id);
      refresh();
    } catch (err) {
      alert("Errore: " + (err.message || "Operazione fallita"));
    }
  }

  function openEditModal(id) {
    const card = document.querySelector(`.daily-dish-card[data-id="${id}"]`);
    if (!card) return;
    const nameEl = card.querySelector(".daily-dish-name");
    const descEl = card.querySelector(".daily-dish-desc");
    const allergensEl = card.querySelector(".daily-dish-allergens");
    const priceEl = card.querySelector(".daily-dish-price");
    const category = card.dataset.category || "extra";

    document.getElementById("edit-id").value = id;
    document.getElementById("edit-name").value = nameEl ? nameEl.textContent : "";
    document.getElementById("edit-description").value = descEl ? descEl.textContent : "";
    document.getElementById("edit-price").value = priceEl ? priceEl.textContent.replace("€", "").trim() : "";
    document.getElementById("edit-allergens").value = allergensEl ? allergensEl.textContent.replace("⚠", "").trim() : "";

    const sel = document.getElementById("edit-category");
    sel.innerHTML = CATEGORY_ORDER.map((c) => `<option value="${c}" ${c === category ? "selected" : ""}>${CATEGORY_LABELS[c]}</option>`).join("");

    document.getElementById("edit-modal").style.display = "flex";
  }

  async function saveEdit() {
    const id = document.getElementById("edit-id").value;
    const body = {
      name: document.getElementById("edit-name").value.trim(),
      description: document.getElementById("edit-description").value.trim(),
      category: document.getElementById("edit-category").value,
      price: Number(document.getElementById("edit-price").value) || 0,
      allergens: document.getElementById("edit-allergens").value.trim(),
    };
    try {
      await apiPut("/" + id, body);
      document.getElementById("edit-modal").style.display = "none";
      refresh();
    } catch (err) {
      alert("Errore: " + (err.message || "Salvataggio fallito"));
    }
  }

  async function toggleMenuActive() {
    try {
      const data = await loadData();
      const next = !data.menuActive;
      await apiPatch("/active", { active: next });
      updateStatusUI(next);
    } catch (err) {
      alert("Errore: " + (err.message || "Operazione fallita"));
    }
  }

  document.getElementById("btn-add-dish").addEventListener("click", addDish);
  document.getElementById("btn-toggle-menu").addEventListener("click", toggleMenuActive);
  document.getElementById("btn-save-edit").addEventListener("click", saveEdit);
  document.getElementById("btn-close-modal").addEventListener("click", () => {
    document.getElementById("edit-modal").style.display = "none";
  });
  document.getElementById("btn-cancel-edit").addEventListener("click", () => {
    document.getElementById("edit-modal").style.display = "none";
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh);
  } else {
    refresh();
  }
})();
