# Ristoword – Restaurant Onboarding Implementation

## 1. Created / Modified Files

### Created
- `backend/src/repositories/restaurants.repository.js` – Restaurant (tenant) storage
- `backend/src/repositories/licenses.repository.js` – Per-restaurant license records
- `backend/src/service/onboarding.service.js` – Onboarding orchestration
- `backend/src/service/mail.service.js` – SMTP welcome email
- `backend/src/utils/generatePassword.js` – Secure temporary password generator
- `backend/src/middleware/requireOnboardingKey.middleware.js` – ONBOARDING_SECRET protection
- `backend/public/change-password/change-password.html` – Change password page
- `backend/public/change-password/change-password.js` – Change password form logic
- `backend/data/restaurants.json` – Restaurant records (initially empty)
- `backend/data/licenses.json` – License records (initially empty)

### Modified
- `backend/src/repositories/users.repository.js` – Added `createUser`
- `backend/src/repositories/auth.repository.js` – `normalize()` sets `redirectTo` to change-password when `mustChangePassword`
- `backend/src/controllers/setup.controller.js` – Added `onboardRestaurant`
- `backend/src/controllers/auth.controller.js` – `mustChangePassword` in session/response, added `changePassword`
- `backend/src/routes/setup.routes.js` – Added POST `/onboard-restaurant`
- `backend/src/routes/auth.routes.js` – Added POST `/change-password`
- `backend/src/app.js` – Added GET `/change-password`
- `backend/src/middleware/requirePageAuth.middleware.js` – Added change-password pattern
- `backend/src/middleware/requireLicense.middleware.js` – Added `/change-password` to skip paths
- `backend/public/shared/auth-guard.js` – Redirect to change-password when `mustChangePassword`
- `backend/package.json` – Added `nodemailer`

---

## 2. Environment Variables

### Required for Onboarding Endpoint
| Variable | Description |
|----------|-------------|
| `ONBOARDING_SECRET` | Secret key for `X-Onboarding-Key` header. **Required** to enable the endpoint. |

### Required for Welcome Email
| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | SMTP server host (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | SMTP port (587, 465, etc.) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | From address (optional, defaults to `SMTP_USER`) |

### Optional
| Variable | Description |
|----------|-------------|
| `APP_URL` | Base URL for login links in email when `req` host cannot be determined |

---

## 3. Example cURL Request

```bash
curl -X POST https://your-app.railway.app/api/setup/onboard-restaurant \
  -H "Content-Type: application/json" \
  -H "X-Onboarding-Key: YOUR_ONBOARDING_SECRET" \
  -d '{
    "restaurantName": "Ristorante Il Cervo",
    "companyName": "Il Cervo SRL",
    "vatNumber": "IT12345678901",
    "address": "Via Roma 10",
    "city": "Milano",
    "postalCode": "20100",
    "country": "IT",
    "adminEmail": "owner@ilcervo.it",
    "phone": "+390212345678",
    "contactName": "Mario Rossi",
    "plan": "ristoword_pro",
    "language": "it",
    "currency": "EUR",
    "tablesCount": 20
  }'
```

### Minimal Request
```bash
curl -X POST https://your-app.railway.app/api/setup/onboard-restaurant \
  -H "Content-Type: application/json" \
  -H "X-Onboarding-Key: YOUR_ONBOARDING_SECRET" \
  -d '{
    "restaurantName": "Ristorante Il Cervo",
    "adminEmail": "owner@ilcervo.it"
  }'
```

---

## 4. Response Format

### Success (201)
```json
{
  "success": true,
  "restaurant": {
    "id": "a1b2c3d4e5f6",
    "slug": "ristorante-il-cervo",
    "name": "Ristorante Il Cervo"
  },
  "owner": {
    "username": "risto_ristorante_il_cervo_owner",
    "temporaryPassword": "GeneratedPassword123"
  },
  "emailStatus": "sent"
}
```

### Email Not Sent (SMTP not configured)
`emailStatus` will be `"not_sent"` but onboarding still succeeds.

### Error (400 / 409)
```json
{
  "success": false,
  "error": "restaurantName is required"
}
```

---

## 5. First Login Flow

1. Owner receives welcome email with username and temporary password.
2. Owner logs in at `/login/login.html`.
3. Backend returns `redirectTo: "/change-password/change-password.html"` when `mustChangePassword === true`.
4. Owner is redirected to change-password page.
5. Owner submits current password + new password.
6. Backend updates password, sets `mustChangePassword = false`.
7. Owner is redirected to dashboard.

---

## 6. Storage Structure

- `data/restaurants.json` – All restaurants
- `data/licenses.json` – Per-restaurant licenses
- `data/users.json` – All users (including onboarded owners with `restaurantId`, `mustChangePassword`)
- `data/tenants/{restaurantId}/` – Tenant-specific data (orders, menu, etc.)
