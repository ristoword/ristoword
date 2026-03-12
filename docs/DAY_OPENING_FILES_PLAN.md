# Day Opening / Z Closure – Files Modification Plan

## Summary

| Action | Count |
|--------|-------|
| **New files** | 2 |
| **Modified files** | 8 |

---

## 1. NEW FILES TO CREATE

| File | Purpose |
|------|---------|
| `backend/data/day_open.json` | Current open business day: `{ date, openedAt, openedBy }` (auto-created) |
| `backend/src/repositories/day-open.repository.js` | CRUD for day_open: get, ensureOpen (auto-open today if not closed) |

---

## 2. FILES TO MODIFY

### Backend

| File | Modifications | Reason |
|------|---------------|--------|
| `backend/src/repositories/closures.repository.js` | Add `finalized: true` to closure records on create | Mark day as finalized after Z |
| `backend/src/repositories/day-open.repository.js` | (new file) | Day opening persistence |
| `backend/src/controllers/closures.controller.js` | Add `getDayStatus(date)` logic: call day-open + closures; auto-open today if not closed; expose via new route | Day status API with auto-open |
| `backend/src/routes/closures.routes.js` | Add `GET /day-status/:date` | Day status endpoint |
| `backend/src/controllers/payments.controller.js` | In `createPayment`: call day-open.ensureOpen(today), then `closures.isDayClosed(today)`; if closed return 403 | Block payments when day finalized |
| `backend/src/app.js` | (no change – closures routes already registered) | — |

### Frontend – Cassa

| File | Modifications | Reason |
|------|---------------|--------|
| `backend/public/cassa/cassa.html` | Add "Storico chiusure Z" card in Report tab (col-right), with `id="closure-history"` | Closure history visibility |
| `backend/public/cassa/cassa.js` | (1) Add `dayStatus` state; fetch from `GET /api/closures/day-status/:date`; (2) Disable tavoli/payment actions if `!dayStatus.open` or `dayStatus.closed`; show overlay/message; (3) Update `fetchDayStatus` to use new API; (4) Add `renderClosureHistory()` and call on Report tab | Prevent ops when day not open; show history |

### Frontend – Chiusura

| File | Modifications | Reason |
|------|---------------|--------|
| `backend/public/cassa/chiusura.html` | Add "Storico chiusure Z" card in col-right (before or after Dettaglio pagamenti) | Closure history on closure page |
| `backend/public/cassa/chiusura.js` | Add `renderClosureHistory()`, fetch `GET /api/closures`, display list; call on load and after Z close | Populate closure history |

---

## 3. API CHANGES

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/closures/day-status/:date` | `{ open, closed, openedAt?, openedBy?, closedAt?, closedBy?, finalized? }`. Auto-opens today if not closed. |
| (existing) | GET `/api/closures` | List closures (used for history) |
| (existing) | POST `/api/closures` | Create Z closure (add `finalized: true`) |
| (existing) | POST `/api/payments` | **Modified**: reject 403 if day closed |

---

## 4. LOGIC FLOW

### Day status (GET /api/closures/day-status/:date)
1. If `closures.isDayClosed(date)` → return `{ open: false, closed: true, closedAt, closedBy, finalized: true }`
2. If `date !== today` → return `{ open: false, closed: false }` (no auto-open for past/future)
3. If `dayOpen.get(date)` exists → return `{ open: true, closed: false, openedAt, openedBy }`
4. Else (today, not closed, not opened) → `dayOpen.ensureOpen(date, "system")` → return `{ open: true, closed: false, openedAt, openedBy }`

### Payments
- Before create: `ensureDayOpen(today)`; if `isDayClosed(today)` → 403

### Closure creation
- Set `finalized: true` on closure record

---

## 5. UNCHANGED (per requirements)
- Payment UI flow (modal, confirm, etc.)
- Staff login flow
- Z closure button and redirect to chiusura
- Backend route structure (only additions)
