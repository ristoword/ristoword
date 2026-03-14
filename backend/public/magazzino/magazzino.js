// backend/public/magazzino/magazzino.js
// Magazzino a doppio livello: Centrale + Scorte reparti

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    if (res.status === 401) {
      try {
        localStorage.removeItem("rw_auth");
      } catch (_) {}
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = "/login/login.html" + (returnTo ? "?return=" + returnTo : "");
      return;
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

let inventoryCache = [];
let transfersCache = [];
let currentTab = "centrale";

const UNITS = ["kg", "lt", "unità", "pezzi"];

function getSearchFilter() {
  return document.getElementById("search-input").value.toLowerCase().trim();
}

function filterBySearch(items, qtyField) {
  const search = getSearchFilter();
  if (!search) return items;
  return items.filter((item) =>
    String(item.name || "").toLowerCase().includes(search)
  );
}

function showTab(tabName) {
  currentTab = tabName;
  document.querySelectorAll(".mag-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  document.querySelectorAll(".card-tab").forEach((el) => {
    el.classList.toggle("active", el.id === "tab-" + tabName);
  });
  document.getElementById("section-new-product").style.display =
    tabName === "centrale" ? "block" : "none";
  renderCurrentTab();
}

function renderCurrentTab() {
  if (currentTab === "centrale") renderCentralList();
  else if (currentTab === "cucina") renderDepartmentList("cucina");
  else if (currentTab === "sala") renderDepartmentList("sala");
  else if (currentTab === "movimenti") renderTransfersList();
}

function updateKPI(items) {
  const all = items || inventoryCache;
  const central = all.filter((i) => (Number(i.central ?? i.quantity) || 0) > 0);
  const totalQty = central.reduce((s, i) => s + (Number(i.central ?? i.quantity) || 0), 0);
  const totalValue = central.reduce(
    (s, i) => s + (Number(i.central ?? i.quantity) || 0) * (Number(i.cost) || 0),
    0
  );
  document.getElementById("kpi-count").textContent = all.length;
  document.getElementById("kpi-central").textContent = totalQty.toFixed(1);
  document.getElementById("kpi-value").textContent = `€ ${totalValue.toFixed(2)}`;
}

function renderCentralList() {
  const listEl = document.getElementById("inventory-central-list");
  const items = filterBySearch(
    inventoryCache.filter((i) => (Number(i.central ?? i.quantity) || 0) > 0)
  );
  updateKPI(inventoryCache);
  if (!items.length) {
    listEl.innerHTML = "<p class='muted'>Nessun prodotto in Magazzino Centrale.</p>";
    return;
  }
  listEl.innerHTML = items
    .map((item) => {
      const qty = Number(item.central ?? item.quantity) || 0;
      const lowStock =
        Number(item.threshold) > 0 && qty <= Number(item.threshold);
      const lineValue = qty * (Number(item.cost) || 0);
      return `
        <div class="inventory-row" data-id="${item.id}">
          <div class="inv-main">
            <div class="inv-name">
              <strong>${escapeHtml(item.name)}</strong>
              <span class="inv-unit">(${escapeHtml(item.unit || "un")})</span>
            </div>
            <div class="inv-qty ${lowStock ? "low" : ""}">
              Q.tà: <strong>${qty}</strong>
              ${lowStock ? '<span class="badge danger">Sotto soglia</span>' : ""}
            </div>
            <div class="inv-meta">
              ${item.category ? `<span class="inv-cat">${escapeHtml(item.category)}</span>` : ""}
              ${item.lot ? `<span class="inv-lot">Lotto: ${escapeHtml(item.lot)}</span>` : ""}
            </div>
            <div class="inv-cost">Costo: € ${Number(item.cost || 0).toFixed(2)} · Valore riga: € ${lineValue.toFixed(2)}</div>
          </div>
          <div class="inv-actions">
            <button class="btn small btn-transfer" data-id="${item.id}" data-name="${escapeHtml(item.name)}" data-unit="${escapeHtml(item.unit || "un")}" data-max="${qty}">Trasferisci</button>
            <button class="btn small" data-delta="-1" data-id="${item.id}">−1</button>
            <button class="btn small" data-delta="1" data-id="${item.id}">+1</button>
            <button class="btn small btn-delete" data-id="${item.id}">Elimina</button>
          </div>
        </div>`;
    })
    .join("");
  attachCentralListeners(listEl);
}

