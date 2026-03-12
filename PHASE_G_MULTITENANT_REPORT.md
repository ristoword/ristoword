# Phase G – Multi-Tenant Data Migration Report

**Date:** March 11, 2025  
**Goal:** Convert single-restaurant storage to tenant-aware architecture while preserving backward compatibility.

---

## 1. Files Modified

### Path and Context Helpers
| File | Change |
|------|--------|
| `src/config/paths.js` | Added `tenantDataPath(tenantId, fileName)`, `legacy(fileName)` |
| `src/context/tenantContext.js` | Added `getTenantIdFromRequest(req)` |
| `src/utils/tenantData.js` | **New** – `tenantDataPath()`, `ensureTenantFileWithLegacyFallback()` |

### Repositories Migrated to Tenant Paths
| File | Change |
|------|--------|
| `src/repositories/pos-shifts.repository.js` | Use `paths.tenantDataPath()` + legacy fallback |
| `src/repositories/shifts.repository.js` | Use `paths.tenantDataPath()` + legacy fallback |
| `src/repositories/cassa-shifts.repository.js` | Use `paths.tenantDataPath()` + legacy fallback |
| `src/repositories/staff-requests.repository.js` | Use `paths.tenantDataPath()` + legacy fallback |
| `src/repositories/sessions.repository.js` | Use `paths.tenantDataPath()` + legacy fallback |

### Migration
| File | Change |
|------|--------|
| `src/utils/tenantMigration.js` | Added `sessions.json` to `TENANT_FILES` |

---

## 2. Repositories Migrated

### Already Tenant-Aware (Unchanged)
- `orders.repository` – `paths.tenant(getRestaurantId(), "orders.json")`
- `inventory.repository` – `paths.tenant(getRestaurantId(), "inventory.json")`
- `menu.repository` – `paths.tenant(getRestaurantId(), "menu.json")`
- `bookings.repository` – `paths.tenant(getRestaurantId(), "bookings.json")`
- `catering.repository` – `paths.tenant(getRestaurantId(), "catering-events.json")`
- `haccp.repository` – `paths.tenant(getRestaurantId(), "haccp-checks.json")`
- `customers.repository` – `paths.tenant(getRestaurantId(), "customers.json")`
- `stock-movements.repository` – `paths.tenant(getRestaurantId(), "stock-movements.json")`
- `order-food-costs.repository` – `paths.tenant(getRestaurantId(), "order-food-costs.json")`
- `recipes.repository` – `paths.tenant(getRestaurantId(), "recipes.json")`
- `closures.repository` – `getDataDir()` → `data/tenants/{id}/`
- `payments.repository` – `getDataDir()` → `data/tenants/{id}/`
- `staff.repository` – `getDataDir()` → `data/tenants/{id}/`

### Migrated in Phase G
- `pos-shifts.repository` – `data/tenants/{id}/pos-shifts.json`
- `shifts.repository` – `data/tenants/{id}/staff-shifts.json`
- `cassa-shifts.repository` – `data/tenants/{id}/cassa-shifts.json`
- `staff-requests.repository` – `data/tenants/{id}/staff-requests.json`
- `sessions.repository` – `data/tenants/{id}/sessions.json`

---

## 3. Legacy Fallback Behaviour

1. **Bootstrap migration (startup):** `ensureTenantMigration()` copies `data/{file}.json` → `data/tenants/default/{file}.json` when the tenant file does not exist.
2. **Copy on first read:** Each migrated repository, when the tenant file is missing:
   - Copies from `data/{file}.json` if it exists
   - For pos-shifts: can also migrate from legacy `shifts.json` to `pos-shifts.json`
   - Otherwise creates a new file with default content
3. **Legacy files:** Not deleted. They remain in `data/` for manual inspection or rollback.
4. **Tenant resolution:** `session.restaurantId ?? "default"` – unauthenticated and current installs use tenant `"default"`.

---

## 4. Tenant Resolution Strategy

- **Source:** `req.session.restaurantId` (from auth)
- **Fallback:** `"default"` when not set or empty
- **Propagation:** `tenantContext.middleware` calls `tenantContext.run(restaurantId, next)` so AsyncLocalStorage holds the current tenant
- **Repositories:** Use `tenantContext.getRestaurantId()` inside tenant context
- **Auth:** Auth controller sets `req.session.restaurantId = user.restaurantId ?? "default"`

---

## 5. Remaining Repositories (Not Tenant-Aware)

| Repository | File | Reason |
|------------|------|--------|
| `users.repository` | `data/users.json` | Shared auth; can be made tenant-aware later |
| `auth.repository` | `data/demo-hashes.json` | Shared demo credentials |
| `reports.repository` | In-memory `reports[]` | Uses tenant-aware orders/payments via `getDailyData`; in-memory reports not persisted |
| `license` (config) | `data/license.json` | Global license; not per-tenant |

---

## 6. WebSocket Compatibility

- WebSocket service uses the same request/session pipeline.
- Tenant context is propagated by middleware before upgrade.
- No protocol changes were made.
- Data is scoped by tenant through the repositories.

---

## 7. Risks and Follow-Up

### Risks
- **Sessions export:** `SESSIONS_FILE` is now a function; callers expecting a string path may need updates.
- **Concurrent migration:** If multiple processes start together, migration can run in parallel; low risk for single-instance deploy.

### Follow-Up
- **users.repository:** Decide whether users are global or per-tenant.
- **reports.repository:** Move in-memory reports to tenant-persisted storage if needed.
- **Legacy cleanup:** Optional move of `data/*.json` to `data/_legacy/` after verification.
- **Tenant selection UI:** Add tenant switcher when supporting multiple restaurants.
- **Data path override:** Wire `DATA_PATH` from env into paths for deployment flexibility.
