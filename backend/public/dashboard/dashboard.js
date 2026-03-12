// =============================
// HELPERS
// =============================

function openLink(link, newTab = true) {
  if (!link) return;

  if (newTab) {
    window.open(link, "_blank");
  } else {
    window.location.href = link;
  }
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function normalizeStatus(status) {
  const s = String(status || "").toLowerCase();

  if (["attesa","waiting"].includes(s)) return "WAITING";
  if (["in_preparazione","preparing"].includes(s)) return "PREPARING";
  if (["pronto","ready"].includes(s)) return "READY";
  if (["servito","served"].includes(s)) return "SERVED";
  if (["chiuso","closed"].includes(s)) return "CLOSED";
  if (["pagato","paid"].includes(s)) return "PAID";

  return s.toUpperCase();
}

function getOrderTimestamp(order) {
  const t = order.updatedAt || order.createdAt || order.timestamp;
  if (!t) return 0;

  const ts = new Date(t).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function minutesSince(ts) {
  if (!ts) return null;
  return Math.floor((Date.now() - ts) / 60000);
}

function readStoredAuth() {
  try {
    const raw = localStorage.getItem("rw_auth");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearStoredAuth() {
  localStorage.removeItem("rw_auth");
}

function formatMoney(v){
  const n = Number(v) || 0
  return "€ " + n.toFixed(2)
}

// =============================
// NAVIGAZIONE
// =============================

function setupSideNav(){

document.querySelectorAll(".side-nav-item").forEach(btn=>{
btn.addEventListener("click",()=>{
const link=btn.getAttribute("data-link")
openLink(link,true)
})
})

}

function setupModuleCards(){

document.querySelectorAll(".module-card").forEach(card=>{

card.addEventListener("click",()=>{
const link=card.getAttribute("data-link")
openLink(link,true)
})

card.setAttribute("tabindex","0")

})

}

// =============================
// API
// =============================

async function fetchOrders(){

try{

const res=await fetch("/api/orders",{credentials:"same-origin"})
if(!res.ok) throw new Error()

const data=await res.json()

return safeArray(data)

}catch{

return []

}

}

async function fetchDailySummary(){
  try {
    const res = await fetch("/api/reports/daily/summary", { credentials: "same-origin" });
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchDashboardSummary() {
  try {
    const res = await fetch("/api/reports/dashboard-summary", { credentials: "same-origin" });
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return null;
  }
}

// =============================
// KPI ORDINI
// =============================

function updateOrderKpi(orders){

const normalized = orders.map(o=>({
...o,
_status:normalizeStatus(o.status),
_ts:getOrderTimestamp(o)
}))

const activeOrders = normalized.filter(
o=>!["CLOSED","PAID","CANCELLED"].includes(o._status)
)

const tables = new Set(
activeOrders.map(o=>o.table)
)

const preparing = activeOrders.filter((o) => o._status === "PREPARING");
const ready = activeOrders.filter((o) => o._status === "READY");
const late = activeOrders.filter((o) => {
  const m = minutesSince(o._ts);
  return m !== null && m >= 15;
});

const setKpi = (id, val) => {
  const el = document.getElementById(id);
  if (el) el.textContent = String(val ?? 0);
};
setKpi("kpi-open", activeOrders.length);
setKpi("kpi-tables", tables.size);
setKpi("kpi-ready", ready.length);
setKpi("kpi-prep", preparing.length);
setKpi("kpi-late", late.length);
}

// =============================
// ULTIME COMANDE
// =============================

function renderLastOrders(orders){

const container=document.getElementById("last-orders-list")
if(!container) return

container.innerHTML=""

if(!orders.length){

container.innerHTML='<div class="placeholder">Nessuna comanda trovata</div>'
return

}

const sorted = orders
.map(o=>({...o,_ts:getOrderTimestamp(o)}))
.sort((a,b)=>b._ts-a._ts)
.slice(0,8)

sorted.forEach(order=>{

const div=document.createElement("div")
div.className="last-order-item"

const table=order.table ?? "-"
const status=normalizeStatus(order.status)

div.innerHTML=`
<div class="last-order-main">
<div class="last-order-title">
Tavolo ${table}
</div>
<div class="last-order-meta">
${status}
</div>
</div>
`

container.appendChild(div)

})

}

// =============================
// LOGIN / LOGOUT
// =============================

function updateAuthUI(){

const auth=readStoredAuth()

const name=document.getElementById("user-name-label")
const login=document.getElementById("btn-login")
const logout=document.getElementById("btn-logout")

if(!name || !login || !logout) return

if(auth && auth.user){

name.textContent=auth.user
logout.disabled=false

}else{

name.textContent="Ospite"
logout.disabled=true

}

}

function setupAuthButtons(){

const login=document.getElementById("btn-login")
const logout=document.getElementById("btn-logout")

if(login){

login.addEventListener("click",()=>{
openLink("/login/login.html",true)
})

}

if(logout){

logout.addEventListener("click",async ()=>{
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  } catch (_) {}
  clearStoredAuth()
  updateAuthUI()
  alert("Logout effettuato")
})

}

}

// =============================
// AI BUTTON
// =============================

async function askAI(question) {
  const q = String(question || "").trim();

  const url = q
    ? "/api/ai?q=" + encodeURIComponent(q)
    : "/api/ai";

  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) {
    throw new Error("Errore risposta AI");
  }

  return await res.json();
}

function ensureAIResponseBox() {
  let box = document.getElementById("ai-response");

  if (!box) {
    const aiCardBody = document.querySelector(".ai-body");
    if (!aiCardBody) return null;

    box = document.createElement("div");
    box.id = "ai-response";
    box.className = "last-order-item";
    box.style.marginTop = "6px";
    box.innerHTML = "AI pronta.";
    aiCardBody.appendChild(box);
  }

  return box;
}

function setupAI() {
  const btn = document.getElementById("ai-btn");
  const input = document.getElementById("ai-input");
  const responseBox = ensureAIResponseBox();

  if (!btn) return;

  btn.disabled = false;
  btn.textContent = "Chiedi AI";

  btn.addEventListener("click", async () => {
    if (!responseBox) return;

    const q = input ? input.value.trim() : "";

    responseBox.innerHTML = "Caricamento risposta AI...";

    try {
      const data = await askAI(q);

      const message =
        data?.message ||
        data?.answer ||
        data?.text ||
        JSON.stringify(data);

      responseBox.innerHTML = `
        <div class="last-order-main">
          <div class="last-order-title">AI Assist</div>
        </div>
        <div class="last-order-line">${message}</div>
      `;
    } catch (err) {
      responseBox.innerHTML = `
        <div class="last-order-main">
          <div class="last-order-title">AI Assist</div>
        </div>
        <div class="last-order-line">Errore nel caricamento risposta AI</div>
      `;
    }
  });
}

// =============================
// CASH STATUS + ALERTS
// =============================

function renderCashStatus(cash) {
  const el = document.getElementById("cash-status-value");
  if (!el) return;
  if (!cash) {
    el.textContent = "—";
    return;
  }
  if (cash.dayClosed) {
    el.textContent = "Giornata chiusa";
    return;
  }
  if (cash.hasOpenShift && cash.shift) {
    const s = cash.shift;
    const op = (s.operator || "").trim();
    const float = Number(s.opening_float) || 0;
    let txt = "Aperta";
    if (op) txt += ` • ${op}`;
    if (float > 0) txt += ` • Float € ${float.toFixed(2)}`;
    el.textContent = txt;
  } else {
    el.textContent = "Chiusa";
  }
}

function renderAlerts(alerts) {
  const list = document.getElementById("alerts-list");
  if (!list) return;
  list.innerHTML = "";
  if (!Array.isArray(alerts) || !alerts.length) {
    list.innerHTML = '<span class="placeholder">Nessun avviso</span>';
    return;
  }
  alerts.forEach((a) => {
    const span = document.createElement("span");
    span.className = "alert-badge " + (a.type || "info");
    span.textContent = a.message || "";
    list.appendChild(span);
  });
}

// =============================
// LOAD DASHBOARD
// =============================

async function loadDashboard() {
  const ordersList = document.getElementById("last-orders-list");
  if (ordersList) ordersList.innerHTML = '<div class="placeholder">Caricamento...</div>';

  const [orders, dashboard] = await Promise.all([
    fetchOrders(),
    fetchDashboardSummary(),
  ]);

  updateOrderKpi(orders);
  renderLastOrders(orders);

  const summary = dashboard?.kpi;
  const cash = dashboard?.cash;
  const alerts = dashboard?.alerts;

  if (summary) {
    const box = document.querySelector(".topbar-right");
    let el = document.getElementById("daily-summary");
    if (!el && box) {
      el = document.createElement("div");
      el.id = "daily-summary";
      el.className = "user-box";
      box.prepend(el);
    }
    if (el) {
      el.innerHTML = `
        <div class="user-info">
          <div class="user-label">Incasso</div>
          <div class="user-name">${formatMoney(summary.netRevenue)}</div>
        </div>
        <div class="user-info">
          <div class="user-label">Scontrino medio</div>
          <div class="user-name">${formatMoney(summary.averageReceipt)}</div>
        </div>
        <div class="user-info">
          <div class="user-label">Coperti</div>
          <div class="user-name">${summary.covers ?? 0}</div>
        </div>
      `;
    }
  }

  renderCashStatus(
    dashboard
      ? { ...(cash || {}), dayClosed: dashboard.dayClosed ?? false }
      : null
  );
  renderAlerts(alerts);

  updateAuthUI();
}

// =============================
// INIT
// =============================

document.addEventListener("DOMContentLoaded",()=>{

setupSideNav()
setupModuleCards()
setupAuthButtons()
setupAI()

window.addEventListener("rw:orders-update", () => loadDashboard());

window.addEventListener("rw:supervisor-sync", (e) => {
  const d = e.detail || {};
  const summary = document.getElementById("daily-summary");
  if (summary) {
    const infos = summary.querySelectorAll(".user-info");
    if (infos[0] && d.revenue != null) {
      const el = infos[0].querySelector(".user-name");
      if (el) el.textContent = formatMoney(d.revenue);
    }
    if (infos[1] && d.averageReceipt != null) {
      const el = infos[1].querySelector(".user-name");
      if (el) el.textContent = formatMoney(d.averageReceipt);
    }
    if (infos[2] && (d.covers != null || d.paymentCount != null)) {
      const el = infos[2].querySelector(".user-name");
      if (el) el.textContent = String(d.covers != null ? d.covers : d.paymentCount);
    }
  }
  const setKpi = (id, val) => {
    const el = document.getElementById(id);
    if (el && val != null) el.textContent = String(val);
  };
  setKpi("kpi-open", d.openOrdersCount);
  setKpi("kpi-tables", d.openTablesCount);
  setKpi("kpi-ready", d.readyOrdersCount);
  if (d.cashStatus) {
    renderCashStatus({ ...d.cashStatus, dayClosed: false });
  }
});

loadDashboard();

setInterval(loadDashboard, 20000);

})