function renderDepartmentList(dept) {
  const listEl = document.getElementById("inventory-" + dept + "-list");
  const items = filterBySearch(
    inventoryCache
      .map((i) => ({
        ...i,
        qtyDept: Number(i.stocks && i.stocks[dept]) || 0,
      }))
      .filter((i) => i.qtyDept > 0)
  );
  if (!items.length) {
    listEl.innerHTML = `<p class='muted'>Nessun prodotto nella Scorta ${dept === "cucina" ? "Cucina" : "Sala"}.</p>`;
    return;
  }
  const deptLabel = dept === "cucina" ? "Cucina" : "Sala";
  listEl.innerHTML = items
    .map((item) => {
      const qty = item.qtyDept;
      const lowStock =
        Number(item.threshold) > 0 && qty <= Number(item.threshold);
      return `
        <div class="inventory-row dept-row">
          <div class="inv-main">
            <div class="inv-name">
              <strong>${escapeHtml(item.name)}</strong>
              <span class="inv-unit">(${escapeHtml(item.unit || "un")})</span>
            </div>
            <div class="inv-qty ${lowStock ? "low" : ""}">
              Q.tà: <strong>${qty}</strong>
              ${lowStock ? '<span class="badge danger">Sotto soglia</span>' : ""}
            </div>
            <div class="inv-cost">Costo: € ${Number(item.cost || 0).toFixed(2)}</div>
          </div>
          <div class="inv-actions">
            <button class="btn small btn-return" data-id="${item.id}" data-name="${escapeHtml(item.name)}" data-unit="${escapeHtml(item.unit || "un")}" data-max="${qty}" data-dept="${dept}">Rientra</button>
          </div>
        </div>`;
    })
    .join("");
  attachDepartmentListeners(listEl, dept);
}

function renderTransfersList() {
  const listEl = document.getElementById("transfers-list");
  if (!transfersCache.length) {
    listEl.innerHTML = "<p class='muted'>Nessun movimento interno registrato.</p>";
    return;
  }
  const deptLabel = (d) => (d === "cucina" ? "Cucina" : d === "sala" ? "Sala" : d || "?");
  listEl.innerHTML = transfersCache
    .map((t) => {
      const dt = t.createdAt || t.date || "";
      const timeStr = dt
        ? new Date(dt).toLocaleString("it-IT", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—";
      const op = t.operator ? ` · ${escapeHtml(t.operator)}` : "";
      const note = t.note ? ` · ${escapeHtml(t.note)}` : "";
      const isReturn = t.type === "return_to_central";
      const badge = isReturn
        ? '<span class="badge return">RIENTRO</span>'
        : '<span class="badge transfer">TRASFERIMENTO</span>';
      const routeText = isReturn
        ? `da ${deptLabel(t.from)} → Centrale`
        : `da Centrale → ${deptLabel(t.to)}`;
      return `
        <div class="transfer-row ${isReturn ? "transfer-row-return" : ""}">
          <div class="transfer-main">
            ${badge}
            <strong>${escapeHtml(t.productName || "?")}</strong>
            <span class="transfer-qty">${t.quantity} ${escapeHtml(t.unit || "un")}</span>
            <span class="transfer-route">${routeText}</span>
          </div>
          <div class="transfer-meta">${timeStr}${op}${note}</div>
        </div>`;
    })
    .join("");
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function attachDepartmentListeners(container, dept) {
  if (!container) return;
  container.querySelectorAll(".btn-return").forEach((btn) => {
    btn.addEventListener("click", () => openReturnModal(btn.dataset));
  });
}

function attachCentralListeners(container) {
  if (!container) return;
  container.querySelectorAll("button[data-delta]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const delta = btn.getAttribute("data-delta") === "1" ? 1 : -1;
      try {
        await fetchJSON(`/api/inventory/${id}/adjust`, {
          method: "PATCH",
          body: JSON.stringify({ delta }),
        });
        await loadAll();
      } catch (err) {
        alert(err.message || "Errore aggiornamento quantità");
      }
    });
  });
  container.querySelectorAll(".btn-transfer").forEach((btn) => {
    btn.addEventListener("click", () => openTransferModal(btn.dataset));
  });
  container.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Eliminare questo prodotto dal magazzino?")) return;
      const id = btn.getAttribute("data-id");
      try {
        await fetchJSON(`/api/inventory/${id}`, { method: "DELETE" });
        await loadAll();
      } catch (err) {
        alert(err.message || "Errore eliminazione");
      }
    });
  });
}

