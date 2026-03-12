// backend/public/supervisor/supervisor.js

// =============================
//  KEYS (localStorage)
// =============================
const MENU_KEY = "rw_menu_official";         // condiviso con Cassa
const REPORTS_KEY = "rw_reports_history";    // storico chiusure giornata
const STORNI_KEY_PREFIX = "rw_storni_";      // rw_storni_YYYY-MM-DD

// =============================
//  STATE
// =============================
let allOrders = [];
let menuOfficial = [];
let reportsHistory = [];
let storniToday = [];

let inventoryCache = null;
let shoppingCache = [];

// =============================
//  HELPERS
// =============================
function pad2(n){ return String(n).padStart(2, "0"); }
function todayKey(){
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function todayLabel(){
  const d = new Date();
  return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;
}
function toMoney(val){
  const n = Number(val) || 0;
  return "€ " + n.toFixed(2);
}
function safeText(s){
  return (s == null) ? "" : String(s);
}
function downloadJson(filename, obj){
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
async function readJsonFile(file){
  const txt = await file.text();
  return JSON.parse(txt);
}

// =============================
//  MENÙ (shared with Cassa)
// =============================
function loadMenu(){
  try{
    const raw = localStorage.getItem(MENU_KEY);
    menuOfficial = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(menuOfficial)) menuOfficial = [];
  }catch(e){
    console.error("Menu load error:", e);
    menuOfficial = [];
  }
}
function saveMenu(){
  try{
    localStorage.setItem(MENU_KEY, JSON.stringify(menuOfficial));
  }catch(e){
    console.error("Menu save error:", e);
  }
}
function nextMenuId(){
  if (!menuOfficial.length) return 1;
  return Math.max(...menuOfficial.map(m => Number(m.id)||0)) + 1;
}
function findMenuItemByName(name){
  const n = (name||"").trim().toLowerCase();
  if (!n) return null;
  return menuOfficial.find(m => (m.name||"").trim().toLowerCase() === n) || null;
}

// =============================
//  REPORTS (day close history)
// =============================
function loadReports(){
  try{
    const raw = localStorage.getItem(REPORTS_KEY);
    reportsHistory = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(reportsHistory)) reportsHistory = [];
  }catch(e){
    console.error("Reports load error:", e);
    reportsHistory = [];
  }
}
function saveReports(){
  try{
    localStorage.setItem(REPORTS_KEY, JSON.stringify(reportsHistory));
  }catch(e){
    console.error("Reports save error:", e);
  }
}
function getReportForDate(ymd){
  return reportsHistory.find(r => r && r.date === ymd) || null;
}

// =============================
//  STORNI (today)
// =============================
function loadStorni(){
  const key = STORNI_KEY_PREFIX + todayKey();
  try{
    const raw = localStorage.getItem(key);
    storniToday = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(storniToday)) storniToday = [];
  }catch(e){
    console.error("Storni load error:", e);
    storniToday = [];
  }
}
function saveStorni(){
  const key = STORNI_KEY_PREFIX + todayKey();
  try{
    localStorage.setItem(key, JSON.stringify(storniToday));
  }catch(e){
    console.error("Storni save error:", e);
  }
}
function storniTotal(){
  return storniToday.reduce((acc,s)=>acc + (Number(s.amount)||0), 0);
}

// =============================
//  ORDERS / REVENUE
// =============================
function itemUnitPrice(it){
  const p = Number(it && it.price);
  if (Number.isFinite(p) && p >= 0) return p;

  // fallback: prova dal menù ufficiale per nome
  const m = findMenuItemByName(it && it.name);
  if (m && Number.isFinite(Number(m.price))) return Number(m.price);

  return 0;
}
function computeOrderTotal(o){
  const items = Array.isArray(o.items) ? o.items : [];
  let t = 0;
  for (const it of items){
    const qty = Number(it.qty) || 1;
    t += itemUnitPrice(it) * qty;
  }
  return t;
}
function computeGrossFromOrders(orders){
  let total = 0;
  for (const o of orders){
    total += computeOrderTotal(o);
  }
  return total;
}
function coversFromOrders(orders){
  return orders.reduce((acc,o)=>acc + (Number(o.covers)||0), 0);
}
function receiptsEstimate(orders){
  // "scontrini stimati" = numero tavoli che hanno almeno un ordine chiuso/servito
  const set = new Set();
  for (const o of orders){
    if (o.table != null && o.table !== "") set.add(String(o.table));
  }
  return set.size;
}

