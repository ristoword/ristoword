# Staff Access Implementation – Files Modification Plan

## Summary

| Action | Count |
|--------|-------|
| **New files** | 8 |
| **Modified files** | 12 |

---

## 1. NEW FILES TO CREATE

| File | Purpose |
|------|---------|
| `backend/data/sessions.json` | Persistent storage for active sessions (auto-created, initially `[]`) |
| `backend/src/constants/departments.js` | Department/role constants, manager→module mapping, future shift scaffolding |
| `backend/src/repositories/sessions.repository.js` | CRUD for sessions (read/write `sessions.json`), follows closures pattern |
| `backend/src/controllers/sessions.controller.js` | API: login, logout, get active, list by department |
| `backend/src/routes/sessions.routes.js` | Routes: POST /login, POST /logout, GET /active, GET /active/:department |
| `backend/public/shared/staff-access.js` | Shared frontend: manager login modal, staff login modal (cassa), API calls, active staff display |
| `backend/public/shared/staff-access.css` | Styles for staff-access UI |
| (optional) `backend/data/staff-seed.json` | Seed structure – staff.json format documented below |

---

## 2. FILES TO MODIFY

### Backend

| File | Modifications | Reason |
|------|---------------|--------|
| `backend/src/app.js` | Add `require("./routes/sessions.routes")` and `app.use("/api/sessions", ...)` | Register sessions API |
| `backend/data/staff.json` | Change to **array** of staff users: `id`, `name`, `role`, `department`, `pinCode`, `active`, `roleType` (manager \| operational) | Store staff users as specified |
| `backend/src/repositories/staff.repository.js` | Load from `data/staff.json`, persist on create/update/delete; add `department`, `roleType`; `getByDepartment()`, `getManagers()`, `getOperational()` | Persist staff in staff.json; support manager vs operational filtering |
| `backend/src/repositories/auth.repository.js` | Add manager users: supervisor, cash_manager, kitchen_manager, sala_manager, bar_manager with `department` and `redirectTo`; add `findManagerByDepartment()` | Support manager login from their modules |

### Cassa (Cash register)

| File | Modifications | Reason |
|------|---------------|--------|
| `backend/public/cassa/cassa.html` | Add manager chip, "Manager login" button; staff chip + "Staff login" button; modal staff login (select staff, authorizedBy=current manager); logout button; include `staff-access.js`, `staff-access.css` | Cash manager login + operational staff login under supervision |
| `backend/public/cassa/cassa.js` | Init staff-access (module: cassa); load active manager; load active staff; staff login modal (select from API, authorizedBy); call sessions API login/logout; refresh active staff list | Implement staff login flow from cassa |

### Cucina (Kitchen)

| File | Modifications | Reason |
|------|---------------|--------|
| `backend/public/cucina/cucina.html` | Add manager chip + "Manager login" button; "Staff attivi" card/section; include `staff-access.js`, `staff-access.css` | Kitchen manager login; show active staff in department |
| `backend/public/cucina/cucina.js` | Init staff-access (module: cucina, department: cucina); manager login handler; fetch and display active staff for cucina; logout handler | Manager login; active staff display |

### Sala

| File | Modifications | Reason |
|------|---------------|--------|
| `backend/public/sala/sala.html` | Add manager chip + "Manager login" button; "Staff attivi" section; include `staff-access.js`, `staff-access.css` | Sala manager login; show active staff |
| `backend/public/sala/sala.js` | Init staff-access (module: sala, department: sala); manager login; display active staff; logout | Same as cucina |

### Bar

| File | Modifications | Reason |
|------|---------------|--------|
| `backend/public/bar/bar.html` | Add manager chip + "Manager login" button; "Staff attivi" section; include `staff-access.js`, `staff-access.css` | Bar manager login; show active staff |
| `backend/public/bar/bar.js` | Init staff-access (module: bar, department: bar); manager login; display active staff; logout | Same as cucina |

### Supervisor

| File | Modifications | Reason |
|------|---------------|--------|
| `backend/public/supervisor/supervisor.html` | Add manager chip + "Supervisor login" button in topbar; "Staff attivi" overview (all departments); include `staff-access.js`, `staff-access.css` | Supervisor login; overview of active staff |
| `backend/public/supervisor/supervisor.js` | Init staff-access (module: supervisor); supervisor login; fetch and display active staff (all departments); logout | Supervisor login; global active staff |

---

## 3. Data Models

### staff.json (array)
```json
[
  {
    "id": "st_001",
    "name": "Marco Rossi",
    "role": "chef",
    "department": "cucina",
    "roleType": "operational",
    "pinCode": "1234",
    "active": true
  },
  {
    "id": "mgr_cassa",
    "name": "Anna Cassa",
    "role": "cash_manager",
    "department": "cassa",
    "roleType": "manager",
    "pinCode": "5678",
    "active": true
  }
]
```

### sessions.json (array of active + closed sessions)
```json
[
  {
    "id": "sess_uuid",
    "userId": "st_001",
    "name": "Marco Rossi",
    "department": "cucina",
    "loginTime": "2026-03-10T10:00:00.000Z",
    "logoutTime": null,
    "authorizedBy": "Anna Cassa",
    "source": "cassa"
  }
]
```
- `source`: `"cassa"` = staff login from cash register; `"module"` = manager login from their module
- `authorizedBy`: only for `source === "cassa"`; null for manager logins

---

## 4. API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sessions/login` | Create session (body: userId, name, department, authorizedBy?, source) |
| POST | `/api/sessions/logout` | End session (body: sessionId or userId) |
| GET | `/api/sessions/active` | All active sessions |
| GET | `/api/sessions/active/:department` | Active sessions for department |

---

## 5. Architecture for Future Shift Scheduling

- `departments.js` exports `DEPARTMENTS`, `MANAGER_ROLES`, `getDepartmentForModule()`
- Sessions model includes `loginTime`/`logoutTime` → future worked hours calculation
- Repository can be extended: `getSessionsByUserAndDateRange()`, `getSessionsByDepartmentAndDate()`
- No implementation of vacations, days off, shift planning yet
