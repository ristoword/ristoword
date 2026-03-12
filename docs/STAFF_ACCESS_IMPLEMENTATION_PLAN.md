# Staff Access System – Implementation Plan

## Overview

Implementation plan for the staff access system (central login from cassa + direct login from modules for department managers). **Before applying changes**, this document describes exactly which files will be modified and why.

---

## 1. Requirements Summary

| # | Feature | Description |
|---|---------|-------------|
| 1 | Central staff login/logout | From **cassa** (cash register) for normal operational staff |
| 2 | Direct login from modules | Department managers: kitchen (cucina), sala, bar, supervisor |
| 3 | Store staff access data | userId, name, role, department, loginTime, logoutTime, authorizedBy |
| 4 | Future-proof architecture | Prepare for schedules, vacations, free days, worked hours, shift planning |

**Out of scope for now:** Full shift scheduling implementation.

---

## 2. Files to Create (NEW)

| File | Purpose |
|------|---------|
| `backend/data/staff-access.json` | JSON storage for staff access sessions (auto-created by repo) |
| `backend/src/repositories/staff-access.repository.js` | CRUD for staff access records; persists to JSON (like closures.repository) |
| `backend/src/controllers/staff-access.controller.js` | API: login, logout, list sessions, get active |
| `backend/src/routes/staff-access.routes.js` | Express routes: POST /login, POST /logout, GET /sessions, GET /active |
| `backend/public/shared/staff-access.js` | Shared frontend: staff login modal, auth state, API calls |
| `backend/public/shared/staff-access.css` | Styles for staff login UI |
| `backend/src/constants/departments.js` | Constants: departments, roles, manager→department mapping (for future schedules) |

---

## 3. Files to Modify (EXISTING)

### Backend

| File | Modifications | Reason |
|------|---------------|--------|
| `backend/src/app.js` | Add `require("./routes/staff-access.routes")` and `app.use("/api/staff-access", ...)` | Register new staff access API |
| `backend/src/repositories/auth.repository.js` | Add DEMO_USERS for `kitchen_manager`, `sala_manager`, `bar_manager` (supervisor already exists) with `department` and `redirectTo` | Support direct login for department managers |

### Cassa (Cash Register)

| File | Modifications | Reason |
|------|---------------|--------|
| `backend/public/cassa/cassa.html` | Add staff chip in header, modal for staff login (select staff + authorizedBy), logout button; include `staff-access.js` and `staff-access.css` | UI for central staff login/logout |
| `backend/public/cassa/cassa.js` | On load: check staff session; add handlers for staff login modal (select staff from API, select authorizer); call POST /api/staff-access/login and /logout | Implement staff login flow from cassa |

### Cucina (Kitchen)

| File | Modifications | Reason |
|------|---------------|--------|
| `backend/public/cucina/cucina.html` | Add manager chip in header + "Manager login" button; include `staff-access.js` | UI for kitchen manager direct login |
| `backend/public/cucina/cucina.js` | Add manager login handler: call auth API for kitchen_manager, then staff-access API; show current manager name | Integrate direct login for kitchen manager |

### Sala

| File | Modifications | Reason |
|------|---------------|--------|
| `backend/public/sala/sala.html` | Add manager chip + "Manager login" button; include `staff-access.js` | UI for sala manager direct login |
| `backend/public/sala/sala.js` | Add manager login handler for sala_manager; call staff-access API | Integrate direct login for sala manager |

### Bar

| File | Modifications | Reason |
|------|---------------|--------|
| `backend/public/bar/bar.html` | Add manager chip + "Manager login" button; include `staff-access.js` | UI for bar manager direct login |
| `backend/public/bar/bar.js` | Add manager login handler for bar_manager; call staff-access API | Integrate direct login for bar manager |

### Supervisor

| File | Modifications | Reason |
|------|---------------|--------|
| `backend/public/supervisor/supervisor.html` | Add manager chip + "Supervisor login" (or reuse existing auth) in header; include `staff-access.js` | UI for supervisor direct login |
| `backend/public/supervisor/supervisor.js` | Add supervisor login handler; call staff-access API for supervisor role | Integrate direct login for supervisor |

