// cassa.js (COMPLETO)
// =============================
//   STATO
// =============================

let allOrders = [];
let groupedByTable = new Map();
let selectedTable = null;

let menuOfficial = [];
const MENU_KEY = "rw_menu_official";

// storni per tavolo (cassa-only)
const VOID_PREFIX = "rw_void_table_";

// report giornalieri (locale)
const REPORT_KEY = "rw_reports_daily";
const INVOICE_KEY = "rw_invoices";

// pagamenti / split per tavolo (locale)
const PAYMENT_PREFIX = "rw_payment_table_";
const SPLIT_PREFIX = "rw_split_table_";

// cache inventario (snapshot)
let inventoryCache = [];
let inventoryLastFetchAt = 0;

// =============================
//   UTILITÀ
// =============================

function toMoney(val) {
  const n = Number(val) || 0;
  return "€ " + n.toFixed(2);
}
function clamp(n, a, b) {
  n = Number(n);
  if (!Number.isFinite(n)) return a;
  return Math.max(a, Math.min(b, n));
}
function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function addDaysISO(iso, deltaDays) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + deltaDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function addYearsISO(iso, deltaYears) {
  const d = new Date(iso + "T00:00:00");
  d.setFullYear(d.getFullYear() + deltaYears);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function parseMoneyText(text) {
  return Number(String(text || "").replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;
}
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function approxEqual(a, b, eps = 0.01) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= eps;
}
function safeJsonParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function formatDateTimeNow() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${dd}/${mm}/${yy} ${hh}:${min}:${ss}`;
}

function formatTimeFromISO(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function fetchDayStatus(dateISO) {
  const opts = { credentials: "same-origin" };
  const [checkRes, closureRes] = await Promise.all([
    fetch(`/api/closures/check/${dateISO}`, opts).then((r) => r.ok ? r.json() : { closed: false }).catch(() => ({ closed: false })),
    fetch(`/api/closures/${dateISO}`, opts).then((r) => r.ok ? r.json() : null).catch(() => null),
  ]);
  const closed = checkRes && checkRes.closed;
  const closure = closureRes;
  return {
    closed,
    closedAt: closure?.closedAt,
    closedBy: closure?.closedBy || "—",
  };
}

function renderDateTime() {
  const el = document.getElementById("rw-datetime-value");
  if (el) el.textContent = formatDateTimeNow();
}

function renderDayStatus(status) {
  const el = document.getElementById("rw-day-status-value");
  if (!el) return;
  if (!status) {
    el.textContent = "—";
    return;
  }
  if (status.closed) {
    el.textContent = `Z chiusa • ${formatTimeFromISO(status.closedAt)} • ${status.closedBy}`;
  } else {
    el.textContent = "Aperta";
  }
}

async function fetchShiftStatus() {
  try {
    const res = await fetch("/api/payments/current-shift", { credentials: "same-origin" });
    if (!res.ok) return { hasOpenShift: false, shift: null };
    const data = await res.json();
    return { hasOpenShift: !!data.hasOpenShift, openShift: data.shift };
  } catch {
    return { hasOpenShift: false, openShift: null };
  }
}

function renderShiftStatus(status) {
  const el = document.getElementById("rw-shift-status-value");
  if (!el) return;
  if (!status) {
    el.textContent = "—";
    return;
  }
  if (status.hasOpenShift && status.openShift) {
    const s = status.openShift;
    const opened = formatTimeFromISO(s.opened_at);
    const op = (s.operator || "").trim();
    const float = Number(s.opening_float) || 0;
    let txt = `Aperto • ${opened}`;
    if (op) txt += ` • ${op}`;
    if (float > 0) txt += ` • Float € ${float.toFixed(2)}`;
    el.textContent = txt;
  } else {
    el.textContent = "Chiuso";
  }
}

function isManagerAuthorizedForZ(session) {
  if (!session || !session.department) return false;
  return session.department === "cassa" || session.department === "supervisor";
}

// =============================
//   CALCOLI TAVOLO
// =============================

function getOrdersForSelectedTable() {
  if (!selectedTable || !groupedByTable.has(selectedTable)) return [];
  return groupedByTable.get(selectedTable);
}

// somma price*qty
function computeOrdersTotal(orders) {
  let total = 0;
  for (const o of orders) {
    const items = Array.isArray(o.items) ? o.items : [];
    for (const it of items) {
      const price = Number(it.price);
      const qty = Number(it.qty) || 1;
      if (Number.isFinite(price)) total += price * qty;
    }
  }
  return total;
}

// flatten items
function flattenItems(orders) {
  const itemsFlat = [];
  for (const o of orders) {
    const items = Array.isArray(o.items) ? o.items : [];
    for (const it of items) {
      itemsFlat.push({
        orderId: o.id,
        name: it.name || "-",
        qty: Number(it.qty) || 1,
        price: Number(it.price),
        area: it.area || o.area || "",
        note: it.note || "",
      });
    }
  }
  return itemsFlat;
}

function getCurrentBillData() {
  if (!selectedTable || !groupedByTable.has(selectedTable)) {
    return {
      totalSim: 0,
      voidAmount: 0,
      discountAmount: 0,
      subtotal: 0,
      vatPerc: 0,
      vatAmount: 0,
      finalTotal: 0,
      discountType: "none",
      discountValue: 0,
      discountReason: "",
      itemsFlat: [],
      coversTotal: 0,
      orderIds: [],
    };
  }

  const orders = groupedByTable.get(selectedTable);
  const itemsFlat = flattenItems(orders);
  const totalSim = computeOrdersTotal(orders);
  const voidAmount = computeVoidAmountForTable(selectedTable, itemsFlat);

  const discType = document.getElementById("discount-type")?.value || "none";
  const discValue = Number(document.getElementById("discount-value")?.value) || 0;
  const discReason = document.getElementById("discount-reason")?.value || "";
  const vatPerc = clamp(document.getElementById("bill-vat")?.value, 0, 30);

  let discountAmount = 0;
  const baseAfterVoids = Math.max(0, totalSim - voidAmount);

  if (discType === "percent") discountAmount = baseAfterVoids * (discValue / 100);
  else if (discType === "amount") discountAmount = discValue;

  if (discountAmount < 0) discountAmount = 0;
  if (discountAmount > baseAfterVoids) discountAmount = baseAfterVoids;

  const subtotal = baseAfterVoids - discountAmount;
  const vatAmount = subtotal * (vatPerc / 100);
  const finalTotal = subtotal + vatAmount;

  return {
    totalSim: round2(totalSim),
    voidAmount: round2(voidAmount),
    discountAmount: round2(discountAmount),
    subtotal: round2(subtotal),
    vatPerc: round2(vatPerc),
    vatAmount: round2(vatAmount),
    finalTotal: round2(finalTotal),
    discountType: discType,
    discountValue: round2(discValue),
    discountReason: discReason,
    itemsFlat,
    coversTotal: orders.reduce((acc, o) => acc + (Number(o.covers) || 0), 0),
    orderIds: orders.map((o) => o.id),
  };
}

// =============================
//   STORNI (CASSA ONLY)
// =============================

function loadVoids(table) {
  try {
    const raw = localStorage.getItem(VOID_PREFIX + String(table));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveVoids(table, arr) {
  try {
    localStorage.setItem(VOID_PREFIX + String(table), JSON.stringify(arr || []));
  } catch {}
}

function computeVoidAmountForTable(table, itemsFlat) {
  const voids = loadVoids(table);
  let sum = 0;
  for (const v of voids) {
    const unit = Number(v.unitPrice);
    const qty = Number(v.qty) || 0;
    if (Number.isFinite(unit)) sum += unit * qty;
  }
  const total = computeOrdersTotal(getOrdersForSelectedTable());
  return Math.min(sum, total);
}

function buildVoidSelectOptions(table, itemsFlat) {
  const sel = document.getElementById("void-item-select");
  if (!sel) return;

  sel.innerHTML = "";
  if (!itemsFlat.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Nessuna riga disponibile";
    sel.appendChild(opt);
    return;
  }

  const map = new Map();
  for (const it of itemsFlat) {
    const p = Number(it.price);
    if (!Number.isFinite(p)) continue;
    const key = `${it.name}__${p.toFixed(2)}`;
    if (!map.has(key)) map.set(key, { name: it.name, unitPrice: p, qty: 0 });
    map.get(key).qty += Number(it.qty) || 1;
  }

  const arr = [...map.entries()].map(([key, v]) => ({ key, ...v }));
  arr.sort((a, b) => a.name.localeCompare(b.name));

  arr.forEach((x) => {
    const opt = document.createElement("option");
    opt.value = x.key;
    opt.textContent = `${x.name} • ${toMoney(x.unitPrice)} • qty ${x.qty}`;
    opt.dataset.unitPrice = String(x.unitPrice);
    opt.dataset.maxQty = String(x.qty);
    sel.appendChild(opt);
  });

  const qtyEl = document.getElementById("void-qty");
  if (qtyEl && sel.options.length) {
    const first = sel.options[sel.selectedIndex];
    qtyEl.value = "1";
    qtyEl.max = first.dataset.maxQty || "1";
  }

  sel.onchange = () => {
    const opt = sel.options[sel.selectedIndex];
    const qtyEl2 = document.getElementById("void-qty");
    if (qtyEl2) {
      qtyEl2.value = "1";
      qtyEl2.max = opt.dataset.maxQty || "1";
    }
  };
}

// =============================
//   PAGAMENTI / SPLIT (locale)
// =============================

function defaultPaymentConfig() {
  return {
    method: "cash",
    operator: "",
    received: 0,
    change: 0,
    note: "",
    ticketCount: 0,
    ticketUnit: 0,
    ticketTotal: 0,
    voucherCode: "",
    voucherAmount: 0,
    mixedCash: 0,
    mixedCard: 0,
    mixedOnline: 0,
    mixedTicket: 0,
    mixedVoucher: 0,
    mixedTotal: 0,
    confirmed: false,
  };
}

function defaultSplitConfig() {
  return {
    mode: "single",
    people: 2,
    shares: [],
    confirmed: false,
  };
}

function loadPaymentConfig(table) {
  if (!table) return defaultPaymentConfig();
  const raw = localStorage.getItem(PAYMENT_PREFIX + String(table));
  const cfg = safeJsonParse(raw, defaultPaymentConfig());
  return { ...defaultPaymentConfig(), ...cfg };
}

function savePaymentConfig(table, config) {
  if (!table) return;
  localStorage.setItem(PAYMENT_PREFIX + String(table), JSON.stringify({ ...defaultPaymentConfig(), ...config }));
}

function clearPaymentConfig(table) {
  if (!table) return;
  localStorage.removeItem(PAYMENT_PREFIX + String(table));
}

function loadSplitConfig(table) {
  if (!table) return defaultSplitConfig();
  const raw = localStorage.getItem(SPLIT_PREFIX + String(table));
  const cfg = safeJsonParse(raw, defaultSplitConfig());
  return { ...defaultSplitConfig(), ...cfg };
}

function saveSplitConfig(table, config) {
  if (!table) return;
  localStorage.setItem(SPLIT_PREFIX + String(table), JSON.stringify({ ...defaultSplitConfig(), ...config }));
}

function clearSplitConfig(table) {
  if (!table) return;
  localStorage.removeItem(SPLIT_PREFIX + String(table));
}

function getSplitComputed(config, total) {
  const mode = config.mode || "single";
  const people = Math.max(1, Number(config.people) || 1);

  if (mode === "single") {
    return {
      shares: [round2(total)],
      totalShares: round2(total),
      diff: 0,
      equalAmount: round2(total),
    };
  }

  if (mode === "equal") {
    const equalAmount = round2(total / people);
    const shares = [];
    let running = 0;
    for (let i = 0; i < people; i++) {
      let amount = equalAmount;
      if (i === people - 1) {
        amount = round2(total - running);
      }
      shares.push(amount);
      running += amount;
    }
    return {
      shares,
      totalShares: round2(shares.reduce((a, b) => a + b, 0)),
      diff: round2(total - shares.reduce((a, b) => a + b, 0)),
      equalAmount,
    };
  }

  const manualShares = Array.isArray(config.shares) ? config.shares.map((x) => round2(x)) : [];
  const totalShares = round2(manualShares.reduce((a, b) => a + (Number(b) || 0), 0));
  return {
    shares: manualShares,
    totalShares,
    diff: round2(total - totalShares),
    equalAmount: 0,
  };
}

function getPaymentComputed(config, total) {
  const method = config.method || "cash";
  const received = round2(config.received || 0);

  let amountRegistered = 0;
  let change = 0;
  let breakdown = {
    cash: 0,
    card: 0,
    online: 0,
    ticket: 0,
    voucher: 0,
  };

  if (method === "cash") {
    amountRegistered = received;
    breakdown.cash = received;
    change = round2(Math.max(0, received - total));
  } else if (method === "card") {
    amountRegistered = total;
    breakdown.card = total;
  } else if (method === "online") {
    amountRegistered = total;
    breakdown.online = total;
  } else if (method === "ticket") {
    const ticketTotal = round2((Number(config.ticketCount) || 0) * (Number(config.ticketUnit) || 0));
    amountRegistered = ticketTotal;
    breakdown.ticket = ticketTotal;
  } else if (method === "voucher") {
    const voucherAmount = round2(config.voucherAmount || 0);
    amountRegistered = voucherAmount;
    breakdown.voucher = voucherAmount;
  } else if (method === "mixed") {
    breakdown.cash = round2(config.mixedCash || 0);
    breakdown.card = round2(config.mixedCard || 0);
    breakdown.online = round2(config.mixedOnline || 0);
    breakdown.ticket = round2(config.mixedTicket || 0);
    breakdown.voucher = round2(config.mixedVoucher || 0);
    amountRegistered = round2(
      breakdown.cash + breakdown.card + breakdown.online + breakdown.ticket + breakdown.voucher
    );
  }

  return {
    amountRegistered: round2(amountRegistered),
    change: round2(change),
    diff: round2(total - amountRegistered),
    breakdown,
  };
}

function renderPaymentSummary() {
  const modeEl = document.getElementById("payment-summary-mode");
  const methodEl = document.getElementById("payment-summary-method");
  const operatorEl = document.getElementById("payment-summary-operator");
  const totalEl = document.getElementById("payment-summary-total");

  if (!modeEl || !methodEl || !operatorEl || !totalEl) return;

  if (!selectedTable) {
    modeEl.value = "Pagamento singolo";
    methodEl.value = "Non selezionato";
    operatorEl.value = "—";
    totalEl.value = "€ 0.00";
    return;
  }

  const bill = getCurrentBillData();
  const payment = loadPaymentConfig(selectedTable);
  const split = loadSplitConfig(selectedTable);

  const splitModeLabels = {
    single: "Pagamento singolo",
    equal: `Diviso per ${Math.max(1, Number(split.people) || 1)} persone`,
    manual: "Divisione manuale",
  };

  const methodLabels = {
    cash: "Contanti",
    card: "Carta / POS",
    online: "Online",
    ticket: "Ticket restaurant",
    voucher: "Voucher / Buono sconto",
    mixed: "Misto",
  };

  modeEl.value = splitModeLabels[split.mode || "single"] || "Pagamento singolo";
  methodEl.value = payment.confirmed ? (methodLabels[payment.method] || payment.method || "Non selezionato") : "Non selezionato";
  operatorEl.value = payment.confirmed ? (payment.operator || "—") : "—";
  totalEl.value = toMoney(bill.finalTotal);
}

// =============================
//   MENÙ UFFICIALE (localStorage)
// =============================

function loadOfficialMenu() {
  try {
    const raw = localStorage.getItem(MENU_KEY);
    if (!raw) {
      menuOfficial = [];
      return;
    }
    const arr = JSON.parse(raw);
    menuOfficial = Array.isArray(arr) ? arr : [];
  } catch (err) {
    console.error("Errore lettura menu:", err);
    menuOfficial = [];
  }
}

function saveOfficialMenu() {
  try {
    localStorage.setItem(MENU_KEY, JSON.stringify(menuOfficial));
  } catch (err) {
    console.error("Errore salvataggio menu:", err);
  }
}

function renderMenuList() {
  const container = document.getElementById("menu-list");
  const filterSel = document.getElementById("menu-filter-category");
  if (!container || !filterSel) return;

  const filter = filterSel.value;
  container.innerHTML = "";

  let items = [...menuOfficial];
  if (filter) {
    const f = filter.toLowerCase();
    items = items.filter((m) => (m.category || "").toLowerCase() === f);
  }

  if (!items.length) {
    container.innerHTML = '<div class="menu-meta">Nessuna voce di menù salvata.</div>';
    return;
  }

  items.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  items.forEach((m, index) => {
    const row = document.createElement("div");
    row.className = "menu-row";

    const main = document.createElement("div");
    main.className = "menu-main";
    main.innerHTML = `
      <div class="menu-title">${m.name || "-"}</div>
      <div class="menu-meta">
        Categoria: ${m.category || "-"} • Reparto: ${m.area || "-"} • Prezzo: ${toMoney(m.price)}
        ${m.vat != null ? " • IVA " + m.vat + "%" : ""}
      </div>
      ${m.notes ? `<div class="menu-meta">Note: ${m.notes}</div>` : ""}
    `;

    const actions = document.createElement("div");
    const btnDel = document.createElement("button");
    btnDel.className = "btn-xs danger";
    btnDel.textContent = "Elimina";
    btnDel.addEventListener("click", () => {
      if (!confirm(`Eliminare "${m.name}" dal menù?`)) return;
      menuOfficial.splice(index, 1);
      saveOfficialMenu();
      renderMenuList();
    });

    actions.appendChild(btnDel);
    row.appendChild(main);
    row.appendChild(actions);
    container.appendChild(row);
  });
}

function setupMenuForm() {
  const btnAdd = document.getElementById("btn-add-menu-item");
  const btnClearForm = document.getElementById("btn-clear-menu-form");
  const btnClearMenu = document.getElementById("btn-clear-menu");
  const filterSel = document.getElementById("menu-filter-category");

  if (filterSel) filterSel.addEventListener("change", renderMenuList);

  if (btnAdd) {
    btnAdd.addEventListener("click", () => {
      const nameEl = document.getElementById("menu-name");
      const catEl = document.getElementById("menu-category-input");
      const areaEl = document.getElementById("menu-area");
      const priceEl = document.getElementById("menu-price");
      const vatEl = document.getElementById("menu-vat");
      const notesEl = document.getElementById("menu-notes");

      const name = nameEl.value.trim();
      if (!name) {
        alert("Inserisci il nome del piatto/bevanda.");
        return;
      }

      const category = catEl.value;
      const area = areaEl.value || "cucina";
      const price = Number(priceEl.value) || 0;
      const vat = Number(vatEl.value) || 0;
      const notes = notesEl.value.trim();

      const nextId =
        menuOfficial.length > 0
          ? Math.max(...menuOfficial.map((m) => Number(m.id) || 0)) + 1
          : 1;

      menuOfficial.push({ id: nextId, name, category, area, price, vat, notes });
      saveOfficialMenu();
      renderMenuList();

      nameEl.value = "";
      priceEl.value = "";
      notesEl.value = "";
    });
  }

  if (btnClearForm) {
    btnClearForm.addEventListener("click", () => {
      document.getElementById("menu-name").value = "";
      document.getElementById("menu-price").value = "";
      document.getElementById("menu-notes").value = "";
    });
  }

  if (btnClearMenu) {
    btnClearMenu.addEventListener("click", () => {
      if (!confirm("Svuotare completamente il menù ufficiale?")) return;
      menuOfficial = [];
      saveOfficialMenu();
      renderMenuList();
    });
  }
}

// =============================
//   ORDINI / CASSA
// =============================

async function fetchOrders() {
  if (window.RW_API?.get) return await window.RW_API.get("/api/orders");
  const res = await fetch("/api/orders", { credentials: "same-origin" });
  if (!res.ok) throw new Error("Errore caricamento ordini");
  return await res.json();
}

async function fetchMenu() {
  try {
    const res = await fetch("/api/menu", { credentials: "same-origin" });
    if (res.ok) {
      const data = await res.json();
      menuFromApi = Array.isArray(data) ? data : [];
    } else {
      menuFromApi = [];
    }
  } catch {
    menuFromApi = [];
  }
  return menuFromApi;
}

function enrichItemsWithMenuPrices(orders, menu) {
  const menuMap = new Map();
  for (const m of menu || []) {
    const name = String(m.name || "").trim().toLowerCase();
    if (name && Number.isFinite(Number(m.price))) menuMap.set(name, Number(m.price));
  }
  for (const o of orders || []) {
    for (const it of o.items || []) {
      if (it.price != null && Number.isFinite(Number(it.price))) continue;
      const name = String(it.name || "").trim().toLowerCase();
      const price = menuMap.get(name);
      if (Number.isFinite(price)) it.price = price;
    }
  }
  return orders;
}

async function patchOrderStatus(orderId, status) {
  if (window.RW_API?.patch) return await window.RW_API.patch(`/api/orders/${orderId}/status`, { status });
  const res = await fetch(`/api/orders/${orderId}/status`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Errore aggiornamento ordine");
  return await res.json().catch(() => null);
}

async function createPaymentRecord(payload) {
  if (window.RW_API?.post) return await window.RW_API.post("/api/payments", payload);
  const res = await fetch("/api/payments", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 409) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Ordini già pagati. Impossibile registrare un secondo pagamento.");
  }
  if (!res.ok) throw new Error("Errore salvataggio pagamento");
  return await res.json();
}

function groupOrdersByTable(orders) {
  const byTable = new Map();
  for (const o of orders) {
    if (o.status === "chiuso" || o.status === "annullato") continue;
    const table = o.table ?? "-";
    if (!byTable.has(table)) byTable.set(table, []);
    byTable.get(table).push(o);
  }
  const map = new Map();
  for (const [table, tableOrders] of byTable.entries()) {
    if (tableOrders.every((o) => String(o.status || "").toLowerCase() === "servito")) {
      map.set(table, tableOrders);
    }
  }
  return map;
}

function renderKpi() {
  const kpiTables = document.getElementById("kpi-tables-open");
  const kpiServed = document.getElementById("kpi-orders-served");
  const kpiTotalSim = document.getElementById("kpi-total-sim");

  const tablesCount = groupedByTable.size;

  let servedCount = 0;
  let totalSim = 0;

  for (const [_table, orders] of groupedByTable.entries()) {
    servedCount += orders.filter((o) => o.status === "servito").length;
    totalSim += computeOrdersTotal(orders);
  }

  kpiTables.textContent = String(tablesCount);
  kpiServed.textContent = String(servedCount);
  kpiTotalSim.textContent = toMoney(totalSim);
}

function renderTablesList() {
  const container = document.getElementById("tables-list");
  container.innerHTML = "";

  if (!groupedByTable.size) {
    container.innerHTML = '<div class="order-row-meta">Nessun tavolo servito pronto per pagamento.</div>';
    return;
  }

  const entries = [...groupedByTable.entries()];
  entries.sort((a, b) => Number(a[0]) - Number(b[0]));

  for (const [table, orders] of entries) {
    const row = document.createElement("div");
    row.className = "order-row";

    if (selectedTable != null && String(selectedTable) === String(table)) row.classList.add("active");

    const main = document.createElement("div");
    main.className = "order-row-main";

    const coversTotal = orders.reduce((acc, o) => acc + (Number(o.covers) || 0), 0);
    const servedCount = orders.filter((o) => o.status === "servito").length;
    const statusText =
      servedCount === orders.length
        ? "Tutti serviti"
        : servedCount > 0
        ? `${servedCount} serviti / ${orders.length} ordini`
        : `${orders.length} ordini`;

    main.innerHTML = `
      <div class="order-row-title">Tavolo ${table}</div>
      <div class="order-row-meta">Coperti stimati: ${coversTotal || "-"} • ${statusText}</div>
    `;

    const amount = document.createElement("div");
    amount.className = "order-row-amount";
    amount.textContent = toMoney(computeOrdersTotal(orders));

    row.appendChild(main);
    row.appendChild(amount);

    row.addEventListener("click", () => {
      selectedTable = table;
      renderTablesList();
      renderBillDetail();
      renderPaymentSummary();
    });

    container.appendChild(row);
  }
}

function renderBillDetail() {
  const tableLabel = document.getElementById("bill-table");
  const coversLabel = document.getElementById("bill-covers");
  const ordersCountLabel = document.getElementById("bill-orders-count");
  const itemsContainer = document.getElementById("bill-items");
  const totalSimInput = document.getElementById("bill-total-sim");

  const voidAppliedLabel = document.getElementById("bill-void-applied");
  const discAppliedLabel = document.getElementById("bill-discount-applied");
  const subtotalLabel = document.getElementById("bill-subtotal");
  const vatAmountLabel = document.getElementById("bill-vat-amount");
  const totalFinalLabel = document.getElementById("bill-total-final");

  if (!selectedTable || !groupedByTable.has(selectedTable)) {
    tableLabel.textContent = "–";
    coversLabel.textContent = "–";
    ordersCountLabel.textContent = "–";
    itemsContainer.innerHTML = '<div class="bill-item-meta">Seleziona un tavolo per vedere il dettaglio.</div>';
    totalSimInput.value = "";
    voidAppliedLabel.textContent = toMoney(0);
    discAppliedLabel.textContent = toMoney(0);
    subtotalLabel.textContent = toMoney(0);
    vatAmountLabel.textContent = toMoney(0);
    totalFinalLabel.textContent = toMoney(0);
    renderPaymentSummary();
    return;
  }

  const orders = groupedByTable.get(selectedTable);
  tableLabel.textContent = selectedTable;

  const coversTotal = orders.reduce((acc, o) => acc + (Number(o.covers) || 0), 0);
  coversLabel.textContent = coversTotal || "–";
  ordersCountLabel.textContent = String(orders.length);

  const totalSim = computeOrdersTotal(orders);
  totalSimInput.value = toMoney(totalSim);

  itemsContainer.innerHTML = "";
  const itemsFlat = flattenItems(orders);
  const voids = loadVoids(selectedTable);

  if (!itemsFlat.length) {
    itemsContainer.innerHTML = '<div class="bill-item-meta">Nessun piatto con prezzo definito per questo tavolo.</div>';
  } else {
    itemsFlat.forEach((it) => {
      const row = document.createElement("div");
      row.className = "bill-item-row";

      const left = document.createElement("div");
      const right = document.createElement("div");

      left.innerHTML = `
        <div class="bill-item-name">${it.name} x${it.qty}</div>
        <div class="bill-item-meta">
          Reparto: ${it.area || "-"} ${it.note ? " • Note: " + it.note : ""}
        </div>
      `;
      right.textContent = Number.isFinite(it.price) ? toMoney(it.price * it.qty) : "—";

      row.appendChild(left);
      row.appendChild(right);
      itemsContainer.appendChild(row);
    });

    if (voids.length) {
      const sep = document.createElement("div");
      sep.className = "bill-item-meta";
      sep.style.marginTop = "6px";
      sep.textContent = "Storni (cassa):";
      itemsContainer.appendChild(sep);

      voids.forEach((v) => {
        const row = document.createElement("div");
        row.className = "bill-item-row voided";
        row.innerHTML = `
          <div>
            <div class="bill-item-name">${v.name} x${v.qty}</div>
            <div class="bill-item-meta">Motivo: ${v.reason}${v.note ? " • " + v.note : ""}</div>
          </div>
          <div>${toMoney((Number(v.unitPrice) || 0) * (Number(v.qty) || 0))}</div>
        `;
        itemsContainer.appendChild(row);
      });
    }
  }

  recalcBill();
  renderPaymentSummary();
}

function recalcBill() {
  if (!selectedTable || !groupedByTable.has(selectedTable)) return;

  const bill = getCurrentBillData();

  document.getElementById("bill-total-sim").value = toMoney(bill.totalSim);
  document.getElementById("bill-void-applied").textContent = toMoney(bill.voidAmount);
  document.getElementById("bill-discount-applied").textContent = toMoney(bill.discountAmount);
  document.getElementById("bill-subtotal").textContent = toMoney(bill.subtotal);
  document.getElementById("bill-vat-amount").textContent = toMoney(bill.vatAmount);
  document.getElementById("bill-total-final").textContent = toMoney(bill.finalTotal);

  renderPaymentSummary();
}

async function loadOrdersAndRender() {
  try {
    const [orders, _] = await Promise.all([fetchOrders(), fetchMenu()]);
    allOrders = orders || [];
    enrichItemsWithMenuPrices(allOrders, menuFromApi);
    groupedByTable = groupOrdersByTable(allOrders);

    if (selectedTable && !groupedByTable.has(selectedTable)) selectedTable = null;

    renderKpi();
    renderTablesList();
    renderBillDetail();
    renderReportBox();
  } catch (err) {
    console.error(err);
    alert("Errore caricamento ordini per la cassa.");
  }
}

function setupBillInteractions() {
  const discType = document.getElementById("discount-type");
  const discValue = document.getElementById("discount-value");
  const vatInput = document.getElementById("bill-vat");
  const btnSimulate = document.getElementById("btn-simulate-bill");
  const btnClose = document.getElementById("btn-close-table");

  [discType, discValue, vatInput].forEach((el) => {
    el.addEventListener("input", recalcBill);
    el.addEventListener("change", recalcBill);
  });

  btnSimulate?.addEventListener("click", () => {
    if (!selectedTable || !groupedByTable.has(selectedTable)) {
      alert("Seleziona prima un tavolo.");
      return;
    }
    const totalFinal = document.getElementById("bill-total-final").textContent;
    alert(
      `Simulazione chiusura tavolo ${selectedTable}\n\nTotale finale (simulato): ${totalFinal}\n\nScontrino NON fiscale.`
    );
  });

  btnClose?.addEventListener("click", async () => {
    if (!selectedTable || !groupedByTable.has(selectedTable)) {
      alert("Seleziona prima un tavolo da chiudere.");
      return;
    }

    const orders = groupedByTable.get(selectedTable);
    const bill = getCurrentBillData();
    const payment = loadPaymentConfig(selectedTable);
    const split = loadSplitConfig(selectedTable);

    if (!payment.confirmed) {
      alert("Configura e conferma prima il pagamento.");
      return;
    }

    const paymentComputed = getPaymentComputed(payment, bill.finalTotal);
    const splitComputed = getSplitComputed(split, bill.finalTotal);

    if (payment.method === "cash") {
      if (paymentComputed.amountRegistered < bill.finalTotal) {
        alert("Importo contanti insufficiente.");
        return;
      }
    } else if (payment.method === "ticket" || payment.method === "voucher" || payment.method === "mixed") {
      if (!approxEqual(paymentComputed.amountRegistered, bill.finalTotal)) {
        alert("Il totale registrato del pagamento non coincide con il totale finale.");
        return;
      }
    }

    if (!approxEqual(splitComputed.totalShares, bill.finalTotal)) {
      alert("La divisione conto non coincide con il totale finale.");
      return;
    }

    try {
      const dayStatus = await fetchDayStatus(todayISO());
      if (dayStatus.closed) {
        alert("La giornata è già stata chiusa con la Z. Non è possibile registrare nuovi pagamenti o chiudere tavoli.");
        return;
      }
    } catch {
      // network error – proceed, backend will validate
    }

    if (!confirm(`Chiudere il tavolo ${selectedTable}? Verranno marcati come "chiuso" ${orders.length} ordini.`)) return;

    try {
      await createPaymentRecord({
        table: String(selectedTable),
        orderIds: bill.orderIds,
        subtotal: bill.subtotal,
        discountAmount: bill.discountAmount,
        discountType: bill.discountType,
        discountReason: bill.discountReason,
        vatPercent: bill.vatPerc,
        vatAmount: bill.vatAmount,
        total: bill.finalTotal,
        paymentMethod: payment.method,
        amountReceived: paymentComputed.amountRegistered,
        changeAmount: paymentComputed.change,
        covers: bill.coversTotal,
        operator: payment.operator || "",
        note: payment.note || "",
        customerName: document.getElementById("inv-cli-name")?.value || "",
        companyName: document.getElementById("inv-rest-name")?.value || "",
        vatNumber: document.getElementById("inv-cli-vat")?.value || "",
        status: "closed",
        closedAt: new Date().toISOString(),
        breakdown: paymentComputed.breakdown,
        split: {
          mode: split.mode,
          people: Number(split.people) || 1,
          shares: splitComputed.shares,
        },
        ticketMeta:
          payment.method === "ticket"
            ? {
                count: Number(payment.ticketCount) || 0,
                unit: Number(payment.ticketUnit) || 0,
                total: Number(payment.ticketTotal) || 0,
              }
            : null,
        voucherMeta:
          payment.method === "voucher"
            ? {
                code: payment.voucherCode || "",
                amount: Number(payment.voucherAmount) || 0,
              }
            : null,
      });

      for (const o of orders) {
        await patchOrderStatus(o.id, "chiuso");
      }

      addRevenueToDailyReport(todayISO(), bill.finalTotal, bill.coversTotal);

      clearPaymentConfig(selectedTable);
      clearSplitConfig(selectedTable);

      await loadOrdersAndRender();
      alert(`Tavolo ${selectedTable} chiuso e pagamento salvato.`);
    } catch (err) {
      console.error(err);
      alert(err.message || "Errore nella chiusura del tavolo o nel salvataggio pagamento.");
    }
  });
}

// =============================
//   TABS
// =============================

function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".tab-panel");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-tab");
      tabs.forEach((t) => t.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));

      tab.classList.add("active");
      const panel = document.getElementById(target);
      if (panel) panel.classList.add("active");
    });
  });
}

// =============================
//   MAGAZZINO SNAPSHOT
// =============================

async function fetchInventory() {
  const res = await fetch("/api/inventory");
  if (!res.ok) throw new Error("Errore /api/inventory");
  return await res.json();
}

async function refreshInventory() {
  try {
    const inv = await fetchInventory();
    inventoryCache = Array.isArray(inv) ? inv : [];
    inventoryLastFetchAt = Date.now();
    renderInventoryMini();
    renderShoppingList();
  } catch (err) {
    console.warn("Magazzino snapshot non disponibile:", err);
    inventoryCache = [];
    renderInventoryMini();
    renderShoppingList();
  }
}

function renderInventoryMini() {
  const box = document.getElementById("inv-mini-list");
  const q = (document.getElementById("inv-search")?.value || "").trim().toLowerCase();
  if (!box) return;

  box.innerHTML = "";

  if (!inventoryCache.length) {
    box.innerHTML = `<div class="label-soft tiny">Nessun dato magazzino (API non raggiungibile o vuoto).</div>`;
    return;
  }

  let list = [...inventoryCache];
  if (q) list = list.filter((x) => (x.name || "").toLowerCase().includes(q));

  list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const top = list.slice(0, 12);
  top.forEach((it) => {
    const row = document.createElement("div");
    row.className = "mini-row";
    const qty = Number(it.quantity);
    const thr = Number(it.threshold);
    const isLow = Number.isFinite(qty) && Number.isFinite(thr) && qty <= thr;

    row.innerHTML = `
      <div class="left">
        <div class="title">${it.name || "-"}</div>
        <div class="meta">${it.unit || ""}${Number.isFinite(thr) ? ` • soglia ${thr}` : ""}${isLow ? " • SOTTO SOGLIA" : ""}</div>
      </div>
      <div class="right">${Number.isFinite(qty) ? qty : "—"}</div>
    `;
    box.appendChild(row);
  });
}

// =============================
//   LISTA SPESA
// =============================

function getLowStockItems() {
  const lows = [];
  for (const it of inventoryCache) {
    const qty = Number(it.quantity);
    const thr = Number(it.threshold);
    if (Number.isFinite(qty) && Number.isFinite(thr) && qty <= thr) lows.push(it);
  }
  lows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return lows;
}

function renderShoppingList() {
  const listBox = document.getElementById("shopping-list");
  if (!listBox) return;

  listBox.innerHTML = "";
  const lows = getLowStockItems();

  if (!lows.length) {
    listBox.innerHTML = `<div class="label-soft tiny">Nessun prodotto sotto soglia (o magazzino non disponibile).</div>`;
    return;
  }

  lows.forEach((it) => {
    const row = document.createElement("div");
    row.className = "mini-row";
    row.innerHTML = `
      <div class="left">
        <div class="title">${it.name || "-"}</div>
        <div class="meta">Disponibile: ${it.quantity ?? "—"} ${it.unit || ""} • Soglia: ${it.threshold ?? "—"}</div>
      </div>
      <div class="right">OK</div>
    `;
    listBox.appendChild(row);
  });
}

function shoppingToPlainText() {
  const lows = getLowStockItems();
  const notes = (document.getElementById("shopping-notes")?.value || "").trim();
  const lines = [];
  lines.push("LISTA SPESA (da magazzino sotto soglia)");
  lines.push("-------------------------------------");
  if (!lows.length) lines.push("- (nessun prodotto sotto soglia)");
  else {
    lows.forEach((it) => {
      lines.push(`- ${it.name} (disp: ${it.quantity ?? "—"} ${it.unit || ""}, soglia: ${it.threshold ?? "—"})`);
    });
  }
  if (notes) {
    lines.push("");
    lines.push("NOTE MANUALI:");
    lines.push(notes);
  }
  return lines.join("\n");
}

function printShopping() {
  const area = document.getElementById("shopping-print-area");
  if (!area) return;
  const text = shoppingToPlainText().replace(/\n/g, "<br/>");
  area.innerHTML = `
    <h2>RISTOWORD – Lista Spesa</h2>
    <div style="font-size:12px;line-height:1.4">${text}</div>
  `;
  window.print();
}

// =============================
//   EMAIL (mailto)
// =============================

function openEmail(to, subject, body) {
  const u = new URL("mailto:");
  if (to) u.pathname = to;
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  u.search = params.toString();
  window.location.href = u.toString();
}

// =============================
//   REPORT (locale)
// =============================

function loadReports() {
  try {
    const raw = localStorage.getItem(REPORT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function saveReports(arr) {
  try {
    localStorage.setItem(REPORT_KEY, JSON.stringify(arr || []));
  } catch {}
}

function getReportByDate(iso) {
  const arr = loadReports();
  return arr.find((r) => r.date === iso) || null;
}

function upsertReport(report) {
  const arr = loadReports();
  const idx = arr.findIndex((r) => r.date === report.date);
  if (idx >= 0) arr[idx] = report;
  else arr.push(report);
  arr.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  saveReports(arr);
  renderReportHistory();
}

function addRevenueToDailyReport(dateISO, revenueAdd, coversAdd) {
  const existing = getReportByDate(dateISO);
  const r = existing || { date: dateISO, revenue: 0, covers: 0, food: 0, staff: 0, note: "", catering: 0 };
  r.revenue = Number(r.revenue) + (Number(revenueAdd) || 0);
  r.covers = Number(r.covers) + (Number(coversAdd) || 0);
  upsertReport(r);
  renderReportBox();
}

function renderReportBox() {
  const box = document.getElementById("report-box");
  if (!box) return;

  const dateEl = document.getElementById("report-date");
  const d = dateEl?.value || todayISO();

  const r = getReportByDate(d) || { date: d, revenue: 0, covers: 0, food: 0, staff: 0, note: "", catering: 0 };
  const food = Number(r.food) || 0;
  const staff = Number(r.staff) || 0;
  const rev = Number(r.revenue) || 0;
  const covers = Number(r.covers) || 0;
  const margin = rev - food - staff;

  box.innerHTML = `
    <div class="report-line"><span>Data</span><strong>${r.date}</strong></div>
    <div class="report-line"><span>Incasso</span><strong>${toMoney(rev)}</strong></div>
    <div class="report-line"><span>Coperti</span><strong>${covers}</strong></div>
    <div class="report-line"><span>Spesa Food+Drink</span><strong>${toMoney(food)}</strong></div>
    <div class="report-line"><span>Spesa Personale</span><strong>${toMoney(staff)}</strong></div>
    <div class="report-line"><span>Margine (stimato)</span><strong>${toMoney(margin)}</strong></div>
    <div class="report-line"><span>Catering (incluso)</span><strong>${toMoney(Number(r.catering) || 0)}</strong></div>
    ${r.note ? `<div class="report-line"><span>Note</span><strong>${String(r.note)}</strong></div>` : ""}
  `;
}

function renderReportHistory() {
  const box = document.getElementById("report-history");
  if (!box) return;
  box.innerHTML = "";

  const arr = loadReports();
  if (!arr.length) {
    box.innerHTML = `<div class="label-soft tiny">Nessun report salvato.</div>`;
    return;
  }

  const last = arr.slice(-15).reverse();
  last.forEach((r) => {
    const row = document.createElement("div");
    row.className = "mini-row";
    row.innerHTML = `
      <div class="left">
        <div class="title">${r.date}</div>
        <div class="meta">Coperti: ${r.covers || 0} • Food: ${toMoney(r.food || 0)} • Staff: ${toMoney(r.staff || 0)}</div>
      </div>
      <div class="right">${toMoney(r.revenue || 0)}</div>
    `;
    row.addEventListener("click", () => {
      document.getElementById("report-date").value = r.date;
      document.getElementById("report-food").value = Number(r.food) || 0;
      document.getElementById("report-staff").value = Number(r.staff) || 0;
      document.getElementById("report-note").value = r.note || "";
      renderReportBox();
    });
    box.appendChild(row);
  });
}

async function fetchClosureHistory(dateFrom, dateTo) {
  const from = dateFrom || addDaysISO(todayISO(), -30);
  const to = dateTo || todayISO();
  try {
    const res = await fetch(`/api/closures?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}`, { credentials: "same-origin" });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

function renderClosureHistory(closures) {
  const box = document.getElementById("closure-history");
  if (!box) return;
  box.innerHTML = "";

  if (!closures || closures.length === 0) {
    box.innerHTML = '<div class="label-soft tiny">Nessuna chiusura Z trovata.</div>';
    return;
  }

  const sorted = [...closures].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  sorted.slice(0, 20).forEach((c) => {
    const row = document.createElement("div");
    row.className = "mini-row";
    const closedAt = c.closedAt ? new Date(c.closedAt).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—";
    row.innerHTML = `
      <div class="left">
        <div class="title">${c.date || "—"}</div>
        <div class="meta">Chiusa: ${closedAt} • ${c.closedBy || "—"}</div>
      </div>
      <div class="right">${toMoney(c.grandTotal ?? 0)}</div>
    `;
    row.addEventListener("click", () => {
      window.open(`/api/closures/${c.date}/export?format=csv`, "_blank");
    });
    box.appendChild(row);
  });
}

function compareReport(dateISO) {
  const base = getReportByDate(dateISO);
  if (!base) return { base: null, week: null, year: null };

  const weekISO = addDaysISO(dateISO, -7);
  const yearISO = addYearsISO(dateISO, -1);

  return {
    base,
    week: getReportByDate(weekISO),
    year: getReportByDate(yearISO),
  };
}

function exportReportPrint() {
  const dateISO = document.getElementById("report-date")?.value || todayISO();
  const c = compareReport(dateISO);

  const fmt = (r) =>
    r
      ? `Incasso ${toMoney(r.revenue || 0)} • Coperti ${r.covers || 0} • Food ${toMoney(r.food || 0)} • Staff ${toMoney(r.staff || 0)}`
      : "(nessun dato)";

  const html = `
    <div class="print-area">
      <h2>RISTOWORD – Report</h2>
      <div>Data: <strong>${dateISO}</strong></div>
      <hr/>
      <div><strong>Oggi</strong>: ${fmt(c.base)}</div>
      <div><strong>Settimana scorsa</strong>: ${fmt(c.week)}</div>
      <div><strong>Anno prima</strong>: ${fmt(c.year)}</div>
    </div>
  `;

  const tmp = document.createElement("div");
  tmp.className = "print-area";
  tmp.innerHTML = html;
  document.body.appendChild(tmp);
  window.print();
  tmp.remove();
}

// =============================
//   FATTURE (locale + stampa)
// =============================

function loadInvoices() {
  try {
    const raw = localStorage.getItem(INVOICE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function saveInvoices(arr) {
  try {
    localStorage.setItem(INVOICE_KEY, JSON.stringify(arr || []));
  } catch {}
}
function renderInvoiceHistory() {
  const box = document.getElementById("invoice-history");
  if (!box) return;
  box.innerHTML = "";

  const arr = loadInvoices();
  if (!arr.length) {
    box.innerHTML = `<div class="label-soft tiny">Nessuna fattura salvata.</div>`;
    return;
  }

  const last = arr.slice(-15).reverse();
  last.forEach((inv) => {
    const row = document.createElement("div");
    row.className = "mini-row";
    row.innerHTML = `
      <div class="left">
        <div class="title">${inv.number || "Fattura"}</div>
        <div class="meta">${inv.date} • ${inv.clientName || "-"}</div>
      </div>
      <div class="right">${toMoney(inv.total || 0)}</div>
    `;
    box.appendChild(row);
  });
}

function buildInvoiceFromSelectedTable() {
  const orders = getOrdersForSelectedTable();
  const items = flattenItems(orders).filter((x) => Number.isFinite(x.price));
  const voids = selectedTable ? loadVoids(selectedTable) : [];

  const byKey = new Map();
  for (const it of items) {
    const key = `${it.name}__${Number(it.price).toFixed(2)}`;
    if (!byKey.has(key)) byKey.set(key, { name: it.name, unitPrice: Number(it.price), qty: 0 });
    byKey.get(key).qty += Number(it.qty) || 1;
  }
  for (const v of voids) {
    const key = v.key;
    if (!byKey.has(key)) continue;
    byKey.get(key).qty -= Number(v.qty) || 0;
  }

  const lines = [...byKey.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .filter((x) => x.qty > 0);

  return lines;
}

function renderInvoiceModal() {
  const linesBox = document.getElementById("invoice-lines");
  const subEl = document.getElementById("inv-sub");
  const vatEl = document.getElementById("inv-vat");
  const totEl = document.getElementById("inv-total");

  if (!linesBox || !subEl || !vatEl || !totEl) return;

  const lines = buildInvoiceFromSelectedTable();
  linesBox.innerHTML = "";

  if (!selectedTable) {
    linesBox.innerHTML = `<div class="label-soft tiny" style="padding:10px;">Seleziona un tavolo prima.</div>`;
    subEl.textContent = toMoney(0);
    vatEl.textContent = toMoney(0);
    totEl.textContent = toMoney(0);
    return;
  }

  if (!lines.length) {
    linesBox.innerHTML = `<div class="label-soft tiny" style="padding:10px;">Nessuna riga fatturabile (prezzi mancanti o tutto stornato).</div>`;
  } else {
    lines.forEach((l) => {
      const row = document.createElement("div");
      row.className = "invoice-line";
      row.innerHTML = `
        <div class="name">${l.name}</div>
        <div class="qty">${l.qty}</div>
        <div class="sum">${toMoney(l.unitPrice * l.qty)}</div>
      `;
      linesBox.appendChild(row);
    });
  }

  const bill = getCurrentBillData();
  subEl.textContent = toMoney(lines.reduce((acc, l) => acc + l.unitPrice * l.qty, 0));
  vatEl.textContent = toMoney(bill.vatAmount);
  totEl.textContent = toMoney((lines.reduce((acc, l) => acc + l.unitPrice * l.qty, 0)) + bill.vatAmount);
}

function buildInvoicePrintHTML(invNumber, dateISO) {
  const restName = document.getElementById("inv-rest-name")?.value || "";
  const restAddr = document.getElementById("inv-rest-addr")?.value || "";
  const restVat = document.getElementById("inv-rest-vat")?.value || "";
  const restPec = document.getElementById("inv-rest-pec")?.value || "";

  const cliName = document.getElementById("inv-cli-name")?.value || "";
  const cliAddr = document.getElementById("inv-cli-addr")?.value || "";
  const cliVat = document.getElementById("inv-cli-vat")?.value || "";

  const lines = buildInvoiceFromSelectedTable();
  const bill = getCurrentBillData();

  const subtotal = lines.reduce((acc, l) => acc + l.unitPrice * l.qty, 0);
  const vatAmount = bill.vatAmount;
  const total = subtotal + vatAmount;

  const rows = lines
    .map(
      (l) => `
      <tr>
        <td>${l.name}</td>
        <td style="text-align:right">${l.qty}</td>
        <td style="text-align:right">${toMoney(l.unitPrice)}</td>
        <td style="text-align:right">${toMoney(l.unitPrice * l.qty)}</td>
      </tr>`
    )
    .join("");

  return `
    <div style="font-family:Arial, sans-serif; padding:18px;">
      <h2 style="margin:0 0 6px;">FATTURA ${invNumber}</h2>
      <div style="margin-bottom:12px;">Data: <strong>${dateISO}</strong> • Tavolo: <strong>${selectedTable ?? "-"}</strong></div>

      <div style="display:flex; gap:18px; margin-bottom:14px;">
        <div style="flex:1;">
          <h3 style="margin:0 0 6px;">Ristorante</h3>
          <div>${restName}</div>
          <div>${restAddr}</div>
          <div>P.IVA: ${restVat}</div>
          <div>SDI/PEC: ${restPec}</div>
        </div>
        <div style="flex:1;">
          <h3 style="margin:0 0 6px;">Cliente</h3>
          <div>${cliName}</div>
          <div>${cliAddr}</div>
          <div>P.IVA/CF: ${cliVat}</div>
        </div>
      </div>

      <table style="width:100%; border-collapse:collapse;" border="1" cellpadding="6">
        <thead>
          <tr>
            <th style="text-align:left;">Descrizione</th>
            <th style="text-align:right;">Qty</th>
            <th style="text-align:right;">Prezzo</th>
            <th style="text-align:right;">Totale</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="4">Nessuna riga</td></tr>`}
        </tbody>
      </table>

      <div style="margin-top:12px; display:flex; justify-content:flex-end;">
        <div style="min-width:280px;">
          <div style="display:flex; justify-content:space-between;"><span>Imponibile</span><strong>${toMoney(subtotal)}</strong></div>
          <div style="display:flex; justify-content:space-between;"><span>IVA (${bill.vatPerc}%)</span><strong>${toMoney(vatAmount)}</strong></div>
          <div style="display:flex; justify-content:space-between; font-size:18px; margin-top:6px;"><span>TOTALE</span><strong>${toMoney(total)}</strong></div>
        </div>
      </div>
    </div>
  `;
}

