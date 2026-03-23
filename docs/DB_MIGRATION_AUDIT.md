# Audit persistenza dati — migrazione verso MySQL (Railway)

**Ambito:** solo repository **`ristoword_copia cloud`**.  
**Tipo:** analisi statica del codice (`backend/src`, `backend/public`, `backend/data`) — **nessuna modifica applicativa** in questo documento.  
**Data riferimento:** allineato al tree corrente del progetto.

---

## 1. Elenco completo delle fonti dati attuali

### 1.1 File JSON — `backend/data/`

**Convenzione path:** `paths.DATA` = `backend/data`. I dati operativi per ristorante sono in `backend/data/tenants/{tenantId}/`. File nella root `data/` = legacy o globali.

#### Root `backend/data/` (globali / legacy)

| File | Lettura / scrittura (riferimento codice) |
|------|----------------------------------------|
| `users.json` | `src/repositories/users.repository.js` |
| `restaurants.json` | `src/repositories/restaurants.repository.js` |
| `licenses.json` | `src/repositories/licenses.repository.js` (+ import da `tenants/*/license.json`) |
| `license.json` | `middleware/licenseGate.js`, `utils/licenseValidation.js` (lettura) |
| `demo-hashes.json` | `src/repositories/auth.repository.js` |
| `gs-codes-mirror.json` | `src/repositories/gsCodesMirror.repository.js` |
| `stripe-mock.json` | `src/stripe/stripeMock.repository.js` |
| `stripe-live-webhook-events.json` | `src/stripe/stripeLiveWebhookDedup.js` |
| `restaurant-config.json` | `src/config/setup.js` |
| `system-maintenance.json` | `src/modules/system/maintenance.service.js` |
| `ai-last-output.json` | `src/service/ai-openai.service.js` (debug) |
| `leave-requests.json` | fallback legacy in `src/repositories/leave.repository.js` se assente per-tenant |
| `sessions.json` | legacy; copia verso tenant in alcuni flussi |
| `orders.json`, `menu.json`, … (vari) | `src/utils/tenantMigration.js` copia in `tenants/default/` se mancante; `paths.legacy()` usato da più repository |

**`backend/data/super-admin/`**

| File | Modulo |
|------|--------|
| `auth.json`, `sessions.json`, `stripe-config.json`, `support-notes.json`, `console-contacts.json` | `src/modules/super-admin/super-admin.repository.js` |

**`backend/data/dev-access/`**

| File | Modulo |
|------|--------|
| `dev-access-logs.json` (e probe) | `src/dev-access/services/dev-access.service.js` |

**`backend/data/sessions/` (Express, produzione)**

| Meccanismo | Dettaglio |
|------------|-----------|
| File per sessione | `src/config/session.js` — **`session-file-store`** quando `NODE_ENV=production` scrive file sotto `data/sessions/`. In **dev** lo store è in-memory (nessun file). |

#### Per tenant — `backend/data/tenants/{tenantId}/`

Elenco file tipici (nome file = persistenza dominio). **Repository principale** tra parentesi.

| File | Repository / servizio |
|------|------------------------|
| `orders.json` | **Non è più la fonte primaria** se MySQL popolato: vedi §1.3. Migrazione one-shot in `orders.repository.sql.js`. |
| `menu.json` | `menu.repository.js` |
| `daily-menu.json` | `daily-menu.repository.js` |
| `inventory.json` | `inventory.repository.js` |
| `stock-movements.json` | `stock-movements.repository.js` |
| `inventory-transfers.json` | `inventory-transfers.repository.js` |
| `bookings.json` | `bookings.repository.js` |
| `closures.json` | `closures.repository.js` |
| `storni.json` | `storni.repository.js` |
| `reports.json` | `reports.repository.js` |
| `payments.json` | `payments.repository.js` |
| `staff.json` | `staff.repository.js` |
| `staff-shifts.json` | `shifts.repository.js` |
| `staff-requests.json` | `staff-requests.repository.js` |
| `sessions.json` | `sessions.repository.js` (sessioni **staff access**, non Express) |
| `cassa-shifts.json` | `cassa-shifts.repository.js` |
| `pos-shifts.json` | **Legacy file** — turni POS cassa sono migrati a **MySQL** via `pos-shifts.repository.js` → `cash.repository.sql.js` |
| `recipes.json` | `recipes.repository.js` |
| `haccp-checks.json` | `haccp.repository.js` |
| `customers.json` | `customers.repository.js` |
| `devices.json` | `devices.repository.js` |
| `qr-tables.json` | `qr-tables.repository.js` |
| `print-routes.json`, `print-jobs.json` | `print-routes.repository.js`, `print-jobs.repository.js` |
| `catering-events.json`, `catering-presets.json` | `catering.repository.js`, `catering-presets.repository.js` |
| `order-food-costs.json` | `order-food-costs.repository.js` |
| `attendance.json` | `attendance.repository.js` |
| `leave-requests.json` | `leave.repository.js` |
| `license.json` | `licenseValidation`, `licenses.repository`, Stripe sync, super-admin |
| `owner-setup.json` | `config/ownerSetup.js` (se presente) |
| `settings.json` | `service/onboarding.service.js` (onboarding) |
| `email-smtp.json` | `service/tenantEmailSettings.service.js` |

