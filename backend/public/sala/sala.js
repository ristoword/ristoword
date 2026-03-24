// =============================
//   STATO LOCALE
// =============================

let allOrders = [];
let activeFilters = {
  status: "",
  area: "",
  table: "",
};

let menuOfficial = [];
let selectedItems = [];

const LS_FLOOR = "rw_sala_floor_v1";
const LS_FLAGS = "rw_sala_table_flags_v1";
const LS_COURSES = "rw_sala_course_drafts_v1";

const DEFAULT_TABLE_COUNT = 30;

let floorTableNums = [];
let floorLayout = {};
let tableFlags = {};
let courseDrafts = {};

let activeTableContext = null;
let orderFlowMode = null;

let popupOpenTable = null;
let popupMoveTarget = null; /* quando impostato, mostra form "Sposta a tavolo" inline */
let dragState = null;
let suppressTableClick = false;

// =============================
//   LOCAL STORAGE — MAPPA / FLAGS / CORSI
// =============================

function loadFloorState() {
  try {
    const raw = localStorage.getItem(LS_FLOOR);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data.tableNums) && data.tableNums.length) {
        floorTableNums = data.tableNums.map(Number);
        floorLayout = data.layout && typeof data.layout === "object" ? data.layout : {};
        return;
      }
    }
  } catch (_) {}
  floorTableNums = Array.from({ length: DEFAULT_TABLE_COUNT }, (_, i) => i + 1);
  floorLayout = buildDefaultGridLayout(floorTableNums);
  saveFloorState();
}

function saveFloorState() {
  try {
    localStorage.setItem(
      LS_FLOOR,
      JSON.stringify({ tableNums: floorTableNums, layout: floorLayout })
    );
  } catch (_) {}
}

function buildDefaultGridLayout(nums) {
  const layout = {};
  const cols = 6;
  nums.forEach((num, idx) => {
    const row = Math.floor(idx / cols);
    const col = idx % cols;
    layout[String(num)] = {
      leftPct: 2 + (col * 96) / cols,
      topPct: 2 + (row * 18),
    };
  });
  return layout;
}

function loadFlags() {
  try {
    const raw = localStorage.getItem(LS_FLAGS);
    tableFlags = raw ? JSON.parse(raw) : {};
    if (!tableFlags || typeof tableFlags !== "object") tableFlags = {};
  } catch (_) {
    tableFlags = {};
  }
}

function saveFlags() {
  try {
    localStorage.setItem(LS_FLAGS, JSON.stringify(tableFlags));
  } catch (_) {}
}

function getFlags(tableNum) {
  const k = String(tableNum);
  return (
    tableFlags[k] || {
      reserved: false,
      billRequested: false,
      paid: false,
    }
  );
}

function setFlags(tableNum, patch) {
  const k = String(tableNum);
  tableFlags[k] = { ...getFlags(tableNum), ...patch };
  saveFlags();
}

function loadCourseDrafts() {
  try {
    const raw = localStorage.getItem(LS_COURSES);
    courseDrafts = raw ? JSON.parse(raw) : {};
    if (!courseDrafts || typeof courseDrafts !== "object") courseDrafts = {};
  } catch (_) {
    courseDrafts = {};
  }
}

function saveCourseDrafts() {
  try {
    localStorage.setItem(LS_COURSES, JSON.stringify(courseDrafts));
  } catch (_) {}
}

function ensureCourseDraft(tableNum) {
  const k = String(tableNum);
  if (!courseDrafts[k]) {
    courseDrafts[k] = { courses: [], activeCourseId: null };
  }
  return courseDrafts[k];
}

function newCourseId() {
  return "c_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

function courseStart(tableNum) {
  const d = ensureCourseDraft(tableNum);
  if (d.courses.length === 0) {
    const id = newCourseId();
    d.courses.push({ id, n: 1, items: [] });
    d.activeCourseId = id;
    saveCourseDrafts();
  } else if (!d.activeCourseId) {
    d.activeCourseId = d.courses[0].id;
    saveCourseDrafts();
  }
}

function courseAdd(tableNum) {
  const d = ensureCourseDraft(tableNum);
  const n = d.courses.length + 1;
  const id = newCourseId();
  d.courses.push({ id, n, items: [] });
  d.activeCourseId = id;
  saveCourseDrafts();
}

function setActiveCourse(tableNum, courseId) {
  const d = ensureCourseDraft(tableNum);
  if (d.courses.some((c) => c.id === courseId)) {
    d.activeCourseId = courseId;
    saveCourseDrafts();
  }
}

function getActiveCourse(tableNum) {
  const d = ensureCourseDraft(tableNum);
  const id = d.activeCourseId;
  return d.courses.find((c) => c.id === id) || d.courses[0] || null;
}

function pushItemToActiveCourse(tableNum, item) {
  const d = ensureCourseDraft(tableNum);
  if (!d.courses.length) {
    alert("Premi Start nel popup tavolo per creare il Corso 1.");
    return;
  }
  let c = getActiveCourse(tableNum);
  if (!c) {
    alert("Seleziona un corso nel popup o premi Start.");
    return;
  }
  const label = `Corso ${c.n}`;
  const row = {
    ...item,
    courseId: c.id,
    courseIndex: c.n,
    courseLabel: label,
  };
  c.items.push(row);
  saveCourseDrafts();
}

function removeLastFromActiveCourse(tableNum) {
  const d = ensureCourseDraft(tableNum);
  const c = getActiveCourse(tableNum);
  if (!c || !c.items.length) return false;
  c.items.pop();
  saveCourseDrafts();
  return true;
}

function flattenCourseItemsForApi(tableNum) {
  const d = ensureCourseDraft(tableNum);
  const out = [];
  for (const c of d.courses) {
    for (const it of c.items) {
      const courseNum = Number(c.n) >= 1 ? Number(c.n) : 1;
      const userNote = it.note && String(it.note).trim() ? String(it.note).trim() : null;
      out.push({
        name: it.name,
        qty: it.qty,
        category: it.category || null,
        area: it.area,
        price: it.price != null ? Number(it.price) : null,
        note: userNote,
        course: courseNum,
      });
    }
  }
  return out;
}

function clearCourseDraft(tableNum) {
  delete courseDrafts[String(tableNum)];
  saveCourseDrafts();
}

// =============================
//   UTILITÀ
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
  return Math.floor((now - d) / 60000);
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

function inferAreaFromCategory(cat) {
  const c = (cat || "").toLowerCase();
  if (c === "pizzeria") return "pizzeria";
  if (c === "bar" || c === "vini" || c === "dessert") return "bar";
  if (c === "ristorante" || c === "altro") return "cucina";
  return "cucina";
}

// =============================
//   API ORDINI
// =============================

async function apiGetOrders() {
  const res = await fetch("/api/orders?active=true", { credentials: "same-origin" });
  if (!res.ok) throw new Error("Errore caricamento ordini");
  return await res.json();
}

async function apiCreateOrder(payload) {
  const res = await fetch("/api/orders", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error("Errore creazione ordine: " + txt);
  }
  return await res.json();
}

async function apiPatchActiveCourse(orderId, activeCourse) {
  const res = await fetch(
    `/api/orders/${encodeURIComponent(orderId)}/active-course`,
    {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeCourse }),
    }
  );
  const contentType = res.headers.get("content-type") || "";
  let data;
  if (contentType.includes("application/json")) {
    data = await res.json();
  } else {
    data = { message: await res.text() };
  }
  if (!res.ok) {
    const msg =
      (data && typeof data.message === "string" && data.message) ||
      (data && typeof data.error === "string" && data.error !== "true" && data.error) ||
      "Errore aggiornamento marcia";
    throw new Error(msg);
  }
  return data;
}