// =============================
//  API
// =============================
async function apiGetOrders(){
  const res = await fetch("/api/orders", { credentials: "same-origin" });
  if (!res.ok) throw new Error("Errore /api/orders");
  return await res.json();
}
async function apiGetDashboardSummary(){
  const res = await fetch("/api/reports/dashboard-summary");
  if (!res.ok) throw new Error("Errore /api/reports/dashboard-summary");
  return await res.json();
}
async function apiGetInventory(){
  const res = await fetch("/api/inventory", { credentials: "same-origin" });
  if (!res.ok) throw new Error("Errore /api/inventory");
  return await res.json();
}
async function apiPing(){
  try{
    const res = await fetch("/api/system/health", { credentials: "same-origin" });
    if (res.ok) return true;
  }catch(_){}
  // fallback: prova orders
  try{
    const res2 = await fetch("/api/orders", { credentials: "same-origin" });
    return res2.ok;
  }catch(_){}
  return false;
}

// =============================
//  UI: TABS
// =============================
function setupTabs(){
  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".tab-panel");

  tabs.forEach(tab=>{
    tab.addEventListener("click", ()=>{
      const id = tab.getAttribute("data-tab");
      tabs.forEach(t=>t.classList.remove("active"));
      panels.forEach(p=>p.classList.remove("active"));
      tab.classList.add("active");
      const panel = document.getElementById(id);
      if (panel) panel.classList.add("active");
    });
  });
}

// =============================
//  UI: KPIs + REPORT
// =============================
function renderTopKpis(){
  document.getElementById("kpi-date").textContent = todayLabel();

  // Incasso live: di default usiamo SOLO ordini CHIUSI per “incasso che sale fino a chiusura”
  // Se vuoi includere anche "servito", basta aggiungere || o.status==="servito"
  const closed = allOrders.filter(o => o.status === "chiuso");
  const gross = computeGrossFromOrders(closed);

  const storni = storniTotal();
  const net = Math.max(0, gross - storni);

  document.getElementById("kpi-gross").textContent = toMoney(gross);
  document.getElementById("kpi-storni").textContent = toMoney(storni);
  document.getElementById("kpi-net").textContent = toMoney(net);

  // metriche tab report
  document.getElementById("m-orders").textContent = String(allOrders.length);
  document.getElementById("m-closed").textContent = String(closed.length);
  document.getElementById("m-covers").textContent = String(coversFromOrders(closed));
  document.getElementById("m-receipts").textContent = String(receiptsEstimate(closed));
}

function renderBusinessKpis(data){
  const kpi = data?.kpi || {};
  const byMethod = data?.paymentsByMethod || {};
  const revenue = Number(kpi.netRevenue) || 0;
  const ordersTotal = (Number(kpi.closedOrders) || 0) + (Number(kpi.openOrders) || 0) + (Number(kpi.servedOrders) || 0);

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set("kpi-revenue", toMoney(revenue));
  set("kpi-orders", String(ordersTotal));
  set("kpi-avg-ticket", toMoney(Number(kpi.averageReceipt) || 0));
  set("kpi-covers", String(Number(kpi.covers) || 0));
  set("kpi-open-tables", String(Number(kpi.openTablesCount) || 0));
  set("kpi-in-prep", String(Number(kpi.ordersInPreparationCount) || 0));
  set("kpi-ready", String(Number(kpi.readyOrdersCount) || 0));
  set("kpi-late", String(Number(kpi.lateOrdersCount) || 0));
  set("kpi-low-stock", String(Number(kpi.inventoryLowStockCount) || 0));
  set("kpi-food-cost", toMoney(Number(kpi.totalFoodCostToday) || 0));

  const parts = [];
  for (const [method, info] of Object.entries(byMethod)){
    const tot = info?.total ?? info;
    const label = method === "cash" ? "Contanti" : method === "card" ? "Carta" : method;
    parts.push(`${label}: ${toMoney(Number(tot) || 0)}`);
  }
  const breakdownEl = document.getElementById("kpi-payments-breakdown");
  if (breakdownEl) breakdownEl.textContent = parts.length ? parts.join(" • ") : "—";
}

