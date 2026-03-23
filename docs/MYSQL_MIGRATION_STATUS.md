# Stato migrazione JSON → MySQL (Ristoword)

## A) Inventario JSON (persistenza)

Vedi anche `docs/DB_MIGRATION_AUDIT.md`. File principali: `backend/data/users.json`, `restaurants.json`, `licenses.json`, `tenants/<id>/*.json`, super-admin, dev-access, sessioni file (produzione).

## B) Mappa → tabelle

| Origine | Tabella / destinazione |
|---------|-------------------------|
| `users.json` | `app_users` |
| `restaurants.json` | `restaurants_registry` |
| `licenses.json` (subscription) | `subscription_licenses` |
| `tenants/<id>/*.json` | `tenant_json_store` (chiave = nome file senza `.json`) |
| Ordini | già `orders` / `order_items` (repository SQL) |
| Cassa POS | già `cash_sessions` / `cash_transactions` |
| Licenza header API | tabella `licenses` (ensureLicensesTable) |

## C) Schema

- `backend/migrations/001_railway_operational_schema.sql` (riferimento umano)
- Creazione runtime: `backend/src/utils/ensureOperationalSchema.js`

## D) Script

1. `npm run backup:data` — copia `data/` in `backups/pre-mysql-<timestamp>-data/`
2. `npm run migrate:mysql` — popola MySQL da JSON (non cancella i JSON)

## E) Backend

- `MYSQL_URL` / `DATABASE_URL` letti in `src/config/db.js` (+ fallback variabili esistenti).
- Utenti: `users.repository.js` → file **o** SQL se `MYSQL_DATA_PRIMARY=1`; mirror JSON se `MYSQL_JSON_MIRROR=1` (default).
- **Tenant JSON** (`data/tenants/<id>/*.json`): con `MYSQL_DATA_PRIMARY=1`, all’avvio `hydrateTenantFilesFromMysql()` (`src/utils/tenantJsonMysqlBridge.js`) copia `tenant_json_store` → file locali; ogni `atomicWriteJson` verso `data/tenants/...` rimanda il payload su MySQL. Così menu, magazzino, ricette, ecc. restano repository sync su file ma allineati al DB.
- Licenze subscription / super-admin / dev-access: persistenza come prima (vedi audit).

## Cosa resta su file o moduli dedicati

- Sessioni Express su file in produzione (`session-file-store`) salvo configurazione diversa.
- Repository non tenant-specific che non passano da `data/tenants/...` non sono coperti dal mirror automatico.

## Test consigliati

1. `MYSQL_DATA_PRIMARY` **non** impostato → comportamento invariato (file).
2. `npm run backup:data` → `npm run migrate:mysql` → verifica tabelle.
3. `MYSQL_DATA_PRIMARY=1` → login, staff, leave, owner activation (utenti da DB).

## Rischio

- **Alto** se si attiva `MYSQL_DATA_PRIMARY` senza aver eseguito `migrate:mysql` (DB vuoto).
- **Medio** sync async utenti: tutti i controller aggiornati per `await` dove necessario.
