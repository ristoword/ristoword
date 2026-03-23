# Audit persistenza dati — migrazione verso MySQL (Railway)

**Ambito:** solo `ristoword_copia cloud` — analisi statica del codice e dell’albero `backend/data/`.  
**Non include:** modifiche applicative, creazione tabelle, refactor.

---

## 1. Fonti dati attuali (elenco)

### 1.1 File JSON sotto `backend/data/` (globale e multi-tenant)

**Root `data/` (non tenant-specifici)**

| File | Uso nel codice (riferimento principale) |
|------|----------------------------------------|
| `users.json` | `repositories/users.repository.js` |
| `restaurants.json` | `repositories/restaurants.repository.js` |
| `licenses.json` | `repositories/licenses.repository.js` (+ sync da `tenants/*/license.json`) |
| `license.json` | `config/license.js`, `middleware/licenseGate.js`, `utils/licenseValidation.js` |
| `gs-codes-mirror.json` | `repositories/gsCodesMirror.repository.js` |
| `demo-hashes.json` | `repositories/auth.repository.js` |
| `system-maintenance.json` | `modules/system/maintenance.service.js` |
| `ai-last-output.json` | `service/ai-openai.service.js` (debug/ultimo output) |
| `stripe-mock.json` | `stripe/stripeMock.repository.js` |
| `stripe-live-webhook-events.json` | `stripe/stripeLiveWebhookDedup.js` |
| `leave-requests.json` | fallback legacy in `repositories/leave.repository.js` se manca tenant |
| `_legacy/order.json` | legacy (cartella `_legacy/`) |
| `sessions.json` | legacy globale prima della migrazione tenant (alcuni repo copiano verso tenant) |
| `orders.json`, `payments.json`, … | legacy root: `utils/tenantMigration.js` e vari repo usano `paths.legacy()` per copia in `tenants/default/` |

**`data/super-admin/`**

| File | Uso |
|------|-----|
| `auth.json`, `sessions.json`, `stripe-config.json`, `support-notes.json`, `console-contacts.json` | `modules/super-admin/super-admin.repository.js` |

**`data/dev-access/`**

| File | Uso |
|------|-----|
| `dev-access-logs.json` | `dev-access/services/dev-access.service.js` |

**`data/sessions/`** (Express)

| Uso |
|-----|
| `config/session.js` — **solo se `NODE_ENV=production`**: `session-file-store` scrive file di sessione cookie-based. In dev la sessione non usa file store. |

**`data/tenants/{tenantId}/`** — file tipici (per tenant; elenco dai repository + campione su disco)

| File JSON | Repository / modulo |
|-----------|---------------------|
| `orders.json` | `orders.repository.js` |
| `payments.json` | `payments.repository.js` |
| `menu.json` | `menu.repository.js` |
| `daily-menu.json` | `daily-menu.repository.js` |
| `inventory.json` | `inventory.repository.js` |
| `stock-movements.json` | `stock-movements.repository.js` |
| `inventory-transfers.json` | `inventory-transfers.repository.js` |
| `bookings.json` | `bookings.repository.js` |
| `closures.json` | `closures.repository.js` |
| `storni.json` | `storni.repository.js` |
| `reports.json` | `reports.repository.js` |
| `staff.json` | `staff.repository.js` |
| `staff-shifts.json` | `shifts.repository.js` |
| `staff-requests.json` | `staff-requests.repository.js` |
| `sessions.json` | `sessions.repository.js` (sessioni staff access, non Express) |
| `cassa-shifts.json` | `cassa-shifts.repository.js` |
| `pos-shifts.json` | `pos-shifts.repository.js` |
| `recipes.json` | `recipes.repository.js` |
| `haccp-checks.json` | `haccp.repository.js` |
| `customers.json` | `customers.repository.js` |
| `devices.json` | `devices.repository.js` |
| `qr-tables.json` | `qr-tables.repository.js` |
| `print-routes.json` | `print-routes.repository.js` |
| `print-jobs.json` | `print-jobs.repository.js` |
| `catering-events.json` | `catering.repository.js` |
| `catering-presets.json` | `catering-presets.repository.js` |
| `order-food-costs.json` | `order-food-costs.repository.js` |
| `attendance.json` | `attendance.repository.js` |
| `leave-requests.json` | `leave.repository.js` (per tenant) |
| `license.json` | `licenses.repository.js`, `stripe/stripeLicenseSync.service.js`, `modules/super-admin/super-admin.service.js` |
| `owner-setup.json` | `config/ownerSetup.js` |
| `settings.json` | `service/onboarding.service.js` |
| `email-smtp.json` | `service/tenantEmailSettings.service.js` (SMTP tenant, password cifrata) |