function updateKpisFromOrders(orders){
  const today = todayKey();
  const daily = (orders || []).filter(o => {
    const d = o.updatedAt || o.createdAt || o.date;
    if (!d) return false;
    const ymd = `${new Date(d).getFullYear()}-${pad2(new Date(d).getMonth()+1)}-${pad2(new Date(d).getDate())}`;
    return ymd === today;
  });
  const openTables = new Set();
  let inPrep = 0, ready = 0, late = 0;
  const now = Date.now();
  for (const o of daily){
    const s = String(o.status || "").toLowerCase();
    if (["chiuso","annullato"].includes(s)) continue;
    openTables.add(String(o.table != null ? o.table : "-"));
    if (s === "pronto") ready += 1;
    else if (["in_attesa","in_preparazione"].includes(s)){
      inPrep += 1;
      const ts = o.updatedAt || o.createdAt;
      if (ts && Math.floor((now - new Date(ts).getTime())/60000) >= 15) late += 1;
    }
  }
  const closed = daily.filter(o => String(o.status||"").toLowerCase() === "chiuso").length;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("kpi-orders", String(daily.length));
  set("kpi-open-tables", String(openTables.size));
  set("kpi-in-prep", String(inPrep));
  set("kpi-ready", String(ready));
  set("kpi-late", String(late));
}

function applySupervisorSyncToKpis(d){
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  if (d.revenue != null) set("kpi-revenue", toMoney(d.revenue));
  if (d.averageReceipt != null) set("kpi-avg-ticket", toMoney(d.averageReceipt));
  if (d.covers != null) set("kpi-covers", String(d.covers));
  if (d.openTablesCount != null) set("kpi-open-tables", String(d.openTablesCount));
  if (d.ordersInPreparationCount != null) set("kpi-in-prep", String(d.ordersInPreparationCount));
  if (d.readyOrdersCount != null) set("kpi-ready", String(d.readyOrdersCount));
  if (d.lateOrdersCount != null) set("kpi-late", String(d.lateOrdersCount));
  const closed = Number(d.closedOrdersCount) || 0;
  const open = Number(d.openOrdersCount) || 0;
  set("kpi-orders", String(closed + open));
  if (d.byMethod && Object.keys(d.byMethod).length){
    const parts = [];
    for (const [method, tot] of Object.entries(d.byMethod)){
      const label = method === "cash" ? "Contanti" : method === "card" ? "Carta" : method;
      parts.push(`${label}: ${toMoney(Number(tot) || 0)}`);
    }
    const el = document.getElementById("kpi-payments-breakdown");
    if (el) el.textContent = parts.join(" • ");
  }
}

function renderComparisons(){
  const ymd = todayKey();

  // settimana scorsa: -7 giorni
  const d = new Date();
  d.setDate(d.getDate() - 7);
  const w = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;

  // anno scorso: -1 anno stesso giorno
  const d2 = new Date();
  d2.setFullYear(d2.getFullYear() - 1);
  const y = `${d2.getFullYear()}-${pad2(d2.getMonth()+1)}-${pad2(d2.getDate())}`;

  const repW = getReportForDate(w);
  const repY = getReportForDate(y);

  const closed = allOrders.filter(o => o.status === "chiuso");
  const gross = computeGrossFromOrders(closed);
  const net = Math.max(0, gross - storniTotal());

  document.getElementById("cmp-week").textContent = repW
    ? `${toMoney(net)} vs ${toMoney(repW.net)} (${w})`
    : "— (nessun report salvato)";

  document.getElementById("cmp-year").textContent = repY
    ? `${toMoney(net)} vs ${toMoney(repY.net)} (${y})`
    : "— (nessun report salvato)";
}

function renderReportsList(){
  const box = document.getElementById("reports-list");
  box.innerHTML = "";

  if (!reportsHistory.length){
    box.innerHTML = `<div class="tiny muted">Nessun report salvato.</div>`;
    return;
  }

  const arr = [...reportsHistory].sort((a,b)=> (b.date||"").localeCompare(a.date||""));
  for (const r of arr.slice(0, 60)){
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `
      <div class="list-item-title">${safeText(r.date)} — Netto ${toMoney(r.net)}</div>
      <div class="list-item-meta">
        Lordo: ${toMoney(r.gross)} • Storni: ${toMoney(r.storni)} • Ordini chiusi: ${safeText(r.closedOrders)}
        • Coperti: ${safeText(r.covers)}
      </div>
    `;
    box.appendChild(div);
  }
}