function getPrimaryOpenOrderForTable(tableNum) {
  const t = Number(tableNum);
  const list = (allOrders || [])
    .filter(
      (o) =>
        Number(o.table) === t &&
        o.status !== "chiuso" &&
        o.status !== "annullato"
    )
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      /* Ordine più vecchio = comanda principale (marcia / corsi coerenti) */
      return ta - tb;
    });
  return list[0] || null;
}

/**
 * Dopo invio ordine la bozza locale è vuota o ha un solo corso:
 * ricostruisce corsi e voci dall'ordine sul server così popup / menù tornano allineati.
 */
function syncCourseDraftFromPrimaryOrder(tableNum) {
  const o = getPrimaryOpenOrderForTable(tableNum);
  if (!o || !Array.isArray(o.items) || o.items.length === 0) return;

  const byN = new Map();
  o.items.forEach((it) => {
    const n = Number(it.course) >= 1 ? Math.floor(Number(it.course)) : 1;
    if (!byN.has(n)) byN.set(n, []);
    byN.get(n).push({
      name: it.name,
      qty: it.qty,
      category: it.category || null,
      area: it.area,
      price: it.price != null ? Number(it.price) : null,
      note: it.note || null,
    });
  });
  const nums = [...byN.keys()].sort((a, b) => a - b);
  const d = ensureCourseDraft(tableNum);
  d.courses = nums.map((n) => ({
    id: `sync_${tableNum}_${n}`,
    n,
    items: byN.get(n),
  }));
  const ac = Number(o.activeCourse) >= 1 ? Math.floor(Number(o.activeCourse)) : 1;
  const match = d.courses.find((c) => c.n === ac);
  d.activeCourseId = match ? match.id : d.courses[0].id;
  saveCourseDrafts();
}