**File presenti su disco ma senza match nel codice (grep su `backend/src` + `backend/public`)**

- `cateringMenus.json`, `productionHistory.json`, `crmClients.json` — **nessun riferimento trovato**; trattare come legacy/orfani fino a verifica manuale.

### 1.2 `localStorage` (browser) — cache / preferenze / dati solo client

Non sono fonte di verità server-side; convivono con API JSON.

| File frontend | Chiavi / uso |
|---------------|----------------|
| `public/shared/api.js` | token API |
| `public/shared/auth-guard.js`, `public/login/login.js`, `public/dashboard/dashboard.js` | `rw_auth` e profilo sessione lato client |
| `public/js/i18n.js` | lingua |
| `public/sala/sala.js` | piano tavoli, flag tavoli, bozza corsi, cache menù `rw_menu_official` |
| `public/cassa/cassa.js` | void/payment/split per tavolo, cache menù, report giornaliero locale, fatture |
| `public/cucina/cucina.js` | ricette/haccp/shopping/turni cucina/fornitori/note vocali (prefissi `ristoword_cucina_*`) |
| `public/pizzeria/pizzeria.js` | `pizzeria_recipes`, note vocali |
| `public/bar/bar.js` | ricette bar, note |
| `public/supervisor/supervisor.js` | cache menù |
| `public/magazzino/attrezzature.js` | attrezzature (`ristoword_attrezzature`) |
| `public/asporto/asporto.js` | ordini asporto locali |

### 1.3 Altri meccanismi

| Meccanismo | Dettaglio |
|------------|-----------|
| **Backup automatico** | `utils/backup.js` — copia ricorsiva `backend/data` → `backend/backups/backup-<timestamp>/` all’avvio server e a intervalli. |
| **WebSocket** | `service/websocket.service.js` — stato in memoria; non persistenza ordini. |
| **Repository “in-memory”** | `repositories/license.repository.js` esporta oggetto in RAM (non allineato al file system per persistenza reale; il flusso produzione usa altri file). |

### 1.4 Nota su file sospetto

- `backend/src/repositories/movements.repository.js` — nel tree risulta **duplicato logico** del controller reports (stesso contenuto di flusso `/api/reports`); il magazzino movimenti reali sono in `stock-movements.repository.js`. Da verificare in fase di refactor; **non** è una terza fonte dati distinta se non importato altrove.

---

## 2. Moduli funzionali — lettura/scrittura, JSON, localStorage, repository

Legenda: **JSON** = file sotto `backend/data/` tramite repository o servizio; **API** = chiamate HTTP al backend che a loro volta usano JSON (fino a migrazione).

### Sala (`public/sala/sala.js`)

| | |
|--|--|
| **Legge** | API: ordini, menù, prenotazioni, sessioni staff; **localStorage**: piano tavoli (`LS_FLOOR`), flag (`LS_FLAGS`), bozze corsi (`LS_COURSES`), cache menù |
| **Scrive** | API POST/PATCH ordini e relativi; **localStorage** aggiornamenti layout/bozze/cache |
| **JSON server** | `orders.json`, `menu.json`, `bookings.json`, `sessions.json`, `qr-tables.json` (indiretto), ecc. via servizi |
| **localStorage** | Sì (cache UI, non fonte unica) |
| **Repository** | `orders`, `menu`, `bookings`, `sessions`, `qr-tables` (admin altre UI) |
| **File tipici** | `routes/orders.routes.js`, `menu.routes.js`, `bookings.routes.js`, `sessions.routes.js` → repository omonimi |

### Cucina (`public/cucina/cucina.js`)