function setupReportsActions(){
  document.getElementById("btn-close-day").addEventListener("click", ()=>{
    const ymd = todayKey();
    const closed = allOrders.filter(o => o.status === "chiuso");
    const gross = computeGrossFromOrders(closed);
    const storni = storniTotal();
    const net = Math.max(0, gross - storni);

    const rep = {
      date: ymd,
      gross,
      storni,
      net,
      closedOrders: closed.length,
      covers: coversFromOrders(closed),
      receipts: receiptsEstimate(closed),
      savedAt: new Date().toISOString()
    };

    // sostituisci se esiste già report stesso giorno
    const idx = reportsHistory.findIndex(x => x && x.date === ymd);
    if (idx >= 0) reportsHistory[idx] = rep;
    else reportsHistory.push(rep);

    saveReports();
    renderReportsList();
    renderComparisons();

    alert(`Report salvato: ${ymd}\nNetto stimato: ${toMoney(net)}`);
  });

  document.getElementById("btn-export-reports").addEventListener("click", ()=>{
    downloadJson(`ristoword_reports_${todayKey()}.json`, reportsHistory);
  });

  document.getElementById("file-import-reports").addEventListener("change", async (e)=>{
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try{
      const obj = await readJsonFile(file);
      if (!Array.isArray(obj)) throw new Error("JSON non valido");
      reportsHistory = obj;
      saveReports();
      renderReportsList();
      renderComparisons();
      alert("Import reports: OK");
    }catch(err){
      console.error(err);
      alert("Import reports: errore JSON.");
    }finally{
      e.target.value = "";
    }
  });

  document.getElementById("btn-clear-reports").addEventListener("click", ()=>{
    if (!confirm("Svuotare lo storico report?")) return;
    reportsHistory = [];
    saveReports();
    renderReportsList();
    renderComparisons();
  });
}

// =============================
//  UI: ORDERS TABLE (filters)
// =============================
function renderOrdersTable(){
  const box = document.getElementById("orders-table");
  const fStatus = document.getElementById("f-status").value;
  const fArea = document.getElementById("f-area").value;
  const q = (document.getElementById("f-q").value || "").trim().toLowerCase();

  let list = [...allOrders];

  if (fStatus){
    list = list.filter(o => (o.status||"") === fStatus);
  }
  if (fArea){
    list = list.filter(o => (o.area||"") === fArea || (Array.isArray(o.items) && o.items.some(i => (i.area||"") === fArea)));
  }
  if (q){
    list = list.filter(o=>{
      const t = safeText(o.table).toLowerCase();
      const w = safeText(o.waiter).toLowerCase();
      const n = safeText(o.notes).toLowerCase();
      return t.includes(q) || w.includes(q) || n.includes(q);
    });
  }

  // ordina per createdAt se esiste
  list.sort((a,b)=>{
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });

  box.innerHTML = "";

  const head = document.createElement("div");
  head.className = "trow head";
  head.innerHTML = `
    <div>Tavolo</div>
    <div>Stato</div>
    <div>Dettagli</div>
    <div>Totale</div>
    <div>Reparto</div>
  `;
  box.appendChild(head);

  if (!list.length){
    const empty = document.createElement("div");
    empty.className = "trow";
    empty.innerHTML = `<div class="tiny muted" style="grid-column:1/-1;">Nessun ordine con i filtri attuali.</div>`;
    box.appendChild(empty);
    return;
  }

  for (const o of list.slice(0, 200)){
    const tot = computeOrderTotal(o);
    const items = Array.isArray(o.items) ? o.items : [];
    const itemsTxt = items.slice(0,4).map(i => `${safeText(i.name)} x${Number(i.qty)||1}`).join(" • ");
    const extra = items.length > 4 ? ` • +${items.length-4}` : "";

    const row = document.createElement("div");
    row.className = "trow";
    row.innerHTML = `
      <div>${safeText(o.table)}</div>
      <div><span class="badge ${safeText(o.status)}">${safeText(o.status||"-")}</span></div>
      <div>${itemsTxt}${extra}${o.waiter ? ` • ${safeText(o.waiter)}` : ""}${o.notes ? ` • ${safeText(o.notes)}` : ""}</div>
      <div>${toMoney(tot)}</div>
      <div>${safeText(o.area || (items[0] && items[0].area) || "-")}</div>
    `;
    box.appendChild(row);
  }
}

function setupOrderFilters(){
  ["f-status","f-area","f-q"].forEach(id=>{
    const el = document.getElementById(id);
    el.addEventListener(id==="f-q" ? "input" : "change", renderOrdersTable);
  });
}