function printInvoice() {
  const invNumber = `RW-${Date.now()}`;
  const dateISO = todayISO();

  const area = document.getElementById("invoice-print-area");
  if (!area) return;

  area.innerHTML = buildInvoicePrintHTML(invNumber, dateISO);
  window.print();
}

function saveInvoiceToHistory() {
  const invNumber = `RW-${Date.now()}`;
  const dateISO = todayISO();

  const cliName = document.getElementById("inv-cli-name")?.value || "";
  const bill = getCurrentBillData();

  const arr = loadInvoices();
  arr.push({
    number: invNumber,
    date: dateISO,
    table: selectedTable,
    clientName: cliName,
    total: bill.finalTotal,
  });
  saveInvoices(arr);
  renderInvoiceHistory();
  alert("Fattura salvata nello storico (locale).");
}

// =============================
//   MODALS
// =============================

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("open");
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("open");
}

// =============================
//   PAGAMENTO UI
// =============================

function fillPaymentModalFromState() {
  if (!selectedTable) return;

  const cfg = loadPaymentConfig(selectedTable);

  document.getElementById("payment-method").value = cfg.method || "cash";
  document.getElementById("payment-operator").value = cfg.operator || "";
  document.getElementById("payment-received").value = Number(cfg.received) || 0;
  document.getElementById("payment-note").value = cfg.note || "";

  document.getElementById("ticket-count").value = Number(cfg.ticketCount) || 0;
  document.getElementById("ticket-unit").value = Number(cfg.ticketUnit) || 0;
  document.getElementById("ticket-total").value = toMoney(Number(cfg.ticketTotal) || 0);

  document.getElementById("voucher-code").value = cfg.voucherCode || "";
  document.getElementById("voucher-amount").value = Number(cfg.voucherAmount) || 0;

  document.getElementById("mixed-cash").value = Number(cfg.mixedCash) || 0;
  document.getElementById("mixed-card").value = Number(cfg.mixedCard) || 0;
  document.getElementById("mixed-online").value = Number(cfg.mixedOnline) || 0;
  document.getElementById("mixed-ticket").value = Number(cfg.mixedTicket) || 0;
  document.getElementById("mixed-voucher").value = Number(cfg.mixedVoucher) || 0;
  document.getElementById("mixed-total").value = toMoney(Number(cfg.mixedTotal) || 0);

  updatePaymentMethodUI();
  recalcPaymentModal();
}

