# Customer / CRM Module – Advanced Intelligence Features

## Summary

This document lists **exactly which files will be created or modified** to add advanced restaurant intelligence to the Customer/CRM module. **AI-related files are excluded**. The plan assumes the base CRM (customers, bookings with customer linkage, tables) is implemented per `CUSTOMER_CRM_IMPLEMENTATION_PLAN.md`.

---

## Feature Overview

| # | Feature | Backend Components |
|---|---------|--------------------|
| 1 | Automatic VIP/Top/Normal classification rules | `customers.service` + `crm-rules` config |
| 2 | Birthday and anniversary alerts | New endpoint `GET /api/crm/alerts` |
| 3 | Customer arrival summary (reservations + sala) | `GET /api/crm/arrival-summary` |
| 4 | Table suggestion for reserved customers | `bookings.service.suggestTable()` + endpoint |
| 5 | Customer spending and loyalty reporting (supervisor) | `crm-reports.service` + `GET /api/reports/crm/*` |
| 6 | No-show tracking | Customer history + `GET /api/crm/no-shows` |
| 7 | Customer feedback and notes history timeline | `GET /api/customers/:id/timeline` |

---

## 1. NEW FILES (Create)

### 1.1 Classification Rules Config

| File | Purpose |
|------|---------|
| `backend/data/crm-rules.json` | Configurable thresholds for VIP/Top/Normal: `{ vipThresholdSpent, topThresholdSpent, topThresholdVisits, vipThresholdVisits, maxNoShowRateForTop, ... }` |

### 1.2 CRM Alerts & Summary Service

| File | Purpose |
|------|---------|
| `backend/src/service/crm-alerts.service.js` | `getBirthdayAnniversaryAlerts(date)` – customers with birthday/anniversary on date or in next N days. |
| `backend/src/service/crm-arrival.service.js` | `getArrivalSummary(date)` – today’s reservations with enriched customer data (allergies, intolerances, preferences, category, favorite table). |

### 1.3 CRM Reports Service

| File | Purpose |
|------|---------|
| `backend/src/service/crm-reports.service.js` | `buildSpendingLoyaltyReport(dateFrom, dateTo)` – top customers by spend, loyalty metrics, category breakdown, no-show stats. `buildNoShowReport(dateFrom, dateTo)` – list no-shows in period with customer details. |

### 1.4 CRM Controller & Routes

| File | Purpose |
|------|---------|
| `backend/src/controllers/crm.controller.js` | Handlers: alerts, arrival-summary, no-shows. |
| `backend/src/routes/crm.routes.js` | `GET /api/crm/alerts`, `GET /api/crm/arrival-summary`, `GET /api/crm/no-shows`. |

---

## 2. MODIFIED FILES

### 2.1 Automatic Classification (Feature 1)

| File | Changes | Reason |
|------|---------|--------|
| `backend/src/service/customers.service.js` | Add `classifyCustomer(customer, history)` using rules from `crm-rules.json`. Call it: (a) after `findOrCreate`, (b) when computing history, (c) in `update` when spending/visits change. Persist `category` on customer. | Apply VIP/Top/Normal rules based on spent, visits, no-show rate. |
| `backend/data/crm-rules.json` | **New file** (see §1.1). | Centralized, editable thresholds. |

### 2.2 Birthday & Anniversary Alerts (Feature 2)

| File | Changes | Reason |
|------|---------|--------|
| `backend/src/service/crm-alerts.service.js` | **New file** – load customers, filter by `birthday` and `anniversaries[].date` matching `date` (or next 7 days). Return `{ birthdays: [], anniversaries: [] }`. | Provide alert data for dashboard/supervisor. |
| `backend/src/controllers/crm.controller.js` | Handler for `GET /api/crm/alerts?date=YYYY-MM-DD&days=7`. | Expose alerts API. |
| `backend/src/routes/crm.routes.js` | Mount `GET /alerts`. | Route for alerts. |

### 2.3 Customer Arrival Summary (Feature 3)

| File | Changes | Reason |
|------|---------|--------|
| `backend/src/service/crm-arrival.service.js` | **New file** – `getArrivalSummary(date)` loads bookings for date with status in [nuova, confermata, arrivato], enriches each with customer profile (allergies, intolerances, preferences, category, favoriteTable, favoriteArea). Returns array for prenotazioni/sala. | Show arrival info with customer context. |
| `backend/src/controllers/crm.controller.js` | Handler for `GET /api/crm/arrival-summary?date=YYYY-MM-DD`. | Expose arrival summary. |
| `backend/src/routes/crm.routes.js` | Mount `GET /arrival-summary`. | Route for arrival summary. |

### 2.4 Table Suggestion (Feature 4)

| File | Changes | Reason |
|------|---------|--------|
| `backend/src/service/bookings.service.js` | Add `suggestTables(booking, customer)` – filter tables by: capacity >= people, area matches customer.favoriteArea if set, prefer customer.favoriteTable. Return ordered suggestions. | Suggest tables based on group size and preferences. |
| `backend/src/controllers/bookings.controller.js` | Add handler for `GET /api/bookings/:id/suggest-tables` (or include in booking response). | Expose table suggestions. |
| `backend/src/routes/bookings.routes.js` | Add `GET /:id/suggest-tables`. | Route for suggestions. |

### 2.5 Spending & Loyalty Reporting (Feature 5)