### Staff Module (optional, for future use)

| File | Modifications | Reason |
|------|---------------|--------|
| `backend/src/repositories/staff.repository.js` | Load initial data from `data/staff.json` if present; add `department` field to create/update | Align staff with departments; ensure staff list available for cassa login |
| `backend/data/staff.json` | Extend to array format with `id`, `name`, `role`, `department`, etc. | Seed data for staff (used by cassa for staff selection) |

---

## 4. Data Model: Staff Access Session

```json
{
  "id": "sa_uuid",
  "userId": "st_001",
  "name": "Marco Rossi",
  "role": "chef",
  "department": "cucina",
  "loginTime": "2026-03-10T10:00:00.000Z",
  "logoutTime": null,
  "authorizedBy": "cassiere1",
  "loginSource": "cassa"
}
```

- **loginSource**: `"cassa"` = central staff login; `"module"` = direct login from module (manager)
- **authorizedBy**: Only for `loginSource === "cassa"`; null for module logins
- **logoutTime**: Set when user logs out

---

## 5. API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/staff-access/login` | Create new session (body: userId, name, role, department, authorizedBy?, loginSource) |
| POST | `/api/staff-access/logout` | End session (body: sessionId or userId for active session) |
| GET | `/api/staff-access/sessions` | List sessions (query: dateFrom, dateTo, department) |
| GET | `/api/staff-access/active` | Get currently active sessions (no logoutTime) |
| GET | `/api/staff-access/active/:userId` | Get active session for specific user |

---

## 6. Architecture for Future Schedule Management

The following structure is **prepared but not implemented**:

- `backend/src/constants/departments.js`: Defines `DEPARTMENTS`, `MANAGER_ROLES`, `getDepartmentForRole(role)`
- Repository methods in `staff-access.repository.js` can later be extended with:
  - `getSessionsByUserAndDateRange(userId, from, to)` → for worked hours
  - `getActiveSessionsByDepartment(department)` → for shift overview
- Each module (cucina, sala, bar, supervisor) will have a reserved section (e.g. "Turni" in cucina already exists) where future schedule management UI can be added
- No new tables/files for schedules, vacations, free days yet

---

## 7. Flow Summary

### Central staff login (Cassa)

1. User (cashier/supervisor) opens cassa.
2. Clicks "Staff login" or similar.
3. Modal opens: select staff member from `/api/staff`, select authorizer (current logged user or dropdown).
4. Submit → POST `/api/staff-access/login` with `loginSource: "cassa"`, `authorizedBy: authorizerName`.
5. Session stored; chip shows "Staff attivo: Marco Rossi" (or similar).

### Direct login (Department manager)

1. User opens cucina/sala/bar/supervisor.
2. Clicks "Manager login".
3. Modal: username, password (or PIN if we add it).
4. Auth API validates; if role matches department (e.g. kitchen_manager for cucina) → POST `/api/staff-access/login` with `loginSource: "module"`, `authorizedBy: null`.
5. Session stored; chip shows current manager.

### Logout

1. User clicks "Logout" in header.
2. POST `/api/staff-access/logout` with sessionId.
3. Session updated with `logoutTime`; UI cleared.

---

## 8. Dependencies

- No new npm packages. Uses existing: `express`, `fs`, `path`, `crypto` (for IDs).
- Staff list: uses existing `/api/staff`. If empty, cassa can show "Nessuno staff" and suggest adding via `/staff/staff.html`.

---

## 9. Order of Implementation

1. Create `departments.js` constants
2. Create `staff-access.repository.js`
3. Create `staff-access.controller.js` and `staff-access.routes.js`
4. Update `app.js` to register routes
5. Update `auth.repository.js` with manager roles
6. Create `staff-access.js` and `staff-access.css` (shared)
7. Update cassa: HTML + JS
8. Update cucina, sala, bar, supervisor: HTML + JS
9. (Optional) Update staff.repository to load from JSON and add department