function updatePaymentMethodUI() {
  const method = document.getElementById("payment-method")?.value || "cash";
  document.getElementById("payment-ticket-box").style.display = method === "ticket" ? "" : "none";
  document.getElementById("payment-voucher-box").style.display = method === "voucher" ? "" : "none";
  document.getElementById("payment-mixed-box").style.display = method === "mixed" ? "" : "none";
}

function recalcPaymentModal() {
  if (!selectedTable) return;
  const bill = getCurrentBillData();
  const method = document.getElementById("payment-method").value;

  const cfg = {
    method,
    operator: document.getElementById("payment-operator").value.trim(),
    received: Number(document.getElementById("payment-received").value) || 0,
    note: document.getElementById("payment-note").value.trim(),
    ticketCount: Number(document.getElementById("ticket-count").value) || 0,
    ticketUnit: Number(document.getElementById("ticket-unit").value) || 0,
    voucherCode: document.getElementById("voucher-code").value.trim(),
    voucherAmount: Number(document.getElementById("voucher-amount").value) || 0,
    mixedCash: Number(document.getElementById("mixed-cash").value) || 0,
    mixedCard: Number(document.getElementById("mixed-card").value) || 0,
    mixedOnline: Number(document.getElementById("mixed-online").value) || 0,
    mixedTicket: Number(document.getElementById("mixed-ticket").value) || 0,
    mixedVoucher: Number(document.getElementById("mixed-voucher").value) || 0,
  };

  cfg.ticketTotal = round2(cfg.ticketCount * cfg.ticketUnit);
  cfg.mixedTotal = round2(cfg.mixedCash + cfg.mixedCard + cfg.mixedOnline + cfg.mixedTicket + cfg.mixedVoucher);

  const computed = getPaymentComputed(cfg, bill.finalTotal);

  document.getElementById("ticket-total").value = toMoney(cfg.ticketTotal);
  document.getElementById("mixed-total").value = toMoney(cfg.mixedTotal);
  document.getElementById("payment-change").value = toMoney(computed.change);
}