**File generati in `data/` da onboarding / non sempre in repo**

| Percorso | Modulo |
|----------|--------|
| `tenants/{id}/` creato con molti JSON seed | `service/onboarding.service.js`, `controllers/setup.controller.js` |

**File su disco senza riferimento sicuro in `src` (possibili legacy)**

- Esempi tipici da cartelle dati reali: `cateringMenus.json`, `productionHistory.json`, `crmClients.json` — **verificare** prima di cancellare; potrebbero essere orfani o usati da script esterni.

### 1.2 Già persistenza MySQL (pool `mysql2`, `config/db.js` / `config/dbPool.js`)

| Dominio | File / modulo | Note |
|---------|---------------|------|
| **Ordini** | `repositories/orders.repository.sql.js` | Tabelle `orders`, `order_items` con **PK composta `(tenant_id, id)`**. Lettura/scrittura **non** passa da `orders.json` salvo migrazione iniziale se tabella vuota. |
| **Turni cassa / POS (cash_sessions)** | `repositories/cash.repository.sql.js`, `pos-shifts.repository.js` | Sessioni incassi e turni POS collegati al modello cash SQL. |
| **Licenze** (registry) | `utils/ensureLicensesTable.js`, `middleware/license.middleware.js` | Tabella `licenses`. |
| **Tenant registry** | `utils/ensureTenantsTable.js` | Tabella `tenants`. |
| **Scarico ingredienti (ordine)** | `services/inventory.service.js` | Tabelle `recipes`, `inventory` (create if not exists) — **uso parziale** (deduzione qty); il **CRUD magazzino** resta su JSON (`inventory.repository.js`). |
| **KPI / report SQL** | `services/kpi.service.js`, `owner.routes.js` (query) | Query dove implementato. |

### 1.3 `localStorage` / `sessionStorage` (browser)

Non sono fonte di verità server-side; convivono con le API.

| File | Uso |
|------|-----|
| `public/shared/api.js` | Token API (`TOKEN_KEY`) |
| `public/shared/auth-guard.js`, `login/login.js`, `dashboard/dashboard.js` | `rw_auth`, `licenseKey` |
| `public/shared/staff-access.js` | **`sessionStorage`** sessione staff manager |
| `public/js/i18n.js` | Lingua |
| `public/sala/sala.js` | Piano tavoli, flag, corsi (`LS_*`), cache `rw_menu_official` |
| `public/cassa/cassa.js` | Void/split/payment per tavolo, cache menù, report/fatture locali |
| `public/cucina/cucina.js` | Lista spesa, fornitori, turni cucina, note vocali, ecc. |
| `public/pizzeria/pizzeria.js` | Ricette/note locali |
| `public/bar/bar.js` | Ricette bar, note |
| `public/supervisor/supervisor.js` | Cache menù |
| `public/magazzino/attrezzature.js` | attrezzature (`ristoword_attrezzature`) |
| `public/asporto/asporto.js` | ordini asporto locali |
| Altri moduli | `localStorage.removeItem("rw_auth")` su logout in più pagine |

### 1.4 Altri meccanismi

| Meccanismo | Dettaglio |
|------------|-----------|
| **Backup** | `utils/backup.js` — copia `backend/data` → `backend/backups/backup-<timestamp>/` |
| **WebSocket** | `service/websocket.service.js` — stato in memoria; non persistenza ordini |
| **Repository in-memory** | `repositories/license.repository.js` — oggetto in RAM (flussi reali usano file/DB altrove) |
| `repositories/license.repository.js` | In-memory; non persistenza duratura |
| **fileStore** | `utils/fileStore.js` — usato da `customers.repository.js` e altri |
| **safeFileIO** | `utils/safeFileIO.js` — lettura/scrittura atomica JSON |

