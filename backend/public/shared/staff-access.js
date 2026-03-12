/**
 * Staff Access – shared module for manager login, staff login (cassa), active staff display
 * Usage: RW_StaffAccess.init({ module: "cassa", department: "cassa" })
 */
(function () {
  const API = "/api";
  const SESSION_STORAGE_KEY = "rw_current_session";
  const MANAGER_ROLE_BY_DEPARTMENT = { cassa: "cash_manager", cucina: "kitchen_manager", sala: "sala_manager", bar: "bar_manager", supervisor: "supervisor" };

  let config = { module: null, department: null };
  let currentSession = null;

  function getStoredSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setStoredSession(s) {
    if (s) sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_STORAGE_KEY);
    currentSession = s;
  }

  async function fetchJson(url, opts = {}) {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...opts.headers },
      ...opts,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    return res.json();
  }

  const RW_StaffAccess = {
    init(opts) {
      config = { module: opts.module || "cassa", department: opts.department || opts.module || "cassa" };
      currentSession = getStoredSession();
      return this;
    },

    getCurrentSession() {
      return currentSession || getStoredSession();
    },

    isManagerLoggedIn() {
      return !!this.getCurrentSession();
    },

    async loginManager(username, password, role) {
      const auth = await fetchJson(`${API}/auth/login`, {
        method: "POST",
        body: JSON.stringify({ username, password, role }),
      });
      if (!auth.success) throw new Error(auth.message || "Login fallito");

      const session = await fetchJson(`${API}/sessions/login`, {
        method: "POST",
        body: JSON.stringify({
          userId: auth.user || username,
          name: auth.name || auth.user || username,
          department: auth.department || config.department,
          authorizedBy: null,
          source: "module",
        }),
      });
      setStoredSession(session);
      return session;
    },

    async loginStaff(userId, name, department, authorizedBy) {
      const session = await fetchJson(`${API}/sessions/login`, {
        method: "POST",
        body: JSON.stringify({
          userId,
          name,
          department,
          authorizedBy: authorizedBy || "",
          source: "cassa",
        }),
      });
      return session;
    },

    async logout(sessionIdOrUserId) {
      const body = sessionIdOrUserId?.length > 20
        ? { sessionId: sessionIdOrUserId }
        : { userId: sessionIdOrUserId };
      await fetchJson(`${API}/sessions/logout`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setStoredSession(null);
    },

    async getActiveSessions(department) {
      const path = department ? `${API}/sessions/active/${department}` : `${API}/sessions/active`;
      return fetchJson(path);
    },

    async getStaffOperational(department) {
      const all = await fetchJson(`${API}/staff`);
      return (all || []).filter((s) => s.roleType !== "manager" && s.active !== false);
    },

    async getStaffAll() {
      return fetchJson(`${API}/staff`);
    },

    renderActiveStaff(containerId, department, options) {
      const el = document.getElementById(containerId);
      if (!el) return;
      const opts = options || {};
      const onLogout = opts.onLogout;
      el.innerHTML = '<div class="rw-active-staff"><div class="rw-title">Caricamento...</div></div>';
      this.getActiveSessions(department).then((sessions) => {
        let list = sessions || [];
        if (opts.source) list = list.filter((s) => s.source === opts.source);
        const title = opts.title || (department ? `Staff attivi (${department})` : "Staff attivi");
        if (!list.length) {
          el.innerHTML = `<div class="rw-active-staff"><div class="rw-title">${title}</div><div class="rw-empty">Nessuno attivo</div></div>`;
          return;
        }
        const badges = list
          .map((s) => {
            const txt = `${s.name} (${s.department})${s.authorizedBy ? " ✓" + s.authorizedBy : ""}`;
            const logoutBtn = onLogout ? `<button type="button" class="rw-badge-logout" data-id="${s.id}" title="Logout">×</button>` : "";
            return `<span class="rw-badge">${txt}${logoutBtn}</span>`;
          })
          .join("");
        el.innerHTML = `<div class="rw-active-staff"><div class="rw-title">${title}</div><div class="rw-list">${badges}</div></div>`;
        if (onLogout) {
          el.querySelectorAll(".rw-badge-logout").forEach((btn) => {
            btn.addEventListener("click", () => {
              const id = btn.getAttribute("data-id");
              onLogout(id);
            });
          });
        }
      }).catch(() => {
        el.innerHTML = `<div class="rw-active-staff"><div class="rw-title">Staff attivi</div><div class="rw-empty">Errore caricamento</div></div>`;
      });
    },

    showManagerLoginModal(onSuccess, defaultRole) {
      const backdrop = document.getElementById("rw-manager-modal-backdrop") || createManagerModal();
      const form = backdrop.querySelector("#rw-manager-form");
      const msg = backdrop.querySelector("#rw-manager-msg");
      const roleSel = backdrop.querySelector("#rw-manager-role");
      if (roleSel) roleSel.value = defaultRole || MANAGER_ROLE_BY_DEPARTMENT[config.department] || "supervisor";

      form.onsubmit = async (e) => {
        e.preventDefault();
        msg.textContent = "";
        const username = backdrop.querySelector("#rw-manager-username").value.trim();
        const password = backdrop.querySelector("#rw-manager-password").value;
        const role = backdrop.querySelector("#rw-manager-role").value;
        if (!username || !password) {
          msg.textContent = "Inserisci username e password";
          msg.style.color = "#f44336";
          return;
        }
        try {
          await this.loginManager(username, password, role);
          backdrop.classList.remove("open");
          if (onSuccess) onSuccess();
        } catch (err) {
          msg.textContent = err.message || "Login fallito";
          msg.style.color = "#f44336";
        }
      };

      backdrop.classList.add("open");
    },

    showStaffLoginModal(authorizedBy, onSuccess) {
      const backdrop = document.getElementById("rw-staff-modal-backdrop") || createStaffModal();
      const select = backdrop.querySelector("#rw-staff-select");
      const msg = backdrop.querySelector("#rw-staff-msg");

      this.getStaffOperational().then((staff) => {
        select.innerHTML = '<option value="">Seleziona staff...</option>';
        (staff || []).forEach((s) => {
          const opt = document.createElement("option");
          opt.value = JSON.stringify({ id: s.id, name: s.name, department: s.department });
          opt.textContent = `${s.name} (${s.department})`;
          select.appendChild(opt);
        });
      }).catch(() => { select.innerHTML = '<option value="">Errore caricamento staff</option>'; });

      backdrop.querySelector("#rw-staff-authorized").value = authorizedBy || "";

      const form = backdrop.querySelector("#rw-staff-form");
      form.onsubmit = async (e) => {
        e.preventDefault();
        msg.textContent = "";
        const opt = select.options[select.selectedIndex];
        if (!opt || !opt.value) {
          msg.textContent = "Seleziona un membro staff";
          msg.style.color = "#f44336";
          return;
        }
        const staff = JSON.parse(opt.value);
        const authBy = backdrop.querySelector("#rw-staff-authorized").value.trim();
        if (!authBy) {
          msg.textContent = "Inserisci chi autorizza (responsabile cassa)";
          msg.style.color = "#f44336";
          return;
        }
        try {
          await this.loginStaff(staff.id, staff.name, staff.department, authBy);
          backdrop.classList.remove("open");
          if (onSuccess) onSuccess();
        } catch (err) {
          msg.textContent = err.message || "Errore login";
          msg.style.color = "#f44336";
        }
      };

      backdrop.classList.add("open");
    },
  };

  function createManagerModal() {
    const html = `
      <div id="rw-manager-modal-backdrop" class="rw-staff-modal-backdrop">
        <div class="rw-staff-modal">
          <h3>Manager login</h3>
          <form id="rw-manager-form">
            <div class="field">
              <label>Username</label>
              <input type="text" id="rw-manager-username" placeholder="Es. cash_manager" autocomplete="username" />
            </div>
            <div class="field">
              <label>Password / PIN</label>
              <input type="password" id="rw-manager-password" placeholder="PIN" autocomplete="current-password" />
            </div>
            <div class="field">
              <label>Ruolo</label>
              <select id="rw-manager-role">
                <option value="supervisor">Supervisor</option>
                <option value="cash_manager">Cash Manager</option>
                <option value="kitchen_manager">Kitchen Manager</option>
                <option value="sala_manager">Sala Manager</option>
                <option value="bar_manager">Bar Manager</option>
              </select>
            </div>
            <div id="rw-manager-msg" style="font-size:12px;margin:8px 0;"></div>
            <div class="actions">
              <button type="button" class="btn btn-ghost" id="rw-manager-cancel">Annulla</button>
              <button type="submit" class="btn btn-primary">Accedi</button>
            </div>
          </form>
        </div>
      </div>
    `;
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    const backdrop = wrap.firstElementChild;
    document.body.appendChild(backdrop);
    backdrop.querySelector("#rw-manager-cancel").onclick = () => backdrop.classList.remove("open");
    return backdrop;
  }

  function createStaffModal() {
    const html = `
      <div id="rw-staff-modal-backdrop" class="rw-staff-modal-backdrop">
        <div class="rw-staff-modal">
          <h3>Staff login (autorizzato da cassa)</h3>
          <form id="rw-staff-form">
            <div class="field">
              <label>Membro staff</label>
              <select id="rw-staff-select"><option value="">Caricamento...</option></select>
            </div>
            <div class="field">
              <label>Autorizzato da (responsabile cassa)</label>
              <input type="text" id="rw-staff-authorized" placeholder="Nome responsabile cassa" />
            </div>
            <div id="rw-staff-msg" style="font-size:12px;margin:8px 0;"></div>
            <div class="actions">
              <button type="button" class="btn btn-ghost" id="rw-staff-cancel">Annulla</button>
              <button type="submit" class="btn btn-primary">Accedi</button>
            </div>
          </form>
        </div>
      </div>
    `;
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    const backdrop = wrap.firstElementChild;
    document.body.appendChild(backdrop);
    backdrop.querySelector("#rw-staff-cancel").onclick = () => backdrop.classList.remove("open");
    return backdrop;
  }

  window.RW_StaffAccess = RW_StaffAccess;
})();