function setupPaymentModal() {
  const btnOpen = document.getElementById("btn-open-payment");
  const btnClose = document.getElementById("btn-payment-close");
  const btnConfirm = document.getElementById("btn-payment-confirm");
  const btnReset = document.getElementById("btn-payment-reset");

  btnOpen?.addEventListener("click", () => {
    if (!selectedTable) {
      alert("Seleziona un tavolo prima.");
      return;
    }
    fillPaymentModalFromState();
    openModal("modal-payment");
  });

  btnClose?.addEventListener("click", () => closeModal("modal-payment"));

  [
    "payment-method",
    "payment-operator",
    "payment-received",
    "payment-note",
    "ticket-count",
    "ticket-unit",
    "voucher-code",
    "voucher-amount",
    "mixed-cash",
    "mixed-card",
    "mixed-online",
    "mixed-ticket",
    "mixed-voucher",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
      if (id === "payment-method") updatePaymentMethodUI();
      recalcPaymentModal();
    });
    el.addEventListener("change", () => {
      if (id === "payment-method") updatePaymentMethodUI();
      recalcPaymentModal();
    });
  });

  btnReset?.addEventListener("click", () => {
    if (!selectedTable) return;
    clearPaymentConfig(selectedTable);
    fillPaymentModalFromState();
  });

  btnConfirm?.addEventListener("click", () => {
    if (!selectedTable) return;

    const bill = getCurrentBillData();
    const cfg = {
      method: document.getElementById("payment-method").value,
      operator: document.getElementById("payment-operator").value.trim(),
      received: Number(document.getElementById("payment-received").value) || 0,
      note: document.getElementById("payment-note").value.trim(),
      ticketCount: Number(document.getElementById("ticket-count").value) || 0,
      ticketUnit: Number(document.getElementById("ticket-unit").value) || 0,
      voucherCode: document.getElementById("voucher-code").value.trim(),
      voucherAmount: Number(document.getElementById("voucher-amount").value) || 0,
      mixedCash: Number(document.getElementById("mixed-cash").value) || 0,
      mixedCard: Number(document.getElementById("mixed-card").value) || 0,
      mixedOnline: Number(document.getElementById("mixed-online").value) || 0,
      mixedTicket: Number(document.getElementById("mixed-ticket").value) || 0,
      mixedVoucher: Number(document.getElementById("mixed-voucher").value) || 0,
      confirmed: true,
    };

    cfg.ticketTotal = round2(cfg.ticketCount * cfg.ticketUnit);
    cfg.mixedTotal = round2(cfg.mixedCash + cfg.mixedCard + cfg.mixedOnline + cfg.mixedTicket + cfg.mixedVoucher);

    const computed = getPaymentComputed(cfg, bill.finalTotal);

    if (cfg.method === "cash" && computed.amountRegistered < bill.finalTotal) {
      alert("Importo contanti insufficiente.");
      return;
    }
    if ((cfg.method === "ticket" || cfg.method === "voucher" || cfg.method === "mixed") && !approxEqual(computed.amountRegistered, bill.finalTotal)) {
      alert("Il totale pagamento deve coincidere con il totale finale.");
      return;
    }

    cfg.change = computed.change;
    savePaymentConfig(selectedTable, cfg);
    closeModal("modal-payment");
    renderPaymentSummary();
  });
}

