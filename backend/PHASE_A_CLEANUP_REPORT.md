# Phase A: Technical Cleanup Report

## Summary

Stabilized the Ristoword codebase by unifying data access, removing dead code, fixing broken references, and standardizing the route → controller → service → repository architecture.

---

## 1. Files Changed

| File | Change |
|------|--------|
| `src/service/orders.service.js` | Refactored to use `orders.repository` for all data access; removed duplicate I/O logic |
| `src/repositories/inventory.repository.js` | Added `create()`, `remove()`, `adjustQuantity()`, `nextId()` for full CRUD |
| `src/controllers/inventory.controller.js` | Updated to use repository; added `adjustInventory`; validated inputs |
| `src/routes/inventory.routes.js` | Replaced inline file I/O with controller delegation |
| `public/supervisor/supervisor.js` | Fixed `apiPing()` to use `/api/system/health` |
| `src/app.js` | Added `/api/health` alias for backward compatibility; shared health handler |
| `src/middleware/requireLicense.middleware.js` | Added `/api/health` to skip paths |

---

## 2. Duplications Removed

- **Orders**: Eliminated duplicate read/write logic between `orders.service` and `orders.repository`. The service now delegates all data access to the repository. Single source of truth for orders I/O.
- **Inventory**: Removed direct `safeReadJson`/`atomicWriteJson` usage from `inventory.routes.js`. Routes now delegate to controller → repository. No more dual inventory flows (legacy `data/inventory.json` vs tenant-aware).

---

## 3. Dead Code Removed or Isolated

- **Removed**: `src/service/stock-sync.service.js` – Unused; inventory sync is handled by `inventory.service.onOrderFinalized`.
- **Isolated**: `data/order.json` moved to `data/_legacy/order.json` with `_legacy/README.md` documenting it as orphan. Different schema from `orders.json`, no references in code.
- **Wired**: `inventory.controller.js` was dead; now used by refactored `inventory.routes.js`.

---

## 4. Broken References Fixed

- **Health endpoint**: Supervisor was calling `/api/health` (404). Fixed to `/api/system/health`. Also added `/api/health` as alias so both work.
- **License skip**: `/api/health` added to `SKIP_PATHS` so health checks work without license.
- **Inventory**: Routes no longer bypass controller; full chain route → controller → repository.

---

## 5. Architecture Standardized

| Area | Before | After |
|------|--------|-------|
| Orders | `orders.service` + `orders.repository` both doing I/O | Service uses repository only |
| Inventory | Routes with inline file access; controller unused | Routes → controller → repository |
| Health | Only `/api/system/health`; supervisor called wrong URL | Both `/api/health` and `/api/system/health` |

**Pattern**: route → controller → (service if needed) → repository → data file.

---

## 6. Remaining Risks

- **pos-shifts.repository.js** and **shifts.repository.js** still use hardcoded `data/` paths (not tenant-aware). Multi-tenant migration applied to other repos; these were left as-is per “no new features” constraint.
- **order.json** in `_legacy`: If any external script or doc expected it in `data/`, paths must be updated.
- **WebSocket**: Not modified. Verify WebSocket flows (e.g. order updates) after deploy.

---

## 7. Frontend Flows to Verify

After deployment, manually verify:

- [ ] Login
- [ ] Dashboard
- [ ] Sala (orders)
- [ ] Cucina (orders)
- [ ] Cassa (payments)
- [ ] Supervisor (health ping, reports, inventory)
- [ ] Magazzino (inventory list, add, adjust)
- [ ] QR ordering

---

## 8. No Breaking Changes

- API contracts unchanged
- Same endpoint paths and request/response shapes
- JSON data storage unchanged
- Tenant migration and behavior preserved
