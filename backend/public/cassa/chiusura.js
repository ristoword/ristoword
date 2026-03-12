// backend/public/cassa/chiusura.js
// Chiusura cassa Z – quadratura giornaliera, chiusura persistente, export CSV/Excel

(function () {
  function pad2(n) {
    return String(n).padStart(2, "0");
  }
  function todayYMD() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function toMoney(v) {
    const n = Number(v) || 0;
    return "€ " + n.toFixed(2);
  }
  function isSameDay(a, b) {
    if (!a || !b) return false;
    const d1 = new Date(a);
    const d2 = new Date(b);
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  }

  let filteredPayments = [];
  let selectedDate = todayYMD();
  let isClosed = false;
  let lastTotals = null;

  async function fetchPayments() {
    const res = await fetch("/api/payments", { credentials: "same-origin" });
    if (!res.ok) throw new Error("Errore lettura pagamenti");
    return await res.json();
  }

  function getPayDate(p) {
    return p.closedAt || p.createdAt || null;
  }

  function filterByDate(payments, dateYMD) {
    if (!dateYMD) return payments;
    const target = new Date(dateYMD);
    return payments.filter((p) => isSameDay(getPayDate(p), target));
  }

  function filterByOperator(payments, op) {
    if (!op || !op.trim()) return payments;
    const q = op.trim().toLowerCase();
    return payments.filter((p) => (p.operator || "").toLowerCase().includes(q));
  }

  function filterByMethod(payments, method) {
    if (!method) return payments;
    return payments.filter((p) => (p.paymentMethod || "").toLowerCase() === method.toLowerCase());
  }

  function computeTotals(payments) {
    let cash = 0,
      card = 0,
      online = 0,
      ticket = 0,
      voucher = 0,
      mixed = 0;
    let discounts = 0,
      vat = 0,
      covers = 0;
    const tables = new Set();

    for (const p of payments) {
      const total = Number(p.total) || 0;
      const method = (p.paymentMethod || "").trim().toLowerCase();
      if (method === "cash") cash += total;
      else if (["card", "pos", "carta"].includes(method)) card += total;
      else if (method === "online") online += total;
      else if (method === "ticket") ticket += total;
      else if (method === "voucher") voucher += total;
      else if (method === "mixed") mixed += total;
      else card += total;

      discounts += Number(p.discountAmount) || 0;
      vat += Number(p.vatAmount) || 0;
      covers += Number(p.covers) || 0;
      if (p.table != null && p.table !== "") tables.add(String(p.table));
    }

    const grandTotal = cash + card + online + ticket + voucher + mixed;
    return {
      cash,
      card,
      online,
      ticket,
      voucher,
      mixed,
      grandTotal,
      discounts,
      vat,
      covers,
      count: payments.length,
      tablesCount: tables.size,
    };
  }

  function renderSummary(totals) {
    const t = totals || { cash: 0, card: 0, online: 0, ticket: 0, voucher: 0, mixed: 0, grandTotal: 0, discounts: 0, vat: 0, covers: 0, count: 0, tablesCount: 0 };

    document.getElementById("sum-cash").textContent = toMoney(t.cash);
    document.getElementById("sum-card").textContent = toMoney(t.card);
    document.getElementById("sum-online").textContent = toMoney(t.online);
    document.getElementById("sum-ticket").textContent = toMoney(t.ticket);
    document.getElementById("sum-voucher").textContent = toMoney(t.voucher);
    document.getElementById("sum-total").textContent = toMoney(t.grandTotal);

    document.getElementById("count-payments").textContent = String(t.count);
    document.getElementById("count-tables").textContent = String(t.tablesCount);
    document.getElementById("count-covers").textContent = String(t.covers);
    document.getElementById("sum-discounts").textContent = toMoney(t.discounts);
    document.getElementById("sum-vat").textContent = toMoney(t.vat);

    const cashReg = document.getElementById("cash-registered");
    const cashDecl = document.getElementById("cash-declared-view");
    const cashDiff = document.getElementById("cash-diff");
    if (cashReg) cashReg.textContent = toMoney(t.cash);
    const declared = Number(document.getElementById("cash-declared")?.value) || 0;
    if (cashDecl) cashDecl.textContent = toMoney(declared);
    if (cashDiff) {
      const diff = t.cash - declared;
      cashDiff.textContent = toMoney(diff);
      cashDiff.style.color = diff === 0 ? "" : diff > 0 ? "var(--success)" : "var(--danger, red)";
    }
  }

  function renderPaymentsTable(payments) {
    const tbody = document.getElementById("payments-body");
    if (!tbody) return;

    if (!payments || payments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Nessun pagamento trovato.</td></tr>';
      return;
    }

    tbody.innerHTML = payments
      .sort((a, b) => new Date(getPayDate(b) || 0) - new Date(getPayDate(a) || 0))
      .map((p) => {
        const dt = getPayDate(p);
        const time = dt ? new Date(dt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "—";
        return `
          <tr>
            <td>${time}</td>
            <td>${(p.table ?? "-")}</td>
            <td>${(p.paymentMethod ?? "-")}</td>
            <td>${(p.operator ?? "-")}</td>
            <td>${p.covers ?? "-"}</td>
            <td>${toMoney(p.total)}</td>
          </tr>
        `;
      })
      .join("");
  }

  async function checkClosureStatus(dateYMD) {
    try {
      const res = await fetch(`/api/closures/check/${dateYMD}`, { credentials: "same-origin" });
      if (!res.ok) return false;
      const data = await res.json();
      return !!data.closed;
    } catch {
      return false;
    }
  }

  function updateClosureStatus(closed) {
    isClosed = !!closed;
    const statusEl = document.getElementById("closure-status");
    const btnClose = document.getElementById("btn-close-z");
    const form = document.getElementById("closure-form");
    if (!statusEl) return;

    if (closed) {
      statusEl.textContent = "Giornata già chiusa. Non è possibile registrare una nuova chiusura.";
      statusEl.className = "closure-status warning";
      if (btnClose) btnClose.disabled = true;
      if (form) form.style.opacity = "0.6";
    } else {
      statusEl.textContent = "Giornata aperta. Puoi procedere alla chiusura Z.";
      statusEl.className = "closure-status";
      if (btnClose) btnClose.disabled = false;
      if (form) form.style.opacity = "1";
    }
  }

  async function applyFilters() {
    const dateInput = document.getElementById("filter-date");
    const opInput = document.getElementById("filter-operator");
    const methodSelect = document.getElementById("filter-method");

    selectedDate = dateInput?.value || todayYMD();
    if (!dateInput?.value) dateInput.value = selectedDate;

    let payments = await fetchPayments();
    payments = filterByDate(payments, selectedDate);
    payments = filterByOperator(payments, opInput?.value);
    payments = filterByMethod(payments, methodSelect?.value);
    filteredPayments = payments;

    const totals = computeTotals(payments);
    lastTotals = totals;
    renderSummary(totals);
    renderPaymentsTable(payments);

    isClosed = await checkClosureStatus(selectedDate);
    updateClosureStatus(isClosed);
  }

  async function closeDayZ() {
    if (isClosed) {
      alert("La giornata risulta già chiusa.");
      return;
    }
    const operator = document.getElementById("closure-operator")?.value?.trim() || "";
    const notes = document.getElementById("closure-notes")?.value?.trim() || "";
    if (!confirm(`Chiudere la giornata ${selectedDate}? Questa operazione non può essere annullata.`)) return;

    try {
      const res = await fetch("/api/closures", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate,
          closedBy: operator,
          notes,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || "Errore chiusura");
      }
      const closure = await res.json();
      alert(`Giornata ${selectedDate} chiusa con successo.`);
      isClosed = true;
      updateClosureStatus(true);
    } catch (err) {
      alert(err.message || "Errore nella chiusura della giornata.");
    }
  }

  function exportClosure(format) {
    if (!isClosed) {
      const c = confirm("La giornata non risulta chiusa. Vuoi comunque scaricare il riepilogo dalla preview?");
      if (!c) return;
    }
    const url = `/api/closures/${selectedDate}/export?format=${format}`;
    window.open(url, "_blank");
  }

  function resetFilters() {
    const dateInput = document.getElementById("filter-date");
    const opInput = document.getElementById("filter-operator");
    const methodSelect = document.getElementById("filter-method");
    const cashDeclared = document.getElementById("cash-declared");
    if (dateInput) dateInput.value = todayYMD();
    if (opInput) opInput.value = "";
    if (methodSelect) methodSelect.value = "";
    if (cashDeclared) cashDeclared.value = "";
    applyFilters();
  }

  function setupPrint() {
    const btn = document.getElementById("btn-print");
    if (btn) {
      btn.addEventListener("click", () => window.print());
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const dateInput = document.getElementById("filter-date");
    if (dateInput && !dateInput.value) dateInput.value = todayYMD();

    document.getElementById("btn-refresh")?.addEventListener("click", applyFilters);
    document.getElementById("btn-apply-filters")?.addEventListener("click", applyFilters);
    document.getElementById("btn-reset-filters")?.addEventListener("click", resetFilters);
    document.getElementById("btn-close-z")?.addEventListener("click", closeDayZ);
    document.getElementById("btn-export-csv")?.addEventListener("click", () => exportClosure("csv"));
    document.getElementById("btn-export-excel")?.addEventListener("click", () => exportClosure("excel"));

    document.getElementById("cash-declared")?.addEventListener("input", () => {
      if (lastTotals) renderSummary(lastTotals);
    });

    setupPrint();
    applyFilters();
  });
})();