// =============================
//   SPLIT UI
// =============================

function buildSplitManualInputs(people, shares) {
  const box = document.getElementById("split-manual-list");
  if (!box) return;
  box.innerHTML = "";

  for (let i = 0; i < people; i++) {
    const row = document.createElement("div");
    row.className = "mini-row";
    row.innerHTML = `
      <div class="left">
        <div class="title">Quota ${i + 1}</div>
      </div>
      <div class="right">
        <input type="number" class="split-share-input" data-idx="${i}" step="0.01" min="0" value="${Number(shares[i]) || 0}" style="width:110px;" />
      </div>
    `;
    box.appendChild(row);
  }

  box.querySelectorAll(".split-share-input").forEach((input) => {
    input.addEventListener("input", recalcSplitModal);
  });
}

function fillSplitModalFromState() {
  if (!selectedTable) return;
  const cfg = loadSplitConfig(selectedTable);

  document.getElementById("split-mode").value = cfg.mode || "single";
  document.getElementById("split-people").value = Math.max(1, Number(cfg.people) || 2);

  updateSplitModeUI();
  const people = Math.max(1, Number(document.getElementById("split-people").value) || 1);
  buildSplitManualInputs(people, Array.isArray(cfg.shares) ? cfg.shares : []);
  recalcSplitModal();
}

