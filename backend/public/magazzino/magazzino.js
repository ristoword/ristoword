// backend/public/magazzino/magazzino.js

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    if (res.status === 401) {
      try { localStorage.removeItem("rw_auth"); } catch (_) {}
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = "/login/login.html" + (returnTo ? "?return=" + returnTo : "");
      return;
    }
    throw new Error(`HTTP ${res.status} su ${url}`);
  }
  return res.json();
}

async function loadInventory() {
  const listEl = document.getElementById("inventory-list");
  listEl.innerHTML = "<p class='muted'>Caricamento magazzino...</p>";

  try {
    const items = await fetchJSON("/api/inventory");
    renderInventory(items);
  } catch (err) {
    console.error("Errore caricamento inventory:", err);
    listEl.innerHTML =
      "<p class='error'>Errore nel caricamento del magazzino.</p>";
  }
}

function renderInventory(items) {
  const listEl = document.getElementById("inventory-list");
  const search = document
    .getElementById("search-input")
    .value.toLowerCase()
    .trim();

  const filtered = items.filter((item) =>
    item.name.toLowerCase().includes(search)
  );

  // KPI
  const kpiCount = document.getElementById("kpi-count");
  const kpiQty = document.getElementById("kpi-qty");
  const kpiValue = document.getElementById("kpi-value");

  const totalProducts = filtered.length;
  const totalQty = filtered.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
  const totalValue = filtered.reduce(
    (sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.cost) || 0),
    0
  );

  kpiCount.textContent = totalProducts;
  kpiQty.textContent = totalQty.toFixed(2);
  kpiValue.textContent = `€ ${totalValue.toFixed(2)}`;

  if (!filtered.length) {
    listEl.innerHTML =
      "<p class='muted'>Nessun prodotto in magazzino.</p>";
    return;
  }

  listEl.innerHTML = "";

  filtered.forEach((item) => {
    const div = document.createElement("div");
    div.className = "inventory-row";

    const lowStock =
      Number(item.threshold) > 0 &&
      Number(item.quantity) <= Number(item.threshold);

    const lineValue =
      (Number(item.quantity) || 0) * (Number(item.cost) || 0);

    div.innerHTML = `
      <div class="inv-main">
        <div class="inv-name">
          <strong>${item.name}</strong>
          <span class="inv-unit">(${item.unit})</span>
        </div>
        <div class="inv-qty ${lowStock ? "low" : ""}">
          Q.tà: <strong>${item.quantity}</strong>
          ${lowStock ? '<span class="badge danger">Sotto soglia</span>' : ""}
        </div>
        <div class="inv-cost">
          Costo: € ${Number(item.cost || 0).toFixed(2)}
        </div>
        <div class="inv-line">
          Valore riga: <strong>€ ${lineValue.toFixed(2)}</strong>
        </div>
      </div>
      <div class="inv-actions">
        <button class="btn small" data-delta="-1" data-id="${item.id}">-1</button>
        <button class="btn small" data-delta="+1" data-id="${item.id}">+1</button>
      </div>
    `;

    listEl.appendChild(div);
  });

  // listener per i pulsanti +/-1
  listEl.querySelectorAll("button[data-delta]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const deltaStr = btn.getAttribute("data-delta");
      const delta = deltaStr === "+1" ? 1 : -1;

      try {
        await fetchJSON(`/api/inventory/${id}/adjust`, {
          method: "PATCH",
          body: JSON.stringify({ delta }),
        });
        await loadInventory();
      } catch (err) {
        console.error("Errore adjust inventory:", err);
        alert("Errore aggiornamento quantità");
      }
    });
  });
}

async function addProduct() {
  const name = document.getElementById("field-name").value.trim();
  const unit = document.getElementById("field-unit").value.trim();
  const quantity = document.getElementById("field-quantity").value;
  const cost = document.getElementById("field-cost").value;
  const threshold = document.getElementById("field-threshold").value;

  if (!name || !unit) {
    alert("Nome e unità sono obbligatori.");
    return;
  }

  try {
    await fetchJSON("/api/inventory", {
      method: "POST",
      body: JSON.stringify({
        name,
        unit,
        quantity,
        cost,
        threshold,
      }),
    });

    // pulisci form
    document.getElementById("field-name").value = "";
    document.getElementById("field-unit").value = "";
    document.getElementById("field-quantity").value = "";
    document.getElementById("field-cost").value = "";
    document.getElementById("field-threshold").value = "";

    await loadInventory();
  } catch (err) {
    console.error("Errore aggiunta prodotto:", err);
    alert("Errore salvataggio prodotto");
  }
}

function initMagazzino() {
  document
    .getElementById("btn-add-product")
    .addEventListener("click", (e) => {
      e.preventDefault();
      addProduct();
    });

  document
    .getElementById("btn-refresh")
    .addEventListener("click", (e) => {
      e.preventDefault();
      loadInventory();
    });

  document
    .getElementById("search-input")
    .addEventListener("input", () => loadInventory());

  loadInventory();
}

document.addEventListener("DOMContentLoaded", initMagazzino);