### 1.5 Anomalia nel tree

| File | Nota |
|------|------|
| `src/repositories/movements.repository.js` | Contenuto **duplicato** del flusso controller report (codice `/api/reports`); i movimenti magazzino reali sono in **`stock-movements.repository.js`**. Da non usare come fonte dati finché non ripulito. |

---

## 2. Moduli coinvolti (dove legge / scrive / JSON / localStorage / repository)

Legenda: **API** = HTTP verso backend; **JSON** = file sotto `data/`; **SQL** = MySQL già usato.

### Sala

| | |
|--|--|
| **Frontend** | `public/sala/sala.js` |
| **Legge** | API: ordini, menù, prenotazioni, staff; **localStorage**: layout mappa, flag tavoli, bozze corsi, cache menù |
| **Scrive** | API ordini (POST/PATCH); localStorage |
| **Server** | Ordini: **SQL** (`orders.repository.sql.js`). Menù: **JSON** `menu.json`. Prenotazioni: **JSON** `bookings.json`. QR tavoli: **JSON** `qr-tables.json`. Staff session: **JSON** `sessions.json`. |
| **Repository** | `orders.repository.js` → SQL; `menu.repository.js`; `bookings.repository.js`; `sessions.repository.js`; `qr-tables.repository.js` |
| **Route tipiche** | `routes/orders.routes.js`, `menu.routes.js`, `bookings.routes.js`, … |

### Cucina

| | |
|--|--|
| **Frontend** | `public/cucina/cucina.js` |
| **Legge/Scrive API** | Ordini, ricette, HACCP, magazzino |
| **localStorage** | Lista spesa, fornitori, turni cucina, note vocali, ecc. |
| **Server** | Ordini **SQL**; `recipes.json`, `haccp-checks.json`, `inventory.json`, `stock-movements.json` **JSON** |
| **Repository** | `orders`, `recipes`, `haccp`, `inventory`, `stock-movements` |

### Pizzeria

| | |
|--|--|
| **Frontend** | `public/pizzeria/pizzeria.js` |
| **localStorage** | Ricette/note locali |
| **Server** | Ordini **SQL**; ricette globali possibili via `recipes.json` se allineate |

### Bar

| | |
|--|--|
| **Frontend** | `public/bar/bar.js` |
| **localStorage** | Ricette bar, note |
| **Server** | Ordini **SQL**; `recipes.json` se unificato |

### Cassa

| | |
|--|--|
| **Frontend** | `public/cassa/cassa.js` |
| **API** | Ordini, pagamenti, chiusure, storni, menù |
| **localStorage** | Void, split, config pagamento, cache menù, report/fatture locali |
| **Server** | Ordini **SQL**; `payments.json`, `closures.json`, `storni.json` **JSON**; turni cassa cassiere: `cassa-shifts.json` **JSON**; turni POS: **SQL** `cash_sessions` |
| **Repository** | `orders`, `payments`, `cassa-shifts`, `closures`, `storni`, `pos-shifts` (SQL) |

### Magazzino

| | |
|--|--|
| **Frontend** | `public/magazzino/magazzino.js`, `attrezzature.js` |
| **API** | Inventario, movimenti, trasferimenti |
| **localStorage** | Solo attrezzature in `attrezzature.js` |
| **Server** | **JSON**: `inventory.json`, `stock-movements.json`, `inventory-transfers.json`. **SQL parziale**: tabelle `inventory`/`recipes` in `services/inventory.service.js` per deduzione ingredienti. |

### Menu del giorno

| | |
|--|--|
| **UI/API** | Route daily-menu |
| **Server** | **JSON** `daily-menu.json` — `daily-menu.repository.js` |

### Prenotazioni

| | |
|--|--|
| **Server** | **JSON** `bookings.json` — `bookings.repository.js` |
| **Frontend** | `public/prenotazioni/prenotazioni.js` |

### Catering

| | |
|--|--|
| **Server** | **JSON** `catering-events.json`, `catering-presets.json` |
| **Repository** | `catering.repository.js`, `catering-presets.repository.js` |

### QR tavoli

| | |
|--|--|
| **Pubblico** | `/qr/:table` → `POST /api/qr/orders` |
| **Admin** | **JSON** `qr-tables.json` — `qr-tables.repository.js` |
| **Ordini** | **SQL** |