function updateSplitModeUI() {
  const mode = document.getElementById("split-mode").value;
  document.getElementById("split-equal-box").style.display = mode === "equal" ? "" : "none";
  document.getElementById("split-manual-box").style.display = mode === "manual" ? "" : "none";
}

function recalcSplitModal() {
  if (!selectedTable) return;
  const bill = getCurrentBillData();
  const mode = document.getElementById("split-mode").value;
  const people = Math.max(1, Number(document.getElementById("split-people").value) || 1);

  let shares = [];

  if (mode === "single") {
    shares = [round2(bill.finalTotal)];
  } else if (mode === "equal") {
    const equalAmount = round2(bill.finalTotal / people);
    let running = 0;
    for (let i = 0; i < people; i++) {
      let val = equalAmount;
      if (i === people - 1) val = round2(bill.finalTotal - running);
      shares.push(val);
      running += val;
    }
  } else {
    const inputs = [...document.querySelectorAll(".split-share-input")];
    shares = inputs.map((x) => round2(Number(x.value) || 0));
  }

  const totalShares = round2(shares.reduce((a, b) => a + b, 0));
  const diff = round2(bill.finalTotal - totalShares);

  document.getElementById("split-equal-amount").value = mode === "equal" ? toMoney(shares[0] || 0) : toMoney(0);
  document.getElementById("split-manual-total").value = toMoney(totalShares);
  document.getElementById("split-manual-diff").value = toMoney(diff);
}