| | |
|--|--|
| **Legge/Scrive API** | Ordini, ricette, HACCP, magazzino (liste), report |
| **localStorage** | Ricette cucina, HACCP, lista spesa, email fornitore, turni cucina, note vocali |
| **JSON server** | `orders.json`, `recipes.json`, `haccp-checks.json`, `inventory.json` (via API) |
| **Repository** | `orders`, `recipes`, `haccp`, `inventory`, `stock-movements` |

### Pizzeria (`public/pizzeria/pizzeria.js`)

| | |
|--|--|
| **Legge/Scrive** | In parte **localStorage** (ricette pizzeria, note); integrazione API da verificare per flusso completo |
| **JSON server** | Se allineato a ricette globali: `recipes.json` |
| **Repository** | `recipes` se si usa API ricette |

### Bar (`public/bar/bar.js`)

| | |
|--|--|
| **localStorage** | Ricette bar, note testuali |
| **JSON server** | Opzionale via `recipes.json` se si unifica; attualmente molto lato client |

### Cassa (`public/cassa/cassa.js`)

| | |
|--|--|
| **API** | Ordini, pagamenti, chiusure, storni, menù |
| **localStorage** | Void, split, config pagamento, cache menù, report giornaliero cassa, fatture |
| **JSON server** | `orders.json`, `payments.json`, `cassa-shifts.json`, `closures.json`, `storni.json` |
| **Repository** | `orders`, `payments`, `cassa-shifts`, `closures`, `storni` |

### Magazzino (`public/magazzino/magazzino.js`, `attrezzature.js`)

| | |
|--|--|
| **API** | Inventario, movimenti, trasferimenti |
| **localStorage** | Solo `attrezzature.js` (attrezzature) |
| **JSON server** | `inventory.json`, `stock-movements.json`, `inventory-transfers.json` |
| **Repository** | `inventory`, `stock-movements`, `inventory-transfers` |

### Menu del giorno

| | |
|--|--|
| **UI** | Flussi collegati a dashboard / ruoli (es. `daily-menu.routes`) |
| **JSON server** | `daily-menu.json` |
| **Repository** | `daily-menu.repository.js` |

### Prenotazioni (`public/prenotazioni/` + API)

| | |
|--|--|
| **JSON server** | `bookings.json` |
| **Repository** | `bookings.repository.js` |

### Catering

| | |
|--|--|
| **JSON server** | `catering-events.json`, `catering-presets.json` |
| **Repository** | `catering.repository.js`, `catering-presets.repository.js` |

### QR tavoli

| | |
|--|--|
| **Pubblico** | `/qr/:table` — ordini via `POST /api/qr/orders` |
| **Admin** | `qr-tables.json` |
| **Repository** | `orders`, `qr-tables` |

### Staff / turni / presenze / permessi

| | |
|--|--|
| **JSON server** | `staff.json`, `staff-shifts.json`, `staff-requests.json`, `attendance.json`, `leave-requests.json` (globale o tenant), `sessions.json` (accessi staff) |
| **Repository** | `staff`, `shifts`, `staff-requests`, `attendance`, `leave`, `sessions` |
| **Turni cassa/POS** | `cassa-shifts.json`, `pos-shifts.json` |

### Supervisor / dashboard

| | |
|--|--|
| **Legge** | API (ordini, menù, report, chiusure a seconda della pagina); **localStorage** cache menù in `supervisor.js` |
| **JSON server** | Stessi file degli altri moduli via API |
| **Repository** | Incroci su `orders`, `menu`, `reports`, `closures`, … |

### Licenze / owner / auth

| | |
|--|--|
| **JSON server** | `users.json`, `restaurants.json`, `licenses.json`, `license.json` globale, `tenants/*/license.json`, `owner-setup.json`, `settings.json` (onboarding) |
| **Moduli** | `auth.routes` + `users`/`auth` repository, `stripeLicenseSync.service.js`, `owner` routes, `super-admin` |
| **Super Admin** | `data/super-admin/*.json` |

### AI / report / inventory / ricette

| | |
|--|--|
| **AI** | `ai.routes` → servizi AI; file `ai-last-output.json` |
| **Report** | `reports.json` |
| **Inventory** | `inventory.json`, `stock-movements.json`, `order-food-costs.json` |
| **Ricette** | `recipes.json` |