async function apiSetStatus(id, status) {
  const res = await fetch(`/api/orders/${id}/status`, {
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

// =============================
//   MENÙ
// =============================

async function loadOfficialMenu() {
  try {
    const res = await fetch("/api/menu/active", { credentials: "same-origin" });
    if (res.ok) {
      const arr = await res.json();
      menuOfficial = Array.isArray(arr) ? arr : [];
      if (menuOfficial.length) {
        try {
          localStorage.setItem("rw_menu_official", JSON.stringify(menuOfficial));
        } catch (_) {}
      }
      return;
    }
  } catch (apiErr) {
    console.warn("Menu API non disponibile, uso cache:", apiErr.message);
  }
  try {
    const raw = localStorage.getItem("rw_menu_official");
    if (raw) {
      menuOfficial = JSON.parse(raw);
      if (!Array.isArray(menuOfficial)) menuOfficial = [];
      return;
    }
  } catch (_) {}
  menuOfficial = [];
}

function getMenuByCategory(category) {
  if (!menuOfficial.length) return [];
  if (!category) return menuOfficial;
  const c = category.toLowerCase();
  return menuOfficial.filter((item) => {
    const cat = (item.category || item.type || "").toLowerCase();
    return cat === c;
  });
}

function populateMenuSelect() {
  const select = document.getElementById("menu-item");
  const categorySelect = document.getElementById("menu-category");
  if (!select || !categorySelect) return;

  const category = categorySelect.value;
  const items = getMenuByCategory(category);

  select.innerHTML = "";

  if (!items.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Menù non configurato o vuoto";
    select.appendChild(opt);
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Seleziona un piatto...";
  select.appendChild(placeholder);

  items.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = String(item.id ?? item.name);
    const price = item.price != null ? ` – € ${Number(item.price).toFixed(2)}` : "";
    opt.textContent = `${item.name}${price}`;
    opt.dataset.name = item.name;
    opt.dataset.category = item.category || item.type || "";
    opt.dataset.price = item.price != null ? String(item.price) : "";
    if (item.recipeId || item.recipe_id) {
      opt.dataset.recipeId = item.recipeId || item.recipe_id;
    }
    select.appendChild(opt);
  });
}

// =============================
//   ORDINI PER TAVOLO + COLORI
// =============================

function getOrdersForTable(tableNum) {
  const t = Number(tableNum);
  return (allOrders || []).filter(
    (o) =>
      Number(o.table) === t &&
      o.status !== "chiuso" &&
      o.status !== "annullato"
  );
}

function computeTableStateClass(tableNum) {
  const f = getFlags(tableNum);
  const orders = getOrdersForTable(tableNum);

  if (f.paid) return { cls: "tbl-paid", label: "Pagato / chiudi" };
  if (f.billRequested) return { cls: "tbl-bill", label: "Conto richiesto" };

  if (orders.length) {
    if (orders.some((o) => o.status === "pronto")) {
      return { cls: "tbl-ready", label: "Pronto in sala" };
    }
    if (orders.some((o) => o.status === "in_preparazione")) {
      return { cls: "tbl-work", label: "In lavorazione" };
    }
    if (orders.some((o) => o.status === "servito")) {
      return { cls: "tbl-served", label: "In servizio" };
    }
    return { cls: "tbl-open", label: "Aperto" };
  }

  if (f.reserved) return { cls: "tbl-reserved", label: "Riservato" };
  return { cls: "tbl-free", label: "Libero" };
}

// =============================
//   MAPPA TAVOLI
// =============================

function renderFloorMap() {
  const floor = document.getElementById("sala-floor");
  if (!floor) return;

  floor.innerHTML = "";
  floorTableNums.forEach((num) => {
    const pos = floorLayout[String(num)] || { leftPct: 2, topPct: 2 };
    const { cls, label } = computeTableStateClass(num);

    const node = document.createElement("div");
    node.className = `sala-table-node ${cls}`;
    node.dataset.table = String(num);
    node.style.left = `${pos.leftPct}%`;
    node.style.top = `${pos.topPct}%`;

    node.innerHTML = `
      <span class="sala-table-num">${num}</span>
      <span class="sala-table-label">${label}</span>
    `;

    node.addEventListener("click", (e) => {
      if (suppressTableClick) return;
      e.stopPropagation();
      openTablePopup(num);
    });

    setupTableDrag(node, num, floor);
    floor.appendChild(node);
  });
}

function setupTableDrag(node, tableNum, floorEl) {
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let moved = false;

  const onDown = (clientX, clientY) => {
    const rect = floorEl.getBoundingClientRect();
    const pos = floorLayout[String(tableNum)] || { leftPct: 0, topPct: 0 };
    startLeft = (pos.leftPct / 100) * rect.width;
    startTop = (pos.topPct / 100) * rect.height;
    startX = clientX;
    startY = clientY;
    moved = false;
    node.classList.add("dragging");
    dragState = { tableNum, floorEl, node };
  };

  const onMove = (clientX, clientY) => {
    if (!dragState || dragState.tableNum !== tableNum) return;
    const rect = floorEl.getBoundingClientRect();
    const dx = clientX - startX;
    const dy = clientY - startY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;

    let nl = startLeft + dx;
    let nt = startTop + dy;
    const nw = node.offsetWidth;
    const nh = node.offsetHeight;
    nl = Math.max(0, Math.min(nl, rect.width - nw));
    nt = Math.max(0, Math.min(nt, rect.height - nh));

    const leftPct = (nl / rect.width) * 100;
    const topPct = (nt / rect.height) * 100;
    node.style.left = `${leftPct}%`;
    node.style.top = `${topPct}%`;
    floorLayout[String(tableNum)] = { leftPct, topPct };
  };

  const onUp = () => {
    if (dragState && dragState.tableNum === tableNum) {
      if (moved) {
        suppressTableClick = true;
        setTimeout(() => {
          suppressTableClick = false;
        }, 80);
        saveFloorState();
      }
      node.classList.remove("dragging");
      dragState = null;
    }
    window.removeEventListener("mousemove", onWinMove);
    window.removeEventListener("mouseup", onWinUp);
    window.removeEventListener("touchmove", onWinTouchMove);
    window.removeEventListener("touchend", onWinUp);
  };

  function onWinMove(ev) {
    onMove(ev.clientX, ev.clientY);
  }
  function onWinTouchMove(ev) {
    if (ev.touches.length) onMove(ev.touches[0].clientX, ev.touches[0].clientY);
  }
  function onWinUp() {
    onUp();
  }

  node.addEventListener("mousedown", (e) => {
    e.preventDefault();
    onDown(e.clientX, e.clientY);
    window.addEventListener("mousemove", onWinMove);
    window.addEventListener("mouseup", onWinUp);
  });

  node.addEventListener(
    "touchstart",
    (e) => {
      if (!e.touches.length) return;
      onDown(e.touches[0].clientX, e.touches[0].clientY);
      window.addEventListener("touchmove", onWinTouchMove, { passive: false });
      window.addEventListener("touchend", onWinUp);
    },
    { passive: true }
  );
}

// =============================
//   POPUP TAVOLO
// =============================

function closeTablePopup() {
  popupOpenTable = null;
  popupMoveTarget = null;
  const back = document.getElementById("sala-popup-backdrop");
  const pop = document.getElementById("sala-popup");
  if (back) {
    back.classList.remove("open");
    back.setAttribute("aria-hidden", "true");
  }
  if (pop) {
    pop.classList.remove("open");
    pop.setAttribute("aria-hidden", "true");
  }
}

function openTablePopup(tableNum) {
  popupOpenTable = tableNum;
  const back = document.getElementById("sala-popup-backdrop");
  const pop = document.getElementById("sala-popup");
  const title = document.getElementById("sala-popup-title");
  const body = document.getElementById("sala-popup-body");

  if (!back || !pop || !title || !body) return;

  title.textContent = `Tavolo ${tableNum}`;
  const orders = getOrdersForTable(tableNum);
  const hasOrders = orders.length > 0;
  const f = getFlags(tableNum);

  if (hasOrders) {
    syncCourseDraftFromPrimaryOrder(tableNum);
  }

  if (popupMoveTarget === tableNum) {
    body.innerHTML = buildPopupMoveTableForm(tableNum);
  } else if (!hasOrders && !f.reserved) {
    body.innerHTML = buildPopupFree(tableNum);
  } else if (!hasOrders && f.reserved) {
    body.innerHTML = buildPopupReservedFree(tableNum);
  } else {
    body.innerHTML = buildPopupOccupied(tableNum);
  }

  back.classList.add("open");
  back.setAttribute("aria-hidden", "false");
  pop.classList.add("open");
  pop.setAttribute("aria-hidden", "false");

  /* Allinea pannello sinistro (piatti per corso) dopo sync da server */
  renderSelectedItems();
}

function initPopupUiOnce() {
  document.getElementById("sala-popup-close")?.addEventListener("click", closeTablePopup);
  document.getElementById("sala-popup-backdrop")?.addEventListener("click", closeTablePopup);

  document.getElementById("sala-popup")?.addEventListener("click", async (e) => {
    const tableNum = popupOpenTable;
    if (!tableNum) return;

    if (e.target.id === "btn-course-start") {
      const d = ensureCourseDraft(tableNum);
      if (d.courses.length === 0) {
        const id = newCourseId();
        d.courses.push({ id, n: 1, items: [] });
        d.activeCourseId = id;
      } else if (!d.activeCourseId) {
        d.activeCourseId = d.courses[0].id;
      }
      saveCourseDrafts();
      openTablePopup(tableNum);
      return;
    }
    if (e.target.id === "btn-course-add") {
      courseAdd(tableNum);
      openTablePopup(tableNum);
      return;
    }

    const head = e.target.closest("[data-select-course]");
    if (head) {
      const id = head.getAttribute("data-select-course");
      setActiveCourse(tableNum, id);
      openTablePopup(tableNum);
      return;
    }

    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.getAttribute("data-act");
    const orders = getOrdersForTable(tableNum);

    if (act === "open-table") {
      document.getElementById("field-table").value = String(tableNum);
      activeTableContext = tableNum;
      orderFlowMode = "food";
      setFlags(tableNum, { reserved: false });
      courseStart(tableNum);
      closeTablePopup();
      document.getElementById("field-covers")?.focus();
      renderFloorMap();
      renderSelectedItems();
      return;
    }
    if (act === "reserve") {
      setFlags(tableNum, { reserved: true });
      closeTablePopup();
      renderFloorMap();
      return;
    }
    if (act === "unreserve") {
      setFlags(tableNum, { reserved: false });
      closeTablePopup();
      renderFloorMap();
      return;
    }

    if (act === "order-food") {
      activeTableContext = tableNum;
      orderFlowMode = "food";
      document.getElementById("field-table").value = String(tableNum);
      document.getElementById("field-area").value = "cucina";
      closeTablePopup();
      document.getElementById("field-covers")?.focus();
      return;
    }
    if (act === "order-bar") {
      activeTableContext = tableNum;
      orderFlowMode = "bar";
      document.getElementById("field-table").value = String(tableNum);
      document.getElementById("field-area").value = "bar";
      closeTablePopup();
      const mc = document.getElementById("menu-category");
      if (mc) {
        mc.value = "bar";
        populateMenuSelect();
      }
      return;
    }
    if (act === "next-course") {
      const o = getPrimaryOpenOrderForTable(tableNum);
      if (!o) {
        alert("Nessun ordine aperto per questo tavolo.");
        return;
      }
      const cur = Number(o.activeCourse) >= 1 ? Number(o.activeCourse) : 1;
      const next = cur + 1;
      try {
        await apiPatchActiveCourse(o.id, next);
        await loadOrdersAndRender();
        openTablePopup(tableNum);
      } catch (err) {
        alert(err.message || "Errore aggiornamento marcia");
      }
      return;
    }
    if (act === "remove-last") {
      if (removeLastFromActiveCourse(tableNum)) openTablePopup(tableNum);
      else alert("Nessun articolo da rimuovere nel corso attivo.");
      return;
    }
    if (act === "move-table") {
      popupMoveTarget = tableNum;
      openTablePopup(tableNum);
      setTimeout(() => document.getElementById("sala-move-dest")?.focus(), 80);
      return;
    }
    if (act === "move-confirm") {
      const input = document.getElementById("sala-move-dest");
      const dest = input?.value?.trim();
      if (!dest) {
        alert("Inserisci il numero del tavolo di destinazione.");
        return;
      }
      const n = Number(dest);
      if (!Number.isFinite(n) || n <= 0) {
        alert("Numero non valido.");
        return;
      }
      if (n === tableNum) {
        alert("Il tavolo di destinazione deve essere diverso.");
        return;
      }
      moveTableLocalState(tableNum, n);
      document.getElementById("field-table").value = String(n);
      activeTableContext = n;
      popupMoveTarget = null;
      closeTablePopup();
      renderFloorMap();
      alert(
        "Stato locale (corsi e flags) spostato al tavolo " + n + ". Gli ordini già inviati restano sul tavolo originale."
      );
      return;
    }
    if (act === "move-cancel") {
      popupMoveTarget = null;
      openTablePopup(tableNum);
      return;
    }
    if (act === "ask-bill") {
      setFlags(tableNum, { billRequested: true, paid: false });
      closeTablePopup();
      renderFloorMap();
      return;
    }
    if (act === "paid") {
      setFlags(tableNum, { paid: true, billRequested: false });
      closeTablePopup();
      renderFloorMap();
      return;
    }
    if (act === "close-table") {
      if (!confirm("Chiudere tutti gli ordini di questo tavolo?")) return;
      try {
        for (const o of orders) {
          await apiSetStatus(o.id, "chiuso");
        }
        setFlags(tableNum, { paid: false, billRequested: false, reserved: false });
        clearCourseDraft(tableNum);
        await loadOrdersAndRender();
        closeTablePopup();
        renderFloorMap();
      } catch (err) {
        alert(err.message || "Errore chiusura");
      }
      return;
    }
    if (act === "view-order") {
      const el = document.getElementById("sala-view-order");
      if (!el) return;
      const lines = [];
      for (const o of orders) {
        lines.push(`Ordine ${o.id} — ${statusLabel(o.status)}`);
        if (o.items && o.items.length) {
          o.items.forEach((i) => {
            lines.push(`  • ${i.name} x${i.qty}${i.note ? " — " + i.note : ""}`);
          });
        }
      }
      const d = ensureCourseDraft(tableNum);
      lines.push("", "--- Bozza corsi (locale) ---");
      d.courses.forEach((c) => {
        lines.push(`Corso ${c.n}:`);
        c.items.forEach((it) => lines.push(`  • ${it.name} x${it.qty}`));
      });
      el.textContent = lines.join("\n");
      el.style.display = el.style.display === "none" ? "block" : "none";
    }
  });
}

/** Blocco Start/Aggiungi corsi + elenco (stesso per tavolo libero o con comanda). */
function buildPopupCoursesBlockHtml(tableNum) {
  const d = ensureCourseDraft(tableNum);
  courseStart(tableNum);

  const courseRows = d.courses
    .map((c) => {
      const active = c.id === d.activeCourseId;
      const rowCls = active ? "active" : "future";
      const itCount = c.items.length;
      return `
      <div class="sala-course-row ${rowCls}" data-course-id="${c.id}">
        <div class="sala-course-head" data-select-course="${c.id}" role="button" tabindex="0">
          <span>Corso ${c.n}</span>
          <span>${itCount} voci</span>
        </div>
        <div class="sala-course-body">
          ${
            c.items.length
              ? c.items
                  .map(
                    (it) =>
                      `• ${escapeHtml(it.name)} x${it.qty}${it.area ? " (" + it.area + ")" : ""}`
                  )
                  .join("<br>")
              : "(vuoto)"
          }
        </div>
      </div>`;
    })
    .join("");

  return `
    <div class="sala-courses-block">
      <div class="sala-courses-actions">
        <button type="button" id="btn-course-start">Start</button>
        <button type="button" id="btn-course-add">Aggiungi</button>
      </div>
      <div id="sala-courses-list">${courseRows || "<p>Nessun corso — premi Start</p>"}</div>
    </div>
  `;
}

function buildPopupMoveTableForm(tableNum) {
  return `
    <p class="sala-popup-hint">Sposta contenuto e stato del tavolo ${tableNum} a un altro numero.</p>
    <div class="sala-move-form">
      <label>
        Nuovo numero tavolo
        <input type="number" id="sala-move-dest" min="1" placeholder="Es. 7" />
      </label>
      <div class="sala-popup-actions">
        <button type="button" class="sala-popup-btn" data-act="move-confirm">Conferma spostamento</button>
        <button type="button" class="sala-popup-btn ghost" data-act="move-cancel">Annulla</button>
      </div>
    </div>
  `;
}

function buildPopupFree(tableNum) {
  return `
    <p class="sala-popup-hint">Tavolo libero.</p>
    <div class="sala-popup-actions">
      <button type="button" class="sala-popup-btn" data-act="open-table">Apri tavolo</button>
      <button type="button" class="sala-popup-btn" data-act="reserve">Riserva tavolo</button>
    </div>
    <p class="sala-popup-hint" style="margin-top:12px;margin-bottom:6px;font-size:13px;">Corsi — Start per il primo, Aggiungi per i successivi</p>
    ${buildPopupCoursesBlockHtml(tableNum)}
  `;
}

function buildPopupReservedFree(tableNum) {
  return `
    <p class="sala-popup-hint">Tavolo riservato — nessun ordine ancora.</p>
    <div class="sala-popup-actions">
      <button type="button" class="sala-popup-btn" data-act="open-table">Apri tavolo</button>
      <button type="button" class="sala-popup-btn" data-act="unreserve">Rimuovi riserva</button>
    </div>
    <p class="sala-popup-hint" style="margin-top:12px;margin-bottom:6px;font-size:13px;">Corsi — Start per il primo, Aggiungi per i successivi</p>
    ${buildPopupCoursesBlockHtml(tableNum)}
  `;
}

function buildPopupOccupied(tableNum) {
  const po = getPrimaryOpenOrderForTable(tableNum);
  const ac =
    po && Number(po.activeCourse) >= 1 ? Math.floor(Number(po.activeCourse)) : 1;
  const maxC = (() => {
    let m = 1;
    if (po && Array.isArray(po.items)) {
      po.items.forEach((it) => {
        const n = Number(it.course) >= 1 ? Math.floor(Number(it.course)) : 1;
        if (n > m) m = n;
      });
    }
    return m;
  })();
  return `
    <p class="sala-popup-hint">Comanda attiva — <strong>Marca corso (server): ${ac}</strong>${maxC > 1 ? ` / fino a corso ${maxC}` : ""}. Il corso attivo è evidenziato sotto; usa <strong>Marcia prossima portata</strong> per il corso successivo.</p>
    <div class="sala-popup-actions">
      <button type="button" class="sala-popup-btn food" data-act="order-food">Prendi ordine (cucina / food)</button>
      <button type="button" class="sala-popup-btn bar" data-act="order-bar">Aggiungi bevande (bar)</button>
      <button type="button" class="sala-popup-btn" data-act="next-course">Marcia prossima portata</button>
      <button type="button" class="sala-popup-btn" data-act="remove-last">Cancella ultimo articolo (corso attivo)</button>
      <button type="button" class="sala-popup-btn" data-act="move-table">Sposta tavolo</button>
      <button type="button" class="sala-popup-btn" data-act="reserve">Riserva / aggiorna riserva</button>
      <button type="button" class="sala-popup-btn" data-act="ask-bill">Chiedi conto</button>
      <button type="button" class="sala-popup-btn" data-act="paid">Conto incassato</button>
      <button type="button" class="sala-popup-btn danger" data-act="close-table">Chiudi tavolo (ordini)</button>
      <button type="button" class="sala-popup-btn" data-act="view-order">Vedi ordine completo</button>
    </div>
    ${buildPopupCoursesBlockHtml(tableNum)}
    <div id="sala-view-order" class="sala-order-preview" style="display:none;margin-top:12px;"></div>
  `;
}

function moveTableLocalState(fromNum, toNum) {
  const fs = String(fromNum);
  const ts = String(toNum);

  if (courseDrafts[fs]) {
    courseDrafts[ts] = courseDrafts[fs];
    delete courseDrafts[fs];
    saveCourseDrafts();
  }
  if (tableFlags[fs]) {
    tableFlags[ts] = tableFlags[fs];
    delete tableFlags[fs];
    saveFlags();
  }
  if (floorLayout[fs]) {
    floorLayout[ts] = floorLayout[fs];
    delete floorLayout[fs];
    saveFloorState();
  }
}

// =============================
//   PIATTI — verso CORSO ATTIVO
// =============================

function effectiveTableForItems() {
  if (activeTableContext != null) return activeTableContext;
  const v = document.getElementById("field-table")?.value;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function renderSelectedItems() {
  const box = document.getElementById("selected-items");
  if (!box) return;

  const tableNum = effectiveTableForItems();
  if (tableNum == null) {
    box.innerHTML = `<div class="order-meta">Imposta il tavolo o apri un tavolo dalla mappa.</div>`;
    return;
  }

  ensureCourseDraft(tableNum);
  const d = ensureCourseDraft(tableNum);

  if (!d.courses.length) {
    box.innerHTML = `<div class="order-meta">Nessun corso — dal popup tavolo premi <strong>Start</strong> o aggiungi piatti dopo aver premuto Start.</div>`;
    return;
  }

  box.innerHTML = "";
  d.courses.forEach((c) => {
    const isActive = c.id === d.activeCourseId;
    const block = document.createElement("div");
    block.className = "selected-course-block";
    const title = document.createElement("div");
    title.className = "selected-course-title";
    title.textContent = `Corso ${c.n}${isActive ? " (attivo)" : ""}`;
    block.appendChild(title);

    if (!c.items.length) {
      const empty = document.createElement("div");
      empty.className = "order-meta";
      empty.textContent = "(nessun piatto)";
      block.appendChild(empty);
    } else {
      c.items.forEach((item, idx) => {
        const row = document.createElement("div");
        row.className = "selected-item-row";
        row.innerHTML = `<span>${escapeHtml(item.name)} x${item.qty} • ${item.area || ""}</span>`;
        const rm = document.createElement("button");
        rm.className = "btn-xs danger";
        rm.textContent = "Rimuovi";
        rm.addEventListener("click", () => {
          c.items.splice(idx, 1);
          saveCourseDrafts();
          renderSelectedItems();
        });
        row.appendChild(rm);
        block.appendChild(row);
      });
    }
    box.appendChild(block);
  });
}

function setupAddFromMenu() {
  const btn = document.getElementById("btn-add-from-menu");
  const categorySelect = document.getElementById("menu-category");
  const itemSelect = document.getElementById("menu-item");
  const qtyInput = document.getElementById("menu-qty");

  if (!btn || !categorySelect || !itemSelect || !qtyInput) return;

  categorySelect.addEventListener("change", () => {
    populateMenuSelect();
  });

  btn.addEventListener("click", () => {
    const tableNum = effectiveTableForItems();
    if (tableNum == null) {
      alert("Seleziona o apri un tavolo dalla mappa.");
      return;
    }

    const d = ensureCourseDraft(tableNum);
    if (!d.courses.length) {
      alert("Premi Start nel popup tavolo per creare il Corso 1.");
      return;
    }
    if (!d.activeCourseId && d.courses.length) {
      d.activeCourseId = d.courses[0].id;
      saveCourseDrafts();
    }

    const selectedOption = itemSelect.options[itemSelect.selectedIndex];
    if (!selectedOption || !selectedOption.value) return;

    const qty = Number(qtyInput.value) || 1;
    const name = selectedOption.dataset.name || selectedOption.textContent;
    const cat = selectedOption.dataset.category || "";
    const priceStr = selectedOption.dataset.price;
    const price = priceStr ? Number(priceStr) : null;
    let area = inferAreaFromCategory(cat);
    if (orderFlowMode === "bar") area = "bar";
    if (orderFlowMode === "food") area = area === "bar" ? "cucina" : area;

    const item = {
      source: "menu",
      menuId: selectedOption.value,
      name,
      qty,
      category: cat,
      area,
      price,
      recipeId: selectedOption.dataset.recipeId || null,
      note: "",
    };

    pushItemToActiveCourse(tableNum, item);
    renderSelectedItems();
  });
}

function setupAddCustom() {
  const btn = document.getElementById("btn-add-custom");
  const nameInput = document.getElementById("custom-name");
  const qtyInput = document.getElementById("custom-qty");
  const notesInput = document.getElementById("custom-notes");
  const areaSelect = document.getElementById("custom-area");

  if (!btn || !nameInput || !qtyInput || !notesInput || !areaSelect) return;

  btn.addEventListener("click", () => {
    const tableNum = effectiveTableForItems();
    if (tableNum == null) {
      alert("Seleziona o apri un tavolo dalla mappa.");
      return;
    }

    const d = ensureCourseDraft(tableNum);
    if (!d.courses.length) {
      alert("Premi Start nel popup tavolo per creare il Corso 1.");
      return;
    }

    const name = nameInput.value.trim();
    if (!name) return;

    const qty = Number(qtyInput.value) || 1;
    const note = notesInput.value.trim();
    const customArea = areaSelect.value;
    const orderArea = document.getElementById("field-area").value || "cucina";
    let area = customArea || orderArea;
    if (orderFlowMode === "bar") area = "bar";

    pushItemToActiveCourse(tableNum, {
      source: "custom",
      name,
      qty,
      category: "fuori_menu",
      area,
      price: null,
      note,
    });

    nameInput.value = "";
    qtyInput.value = "1";
    notesInput.value = "";
    areaSelect.value = "";
    renderSelectedItems();
  });
}

// =============================
//   FILTRI E KPI
// =============================

function applyFilters(orders) {
  let filtered = [...orders];
  if (activeFilters.status) {
    filtered = filtered.filter((o) => o.status === activeFilters.status);
  }
  if (activeFilters.area) {
    filtered = filtered.filter((o) => o.area === activeFilters.area);
  }
  if (activeFilters.table) {
    const t = Number(activeFilters.table);
    filtered = filtered.filter((o) => Number(o.table) === t);
  }
  return filtered;
}

function renderKpi(orders) {
  const active = orders.filter(
    (o) => o.status !== "chiuso" && o.status !== "annullato"
  );
  const awaitingBill = orders.filter((o) => o.status === "servito");

  const tablesSet = new Set(
    active
      .map((o) => o.table)
      .filter((t) => t !== undefined && t !== null && t !== "")
  );

  const el1 = document.getElementById("kpi-tables");
  const el2 = document.getElementById("kpi-open-orders");
  const el3 = document.getElementById("kpi-awaiting-bill");
  if (el1) el1.textContent = tablesSet.size || "0";
  if (el2) el2.textContent = active.length || "0";
  if (el3) el3.textContent = awaitingBill.length || "0";
}

function renderOrdersList() {
  /* Lista ordini centrale rimossa: filtri restano per uso futuro */
}

// =============================
//   CARICAMENTO ORDINI
// =============================

async function loadOrdersAndRender() {
  try {
    const orders = await apiGetOrders();
    allOrders = orders || [];
    renderKpi(allOrders);
    renderFloorMap();
    renderOrdersList();
  } catch (err) {
    console.error(err);
    alert("Errore caricamento ordini dalla sala.");
  }
}

// =============================
//   CREAZIONE ORDINE
// =============================

async function handleCreateOrder() {
  const tableVal = document.getElementById("field-table").value.trim();
  const coversVal = document.getElementById("field-covers").value.trim();
  const area = document.getElementById("field-area").value;
  const waiter = document.getElementById("field-waiter").value.trim();
  const notes = document.getElementById("field-notes").value.trim();

  const tableNum = Number(tableVal);
  const coversNum = Number(coversVal);

  if (!Number.isFinite(tableNum) || tableNum <= 0) {
    alert("Inserisci un numero di tavolo valido.");
    return;
  }
  if (!Number.isFinite(coversNum) || coversNum <= 0) {
    alert("Inserisci un numero di coperti valido.");
    return;
  }
  if (!waiter) {
    alert("Inserisci il nome del cameriere.");
    return;
  }

  const itemsPayload = flattenCourseItemsForApi(tableNum);
  if (!itemsPayload.length) {
    const ok = confirm(
      "Nessun piatto nei corsi per questo tavolo. Creare comunque l'ordine vuoto?"
    );
    if (!ok) return;
  }

  const ac = getActiveCourse(tableNum);
  const activeCourseNum = ac && Number(ac.n) >= 1 ? Number(ac.n) : 1;

  const payload = {
    table: tableNum,
    covers: coversNum,
    area,
    waiter,
    notes,
    activeCourse: activeCourseNum,
    items: itemsPayload,
  };

  try {
    const order = await apiCreateOrder(payload);

    document.getElementById("field-covers").value = "";
    document.getElementById("field-waiter").value = "";
    document.getElementById("field-notes").value = "";

    clearCourseDraft(tableNum);
    orderFlowMode = null;
    renderSelectedItems();

    if (order && order._printJobs && order._printJobs.length > 0) {
      const withWarning = order._printJobs.filter((p) => p.warning);
      const routed = order._printJobs.filter((p) => p.routed);
      if (withWarning.length > 0) {
        console.warn(
          "Print routing:",
          withWarning.map((p) => p.warning).join("; ")
        );
      }
      if (routed.length > 0) {
        routed.forEach((p) => {
          if (p.jobId) {
            const w = window.open(
              `/api/print-jobs/${p.jobId}/print`,
              "_blank",
              "width=400,height=500"
            );
            if (w) setTimeout(() => w.print(), 600);
          }
        });
      } else if (order._printJobs.some((p) => p.jobId)) {
        order._printJobs.forEach((p) => {
          if (p.jobId) {
            window.open(
              `/api/print-jobs/${p.jobId}/print`,
              "_blank",
              "width=400,height=500"
            );
          }
        });
      }
    }

    await loadOrdersAndRender();
  } catch (err) {
    console.error(err);
    alert("Errore nella creazione dell'ordine.");
  }
}

// =============================
//   FILTRI
// =============================

function setupFilters() {
  const statusSel = document.getElementById("filter-status");
  const areaSel = document.getElementById("filter-area");
  const tableInput = document.getElementById("filter-table");
  const resetBtn = document.getElementById("btn-reset-filters");

  statusSel.addEventListener("change", () => {
    activeFilters.status = statusSel.value;
    renderOrdersList();
  });

  areaSel.addEventListener("change", () => {
    activeFilters.area = areaSel.value;
    renderOrdersList();
  });

  tableInput.addEventListener("input", () => {
    activeFilters.table = tableInput.value.trim();
    renderOrdersList();
  });

  resetBtn.addEventListener("click", () => {
    activeFilters = { status: "", area: "", table: "" };
    statusSel.value = "";
    areaSel.value = "";
    tableInput.value = "";
    renderOrdersList();
  });
}

// =============================
//   TOOLBAR MAPPA
// =============================

function setupFloorToolbar() {
  document.getElementById("btn-floor-add-table")?.addEventListener("click", () => {
    const next = floorTableNums.length ? Math.max(...floorTableNums) + 1 : 1;
    floorTableNums.push(next);
    const idx = floorTableNums.length - 1;
    const cols = 6;
    const row = Math.floor(idx / cols);
    const col = idx % cols;
    floorLayout[String(next)] = {
      leftPct: 2 + (col * 96) / cols,
      topPct: 2 + (row * 16),
    };
    saveFloorState();
    renderFloorMap();
  });

  document.getElementById("btn-floor-remove-table")?.addEventListener("click", () => {
    if (floorTableNums.length <= 1) {
      alert("Serve almeno un tavolo.");
      return;
    }
    const removed = floorTableNums.pop();
    delete floorLayout[String(removed)];
    saveFloorState();
    renderFloorMap();
  });

  document.getElementById("btn-floor-reset-layout")?.addEventListener("click", () => {
    if (!confirm("Riposizionare tutti i tavoli in griglia (solo layout locale)?")) return;
    floorLayout = buildDefaultGridLayout(floorTableNums);
    saveFloorState();
    renderFloorMap();
  });
}

// =============================
//   INIT
// =============================

function initStaffAccess() {
  if (!window.RW_StaffAccess) return;
  RW_StaffAccess.init({ module: "sala", department: "sala" });

  function refreshStaffUI() {
    const sess = RW_StaffAccess.getCurrentSession();
    const mgrVal = document.getElementById("rw-manager-value");
    const btnLogin = document.getElementById("rw-btn-manager-login");
    const btnLogout = document.getElementById("rw-btn-manager-logout");
    if (mgrVal) mgrVal.textContent = sess ? sess.name : "—";
    if (btnLogin) btnLogin.style.display = sess ? "none" : "";
    if (btnLogout) btnLogout.style.display = sess ? "" : "none";
    const chip = document.getElementById("rw-sala-manager-chip");
    if (chip) chip.classList.toggle("logged-in", !!sess);
    RW_StaffAccess.renderActiveStaff("rw-sala-active-staff", "sala");
  }

  document.getElementById("rw-btn-manager-login")?.addEventListener("click", () => {
    RW_StaffAccess.showManagerLoginModal(refreshStaffUI, "sala_manager");
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

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

document.addEventListener("DOMContentLoaded", async () => {
  loadFloorState();
  loadFlags();
  loadCourseDrafts();

  initPopupUiOnce();

  await loadOfficialMenu();
  populateMenuSelect();

  renderSelectedItems();
  setupAddFromMenu();
  setupAddCustom();

  document.getElementById("field-table")?.addEventListener("input", () => {
    renderSelectedItems();
  });

  document
    .getElementById("btn-create-order")
    .addEventListener("click", handleCreateOrder);

  document
    .getElementById("btn-refresh")
    .addEventListener("click", loadOrdersAndRender);

  window.addEventListener("rw:orders-update", (ev) => {
    if (ev.detail?.orders) {
      allOrders = ev.detail.orders;
      renderKpi(allOrders);
      renderFloorMap();
      renderOrdersList();
    }
  });

  setupFilters();
  setupFloorToolbar();
  initStaffAccess();

  renderFloorMap();
  loadOrdersAndRender();

  setInterval(loadOrdersAndRender, 15000);

  loadDailyMenuSala();
});

async function loadDailyMenuSala() {
  const container = document.getElementById("daily-menu-sala-content");
  if (!container) return;
  try {
    const res = await fetch("/api/daily-menu/active", { credentials: "same-origin" });
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (!data.menuActive || !data.dishes || data.dishes.length === 0) {
      container.innerHTML =
        '<div class="daily-menu-empty">Menu del giorno non attivo o vuoto.</div>';
      return;
    }
    const byCat = {};
    data.dishes.forEach((d) => {
      const c = d.category || "extra";
      if (!byCat[c]) byCat[c] = [];
      byCat[c].push(d);
    });
    const labels = {
      antipasto: "Antipasto",
      primo: "Primo",
      secondo: "Secondo",
      contorno: "Contorno",
      dolce: "Dolce",
      bevanda: "Bevanda",
      extra: "Extra",
    };
    const order = [
      "antipasto",
      "primo",
      "secondo",
      "contorno",
      "dolce",
      "bevanda",
      "extra",
    ];
    let html = "";
    order.forEach((cat) => {
      const list = byCat[cat] || [];
      if (list.length === 0) return;
      html +=
        '<div class="daily-cat"><div class="daily-cat-title">' +
        (labels[cat] || cat) +
        "</div>";
      list.forEach((d) => {
        const price = "€ " + (Number(d.price) || 0).toFixed(2);
        html +=
          '<div class="daily-dish-row"><span>' +
          escapeHtml(d.name) +
          "</span><span class='price'>" +
          price +
          "</span></div>";
      });
      html += "</div>";
    });
    container.innerHTML =
      html || '<div class="daily-menu-empty">Nessun piatto attivo.</div>';
  } catch (_) {
    container.innerHTML =
      '<div class="daily-menu-empty">Menu del giorno non disponibile.</div>';
  }
}
