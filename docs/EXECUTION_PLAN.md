# RISTOWORD – Execution Plan

**Created:** 2026-03-10  
**Scope:** Stabilize core workflow, then implement priorities 2–7

---

## 1. CURRENT WORKING MODULES

| Module | Status | Notes |
|--------|--------|-------|
| **Orders API** | ✅ Working | GET /, POST /, PATCH /:id/status; orders.service + orders.repository both use orders.json |
| **Menu API** | ✅ Working | GET /, GET /active, GET /:id, POST / |
| **Payments API** | ✅ Working | list, summary, current-shift, open, shift-change, partial-close, z-report, create, update, delete |
| **Reports API** | ✅ Working | GET /daily/summary, GET /accountant, CRUD reports |
| **Sala** | ✅ Working | Creates orders via POST /api/orders; uses localStorage for menu (rw_menu_official); WebSocket for live updates |
| **Cucina** | ✅ Working | KDS with status flow: in_attesa → in_preparazione → pronto → servito; PATCH /api/orders/:id/status |
| **Cassa** | ✅ Working | Close table (chiuso), create payment; shift operations; fetches /api/menu for menu tab |
| **Dashboard** | ✅ Working | Fetches orders + /api/reports/daily/summary; listens to rw:orders-update, rw:supervisor-sync |
| **WebSocket** | ✅ Working | /ws path; broadcasts orders_update, supervisor_sync; reconnection logic |
| **Closures** | ✅ Working | Z-report creates closure; blocks new payments when day closed |
| **POS shifts** | ✅ Working | pos-shifts.repository, payments.service: openShift, shiftChange, partialClose, zReport, getCurrentShift |

### Data Files (backend/data/)

- `orders.json` – active (orders.service + orders.repository)
- `order.json` – **orphan** (different schema, not referenced)
- `menu.json`, `payments.json`, `pos-shifts.json`, `closures.json` – in use
- `inventory.json`, `staff.json`, `recipes.json`, etc. – used by respective modules

---

## 2. BROKEN / RISKY MODULES

| Issue | Severity | Description |
|-------|----------|-------------|
| Duplicate route mounts | Low | app.js mounts menu, bookings, catering, staff, haccp, license, reports **twice** (lines 47–109 and 136–181). Redundant, no functional break. |
| Sala menu on first load | Medium | Sala reads menu from `localStorage` only. If user opens Sala before Cassa/menu-admin, menu is empty. No API fallback. |
| config/env.js uses dotenv | Low | `require("dotenv").config()` but `dotenv` not in package.json. Only loaded if env.js is required; server does not require it at startup. Risk if env added later. |
| order.json orphan | Low | Different schema, unused. Can cause confusion. |
| Inventory inline logic | Low | inventory.routes.js has logic inline; inventory.controller exists but unused. Works, but breaks route→controller→service pattern. |

---

## 3. ARCHITECTURE RISKS

1. **Dual orders access**: `orders.service` (used by orders.controller) and `orders.repository` (used by payments, websocket, reports, etc.) both read/write `orders.json`. Service does writes; repository is read-only for orders. **Mitigation:** Keep single write path (orders.service); repository only for reads. Current setup is acceptable.

2. **Menu sync Sala ↔ Cassa**: Sala uses localStorage; Cassa fetches /api/menu. Menu-admin writes to API. Flow: Menu-admin → API → Cassa syncs to localStorage → Sala reads localStorage. **Gap:** Sala has no API fallback when localStorage is empty.

3. **Route ordering**: Reports has GET /daily/summary before GET /:id – correct. Payments has shift routes before /:id – correct.

4. **Project path space**: Workspace path `ristoword ` has trailing space. Can cause issues with some tools. Manual rename recommended.

---

## 4. FILES TO TOUCH – PHASE 1 (Core Stability)

| File | Change |
|------|--------|
| `backend/src/app.js` | Remove duplicate route blocks (lines 103–181) |
| `backend/public/sala/sala.js` | Add fallback: if menu official empty, fetch from GET /api/menu and populate |
| `backend/package.json` | Add `dotenv` dependency (optional, for config/env.js safety) |

**No changes needed (verified):**
- orders.routes.js, orders.controller.js, orders.service.js
- payments.routes.js, payments.controller.js, payments.service.js
- menu.routes.js, reports.routes.js
- websocket.service.js, shared/websocket.js
- sala.html, cucina.html, cassa.html (script paths correct)
- Static path: express.static(public) → /sala/sala.html etc. work

---

## 5. PHASE 2–7 (High-Level)

| Phase | Scope |
|-------|--------|
| **2. Professional Cash Register** | ✅ Done. Storage: `pos-shifts.json`. Features: Open, Shift Change (with operator), Partial Close (with counted_cash + difference), Z Report. UI: operator in shift-change, cash difference in partial-close, enhanced shift status. |
| **3. Real Dashboard** | ✅ Done. GET /api/reports/dashboard-summary. Widgets: Active, Ready, Prep, Late orders; Open tables; Daily revenue; Average ticket; Cash status; Alerts. WebSocket supervisor_sync extended. |
| **4. Login / Roles / License** | ✅ Done. users.json, express-session, requireAuth/requireRole, requireLicense, auth-guard on pages. Owner/sala/cucina/cassa; license block except login/setup/QR. |
| **5. Module Integration** | recipes→inventory, sales→stock deduction, cash→dashboard, staff→operators/shifts, reports→real data. |
| **6. Real Reports** | Daily sales, payment methods, best-selling, kitchen timing, cash differences, stock consumption, margins. |
| **7. Demo / Sales Readiness** | Demo data, clean workflow, presentation UI, trial flow. |

---

## 6. PHASE 1 CHECKLIST

- [x] Remove duplicate route mounts in app.js
- [x] Add Sala menu API fallback when localStorage empty
- [x] Add dotenv to package.json
- [x] Verify all API routes and static pages (smoke test passed)
- [ ] Manual test: Sala create → Cucina status → Cassa close (recommended)
