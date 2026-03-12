# Phase 4: Login / Roles / License – Analysis (IMPLEMENTED)

## 1. What already exists

| Component | Status | Notes |
|-----------|--------|-------|
| **Login page** | ✅ | login.html, login.js, login.css – form, role dropdown (supervisor, cashier, kitchen, staff, customer) |
| **POST /api/auth/login** | ✅ | auth.controller.js + auth.routes.js – returns user, role, token, redirectTo |
| **POST /api/auth/logout** | ✅ | Returns success (no server-side invalidation) |
| **GET /api/auth/me** | ✅ | Query by username – no token/session check |
| **Auth repository** | ✅ | auth.repository.js – **DEMO_USERS** hardcoded in memory, no users.json |
| **Sessions (staff)** | ✅ | sessions.routes.js, sessions.repository.js – staff access sessions (sessions.json) |
| **express-session** | ✅ Installed | **Not used** in app.js |
| **License API** | ✅ | license.routes.js, config/license.js (file-based license.json) |
| **License controller** | ⚠️ Partial | Exports getLicenseHandler, activateLicenseHandler; routes expect getLicense, activateLicense, deactivateLicense, getStatus → **mismatch** |
| **Dashboard auth** | ✅ | Reads rw_auth from localStorage, shows user/logout |
| **Staff access** | ✅ | shared/staff-access.js – manager login via /api/auth/login + /api/sessions/login |

## 2. What is missing

- **users.json** and persistence (users repository)
- **express-session** in app.js and session persistence on login
- **Auth middleware** (requireAuth) for protected API routes
- **Role middleware** (requireRole) for role-based API access
- **License middleware** (requireLicense) – block app if not activated (except login/license)
- **Frontend route protection** – redirect to login / access denied on dashboard, sala, cucina, cassa, supervisor
- **Role “owner”** and mapping: owner, sala, cucina, cassa
- **License controller** – implement and export getStatus, deactivateLicense; align names with routes

## 3. Files to create

| File | Purpose |
|------|---------|
| backend/data/users.json | Initial user list (owner, sala, cucina, cassa) |
| backend/src/repositories/users.repository.js | Read/write users, findByCredentials |
| backend/src/middleware/requireAuth.middleware.js | Require req.session.user |
| backend/src/middleware/requireRole.middleware.js | Require role in allowed list |
| backend/src/middleware/requireLicense.middleware.js | Require license activated (or allow list) |
| backend/public/shared/auth-guard.js | Frontend: check rw_auth + role, redirect if unauthorized |

## 4. Files to modify

| File | Change |
|------|--------|
| backend/src/app.js | Add express-session; add requireLicense for HTML routes (except login, qr); add auth + role to API where needed |
| backend/src/repositories/auth.repository.js | Use users.repository instead of DEMO_USERS; add owner role support |
| backend/src/controllers/auth.controller.js | Set req.session.user on login; clear on logout |
| backend/src/controllers/license.controller.js | Export getLicense, activateLicense, add getStatus, deactivateLicense (use config/license) |
| backend/public/login/login.html | Add “Owner” to role dropdown |
| backend/public/login/login.js | Handle owner redirect; ensure rw_auth includes role |
| backend/public/dashboard/dashboard.html | Include auth-guard.js |
| backend/public/dashboard/dashboard.js | Optional: redirect if no auth (or rely on auth-guard) |
| backend/public/sala/sala.html | Include auth-guard.js with data-allowed-roles |
| backend/public/cucina/cucina.html | Include auth-guard.js |
| backend/public/cassa/cassa.html | Include auth-guard.js |
| backend/public/supervisor/supervisor.html | Include auth-guard.js |

## 5. Role → access (concise)

- **owner**: all pages and APIs
- **sala**: dashboard, sala; APIs: orders, menu (and what sala needs)
- **cucina**: cucina; APIs: orders (list, setStatus)
- **cassa**: cassa; APIs: payments, orders (list), closures

## 6. License flow

- If license not activated: allow only /login, /api/auth/login, /api/license/*, /qr (and static for login).
- All other routes (dashboard, sala, cucina, cassa, supervisor, APIs) require license active.