function setupSplitModal() {
  const btnOpen = document.getElementById("btn-open-split");
  const btnClose = document.getElementById("btn-split-close");
  const btnConfirm = document.getElementById("btn-split-confirm");
  const btnReset = document.getElementById("btn-split-reset");

  btnOpen?.addEventListener("click", () => {
    if (!selectedTable) {
      alert("Seleziona un tavolo prima.");
      return;
    }
    fillSplitModalFromState();
    openModal("modal-split");
  });

  btnClose?.addEventListener("click", () => closeModal("modal-split"));

  document.getElementById("split-mode")?.addEventListener("change", () => {
    updateSplitModeUI();
    const people = Math.max(1, Number(document.getElementById("split-people").value) || 1);
    buildSplitManualInputs(people, []);
    recalcSplitModal();
  });

  document.getElementById("split-people")?.addEventListener("input", () => {
    const people = Math.max(1, Number(document.getElementById("split-people").value) || 1);
    if (document.getElementById("split-mode").value === "manual") {
      buildSplitManualInputs(people, []);
    }
    recalcSplitModal();
  });

  btnReset?.addEventListener("click", () => {
    if (!selectedTable) return;
    clearSplitConfig(selectedTable);
    fillSplitModalFromState();
  });

  btnConfirm?.addEventListener("click", () => {
    if (!selectedTable) return;

    const bill = getCurrentBillData();
    const mode = document.getElementById("split-mode").value;
    const people = Math.max(1, Number(document.getElementById("split-people").value) || 1);

    let shares = [];
    if (mode === "single") {
      shares = [round2(bill.finalTotal)];
    } else if (mode === "equal") {
      let running = 0;
      const eq = round2(bill.finalTotal / people);
      for (let i = 0; i < people; i++) {
        let val = eq;
        if (i === people - 1) val = round2(bill.finalTotal - running);
        shares.push(val);
        running += val;
      }
    } else {
      shares = [...document.querySelectorAll(".split-share-input")].map((x) => round2(Number(x.value) || 0));
      if (!approxEqual(shares.reduce((a, b) => a + b, 0), bill.finalTotal)) {
        alert("La somma delle quote manuali deve coincidere con il totale finale.");
        return;
      }
    }

    saveSplitConfig(selectedTable, {
      mode,
      people,
      shares,
      confirmed: true,
    });

    closeModal("modal-split");
    renderPaymentSummary();
  });
}

// =============================
//   SETUP TOOL BUTTONS
// =============================

function setupTools() {
  document.getElementById("btn-ai")?.addEventListener("click", () => {
    alert("Pulsante AI pronto. Qui collegheremo suggerimenti (food cost, upsell, warning scorte, ecc.).");
  });

  document.getElementById("btn-void-item")?.addEventListener("click", () => {
    if (!selectedTable) {
      alert("Seleziona un tavolo prima.");
      return;
    }
    const orders = getOrdersForSelectedTable();
    const itemsFlat = flattenItems(orders).filter((x) => Number.isFinite(x.price));
    buildVoidSelectOptions(selectedTable, itemsFlat);
    openModal("modal-void");
  });

  document.getElementById("btn-void-close")?.addEventListener("click", () => closeModal("modal-void"));

  document.getElementById("btn-void-remove-all")?.addEventListener("click", () => {
    if (!selectedTable) return;
    if (!confirm("Svuotare tutti gli storni di questo tavolo?")) return;
    saveVoids(selectedTable, []);
    closeModal("modal-void");
    renderBillDetail();
  });

  document.getElementById("btn-void-confirm")?.addEventListener("click", () => {
    if (!selectedTable) return;

    const sel = document.getElementById("void-item-select");
    const qtyEl = document.getElementById("void-qty");
    const reasonEl = document.getElementById("void-reason");
    const noteEl = document.getElementById("void-note");

    const key = sel?.value || "";
    if (!key) {
      alert("Seleziona una riga.");
      return;
    }

    const opt = sel.options[sel.selectedIndex];
    const unitPrice = Number(opt.dataset.unitPrice);
    const maxQty = Number(opt.dataset.maxQty) || 1;
    const qty = clamp(qtyEl?.value || 1, 1, maxQty);

    const reason = reasonEl?.value || "altro";
    const note = (noteEl?.value || "").trim();

    const name = String(opt.textContent || "").split("•")[0].trim();

    const arr = loadVoids(selectedTable);
    arr.push({ key, name, unitPrice, qty, reason, note, ts: Date.now() });
    saveVoids(selectedTable, arr);

    closeModal("modal-void");
    renderBillDetail();
  });

  document.getElementById("btn-invoice")?.addEventListener("click", () => {
    if (!selectedTable) {
      alert("Seleziona un tavolo prima.");
      return;
    }
    renderInvoiceModal();
    openModal("modal-invoice");
  });

  document.getElementById("btn-invoice-close")?.addEventListener("click", () => closeModal("modal-invoice"));
  document.getElementById("btn-invoice-print")?.addEventListener("click", () => printInvoice());
  document.getElementById("btn-invoice-save")?.addEventListener("click", () => saveInvoiceToHistory());
  document.getElementById("btn-invoice-email")?.addEventListener("click", () => {
    const email = document.getElementById("inv-cli-email")?.value || "";
    const tot = document.getElementById("inv-total")?.textContent || "";
    openEmail(email, "Fattura RISTOWORD", `In allegato (stampa/PDF) fattura. Totale: ${tot}`);
  });

  document.getElementById("btn-email")?.addEventListener("click", () => openModal("modal-email"));
  document.getElementById("btn-email-close")?.addEventListener("click", () => closeModal("modal-email"));
  document.getElementById("btn-email-fill-shopping")?.addEventListener("click", () => {
    document.getElementById("email-body").value = shoppingToPlainText();
  });
  document.getElementById("btn-email-send")?.addEventListener("click", () => {
    const to = document.getElementById("email-to")?.value || "";
    const subject = document.getElementById("email-subject")?.value || "";
    const body = document.getElementById("email-body")?.value || "";
    openEmail(to, subject, body);
  });

  document.getElementById("btn-shopping")?.addEventListener("click", () => {
    renderShoppingList();
    openModal("modal-shopping");
  });
  document.getElementById("btn-shopping-close")?.addEventListener("click", () => closeModal("modal-shopping"));
  document.getElementById("btn-shopping-print")?.addEventListener("click", () => printShopping());

  setupPaymentModal();
  setupSplitModal();
}

// =============================
//   REPORT UI SETUP
// =============================

function setupReport() {
  const dateEl = document.getElementById("report-date");
  const foodEl = document.getElementById("report-food");
  const staffEl = document.getElementById("report-staff");
  const noteEl = document.getElementById("report-note");

  const btnSave = document.getElementById("btn-save-report");
  const btnCompare = document.getElementById("btn-show-compare");
  const btnAddCatering = document.getElementById("btn-add-catering");
  const btnExport = document.getElementById("btn-export-report");
  const btnClear = document.getElementById("btn-clear-reports");

  if (dateEl && !dateEl.value) dateEl.value = todayISO();

  const loadIntoForm = (iso) => {
    const r = getReportByDate(iso) || { date: iso, revenue: 0, covers: 0, food: 0, staff: 0, note: "", catering: 0 };
    foodEl.value = Number(r.food) || 0;
    staffEl.value = Number(r.staff) || 0;
    noteEl.value = r.note || "";
    renderReportBox();
  };

  dateEl?.addEventListener("change", () => loadIntoForm(dateEl.value));

  btnSave?.addEventListener("click", () => {
    const d = dateEl?.value || todayISO();
    const existing = getReportByDate(d) || { date: d, revenue: 0, covers: 0, food: 0, staff: 0, note: "", catering: 0 };

    existing.food = Number(foodEl.value) || 0;
    existing.staff = Number(staffEl.value) || 0;
    existing.note = (noteEl.value || "").trim();

    upsertReport(existing);
    renderReportBox();
    alert("Report salvato (locale).");
  });

  btnCompare?.addEventListener("click", () => {
    const d = dateEl?.value || todayISO();
    const cmp = compareReport(d);
    const box = document.getElementById("report-box");
    if (!box) return;

    if (!cmp.base) {
      alert("Nessun report salvato per questa data.");
      return;
    }

    const fmt = (r) =>
      r
        ? `Incasso ${toMoney(r.revenue || 0)} • Coperti ${r.covers || 0} • Food ${toMoney(r.food || 0)} • Staff ${toMoney(r.staff || 0)}`
        : "(nessun dato)";

    const compareHtml = `
      <div class="report-compare">
        <div class="report-line"><span><strong>Settimana scorsa</strong></span><strong>${fmt(cmp.week)}</strong></div>
        <div class="report-line"><span><strong>Anno prima</strong></span><strong>${fmt(cmp.year)}</strong></div>
      </div>
    `;
    renderReportBox();
    box.insertAdjacentHTML("beforeend", compareHtml);
  });

  btnAddCatering?.addEventListener("click", () => {
    const d = dateEl?.value || todayISO();
    const amount = Number(prompt("Incasso catering da aggiungere (€):", "0")) || 0;
    if (amount <= 0) return;

    const r = getReportByDate(d) || { date: d, revenue: 0, covers: 0, food: 0, staff: 0, note: "", catering: 0 };
    r.revenue = Number(r.revenue) + amount;
    r.catering = Number(r.catering) + amount;
    upsertReport(r);
    renderReportBox();
  });

  btnExport?.addEventListener("click", () => exportReportPrint());

  btnClear?.addEventListener("click", () => {
    if (!confirm("Svuotare TUTTO lo storico report (locale)?")) return;
    saveReports([]);
    renderReportHistory();
    renderReportBox();
  });

  renderReportHistory();
  renderReportBox();

  const btnRefreshClosures = document.getElementById("btn-refresh-closures");
  async function loadAndRenderClosureHistory() {
    const closures = await fetchClosureHistory();
    renderClosureHistory(closures);
  }
  btnRefreshClosures?.addEventListener("click", loadAndRenderClosureHistory);
  loadAndRenderClosureHistory();
}

// =============================
//   SHIFT MODALS (Apri Cassa, Cambio Turno, Chiusura Z)
// =============================

