# Phase D – Commercial Readiness Report

**Date:** March 11, 2025  
**Goal:** Turn the system into a sellable product with license flow, setup wizard, and deployment readiness.

---

## 1. Files Modified / Created

### License System
| File | Change |
|------|--------|
| `src/config/license.js` | Added `valid`, `plan`, `licenseKey` (masked) to decorated response |
| `src/controllers/license.controller.js` | Extended activate with `plan`; deactivate uses `saveLicense`; status returns full fields |
| `src/middleware/requireLicense.middleware.js` | Redirect unlicensed → `/license/license.html`; expired → `/license/license.html?expired=1`; added `/setup`, `/api/setup` to skip paths |
| `public/license/license.html` | **New** – license activation page |
| `public/license/license.js` | **New** – activation form logic |
| `public/login/login.js` | Links to license page when `license=required` or `license=expired` |

### Restaurant Setup Wizard
| File | Change |
|------|--------|
| `src/config/setup.js` | **New** – `restaurant-config.json` read/write; `isSetupComplete` with backward compat |
| `src/controllers/setup.controller.js` | **New** – GET status, POST run setup (seed menu, create tenant files) |
| `src/routes/setup.routes.js` | **New** – GET /api/setup/status, POST /api/setup |
| `src/middleware/requireSetup.middleware.js` | **New** – redirect to /setup if setup not complete |
| `src/app.js` | Mount `requireSetup`, mount `/api/setup` routes |
| `public/setup/setup.html` | **New** – setup wizard UI |
| `public/setup/setup.js` | **New** – setup form logic |

### Deployment Readiness
| File | Change |
|------|--------|
| `src/config/session.js` | `secure: true` and `sameSite: "lax"` when NODE_ENV=production |
| `.env.example` | Document NODE_ENV, BASE_PATH, DATA_PATH |

---

## 2. License Flow Implemented

### Endpoints
- `GET /api/license` – full license object (masked key)
- `GET /api/license/status` – status summary: `valid`, `plan`, `restaurantName`, `expiresAt`, `daysLeft`, etc.
- `POST /api/license/activate` – body: `{ code, restaurantName }` – accepts DEMO-* codes, 30 days
- `POST /api/license/deactivate` – clears license

### Fields
- `valid` – true when status is active or grace
- `plan` – "demo" or "starter"
- `licenseKey` – masked (e.g. "DEMO-****")
- `restaurantName`, `expiresAt`, `status`, `daysLeft`

### Protection
- `requireLicense` blocks all routes except login, license, setup, health, QR
- Unlicensed → redirect to `/license/license.html`
- Expired → redirect to `/license/license.html?expired=1`
- API 403 with `error` and `message` for JSON requests

### Frontend
- License activation page at `/license/license.html` with form (restaurant name, license code)
- Demo code: `DEMO-TRIAL` (30 days)
- Login page links to license page when `?license=required` or `?license=expired`

---

## 3. Setup Flow Implemented

### Endpoints
- `GET /api/setup/status` – `setupComplete`, `restaurantName`, `numTables`, `departments`
- `POST /api/setup` – body: `{ restaurantName, numTables, departments, seedMenu }`

### Config Stored
- `data/restaurant-config.json`: `restaurantName`, `numTables`, `departments`, `setupComplete`, `completedAt`

### Behaviour
- Setup wizard at `/setup/setup.html` – restaurant name, number of tables, departments (sala, cucina, pizzeria, bar), option to seed menu
- Optional menu seed: 5 default items (Acqua, Caffè, Margherita, Pasta al pomodoro, Insalata mista)
- Ensures `data/tenants/default/` exists and required JSON files are created
- **Backward compatibility:** existing installs with menu data are treated as already set up

### Protection
- `requireSetup` runs after `requireLicense`; redirects to `/setup/setup.html` if setup not complete
- `/setup` and `/api/setup` skip both license and setup checks

---

## 4. Deployment-Readiness Changes

- **Session cookies:** `secure: true` and `sameSite: "lax"` when `NODE_ENV=production`
- **.env.example:** NODE_ENV, BASE_PATH, DATA_PATH
- **Base URLs:** all frontend uses relative paths (`/api/...`, `/login/...`) – no changes
- **Localhost:** works as before; `secure: false` when not production

---

## 5. Remaining Work Before Production

- **License validation:** current logic is DEMO-only; real keys and validation not implemented
- **License server:** no external license server or signature checks
- **BASE_PATH:** env documented but not used; would need frontend/config changes for subpath deployment
- **Data path:** paths.js uses fixed `data/`; DATA_PATH in env not applied
- **HTTPS:** must be handled by reverse proxy (e.g. nginx)
- **Asporto backend:** still pending

---

## 6. Phase G – Future Multi-Tenant Migration

Suggested scope:

1. **Data layout:** move from `data/tenants/default/` to `data/restaurants/{id}/` (or keep tenants)
2. **restaurant-config:** one config per tenant; link to license
3. **User/tenant association:** session.restaurantId resolved from user or selection
4. **Tenant selection UI:** owner chooses active restaurant
5. **License → tenant:** map license to one or more restaurant IDs
6. **Auth:** per-tenant or shared users with tenant scope
7. **API:** all repositories already tenant-aware via `paths.tenant()`; verify isolation