### Email tenant (SMTP)

| | |
|--|--|
| **JSON server** | `tenants/{id}/email-smtp.json` |
| **Servizio** | `tenantEmailSettings.service.js` |

### Stripe / checkout

| | |
|--|--|
| **JSON server** | `stripe-mock.json`, `stripe-live-webhook-events.json`, `licenses.json`, `tenants/*/license.json` |
| **Servizi** | `stripeMock.repository.js`, `stripeLiveWebhookDedup.js`, `checkout` routes |

### Dev access (emergenza)

| | |
|--|--|
| **JSON server** | `dev-access-logs.json` + lettura probe di molti file tenant |
| **Servizio** | `dev-access.service.js` |

---

## 3. Priorità di migrazione (suggerita)

### Prima (core operativo e multi-tenant)

1. **`restaurants.json` + `users.json` + autenticazione** — identità e tenant.
2. **`orders` + voci ordine** (oggi array in `orders.json`) — cuore sala/cassa/cucina/QR.
3. **`payments.json`, `cassa-shifts.json`, `closures.json`, `storni.json`** — cassa e chiusure.
4. **`menu.json`, `daily-menu.json`** — offerta venduta.

### Dopo (operatività estesa)

5. **`inventory.json`, `stock-movements.json`, `inventory-transfers.json`, `order-food-costs.json`**.
6. **`bookings.json`**, **`catering-*`**, **`staff.json`**, turni (`staff-shifts`, `cassa-shifts`, `pos-shifts`), **`sessions.json` (staff)**.
7. **`reports.json`**, **`recipes.json`, `haccp-checks.json`**, **`customers.json`**, **`devices.json`**, **`print-*`**.

### Può restare temporaneamente file o browser (senza “rompere” il core se API invariata)

- **localStorage** (cache UI, preferenze) — finché le API restituiscono gli stessi JSON shape.
- **`ai-last-output.json`**, **`system-maintenance.json`**, **`stripe-live-webhook-events.json`** (piccoli file di supporto).
- **`super-admin`** e **`dev-access`** — possono restare file-based in una prima fase o migrare dopo il core tenant.

### Critico per produzione

- Ordini, pagamenti, menù attivo, utenti/tenant, licenze attive, sessioni login (Express: considerare **Redis** o DB session store al posto di file in produzione).

---

## 4. Schema DB minimo proposto (logico)

Nomi indicativi; tipi SQL da definire in fase DDL.

### Multi-tenant e utenti

- **`tenants`** — `id`, `slug`, `name`, `created_at`, …
- **`users`** — `id`, `tenant_id`, `username`, `password_hash`, `role`, `active`, …  
- **`restaurants`** (se distinto da tenant) o campo su `tenants` — allineamento a `restaurants.json`.

### Ordini e pagamenti

- **`orders`** — `id`, `tenant_id`, `status`, `table_id` / `table_label`, `source` (sala/qr/asporto), `created_at`, `updated_at`, `totals` JSON o colonne, …
- **`order_items`** — `id`, `order_id`, `menu_item_id`, `qty`, `price`, `notes`, …
- **`payments`** — `id`, `tenant_id`, `order_id`?, `amount`, `method`, `created_at`, …
- **`cash_register_sessions` (cassa_shifts)** — turni cassa; campi come apertura/chiusura, operatore.
- **`closures` (daily_z)** — chiusure giornaliere.
- **`storni`** — voci storno legate a pagamenti/ordini.

### Menù

- **`menu_items`** — voci menù per tenant.
- **`daily_menu`** — menu del giorno (data + riferimenti voci o JSON snapshot).

### Magazzino

- **`inventory_items`** — articoli magazzino.
- **`inventory_movements`** / **`stock_movements`** — movimenti (carico/scarico, legame ordine).
- **`inventory_transfers`** — trasferimenti tra ubicazioni.

### Prenotazioni e catering

- **`bookings`** — prenotazioni tavoli/clienti.
- **`catering_events`**, **`catering_presets`**.

### Staff

- **`staff_members`** (se separato da `users`), **`staff_shifts`**, **`staff_requests`**, **`attendance`**, **`leave_requests`**.