| File | Changes | Reason |
|------|---------|--------|
| `backend/src/service/crm-reports.service.js` | **New file** – `buildSpendingLoyaltyReport(dateFrom, dateTo)` aggregates payments by customerId, joins customers, computes: total spent, visit count, avg spend, category. Sorted by spend. | Supervisor reporting. |
| `backend/src/controllers/reports.controller.js` | Add `getCrmSpendingLoyaltyReport` – calls crm-reports.service, returns JSON. | New report endpoint. |
| `backend/src/routes/reports.routes.js` | Add `GET /crm/spending-loyalty?dateFrom=&dateTo=`. | Route for CRM report. |

### 2.6 No-Show Tracking (Feature 6)

| File | Changes | Reason |
|------|---------|--------|
| `backend/src/service/crm-reports.service.js` | Add `buildNoShowReport(dateFrom, dateTo)` – list bookings with status `no_show` in period, join customer. | Dedicated no-show report. |
| `backend/src/controllers/crm.controller.js` | Handler for `GET /api/crm/no-shows?dateFrom=&dateTo=`. | Expose no-show list. |
| `backend/src/routes/crm.routes.js` | Mount `GET /no-shows`. | Route for no-shows. |
| `backend/src/service/customers.service.js` | Ensure `getHistory` includes `noShowCount`; classification uses it. | Already in plan; no extra change. |

### 2.7 Feedback & Notes Timeline (Feature 7)

| File | Changes | Reason |
|------|---------|--------|
| `backend/src/service/customers.service.js` | Add `getTimeline(customerId)` – merge: feedbackHistory, notes (if stored as events), reservations (with status), payments. Return sorted by date. | Single timeline for customer activity. |
| `backend/src/controllers/customers.controller.js` | Add handler for `GET /api/customers/:id/timeline`. | Expose timeline. |
| `backend/src/routes/customers.routes.js` | Add `GET /:id/timeline`. | Route for timeline. |

### 2.8 App & Route Registration

| File | Changes | Reason |
|------|---------|--------|
| `backend/src/app.js` | Add `app.use("/api/crm", crmRouter)`. | Mount CRM alerts, arrival-summary, no-shows. |

---

## 3. NEW ROUTES (Summary)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/crm/alerts?date=&days=` | Birthday and anniversary alerts |
| `GET` | `/api/crm/arrival-summary?date=` | Customer arrival summary for reservations/sala |
| `GET` | `/api/crm/no-shows?dateFrom=&dateTo=` | No-show tracking report |
| `GET` | `/api/bookings/:id/suggest-tables` | Table suggestions for a reservation |
| `GET` | `/api/reports/crm/spending-loyalty?dateFrom=&dateTo=` | Spending and loyalty report for supervisor |
| `GET` | `/api/customers/:id/timeline` | Customer feedback and notes history timeline |

---

## 4. DATA STRUCTURES

### 4.1 `crm-rules.json`

```json
{
  "vipThresholdSpent": 2000,
  "topThresholdSpent": 500,
  "vipThresholdVisits": 20,
  "topThresholdVisits": 5,
  "maxNoShowRateForTop": 0.2,
  "maxNoShowRateForVip": 0.1
}
```

### 4.2 Arrival Summary Response

```json
{
  "date": "2026-03-10",
  "arrivals": [
    {
      "bookingId": "...",
      "time": "20:30",
      "name": "Mario Rossi",
      "guests": 4,
      "status": "confermata",
      "customerId": "cli_xxx",
      "category": "vip",
      "allergies": ["glutine"],
      "intolerances": [],
      "preferences": ["tavolo finestra"],
      "favoriteTable": 12,
      "favoriteArea": "sala"
    }
  ]
}
```

### 4.3 Customer Timeline Response

```json
{
  "customerId": "cli_xxx",
  "events": [
    { "type": "feedback", "date": "...", "note": "...", "staff": "..." },
    { "type": "reservation", "date": "...", "status": "arrivato", "guests": 4 },
    { "type": "payment", "date": "...", "total": 85 }
  ]
}
```

---

## 5. FILES NOT MODIFIED

| File / Folder | Reason |
|---------------|--------|
| `backend/src/service/ai-assistant.service.js` | Do not modify AI files. |
| `backend/src/controllers/ai.controller.js` | Same. |
| `backend/src/routes/ai.routes.js` | Same. |
| `backend/src/repositories/*` (except as in base plan) | No direct changes for advanced features. |

---

## 6. IMPLEMENTATION ORDER

1. Create `crm-rules.json` and extend `customers.service` with classification.
2. Create `crm-alerts.service.js`, `crm-arrival.service.js`, `crm-reports.service.js`.
3. Create `crm.controller.js`, `crm.routes.js`; mount in `app.js`.
4. Add `suggestTables` to `bookings.service`; add route `GET /bookings/:id/suggest-tables`.
5. Add `getCrmSpendingLoyaltyReport` to reports controller; add route `/reports/crm/spending-loyalty`.
6. Add `getTimeline` to `customers.service`; add route `GET /customers/:id/timeline`.

---

## 7. DEPENDENCIES ON BASE CRM

These advanced features require the base CRM to exist:

- `customers.repository.js`, `customers.service.js`, `customers.json`
- `bookings.repository.js` with `customerId`, `status`, persistence
- `bookings.service.js` with find-or-create customer
- `tables.repository.js`, `tables.json`
- `payments.repository.js` with `customerId`

If the base CRM is not yet implemented, implement it first per `CUSTOMER_CRM_IMPLEMENTATION_PLAN.md`, then apply this plan.
