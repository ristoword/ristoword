// =============================
//  MENU-ADMIN – wired to /api/menu
// =============================

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

async function loadMenuItems() {
  const data = await fetchJSON("/api/menu");
  return Array.isArray(data) ? data : [];
}

async function createMenuItem(item) {
  return fetchJSON("/api/menu", {
    method: "POST",
    body: JSON.stringify(item),
  });
}

async function updateMenuItem(id, item) {
  return fetchJSON(`/api/menu/${id}`, {
    method: "PATCH",
    body: JSON.stringify(item),
  });
}

async function deleteMenuItem(id) {
  return fetchJSON(`/api/menu/${id}`, { method: "DELETE" });
}

// =============================
//  RENDER
// =============================

async function renderMenuList() {
  const listEl = document.getElementById("menu-list");
  const statsEl = document.getElementById("menu-stats");
  if (!listEl) return;

  const search = document.getElementById("filter-search")?.value.trim().toLowerCase() || "";
  const areaFilter = document.getElementById("filter-area")?.value || "";
  const activeFilter = document.getElementById("filter-active")?.value || "";

  let items;
  try {
    items = await loadMenuItems();
  } catch (err) {
    console.error("Errore caricamento menu:", err);
    listEl.innerHTML = "<div class='menu-row' style='color:#c00'>Errore caricamento menu.</div>";
    return;
  }

  items = items.filter((it) => {
    if (search && !(it.name || "").toLowerCase().includes(search)) return false;
    if (areaFilter && it.area !== areaFilter) return false;
    if (activeFilter) {
      const isActive = it.active !== false;
      if (activeFilter === "true" && !isActive) return false;
      if (activeFilter === "false" && isActive) return false;
    }
    return true;
  });

  listEl.innerHTML = "";

  if (!items.length) {
    listEl.innerHTML =
      "<div style='padding:6px 4px;color:#7f8599;font-size:12px;'>Nessun piatto trovato con i filtri attuali.</div>";
  } else {
    items.forEach((it) => {
      const row = document.createElement("div");
      row.className = "menu-row";

      const priceStr =
        typeof it.price === "number"
          ? "€ " + it.price.toFixed(2)
          : it.price != null
          ? "€ " + it.price
          : "-";

      const statusClass = it.active !== false ? "active" : "inactive";
      const statusLabel = it.active !== false ? "ATTIVO" : "NASCOSTO";

      row.innerHTML = `
        <div>
          <div class="menu-name">${(it.name || "").replace(/</g, "&lt;")}</div>
          <div class="menu-category">${(it.category || "").replace(/</g, "&lt;")}</div>
        </div>
        <div class="menu-area">${(it.area || "-").replace(/</g, "&lt;")}</div>
        <div class="menu-price">${priceStr}</div>
        <div class="menu-status ${statusClass}">${statusLabel}</div>
        <div class="menu-actions">
          <button class="toggle" data-id="${it.id}">${it.active !== false ? "Disattiva" : "Attiva"}</button>
          <button class="delete" data-id="${it.id}">Elimina</button>
        </div>
      `;
      listEl.appendChild(row);
    });

    listEl.querySelectorAll("button.toggle").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        try {
          const items = await loadMenuItems();
          const it = items.find((x) => String(x.id) === String(id));
          if (!it) return;
          await updateMenuItem(id, { active: !it.active });
          await renderMenuList();
        } catch (err) {
          console.error(err);
          alert("Errore: " + (err.message || "Aggiornamento fallito"));
        }
      });
    });

    listEl.querySelectorAll("button.delete").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const items = await loadMenuItems();
        const it = items.find((x) => String(x.id) === String(id));
        if (!it || !confirm(`Eliminare il piatto "${it.name}"?`)) return;
        try {
          await deleteMenuItem(id);
          await renderMenuList();
        } catch (err) {
          console.error(err);
          alert("Errore: " + (err.message || "Eliminazione fallita"));
        }
      });
    });
  }

  try {
    const all = await loadMenuItems();
    const activeCount = all.filter((x) => x.active !== false).length;
    if (statsEl) statsEl.textContent = `${all.length} piatti totali • ${activeCount} attivi`;
  } catch (_) {}
}

// =============================
//  FORM NUOVO PIATTO
// =============================

function clearForm() {
  document.getElementById("field-name").value = "";
  document.getElementById("field-category").value = "";
  document.getElementById("field-area").value = "cucina";
  document.getElementById("field-price").value = "";
  document.getElementById("field-code").value = "";
  document.getElementById("field-active").value = "true";
  document.getElementById("field-notes").value = "";
}

function setupForm() {
  const btnAdd = document.getElementById("btn-add-item");
  const btnClear = document.getElementById("btn-clear-form");

  if (btnAdd) {
    btnAdd.addEventListener("click", async () => {
      const name = document.getElementById("field-name").value.trim();
      const category = document.getElementById("field-category").value.trim();
      const area = document.getElementById("field-area").value;
      const priceStr = document.getElementById("field-price").value.trim();
      const code = document.getElementById("field-code").value.trim();
      const activeStr = document.getElementById("field-active").value;
      const notes = document.getElementById("field-notes").value.trim();

      if (!name) {
        alert("Inserisci il nome del piatto.");
        return;
      }

      let price = null;
      if (priceStr) {
        const p = Number(priceStr);
        if (Number.isFinite(p) && p >= 0) price = p;
      }

      try {
        await createMenuItem({
          name,
          category: category || "Generale",
          area,
          price,
          code: code || null,
          notes: notes || null,
          active: activeStr === "true",
        });
        clearForm();
        await renderMenuList();
      } catch (err) {
        console.error(err);
        alert("Errore: " + (err.message || "Salvataggio fallito"));
      }
    });
  }

  if (btnClear) {
    btnClear.addEventListener("click", clearForm);
  }
}

// =============================
//  FILTRI
// =============================

function setupFilters() {
  const searchInput = document.getElementById("filter-search");
  const areaSel = document.getElementById("filter-area");
  const activeSel = document.getElementById("filter-active");
  const btnReset = document.getElementById("btn-reset-filters");

  if (searchInput) searchInput.addEventListener("input", renderMenuList);
  if (areaSel) areaSel.addEventListener("change", renderMenuList);
  if (activeSel) activeSel.addEventListener("change", renderMenuList);
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      if (areaSel) areaSel.value = "";
      if (activeSel) activeSel.value = "true";
      renderMenuList();
    });
  }
}

// =============================
//  CLEAR TUTTO – non supportato (nessun endpoint bulk delete)
// =============================

function setupClearAll() {
  const btn = document.getElementById("btn-clear-all");
  if (!btn) return;
  btn.addEventListener("click", () => {
    alert("Per svuotare il menu, elimina i piatti uno per uno.");
  });
}

// =============================
//  INIT
// =============================

document.addEventListener("DOMContentLoaded", () => {
  setupForm();
  setupFilters();
  setupClearAll();
  renderMenuList();
});