### QR e stampa

- **`qr_tables`** — configurazione tavoli QR.
- **`print_routes`**, **`print_jobs`**.

### Licenze e integrazioni

- **`licenses`** (globale + per `tenant_id`), **`license_audit`** opzionale.
- **`gs_codes_mirror`** o tabella sync codici GS.

### Altro

- **`tenant_settings`** — merge di `owner-setup`, `settings.json`, flags.
- **`tenant_smtp`** — host/port/user (password cifrata come oggi o colonna encrypted).
- **`reports`** — o tabella + JSON per allegati.

**Relazioni chiave:** `tenant_id` su quasi tutte le tabelle; `orders` 1—N `order_items`; `orders` 1—N `payments`; movimenti magazzino opzionalmente legati a `order_id`.

---

## 5. Impatto tecnico

### Repository sostituibili con implementazione SQL

Tutti i file in `backend/src/repositories/*.repository.js` che usano `safeReadJson` / `atomicWriteJson` / `fs` sono candidati a **adapter** che mantengono la stessa interfaccia e leggono/scrivono MySQL.

Eccezioni / attenzioni:

- **`gsCodesMirror.repository.js`**, **`users.repository.js`**, **`restaurants.repository.js`**, **`licenses.repository.js`** — globale; va gestito `tenant_id` in modo esplicito nello schema.
- **`super-admin`** — modulo dedicato; può restare file-based nella prima fase.
- **Session Express** — non è un “repository” JSON dell’app ma file sotto `data/sessions/`; migrazione a **store SQL o Redis** consigliata in produzione.

### Endpoint / controller

- **Cambiano poco** se i repository espongono gli stessi metodi e gli stessi shape JSON: controller e route restano; cambia solo l’implementazione dietro `require('../repositories/orders.repository')` o un factory.

### Frontend

- **Non si accorge** della migrazione se **`/api/*`** restituisce gli stessi oggetti/array attesi; le modifiche sono lato server e schema DB.

---

## 6. Output finale — Fase 1 consigliata

### FASE 1 MIGRAZIONE CONSIGLIATA

1. Definire schema MySQL per **`tenants`**, **`users`**, **`restaurants`** (o equivalente) e script di seed da JSON esistente.
2. Introdurre **connection pool** `mysql2` e **un solo repository pilota** (es. `users` o `restaurants`) con doppia scrittura o read-only da SQL in parallelo al file (feature flag env) — *solo quando deciderete di implementarlo*; questo documento non impone codice.
3. Pianificare migrazione **`orders` + `order_items`** e **`payments`** come blocco successivo (massimo impatto business).
4. Sostituire **session store** file-based in produzione con store condiviso (Redis/MySQL) prima o in parallelo al carico multi-istanza.

### File da toccare nella prima fase (quando si passerà all’implementazione)

- `backend/src/config/` — aggiunta config DB (senza rompere `loadEnv` esistente).
- `backend/src/repositories/` — 1–2 repository pilota + eventuale `db/pool.js`.
- **Non** obbligatorio nella fase 1: tutti i `public/*.js` se l’API resta uguale.

### Rischio

| Area | Rischio |
|------|---------|
| Utenti + login | **Alto** (sicurezza, sessioni) |
| Ordini + pagamenti | **Alto** (consistenza, concorrenza) |
| Menù + daily menu | **Medio** |
| Magazzino / movimenti | **Medio–Alto** (integrità quantità) |
| localStorage-only UI | **Basso** (fuori scope DB finché l’API non dipende da essi) |
| Super-admin / dev-access | **Medio** (isolamento) |

### Ordine esatto dei lavori (dopo Fase 1 progettuale)

1. Schema DDL + migrazioni versionate (cartella dedicata, es. `migrations/`).
2. Pool DB + health check.
3. Repository utenti/tenant + test integrazione.
4. Migrazione dati storici (script one-shot da JSON → SQL).
5. Orders + payments + transazioni DB.
6. Resto dei repository per dominio.
7. Deprecazione scrittura JSON e backup solo come export.

---

*Documento generato per audit interno. Aggiornare quando cambiano repository o nuovi file in `data/`.*
