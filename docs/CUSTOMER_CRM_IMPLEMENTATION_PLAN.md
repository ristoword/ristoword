# Customer / CRM Module – Implementation Plan

## Summary

This document lists **exactly which files will be created or modified** to implement the advanced Customer/CRM module for Ristoword. **AI-related files are excluded** from changes.

---

## 1. NEW FILES (Create)

### 1.1 Customer Profile System

| File | Purpose |
|------|---------|
| `backend/data/customers.json` | JSON storage for customer profiles (array). Initially `[]`. |
| `backend/src/repositories/customers.repository.js` | CRUD for customers: load/save from `data/customers.json`. Find by phone, email, name. |
| `backend/src/service/customers.service.js` | Business logic: find-or-create customer, compute history (reservation count, visit count, no-show count, total spent, average spent, last visit). |
| `backend/src/controllers/customers.controller.js` | REST handlers: list, get by id, create, update, search, get history. |
| `backend/src/routes/customers.routes.js` | Express router: `GET /`, `GET /:id`, `GET /:id/history`, `POST /`, `PATCH /:id`, `GET /search`. |

**Customer profile schema:**
```js
{
  id: "cli_xxx",           // UUID
  name: "",
  surname: "",
  phone: "",
  email: "",
  notes: "",
  birthday: "",            // ISO date string
  anniversaries: [],       // [{ label, date }]
  allergies: [],           // ["glutine", ...]
  intolerances: [],        // ["lattosio", ...]
  preferences: [],         // ["tavolo vicino finestra", ...]
  favoriteTable: null,     // table number or null
  favoriteArea: "",        // "sala", "terrazzo", etc.
  feedbackHistory: [],     // [{ date, note, staff }]
  category: "normal",      // "normal" | "top" | "vip"
  createdAt: "",
  updatedAt: ""
}
```

### 1.2 Sala Tables Configuration

| File | Purpose |
|------|---------|
| `backend/data/tables.json` | Configuration of sala tables: `[{ id, number, area, capacity, label }]`. Enables table assignment and availability checks. |
| `backend/src/repositories/tables.repository.js` | Load tables config, get available tables (exclude those in active orders). |

---

## 2. MODIFIED FILES

### 2.1 Bookings (Reservations)

| File | Changes | Reason |
|------|---------|--------|
| `backend/data/bookings.json` | **Replace** current single-object schema with `[]` (empty array). Bookings will be persisted here. | Backend currently uses in-memory array; migrate to JSON persistence. |
| `backend/src/repositories/bookings.repository.js` | 1) Use `fileStore` / `data/bookings.json` for persistence. 2) Add fields: `customerId`, `assignedTable`, `assignedArea`, `status` (nuova/confermata/arrivato/no_show/cancellata). 3) Keep `name`, `phone`, `people`, `date`, `time`, `note` for backward compatibility. | Connect bookings to customers and tables; persist data. |
| `backend/src/service/bookings.service.js` | **NEW** – Extract business logic: on create, call customers.service.findOrCreate; link reservation to customer; optionally assign table. | Find-or-create customer when reservation is created. |
| `backend/src/controllers/bookings.controller.js` | Use `bookings.service` instead of repository directly for create/update. Pass through customer find-or-create logic. | Orchestrate customer linkage. |

### 2.2 Routes & App

| File | Changes | Reason |
|------|---------|--------|
| `backend/src/app.js` | Add `app.use("/api/customers", customersRouter)` and `app.use("/api/tables", tablesRouter)`. | Mount new CRM and tables APIs. |

### 2.3 Payments (for Spending History)

| File | Changes | Reason |
|------|---------|--------|
| `backend/data/payments.json` | Existing. No schema change; add optional `customerId` on new payments. | Link payments to customers for total spent / average spent. |
| `backend/src/repositories/payments.repository.js` | In `normalizePaymentInput`, add `customerId: normalizeString(input.customerId, "")`. Persist and return it. | Enable spending history per customer. |
| `backend/src/controllers/payments.controller.js` | In `createPayment` and `updatePayment`, pass `customerId` from payload to repository. | Accept customerId from cassa/frontend. |

### 2.4 Orders (optional link)

| File | Changes | Reason |
|------|---------|--------|
| `backend/src/repositories/orders.repository.js` | No change. Orders stay as-is (table, covers, area, etc.). | Orders are linked to payments via `orderIds`; spending comes from payments. |

### 2.5 Config Paths (optional)

| File | Changes | Reason |
|------|---------|--------|
| `backend/src/config/paths.js` | Optional: add `CUSTOMERS`, `TABLES`, `BOOKINGS` data paths. | Consistency; not strictly required. |

---

## 3. NEW ROUTES

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/customers` | List customers (with optional filters) |
| `GET` | `/api/customers/:id` | Get customer profile with preferences |
| `GET` | `/api/customers/:id/history` | Get computed history (reservations, visits, no-shows, total spent, avg spent, last visit) |
| `GET` | `/api/customers/search?q=` | Search by name, phone, email |
| `POST` | `/api/customers` | Create customer |
| `PATCH` | `/api/customers/:id` | Update customer |
| `GET` | `/api/tables` | List all tables from config |
| `GET` | `/api/tables/available` | List tables not currently in use (no active orders) |

---

## 4. FILES NOT MODIFIED (AI & unrelated)

| File / Folder | Reason |
|---------------|--------|
| `backend/src/service/ai-assistant.service.js` | User requested: do not modify AI files. |
| `backend/src/controllers/ai.controller.js` | Same. |
| `backend/src/routes/ai.routes.js` | Same. |
| All other existing modules (menu, inventory, staff, etc.) | No direct dependency on CRM. |

---

## 5. DATA FLOW

1. **Reservation created** → `bookings.service.create` → find or create customer (by phone/email/name) → save booking with `customerId` → optionally assign table.
2. **Payment created** → `payments.controller` stores `customerId` when provided → used for spending history.
3. **Customer history** → `customers.service.getHistory` aggregates:
   - Reservation count: from `bookings` where `customerId` matches.
   - Visit count: from bookings with `status === "arrivato"`.
   - No-show count: from bookings with `status === "no_show"`.
   - Total spent / average spent: from `payments` where `customerId` matches.
   - Last visit: max date from bookings (arrivato) or payments.

---

## 6. BACKWARD COMPATIBILITY

- Existing bookings in memory will be lost on first run after migration; `bookings.json` starts empty. (Prenotazioni frontend uses localStorage separately; future work can sync to backend.)
- Existing payments without `customerId` remain valid; history will only include payments with `customerId`.
- Orders unchanged; no `customerId` on orders.
- All new code follows existing patterns: repositories for data, services for logic, controllers for HTTP.

---

## 7. IMPLEMENTATION ORDER

1. Create `customers.repository.js`, `customers.service.js`, `customers.controller.js`, `customers.routes.js`, `data/customers.json`.
2. Create `tables.repository.js`, `data/tables.json`, `tables.routes.js` (minimal controller or route-level logic).
3. Update `bookings.repository.js` (persistence + new fields), create `bookings.service.js`, update `bookings.controller.js`.
4. Update `payments.repository.js` and `payments.controller.js` for `customerId`.
5. Register routes in `app.js`.