// =============================
//  UI: STORNI
// =============================
function renderStorni(){
  document.getElementById("st-total").textContent = toMoney(storniTotal());
  const box = document.getElementById("storni-list");
  box.innerHTML = "";

  if (!storniToday.length){
    box.innerHTML = `<div class="tiny muted">Nessuno storno inserito oggi.</div>`;
    return;
  }

  storniToday.slice().reverse().forEach((s, idxRev)=>{
    const idx = storniToday.length - 1 - idxRev;
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `
      <div class="list-item-title">${toMoney(s.amount)} — ${safeText(s.reason)}</div>
      <div class="list-item-meta">
        ${s.table ? `Tavolo: ${safeText(s.table)} • ` : ""}${s.orderId ? `Ordine: ${safeText(s.orderId)} • ` : ""}${safeText(s.note||"")}
      </div>
      <div class="list-item-actions">
        <button class="btn-xs danger" data-del="${idx}">Elimina</button>
      </div>
    `;
    div.querySelector("[data-del]").addEventListener("click", ()=>{
      if (!confirm("Eliminare questo storno?")) return;
      storniToday.splice(idx, 1);
      saveStorni();
      renderStorni();
      renderTopKpis();
      renderComparisons();
    });
    box.appendChild(div);
  });
}

function setupStorni(){
  document.getElementById("btn-add-storno").addEventListener("click", ()=>{
    const amount = Number(document.getElementById("st-amount").value) || 0;
    if (amount <= 0){
      alert("Inserisci un importo > 0.");
      return;
    }
    const storno = {
      amount,
      reason: document.getElementById("st-reason").value,
      table: document.getElementById("st-table").value.trim(),
      orderId: document.getElementById("st-orderid").value.trim(),
      note: document.getElementById("st-note").value.trim(),
      ts: new Date().toISOString()
    };
    storniToday.push(storno);
    saveStorni();

    document.getElementById("st-amount").value = "";
    document.getElementById("st-table").value = "";
    document.getElementById("st-orderid").value = "";
    document.getElementById("st-note").value = "";

    renderStorni();
    renderTopKpis();
    renderComparisons();
  });

  document.getElementById("btn-clear-storni").addEventListener("click", ()=>{
    if (!confirm("Svuotare gli storni di oggi?")) return;
    storniToday = [];
    saveStorni();
    renderStorni();
    renderTopKpis();
    renderComparisons();
  });
}

// =============================
//  UI: MENU
// =============================
function renderMenuList(){
  const box = document.getElementById("menu-list");
  const f = (document.getElementById("menu-filter").value || "").toLowerCase();
  const q = (document.getElementById("menu-q").value || "").trim().toLowerCase();

  box.innerHTML = "";

  let items = [...menuOfficial];

  if (f){
    items = items.filter(m => (m.category||"").toLowerCase() === f);
  }
  if (q){
    items = items.filter(m => (m.name||"").toLowerCase().includes(q));
  }

  if (!items.length){
    box.innerHTML = `<div class="tiny muted">Nessuna voce menù con questi filtri.</div>`;
    return;
  }

  items.sort((a,b)=> (a.name||"").localeCompare(b.name||""));

  items.forEach((m)=>{
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `
      <div class="list-item-title">${safeText(m.name)} — ${toMoney(m.price)}</div>
      <div class="list-item-meta">
        Categoria: ${safeText(m.category)} • Reparto: ${safeText(m.area)} • IVA: ${safeText(m.vat)}%
        ${m.notes ? `<br/>Note: ${safeText(m.notes)}` : ""}
      </div>
      <div class="list-item-actions">
        <button class="btn-xs danger" data-del="${safeText(m.id)}">Elimina</button>
      </div>
    `;
    div.querySelector("[data-del]").addEventListener("click", ()=>{
      if (!confirm(`Eliminare "${m.name}" dal menù?`)) return;
      menuOfficial = menuOfficial.filter(x => String(x.id) !== String(m.id));
      saveMenu();
      renderMenuList();
    });
    box.appendChild(div);
  });
}