let transferProductId = null;

function openTransferModal(dataset) {
  transferProductId = dataset.id;
  document.getElementById("transfer-product-name").textContent = dataset.name || "—";
  document.getElementById("transfer-unit").textContent = dataset.unit || "un";
  document.getElementById("transfer-qty").value = "";
  document.getElementById("transfer-qty").max = Number(dataset.max) || 9999;
  document.getElementById("transfer-operator").value = "";
  document.getElementById("transfer-note").value = "";
  document.getElementById("modal-transfer").classList.add("open");
}

function closeTransferModal() {
  document.getElementById("modal-transfer").classList.remove("open");
  transferProductId = null;
}

async function confirmTransfer() {
  if (!transferProductId) return;
  const qty = parseFloat(document.getElementById("transfer-qty").value);
  const dept = document.getElementById("transfer-dept").value;
  const operator = document.getElementById("transfer-operator").value.trim();
  const note = document.getElementById("transfer-note").value.trim();
  if (!qty || qty <= 0) {
    alert("Inserisci una quantità valida.");
    return;
  }
  try {
    await fetchJSON("/api/inventory/transfer", {
      method: "POST",
      body: JSON.stringify({
        productId: transferProductId,
        toDepartment: dept,
        quantity: qty,
        note,
        operator,
      }),
    });
    closeTransferModal();
    await loadAll();
  } catch (err) {
    alert(err.message || "Errore trasferimento");
  }
}

let returnProductId = null;
let returnFromDept = null;

function openReturnModal(dataset) {
  returnProductId = dataset.id;
  returnFromDept = dataset.dept || "";
  const deptLabel = returnFromDept === "cucina" ? "Cucina" : "Sala";
  document.getElementById("return-product-name").textContent = dataset.name || "—";
  document.getElementById("return-dept-label").textContent = `Reparto: ${deptLabel}`;
  document.getElementById("return-unit").textContent = dataset.unit || "un";
  document.getElementById("return-qty").value = "";
  document.getElementById("return-qty").max = Number(dataset.max) || 9999;
  document.getElementById("return-operator").value = "";
  document.getElementById("return-note").value = "";
  document.getElementById("modal-return").classList.add("open");
}

function closeReturnModal() {
  document.getElementById("modal-return").classList.remove("open");
  returnProductId = null;
  returnFromDept = null;
}

async function confirmReturn() {
  if (!returnProductId || !returnFromDept) return;
  const qty = parseFloat(document.getElementById("return-qty").value);
  const operator = document.getElementById("return-operator").value.trim();
  const note = document.getElementById("return-note").value.trim();
  if (!qty || qty <= 0) {
    alert("Inserisci una quantità valida.");
    return;
  }
  try {
    await fetchJSON("/api/inventory/return", {
      method: "POST",
      body: JSON.stringify({
        productId: returnProductId,
        fromDepartment: returnFromDept,
        quantity: qty,
        note,
        operator,
      }),
    });
    closeReturnModal();
    await loadAll();
  } catch (err) {
    alert(err.message || "Errore rientro");
  }
}

async function loadInventory() {
  inventoryCache = await fetchJSON("/api/inventory");
}

async function loadTransfers() {
  transfersCache = await fetchJSON("/api/inventory/transfers?limit=100");
}

async function loadAll() {
  const listEl = document.getElementById("inventory-central-list");
  listEl.innerHTML = "<p class='muted'>Caricamento...</p>";
  try {
    await Promise.all([loadInventory(), loadTransfers()]);
    renderCurrentTab();
  } catch (err) {
    console.error("Errore caricamento magazzino:", err);
    listEl.innerHTML = "<p class='error'>Errore nel caricamento del magazzino.</p>";
  }
}