function setupShiftModals() {
  const btnOpenShift = document.getElementById("rw-btn-open-shift");
  const btnShiftChange = document.getElementById("rw-btn-shift-change");

  const btnPartialClose = document.getElementById("rw-btn-partial-close");
  btnOpenShift?.addEventListener("click", () => openModal("modal-open-shift"));
  btnShiftChange?.addEventListener("click", () => openModal("modal-shift-change"));
  btnPartialClose?.addEventListener("click", () => {
    openModal("modal-partial-close");
    fetchAndRenderPartialClose();
  });

  document.getElementById("btn-open-shift-close")?.addEventListener("click", () => closeModal("modal-open-shift"));
  document.getElementById("btn-shift-change-close")?.addEventListener("click", () => closeModal("modal-shift-change"));
  document.getElementById("btn-partial-close-close")?.addEventListener("click", () => closeModal("modal-partial-close"));
  document.getElementById("btn-z-report-close")?.addEventListener("click", () => closeModal("modal-z-report"));

  document.getElementById("btn-open-shift-confirm")?.addEventListener("click", async () => {
    const floatEl = document.getElementById("open-shift-float");
    const operatorEl = document.getElementById("open-shift-operator");
    const openingFloat = Number(floatEl?.value) || 0;
    const operator = (operatorEl?.value || "").trim();
    try {
      const res = await fetch("/api/payments/open", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opening_float: openingFloat, operator }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.message || data.error || "Errore apertura cassa.");
        return;
      }
      closeModal("modal-open-shift");
      if (floatEl) floatEl.value = "0";
      const status = await fetchShiftStatus();
      renderShiftStatus(status);
      const dayStatus = await fetchDayStatus(todayISO());
      renderDayStatus(dayStatus);
      alert("Cassa aperta.");
    } catch (err) {
      console.error(err);
      alert("Errore apertura cassa.");
    }
  });

  document.getElementById("btn-shift-change-confirm")?.addEventListener("click", async () => {
    const operatorEl = document.getElementById("shift-change-operator");
    const countedEl = document.getElementById("shift-change-counted");
    const newFloatEl = document.getElementById("shift-change-new-float");
    const operator = (operatorEl?.value || "").trim();
    const countedCash = Number(countedEl?.value) || 0;
    const newOpeningFloat = newFloatEl?.value !== "" && newFloatEl?.value != null ? Number(newFloatEl.value) : undefined;
    try {
      const body = { counted_cash: countedCash };
      if (operator) body.operator = operator;
      if (newOpeningFloat != null && Number.isFinite(newOpeningFloat)) body.new_opening_float = newOpeningFloat;
      const res = await fetch("/api/payments/shift-change", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.message || data.error || "Errore cambio turno.");
        return;
      }
      closeModal("modal-shift-change");
      if (operatorEl) operatorEl.value = "";
      if (countedEl) countedEl.value = "0";
      if (newFloatEl) newFloatEl.value = "";
      const status = await fetchShiftStatus();
      renderShiftStatus(status);
      const dayStatus = await fetchDayStatus(todayISO());
      renderDayStatus(dayStatus);
      alert("Cambio turno eseguito.");
    } catch (err) {
      console.error(err);
      alert("Errore cambio turno.");
    }
  });

  async function fetchAndRenderPartialClose() {
    const box = document.getElementById("partial-close-report");
    const countedEl = document.getElementById("partial-close-counted");
    if (!box) return;
    const countedCash = countedEl?.value !== "" && countedEl?.value != null ? Number(countedEl.value) : null;
    const body = countedCash != null && Number.isFinite(countedCash) ? { counted_cash: countedCash } : {};
    try {
      const res = await fetch("/api/payments/partial-close", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const r = await res.json();
      if (!res.ok) {
        box.innerHTML = `<div class="label-soft tiny">Errore: ${r.message || r.error || "Richiesta fallita"}</div>`;
        return;
      }
      const fmt = (n) => toMoney(Number(n) || 0);
      let diffHtml = "";
      if (r.counted_cash != null && r.cash_difference != null) {
        const diffClass = r.cash_difference > 0 ? "diff-sopra" : r.cash_difference < 0 ? "diff-sotto" : "diff-ok";
        diffHtml = `
          <div class="report-line"><span>Contanti contati</span><strong>${fmt(r.counted_cash)}</strong></div>
          <div class="report-line"><span>Contanti attesi (float + incasso)</span><strong>${fmt((r.opening_float || 0) + (r.cash_total || 0))}</strong></div>
          <div class="report-line ${diffClass}"><span>Differenza</span><strong>${fmt(r.cash_difference)} ${r.cash_difference_label || ""}</strong></div>
        `;
      }
      box.innerHTML = `
        <div class="report-line"><span>Turno aperto</span><strong>${r.hasOpenShift ? "Sì" : "No"}</strong></div>
        ${r.shiftId ? `<div class="report-line"><span>ID turno</span><strong>${r.shiftId}</strong></div>` : ""}
        ${r.opening_float != null ? `<div class="report-line"><span>Cambio iniziale</span><strong>${fmt(r.opening_float)}</strong></div>` : ""}
        <div class="report-line"><span>Contanti incassati</span><strong>${fmt(r.cash_total)}</strong></div>
        <div class="report-line"><span>Carta / POS</span><strong>${fmt(r.card_total)}</strong></div>
        <div class="report-line"><span>Altri</span><strong>${fmt(r.other_total)}</strong></div>
        <div class="report-line total"><span>Totale</span><strong>${fmt(r.grand_total)}</strong></div>
        <div class="report-line"><span>N. pagamenti</span><strong>${r.payments_count || 0}</strong></div>
        ${diffHtml}
      `;
    } catch (err) {
      box.innerHTML = `<div class="label-soft tiny">Errore: ${err.message || "Rete"}</div>`;
    }
  }

  document.getElementById("btn-partial-close-fetch")?.addEventListener("click", fetchAndRenderPartialClose);

  document.getElementById("btn-z-report-confirm")?.addEventListener("click", async () => {
    const countedEl = document.getElementById("z-report-counted");
    const closedByEl = document.getElementById("z-report-closed-by");
    const notesEl = document.getElementById("z-report-notes");
    const countedCash = Number(countedEl?.value) || 0;
    const closedBy = (closedByEl?.value || "").trim();
    const notes = (notesEl?.value || "").trim();
    if (!confirm("Confermi la chiusura Z della giornata? La giornata verrà chiusa definitivamente.")) return;
    try {
      const res = await fetch("/api/payments/z-report", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counted_cash: countedCash, closed_by: closedBy, notes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.message || data.error || "Errore chiusura Z.");
        return;
      }
      closeModal("modal-z-report");
      if (countedEl) countedEl.value = "0";
      if (closedByEl) closedByEl.value = "";
      if (notesEl) notesEl.value = "";
      const status = await fetchDayStatus(todayISO());
      renderDayStatus(status);
      const shiftStatus = await fetchShiftStatus();
      renderShiftStatus(shiftStatus);
      alert("Chiusura Z eseguita. Giornata chiusa.");
    } catch (err) {
      console.error(err);
      alert("Errore chiusura Z.");
    }
  });
}

// =============================
//   INIT
// =============================

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();

  // Staff access (cassa: cash manager + operational staff login)
  (function initStaffAccess() {
    if (!window.RW_StaffAccess) return;
    RW_StaffAccess.init({ module: "cassa", department: "cassa" });

    function refreshStaffUI() {
      const sess = RW_StaffAccess.getCurrentSession();
      const mgrVal = document.getElementById("rw-manager-value");
      const btnLogin = document.getElementById("rw-btn-manager-login");
      const btnLogout = document.getElementById("rw-btn-manager-logout");
      const btnZ = document.getElementById("rw-btn-z-closure");
      if (mgrVal) mgrVal.textContent = sess ? sess.name : "—";
      if (btnLogin) btnLogin.style.display = sess ? "none" : "";
      if (btnLogout) btnLogout.style.display = sess ? "" : "none";
      if (btnZ) btnZ.style.display = isManagerAuthorizedForZ(sess) ? "" : "none";
      if (sess) document.getElementById("rw-cassa-manager-chip")?.classList.add("logged-in");
      else document.getElementById("rw-cassa-manager-chip")?.classList.remove("logged-in");

      RW_StaffAccess.getActiveSessions().then(function (list) {
        const staffFromCassa = (list || []).filter((s) => s.source === "cassa");
        const cnt = document.getElementById("rw-staff-count");
        if (cnt) cnt.textContent = String(staffFromCassa.length);
      }).catch(function () {
        const cnt = document.getElementById("rw-staff-count");
        if (cnt) cnt.textContent = "—";
      });
      RW_StaffAccess.renderActiveStaff("rw-cassa-active-staff", null, {
        source: "cassa",
        title: "Staff attivi (loggati da cassa)",
        onLogout: async function (sessionId) {
          try {
            await RW_StaffAccess.logout(sessionId);
            refreshStaffUI();
          } catch (e) {
            console.error(e);
          }
        },
      });
    }

    document.getElementById("rw-btn-manager-login")?.addEventListener("click", () => {
      RW_StaffAccess.showManagerLoginModal(refreshStaffUI, "cash_manager");
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
    document.getElementById("rw-btn-staff-login")?.addEventListener("click", () => {
      const mgr = RW_StaffAccess.getCurrentSession();
      if (!mgr) {
        alert("Effettua prima il login come responsabile cassa (Manager).");
        return;
      }
      RW_StaffAccess.showStaffLoginModal(mgr.name, refreshStaffUI);
    });

    document.getElementById("rw-btn-z-closure")?.addEventListener("click", () => {
      openModal("modal-z-report");
    });

    refreshStaffUI();

    async function refreshShiftStatus() {
      try {
        const status = await fetchShiftStatus();
        renderShiftStatus(status);
      } catch {
        renderShiftStatus({ hasOpenShift: false });
      }
    }
    refreshShiftStatus();
    setInterval(refreshShiftStatus, 30000);

    async function refreshDayStatus() {
      try {
        const status = await fetchDayStatus(todayISO());
        renderDayStatus(status);
      } catch {
        renderDayStatus({ closed: false });
      }
    }
    refreshDayStatus();
    setInterval(refreshDayStatus, 60000);
  })();

  renderDateTime();
  setInterval(renderDateTime, 1000);

  fetchShiftStatus().then(renderShiftStatus);

  loadOfficialMenu();
  setupMenuForm();
  renderMenuList();

  document.getElementById("btn-refresh-orders")?.addEventListener("click", loadOrdersAndRender);

  window.addEventListener("rw:orders-update", (ev) => {
    if (ev.detail?.orders) {
      allOrders = ev.detail.orders;
      groupedByTable = groupOrdersByTable(allOrders);
      if (selectedTable && !groupedByTable.has(selectedTable)) selectedTable = null;
      renderKpi();
      renderTablesList();
      renderBillDetail();
      renderReportBox();
    }
  });

  setupBillInteractions();

  setupTools();

  document.getElementById("btn-inv-refresh")?.addEventListener("click", refreshInventory);
  document.getElementById("inv-search")?.addEventListener("input", renderInventoryMini);

  setupReport();
  renderInvoiceHistory();

  document.getElementById("btn-clear-invoices")?.addEventListener("click", () => {
    if (!confirm("Svuotare storico fatture (locale)?")) return;
    saveInvoices([]);
    renderInvoiceHistory();
  });

  loadOrdersAndRender();
  refreshInventory();

  setupShiftModals();

  setInterval(loadOrdersAndRender, 30000);
  setInterval(() => {
    if (Date.now() - inventoryLastFetchAt > 120000) refreshInventory();
  }, 30000);
});