function setupMenu(){
  document.getElementById("btn-menu-add").addEventListener("click", ()=>{
    const name = document.getElementById("menu-name").value.trim();
    if (!name){
      alert("Inserisci un nome.");
      return;
    }
    const price = Number(document.getElementById("menu-price").value) || 0;

    const item = {
      id: nextMenuId(),
      name,
      category: document.getElementById("menu-category").value,
      area: document.getElementById("menu-area").value,
      price,
      vat: Number(document.getElementById("menu-vat").value) || 0,
      notes: document.getElementById("menu-notes").value.trim()
    };

    menuOfficial.push(item);
    saveMenu();
    renderMenuList();

    document.getElementById("menu-name").value = "";
    document.getElementById("menu-price").value = "";
    document.getElementById("menu-notes").value = "";
  });

  document.getElementById("btn-menu-clear-form").addEventListener("click", ()=>{
    document.getElementById("menu-name").value = "";
    document.getElementById("menu-price").value = "";
    document.getElementById("menu-notes").value = "";
  });

  document.getElementById("menu-filter").addEventListener("change", renderMenuList);
  document.getElementById("menu-q").addEventListener("input", renderMenuList);

  document.getElementById("btn-menu-export").addEventListener("click", ()=>{
    downloadJson(`ristoword_menu_${todayKey()}.json`, menuOfficial);
  });

  document.getElementById("file-menu-import").addEventListener("change", async (e)=>{
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try{
      const obj = await readJsonFile(file);
      if (!Array.isArray(obj)) throw new Error("JSON non valido");
      menuOfficial = obj;
      saveMenu();
      renderMenuList();
      alert("Import menù: OK");
    }catch(err){
      console.error(err);
      alert("Import menù: errore JSON.");
    }finally{
      e.target.value = "";
    }
  });

  document.getElementById("btn-menu-clear-all").addEventListener("click", ()=>{
    if (!confirm("Svuotare completamente il menù?")) return;
    menuOfficial = [];
    saveMenu();
    renderMenuList();
  });
}

// =============================
//  UI: INVENTORY + SHOPPING
// =============================
function computeInventoryKpis(inv){
  // supporta array generico
  const items = Array.isArray(inv) ? inv : (Array.isArray(inv.items) ? inv.items : []);
  const count = items.length;

  // prova a capire low stock (campi comuni: qty, quantity, stock; threshold, min, minStock)
  let low = 0;
  let value = 0;

  for (const p of items){
    const qty = Number(p.qty ?? p.quantity ?? p.stock ?? 0) || 0;
    const min = Number(p.min ?? p.minStock ?? p.threshold ?? 0) || 0;
    const cost = Number(p.cost ?? p.unitCost ?? p.price ?? 0) || 0;

    if (min > 0 && qty <= min) low++;
    if (cost > 0 && qty > 0) value += cost * qty;
  }

  return { count, low, value, items };
}

function renderInventory(inv){
  const box = document.getElementById("inv-list");
  const kCount = document.getElementById("inv-count");
  const kLow = document.getElementById("inv-low");
  const kVal = document.getElementById("inv-value");

  box.innerHTML = "";

  if (!inv){
    kCount.textContent = "—";
    kLow.textContent = "—";
    kVal.textContent = "—";
    box.innerHTML = `<div class="tiny muted">Magazzino non disponibile (endpoint /api/inventory non trovato).</div>`;
    return;
  }

  const k = computeInventoryKpis(inv);
  kCount.textContent = String(k.count);
  kLow.textContent = String(k.low);
  kVal.textContent = toMoney(k.value);

  if (!k.items.length){
    box.innerHTML = `<div class="tiny muted">Nessun prodotto in magazzino.</div>`;
    return;
  }

  // lista sintetica (max 60)
  k.items.slice(0, 60).forEach(p=>{
    const name = safeText(p.name ?? p.title ?? p.product ?? "Prodotto");
    const qty = Number(p.qty ?? p.quantity ?? p.stock ?? 0) || 0;
    const min = Number(p.min ?? p.minStock ?? p.threshold ?? 0) || 0;

    const row = document.createElement("div");
    row.className = "mini-row";
    row.innerHTML = `
      <div>
        <div style="font-weight:900;">${name}</div>
        <div class="tiny muted">Qta: ${qty}${min ? ` • Soglia: ${min}` : ""}</div>
      </div>
      <div style="font-weight:900; color:${(min>0 && qty<=min) ? "var(--danger)" : "var(--softtext)"};">
        ${(min>0 && qty<=min) ? "SOTTO" : ""}
      </div>
    `;
    box.appendChild(row);
  });

  // shopping list base = prodotti sotto soglia
  shoppingCache = [];
  const k2 = computeInventoryKpis(inv);
  for (const p of k2.items){
    const qty = Number(p.qty ?? p.quantity ?? p.stock ?? 0) || 0;
    const min = Number(p.min ?? p.minStock ?? p.threshold ?? 0) || 0;
    if (min > 0 && qty <= min){
      const name = safeText(p.name ?? p.title ?? p.product ?? "Prodotto");
      shoppingCache.push(`${name} (qta ${qty} / soglia ${min})`);
    }
  }
}