### Staff / turni / presenze

| | |
|--|--|
| **Server** | **JSON**: `staff.json`, `staff-shifts.json`, `staff-requests.json`, `attendance.json`, `leave-requests.json`, `sessions.json` (staff access) |
| **Turni cassa (file)** | `cassa-shifts.json` |
| **Turni POS** | **SQL** `cash_sessions` |
| **Repository** | `staff`, `shifts`, `staff-requests`, `attendance`, `leave`, `sessions`, `cassa-shifts`, `pos-shifts` |

### Supervisor / dashboard

| | |
|--|--|
| **Frontend** | `public/supervisor/supervisor.js`, `public/dashboard/dashboard.js` |
| **Legge** | API aggregate; localStorage cache menù |
| **Server** | Stessi repository degli altri moduli via API |

### Licenze / owner / auth

| | |
|--|--|
| **Server** | **JSON**: `users.json`, `restaurants.json`, `licenses.json`, `license.json`, `tenants/*/license.json`. **SQL**: tabella `licenses`, middleware licenza |
| **Repository** | `users.repository.js`, `restaurants.repository.js`, `licenses.repository.js`, `auth.repository.js` |
| **Super Admin** | `data/super-admin/*.json` |

### AI / report / inventory / ricette

| | |
|--|--|
| **AI** | `ai-last-output.json`; servizi AI |
| **Report** | **JSON** `reports.json` |
| **Inventory** | **JSON** + **SQL** parziale (vedi §1.2) |
| **Ricette** | **JSON** `recipes.json` + righe SQL in `recipes` per deduzione |

### Stripe / checkout

| | |
|--|--|
| **JSON** | `stripe-mock.json`, `stripe-live-webhook-events.json`, `licenses.json`, `tenants/*/license.json` |
| **SQL** | `tenants` (provisioning Stripe in `stripeProvisionDb.service.js` dove presente) |

---

## 3. Priorità di migrazione

### Prima (core operativo e volumi alti)

1. **`orders` / `order_items`** — già su SQL; verificare **solo DB** in produzione, archiviare JSON dopo migrazione.
2. **`users` + `restaurants` + mapping tenant** — identità e tenant (oggi JSON).
3. **`payments` + chiusure economiche** — `payments.json`, `closures.json`, `storni.json` (cassa).
4. **`menu.json` + `daily-menu.json`** — offerta venduta.

### Dopo

