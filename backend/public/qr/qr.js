// QR Table Ordering – Integrates with existing /api/orders and /api/menu

(function () {
  const MENU_API = "/api/menu/active";
  const ORDERS_API = "/api/qr/orders";

  function getTableFromPath() {
    const m = window.location.pathname.match(/\/qr\/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  function inferArea(category) {
    const c = (category || "").toLowerCase();
    if (c.includes("pizz") || c === "pizze") return "pizzeria";
    if (["bar", "vini", "bevande", "dessert"].includes(c)) return "bar";
    return "cucina";
  }

  let menuItems = [];
  let cart = [];
  let tableNum = getTableFromPath();

  const $ = (id) => document.getElementById(id);

  function showToast(msg, type = "success") {
    const el = $("qr-toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "qr-toast " + type + " show";
    setTimeout(() => el.classList.remove("show"), 3000);
  }

  function formatMoney(n) {
    return "€ " + (Number(n) || 0).toFixed(2);
  }

  function renderTitle() {
    const title = $("qr-title");
    const label = $("qr-table-label");
    if (title) title.textContent = "Ordina al tavolo";
    if (label) {
      label.textContent = tableNum != null ? "Tavolo " + tableNum : "Seleziona un tavolo";
    }
  }

  function loadMenu() {
    const loading = $("qr-loading");
    const grid = $("qr-menu-grid");
    if (loading) loading.style.display = "block";
    if (grid) grid.innerHTML = "";

    fetch(MENU_API)
      .then((r) => (r.ok ? r.json() : []))
      .then((arr) => {
        menuItems = Array.isArray(arr) ? arr.filter((i) => i.active !== false) : [];
        renderCategories();
        renderMenu("");
        if (loading) loading.style.display = "none";
      })
      .catch(() => {
        menuItems = [];
        if (loading) loading.textContent = "Errore caricamento menù";
      });
  }

  function getCategories() {
    const set = new Set();
    menuItems.forEach((i) => {
      const cat = (i.category || "Altro").trim() || "Altro";
      set.add(cat);
    });
    return ["Tutti", ...[...set].sort()];
  }

  function renderCategories() {
    const container = $("qr-categories");
    if (!container) return;
    const cats = getCategories();
    container.innerHTML = cats
      .map((c, i) => {
        const value = c === "Tutti" ? "" : c;
        const active = i === 0 ? " active" : "";
        return `<button type="button" class="cat-btn${active}" data-category="${value}">${c}</button>`;
      })
      .join("");

    container.querySelectorAll(".cat-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        container.querySelectorAll(".cat-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderMenu(btn.dataset.category || "");
      });
    });
  }

  function renderMenu(category) {
    const grid = $("qr-menu-grid");
    if (!grid) return;

    let items = menuItems;
    if (category) {
      items = menuItems.filter((i) => (i.category || "").trim() === category);
    }

    grid.innerHTML = items
      .map((item) => {
        const qty = cart.filter((c) => c.id === item.id).reduce((s, c) => s + c.qty, 0);
        return `
          <div class="menu-item" data-id="${item.id}">
            <span class="menu-item-name">${escapeHtml(item.name || "-")}</span>
            <span class="menu-item-price">${formatMoney(item.price)}</span>
            ${qty > 0 ? `<span class="menu-item-qty">In carrello: ${qty}</span>` : ""}
          </div>
        `;
      })
      .join("");

    grid.querySelectorAll(".menu-item").forEach((el) => {
      el.addEventListener("click", () => addToCart(parseInt(el.dataset.id, 10)));
    });
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function addToCart(id) {
    const item = menuItems.find((i) => i.id === id);
    if (!item) return;
    const existing = cart.find((c) => c.id === id);
    if (existing) {
      existing.qty += 1;
    } else {
      cart.push({
        id: item.id,
        name: item.name,
        price: item.price,
        category: item.category,
        qty: 1,
      });
    }
    renderCart();
    renderMenu(
      $("qr-categories")?.querySelector(".cat-btn.active")?.dataset.category || ""
    );
  }

  function removeFromCart(id) {
    const idx = cart.findIndex((c) => c.id === id);
    if (idx === -1) return;
    cart[idx].qty -= 1;
    if (cart[idx].qty <= 0) cart.splice(idx, 1);
    renderCart();
    renderMenu(
      $("qr-categories")?.querySelector(".cat-btn.active")?.dataset.category || ""
    );
  }

  function renderCart() {
    const list = $("cart-items");
    const count = $("cart-count");
    const totalEl = $("cart-total-value");
    const btn = $("btn-send");

    if (!list) return;

    const totalItems = cart.reduce((s, c) => s + c.qty, 0);
    const totalPrice = cart.reduce((s, c) => s + (c.price || 0) * c.qty, 0);

    if (count) count.textContent = totalItems;
    if (totalEl) totalEl.textContent = formatMoney(totalPrice);
    if (btn) btn.disabled = totalItems === 0 || tableNum == null;

    list.innerHTML = cart
      .map((c) => {
        return `
          <div class="cart-line">
            <span class="cart-line-name">${escapeHtml(c.name)} × ${c.qty}</span>
            <div class="cart-line-qty">
              <button type="button" data-action="minus" data-id="${c.id}">−</button>
              <span>${c.qty}</span>
              <button type="button" data-action="plus" data-id="${c.id}">+</button>
            </div>
          </div>
        `;
      })
      .join("");

    list.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", (e) => {
        const id = parseInt(b.dataset.id, 10);
        if (b.dataset.action === "plus") addToCart(id);
        else removeFromCart(id);
      });
    });
  }

  function sendOrder() {
    if (tableNum == null) {
      showToast("Tavolo non valido. Accedi tramite QR.", "error");
      return;
    }
    if (cart.length === 0) {
      showToast("Aggiungi almeno un articolo.", "error");
      return;
    }

    const notes = ($("cart-notes-input")?.value || "").trim();

    const items = cart.map((c) => ({
      name: c.name,
      qty: c.qty,
      price: c.price,
      area: inferArea(c.category),
      category: c.category || "",
      type: "piatto",
      notes: "",
    }));

    const payload = {
      table: tableNum,
      area: "sala",
      waiter: "QR",
      covers: null,
      notes: notes ? "QR Order – " + notes : "QR Order",
      items,
    };

    const btn = $("btn-send");
    if (btn) btn.disabled = true;

    fetch(ORDERS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => {
        if (!r.ok) return r.text().then((t) => Promise.reject(new Error(t)));
        return r.json();
      })
      .then(() => {
        cart = [];
        renderCart();
        renderMenu(
          $("qr-categories")?.querySelector(".cat-btn.active")?.dataset.category || ""
        );
        if ($("cart-notes-input")) $("cart-notes-input").value = "";
        showToast("Ordine inviato! Il cameriere passerà a confermare.");
      })
      .catch((err) => {
        showToast("Errore invio ordine. Riprova.", "error");
        if (btn) btn.disabled = false;
      });
  }

  function init() {
    renderTitle();
    loadMenu();
    renderCart();

    $("btn-send")?.addEventListener("click", sendOrder);

    if (tableNum == null) {
      showToast("Usa il QR sul tavolo per ordinare.", "error");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