async function loadInventory(){
  try{
    const inv = await apiGetInventory();
    inventoryCache = inv;
    renderInventory(inv);
  }catch(err){
    console.warn("Inventory not available:", err);
    inventoryCache = null;
    renderInventory(null);
  }
}

function openModalShopping(){
  const modal = document.getElementById("modal-shopping");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  renderShoppingModal();
}

function closeModalShopping(){
  const modal = document.getElementById("modal-shopping");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function renderShoppingModal(){
  const list = document.getElementById("shopping-list");
  const notes = document.getElementById("shopping-notes").value.trim();

  list.innerHTML = "";

  const base = shoppingCache.length ? shoppingCache : ["(nessun prodotto sotto soglia)"];
  base.forEach(line=>{
    const row = document.createElement("div");
    row.className = "mini-row";
    row.innerHTML = `<div>${safeText(line)}</div><div></div>`;
    list.appendChild(row);
  });

  if (notes){
    const row = document.createElement("div");
    row.className = "mini-row";
    row.innerHTML = `<div><strong>Note:</strong> ${safeText(notes)}</div><div></div>`;
    list.appendChild(row);
  }
}

function printShopping(){
  const notes = document.getElementById("shopping-notes").value.trim();
  const items = shoppingCache.length ? shoppingCache : [];

  const html = `
    <html>
      <head>
        <meta charset="utf-8"/>
        <title>Lista spesa - RistoWord</title>
        <style>
          body{ font-family:system-ui; padding:20px; }
          h1{ margin:0 0 10px; }
          .muted{ color:#666; font-size:12px; }
          ul{ margin-top:10px; }
        </style>
      </head>
      <body>
        <h1>Lista spesa</h1>
        <div class="muted">Data: ${todayLabel()}</div>
        <ul>
          ${(items.length ? items : ["(nessun prodotto sotto soglia)"]).map(x=>`<li>${safeText(x)}</li>`).join("")}
        </ul>
        ${notes ? `<h3>Note</h3><div>${safeText(notes)}</div>` : ""}
        <script>window.print();</script>
      </body>
    </html>
  `;

  const w = window.open("", "_blank");
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function setupShopping(){
  document.getElementById("btn-open-shopping").addEventListener("click", async ()=>{
    await loadInventory(); // tenta refresh prima
    openModalShopping();
  });

  document.getElementById("btn-shopping-close").addEventListener("click", closeModalShopping);
  document.getElementById("btn-shopping-print").addEventListener("click", printShopping);

  document.getElementById("shopping-notes").addEventListener("input", renderShoppingModal);

  // chiudi cliccando fuori
  document.getElementById("modal-shopping").addEventListener("click", (e)=>{
    if (e.target && e.target.id === "modal-shopping") closeModalShopping();
  });
}

// =============================
//  UI: EMAIL
// =============================
function setupEmail(){
  // pulsante sidebar: porta al tab email
  document.getElementById("btn-open-email").addEventListener("click", ()=>{
    // attiva tab-email
    document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p=>p.classList.remove("active"));
    document.querySelector('[data-tab="tab-email"]').classList.add("active");
    document.getElementById("tab-email").classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  document.getElementById("btn-email-open").addEventListener("click", ()=>{
    const to = encodeURIComponent(document.getElementById("email-to").value.trim());
    const subject = encodeURIComponent(document.getElementById("email-subject").value.trim());
    const body = encodeURIComponent(document.getElementById("email-body").value.trim());
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  });

  document.getElementById("btn-email-fill-shopping").addEventListener("click", async ()=>{
    // tenta prendere inventario per aggiornare shoppingCache
    await loadInventory();
    const notes = document.getElementById("shopping-notes") ? document.getElementById("shopping-notes").value.trim() : "";
    const lines = [];

    lines.push("LISTA SPESA (RistoWord)");
    lines.push("Data: " + todayLabel());
    lines.push("");

    if (shoppingCache.length){
      shoppingCache.forEach(x=>lines.push("- " + x));
    }else{
      lines.push("- (nessun prodotto sotto soglia)");
    }

    if (notes){
      lines.push("");
      lines.push("NOTE:");
      lines.push(notes);
    }

    const curr = document.getElementById("email-body").value.trim();
    document.getElementById("email-body").value = (curr ? curr + "\n\n" : "") + lines.join("\n");
  });
}

// =============================
//  LOAD + RENDER
// =============================
async function loadOrders(){
  try{
    const data = await apiGetOrders();
    allOrders = Array.isArray(data) ? data : [];
  }catch(err){
    console.error(err);
    allOrders = [];
  }
}

let dashboardSummaryCache = null;
async function loadDashboardSummary(){
  try{
    dashboardSummaryCache = await apiGetDashboardSummary();
  }catch(err){
    console.error(err);
    dashboardSummaryCache = null;
  }
}

async function refreshAll(){
  const ok = await apiPing();
  document.getElementById("backend-status").textContent = "Backend: " + (ok ? "OK" : "OFF");

  await Promise.all([loadOrders(), loadDashboardSummary()]);
  loadMenu();       // in caso sia cambiato da Cassa
  loadReports();
  loadStorni();

  renderTopKpis();
  if (dashboardSummaryCache) renderBusinessKpis(dashboardSummaryCache);
  renderComparisons();
  renderReportsList();
  renderOrdersTable();
  renderStorni();
  renderMenuList();

  // magazzino non forzato ogni refresh (solo on demand) per non pesare
}

// =============================
//  INIT
// =============================

function initStaffAccess() {
  if (!window.RW_StaffAccess) return;
  RW_StaffAccess.init({ module: "supervisor", department: "supervisor" });

  function refreshStaffUI() {
    const sess = RW_StaffAccess.getCurrentSession();
    const mgrVal = document.getElementById("rw-manager-value");
    const btnLogin = document.getElementById("rw-btn-manager-login");
    const btnLogout = document.getElementById("rw-btn-manager-logout");
    if (mgrVal) mgrVal.textContent = sess ? sess.name : "—";
    if (btnLogin) btnLogin.style.display = sess ? "none" : "";
    if (btnLogout) btnLogout.style.display = sess ? "" : "none";
    const chip = document.getElementById("rw-supervisor-manager-chip");
    if (chip) chip.classList.toggle("logged-in", !!sess);
    RW_StaffAccess.renderActiveStaff("rw-supervisor-active-staff", null); // all departments
  }

  document.getElementById("rw-btn-manager-login")?.addEventListener("click", () => {
    RW_StaffAccess.showManagerLoginModal(refreshStaffUI, "supervisor");
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

document.addEventListener("DOMContentLoaded", ()=>{
  setupTabs();
  setupOrderFilters();
  initStaffAccess();

  loadMenu();
  loadReports();
  loadStorni();

  setupReportsActions();
  setupStorni();
  setupMenu();
  setupEmail();
  setupShopping();

  document.getElementById("btn-refresh").addEventListener("click", refreshAll);
  document.getElementById("btn-inv-refresh").addEventListener("click", loadInventory);

  window.addEventListener("rw:orders-update", (ev) => {
    if (ev.detail?.orders) {
      allOrders = ev.detail.orders;
      renderTopKpis();
      renderComparisons();
      renderOrdersTable();
      updateKpisFromOrders(allOrders);
    }
  });

  window.addEventListener("rw:supervisor-sync", (ev) => {
    const d = ev.detail || {};
    if (d.revenue != null) {
      const grossEl = document.getElementById("kpi-gross");
      const netEl = document.getElementById("kpi-net");
      const storni = storniTotal();
      if (grossEl) grossEl.textContent = toMoney(d.revenue);
      if (netEl) netEl.textContent = toMoney(Math.max(0, d.revenue - storni));
    }
    if (d.closedOrdersCount != null) {
      const el = document.getElementById("m-closed");
      if (el) el.textContent = String(d.closedOrdersCount);
    }
    if (d.paymentCount != null) {
      const el = document.getElementById("m-receipts");
      if (el) el.textContent = String(d.paymentCount);
    }
    if (d.covers != null) {
      const el = document.getElementById("m-covers");
      if (el) el.textContent = String(d.covers);
    }
    applySupervisorSyncToKpis(d);
  });

  refreshAll();
  setInterval(refreshAll, 30000);
});