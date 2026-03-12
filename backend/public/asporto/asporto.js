const LS_ASPORTO = "rw_asporto_orders";

function loadAsporto() {
  try {
    return JSON.parse(localStorage.getItem(LS_ASPORTO)) || [];
  } catch {
    return [];
  }
}

function saveAsporto(list) {
  localStorage.setItem(LS_ASPORTO, JSON.stringify(list));
}

function renderAsporto() {
  const colNew = document.getElementById("col-new");
  const colPrep = document.getElementById("col-prep");
  const colDone = document.getElementById("col-done");

  colNew.innerHTML = "";
  colPrep.innerHTML = "";
  colDone.innerHTML = "";

  const list = loadAsporto();

  document.getElementById("kpi-new").textContent = list.filter(
    (o) => o.status === "new"
  ).length;
  document.getElementById("kpi-prep").textContent = list.filter(
    (o) => o.status === "prep"
  ).length;
  document.getElementById("kpi-done").textContent = list.filter(
    (o) => o.status === "done"
  ).length;

  if (!list.length) {
    colNew.innerHTML =
      '<div class="table-meta">Nessun ordine asporto registrato.</div>';
    return;
  }

  list.forEach((o, idx) => {
    const card = document.createElement("div");
    card.className = "order-card";
    card.innerHTML = `
      <div class="order-header">
        <div class="order-title">${o.name || "Cliente"}</div>
        <div class="order-meta">
          Tel: ${o.phone || "-"} • Persone/porzioni: ${o.people || "-"}
        </div>
      </div>
      <div class="order-meta">
        Ritiro: ${o.time || "-"} • Importo stimato: €${o.amount || "0.00"}
      </div>
      <div class="order-meta">
        ${o.notes || ""}
      </div>
      <div class="order-actions">
        <button class="btn-xs" data-action="prep" data-idx="${idx}">In prep</button>
        <button class="btn-xs success" data-action="done" data-idx="${idx}">Consegnato</button>
        <button class="btn-xs danger" data-action="del" data-idx="${idx}">Elimina</button>
      </div>
    `;

    const body =
      o.status === "prep"
        ? colPrep
        : o.status === "done"
        ? colDone
        : colNew;
    body.appendChild(card);
  });

  document
    .querySelectorAll("[data-action][data-idx]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-idx"));
        const action = btn.getAttribute("data-action");
        const list = loadAsporto();

        if (!list[idx]) return;

        if (action === "del") {
          list.splice(idx, 1);
        } else if (action === "prep") {
          list[idx].status = "prep";
        } else if (action === "done") {
          list[idx].status = "done";
        }

        saveAsporto(list);
        renderAsporto();
      });
    });
}

function setupAsportoForm() {
  const btnAdd = document.getElementById("btn-add");
  const btnClear = document.getElementById("btn-clear-all");

  btnAdd.addEventListener("click", () => {
    const name = document.getElementById("field-name").value.trim();
    const phone = document.getElementById("field-phone").value.trim();
    const time = document.getElementById("field-time").value;
    const people = document.getElementById("field-people").value;
    const notes = document.getElementById("field-notes").value.trim();
    const amount = document.getElementById("field-amount").value;

    if (!name && !notes) {
      alert("Inserisci almeno il nome cliente o il dettaglio ordine.");
      return;
    }

    const list = loadAsporto();
    list.push({
      name,
      phone,
      time,
      people,
      notes,
      amount,
      status: "new",
      createdAt: new Date().toISOString(),
    });
    saveAsporto(list);

    document.getElementById("field-name").value = "";
    document.getElementById("field-phone").value = "";
    document.getElementById("field-time").value = "";
    document.getElementById("field-people").value = "";
    document.getElementById("field-notes").value = "";
    document.getElementById("field-amount").value = "";

    renderAsporto();
  });

  btnClear.addEventListener("click", () => {
    if (!confirm("Svuotare tutti gli ordini asporto della giornata?")) return;
    saveAsporto([]);
    renderAsporto();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupAsportoForm();
  renderAsporto();
});