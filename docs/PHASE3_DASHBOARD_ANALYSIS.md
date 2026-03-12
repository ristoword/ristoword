# Phase 3: Dashboard Analysis (IMPLEMENTED)

## 1. Current Dashboard Implementation

### Already DYNAMIC (connected to backend)
| Widget | Data Source | API/Event |
|--------|-------------|-----------|
| Ordini aperti (kpi-open) | orders | GET /api/orders + rw:orders-update |
| Tavoli occupati (kpi-tables) | orders | GET /api/orders + rw:supervisor-sync |
| In preparazione (kpi-prep) | orders | GET /api/orders |
| In ritardo (kpi-late) | orders | GET /api/orders |
| Ultime comande | orders | GET /api/orders |
| Incasso (topbar) | daily summary | GET /api/reports/daily/summary + rw:supervisor-sync |
| Coperti (topbar) | daily summary | GET /api/reports/daily/summary + rw:supervisor-sync |

### STATIC or MISSING
| Widget | Status |
|--------|--------|
| Ready orders (Pronti) | Not shown – data available from orders |
| Average ticket | In daily summary but not displayed |
| Cash register status | Not shown – API exists: GET /api/payments/current-shift |
| Basic alerts | None (cassa chiusa, ordini in ritardo, giornata chiusa) |

### Live updates
- WebSocket `/ws` – already used
- `rw:orders-update` – triggers loadDashboard()
- `rw:supervisor-sync` – updates revenue, covers, kpi-open, kpi-tables
- Polling fallback: setInterval(loadDashboard, 20000)

## 2. Existing APIs (reusable)
- GET /api/orders
- GET /api/reports/daily/summary (returns kpi: openOrders, servedOrders, closedOrders, netRevenue, averageReceipt, covers, tablesWorked)
- GET /api/payments/current-shift (returns hasOpenShift, shift)
- rw:orders-update, rw:supervisor-sync events

## 3. Files to Touch

### Backend
| File | Change |
|------|--------|
| backend/src/service/reports.service.js | Add buildDashboardSummary() |
| backend/src/controllers/reports.controller.js | Add getDashboardSummary |
| backend/src/routes/reports.routes.js | Add GET /dashboard-summary (before /:id) |
| backend/src/service/websocket.service.js | Extend computeSupervisorStats with averageReceipt, readyOrdersCount, cashStatus |

### Frontend
| File | Change |
|------|--------|
| backend/public/dashboard/dashboard.html | Add KPI "Pronti", Cash Status widget, Alerts section |
| backend/public/dashboard/dashboard.js | fetchDashboardSummary, renderCashStatus, renderAlerts, update KPI |
| backend/public/dashboard/dashboard.css | Styles for alerts, cash widget (minimal) |

## 4. Route Order
GET /dashboard-summary must be before GET /:id in reports.routes.js.