5. **Magazzino completo** — unificare `inventory.json` / movimenti con modello SQL (oggi dual JSON + SQL parziale).
6. **`bookings`, catering, staff, turni** (file JSON), `sessions` staff.
7. **`reports`, `customers`, `devices`, print`, `haccp`, `order-food-costs`**.

### Può restare temporaneamente file o browser

- **localStorage** (cache UI, preferenze) se le API restano identiche.
- **File piccoli**: `ai-last-output.json`, `stripe-live-webhook-events.json`, `system-maintenance.json`.
- **Super-admin / dev-access** — possono restare file-based nella prima fase.
- **Session Express su file** — accettabile in single-instance; per **multi-istanza** Railway serve **Redis o session store SQL**.

### Critico per produzione

- Ordini, pagamenti, menù, utenti/tenant, licenze attive.
- **Sessioni login** (Express + file) e **coerenza** con più repliche.

---

## 4. Proposta schema DB minimo (logico, senza DDL)

Obbligatorio: colonna **`tenant_id`** (VARCHAR o INT) su quasi tutte le tabelle operative, allineata a `tenantContext`.

| Tabella | Campi essenziali | Relazioni |
|---------|------------------|-----------|
| **tenants** | `id`, nome, slug, `created_at` | 1—N verso dati tenant |
| **users** | `id`, `tenant_id` (se multi-tenant), `username`, `password_hash`, `role`, `active` | FK → tenants |
| **restaurants** | (o estensione tenants) dati anagrafici onboarding | FK tenants |
| **orders** | `(tenant_id, id)` PK, `table_number`, `covers`, `area`, `waiter`, `status`, `notes`, `active_course`, `created_at`, `updated_at`, totali opzionali | 1—N **order_items** |
| **order_items** | `id` PK, `tenant_id`, `order_id`, `name`, `category`, `type`, `qty`, `notes`, `course`, `price`, … | FK (tenant_id, order_id) → orders |
| **payments** | `id`, `tenant_id`, importi, metodo, riferimenti ordine/tavolo, timestamp | → orders opzionale |
| **cash_sessions** | già presente (turni POS/cassa SQL) | per tenant |
| **cassa_shifts** (se distinto da cash JSON) | turni cassa file-based o unificazione in cash_sessions | da definire |
| **closures** | chiusura giornaliera Z, `tenant_id`, data, totali | |
| **storni** | voci storno, `tenant_id`, `payment_id`/`order_id` | |
| **menu_items** | voci menù per tenant, prezzi, categorie, `active` | |
| **daily_menu** | data, `tenant_id`, snapshot o FK a voci | |
| **inventory_items** | ingredienti/prodotti, qty, `tenant_id` | |
| **stock_movements** / **inventory_movements** | carico/scarico, riferimento ordine opzionale | |
| **inventory_transfers** | da/a reparto | |
| **bookings** | cliente, data/ora, persone, stato | |
| **catering_events**, **catering_presets** | eventi e preset | |
| **staff_members** | anagrafica estesa (o JSONB in colonna) | |
| **staff_shifts**, **staff_requests** | turni e richieste | |
| **attendance**, **leave_requests** | presenze e permessi | |
| **qr_tables** | configurazione tavoli QR | |
| **print_routes**, **print_jobs** | stampa | |
| **licenses** | già in DB; codice, `tenant_id`, scadenza, stato | |
| **tenant_settings** | merge owner-setup, settings, flags | |
| **tenant_smtp** | SMTP (password cifrata) | |
| **reports** | report salvati o metadati + blob JSON | |

**Nota:** `dining_tables` (layout sala) oggi è **soprattutto localStorage** in Sala + `numTables` configurazione; eventuale tabella `floor_layout` è **nice-to-have**, non bloccante per il core ordini.

---

## 5. Impatto tecnico

### Repository sostituibili con SQL (adattare implementazione, stessa interfaccia)

Tutti i `*.repository.js` che usano `safeReadJson` / `atomicWriteJson` / `fs` sono candidati a **adapter SQL** dietro la stessa API.

**Già SQL o parziale:**

- `orders.repository.js` → `orders.repository.sql.js`** (completo ordini).
- `cash.repository.sql.js`, `pos-shifts.repository.js` (turni POS).
- `ensureLicensesTable` / `ensureTenantsTable`.

### Endpoint / controller

- **Cambiano poco** se i repository mantengono la stessa firma e gli stessi shape JSON: `controllers/*` e `routes/*` restano; si sostituisce l’implementazione interna.

### Frontend

- **Non si accorge** se **`/api/*`** restituisce gli stessi oggetti; le modifiche sono lato server.

---

## 6. Output finale

### FASE 1 MIGRAZIONE CONSIGLIATA (operativa)

1. **Congelare comportamento API** e documentare shape JSON per dominio.
2. **Ordini**: già su MySQL — in produzione, **verificare** assenza di dipendenze da `orders.json` attivo; backup JSON e pulizia pianificata.
3. **Utenti + tenant (`users.json`, `restaurants.json`)** → **prima grande migrazione** dopo ordini (identità).
4. **Pagamenti + chiusure + storni** → blocco cassa.
5. **Menù + daily menu** → blocco vendita.
6. **Session store** produzione: valutare **Redis** o tabella sessioni per più istanze Railway.

### File da toccare nella prima fase (quando si implementa)

- `backend/src/repositories/users.repository.js`, `restaurants.repository.js`
- Eventualmente `backend/src/config/session.js` (store)
- **Non** obbligatorio: `public/*` se l’API è invariata

### Rischio

| Area | Rischio |
|------|---------|
| Utenti + login + sessioni | **Alto** |
| Ordini + pagamenti | **Alto** (ordini già mitigati se solo SQL) |
| Menù + daily | **Medio** |
| Magazzino (dual JSON/SQL) | **Medio–Alto** |
| localStorage-only UI | **Basso** (fuori DB) |
| Super-admin / dev-access | **Medio** |

### Ordine esatto dei lavori suggerito

1. Verifica produzione: **ordini solo DB** + backup JSON.
2. DDL + migrazione **users/restaurants/licenses** coerenti con `tenant_id`.
3. **payments / closures / storni**.
4. **menu / daily-menu**.
5. Unificare **inventory** (JSON + SQL deduzione).
6. Domini rimanenti per priorità business.
7. Spegnere scrittura JSON dove sostituita da SQL; export solo backup.

---

*Documento di audit interno. Aggiornare quando cambiano repository o nuovi file in `data/`.*