async function addProduct() {
  const name = document.getElementById("field-name").value.trim();
  const unit = document.getElementById("field-unit").value || "kg";
  const quantity = document.getElementById("field-quantity").value;
  const cost = document.getElementById("field-cost").value;
  const threshold = document.getElementById("field-threshold").value;
  const category = document.getElementById("field-category").value.trim();
  const lot = document.getElementById("field-lot").value.trim();
  const notes = document.getElementById("field-notes").value.trim();

  if (!name) {
    alert("Nome prodotto obbligatorio.");
    return;
  }

  try {
    await fetchJSON("/api/inventory", {
      method: "POST",
      body: JSON.stringify({
        name,
        unit,
        quantity: quantity ? parseFloat(quantity) : 0,
        cost: cost ? parseFloat(cost) : 0,
        threshold: threshold ? parseFloat(threshold) : 0,
        category,
        lot,
        notes,
      }),
    });
    document.getElementById("field-name").value = "";
    document.getElementById("field-unit").value = "kg";
    document.getElementById("field-quantity").value = "";
    document.getElementById("field-cost").value = "";
    document.getElementById("field-threshold").value = "";
    document.getElementById("field-category").value = "";
    document.getElementById("field-lot").value = "";
    document.getElementById("field-notes").value = "";
    await loadAll();
  } catch (err) {
    alert(err.message || "Errore salvataggio prodotto");
  }
}

async function loadAISuggestion() {
  const el = document.getElementById("ai-message");
  el.textContent = "Caricamento suggerimenti...";
  try {
    const res = await fetchJSON("/api/ai/inventory", {
      method: "POST",
      body: JSON.stringify({}),
    });
    el.textContent = res.message || "Nessun suggerimento.";
  } catch (err) {
    el.textContent = "Assistente non disponibile. Riprova più tardi.";
  }
}

function initVoice() {
  const SpeechRec =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = document.getElementById("btn-voice-product");
  if (!btn || !SpeechRec) {
    if (btn) btn.style.display = "none";
    return;
  }
  let recognizing = false;
  const rec = new SpeechRec();
  rec.continuous = false;
  rec.interimResults = false;
  rec.lang = "it-IT";
  rec.onresult = (e) => {
    const t = (e.results[0] && e.results[0][0] && e.results[0][0].transcript) || "";
    if (!t.trim()) return;
    const nameEl = document.getElementById("field-name");
    if (nameEl && document.activeElement === nameEl) {
      nameEl.value = t.trim();
    } else {
      nameEl.value = t.trim();
    }
  };
  rec.onend = () => {
    recognizing = false;
    btn.classList.remove("recording");
  };
  rec.onerror = () => {
    recognizing = false;
    btn.classList.remove("recording");
  };
  btn.addEventListener("click", () => {
    if (recognizing) {
      rec.stop();
      return;
    }
    recognizing = true;
    btn.classList.add("recording");
    document.getElementById("field-name").focus();
    rec.start();
  });
}

function initMagazzino() {
  document.querySelectorAll(".mag-tab").forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });

  document.getElementById("btn-add-product").addEventListener("click", (e) => {
    e.preventDefault();
    addProduct();
  });

  document.getElementById("btn-refresh").addEventListener("click", (e) => {
    e.preventDefault();
    loadAll();
  });

  document.getElementById("search-input").addEventListener("input", () => {
    renderCurrentTab();
  });

  document.getElementById("btn-ai-refresh").addEventListener("click", () => {
    loadAISuggestion();
  });

  document.getElementById("modal-transfer-close").addEventListener("click", closeTransferModal);
  document.getElementById("modal-transfer-cancel").addEventListener("click", closeTransferModal);
  document.getElementById("modal-transfer-confirm").addEventListener("click", confirmTransfer);
  document.getElementById("modal-transfer").addEventListener("click", (e) => {
    if (e.target.id === "modal-transfer") closeTransferModal();
  });

  document.getElementById("modal-return-close").addEventListener("click", closeReturnModal);
  document.getElementById("modal-return-cancel").addEventListener("click", closeReturnModal);
  document.getElementById("modal-return-confirm").addEventListener("click", confirmReturn);
  document.getElementById("modal-return").addEventListener("click", (e) => {
    if (e.target.id === "modal-return") closeReturnModal();
  });

  initVoice();
  loadAll();
  loadAISuggestion();
}

document.addEventListener("DOMContentLoaded", initMagazzino);
