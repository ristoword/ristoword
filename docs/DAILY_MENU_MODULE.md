# Ristoword – Modulo Menu del Giorno

## Riepilogo tecnico

Il modulo **Menu del Giorno** permette alla Cucina di gestire un menu giornaliero con piatti singoli per portata, visibile in tutti i reparti operativi.

### Funzionamento

1. **Gestione (Cucina)**  
   Dalla Cucina, tramite il pulsante "Menu del Giorno", si accede alla pagina di gestione (`/daily-menu/daily-menu.html`), dove è possibile:
   - Aggiungere piatti con nome, descrizione, portata, prezzo, allergeni
   - Attivare/disattivare singoli piatti
   - Attivare/disattivare l’intero menu
   - Modificare ed eliminare piatti

2. **Visualizzazione (Sala, Cassa, Dashboard, Supervisor)**  
   Il menu del giorno attivo è mostrato in sola lettura, raggruppato per portata con prezzi visibili.

3. **Persistenza**  
   I dati sono salvati in `data/tenants/{restaurantId}/daily-menu.json` in modo tenant-aware.

4. **Compatibilità ordini**  
   La struttura è predisposta per permettere in futuro di selezionare i piatti del menu del giorno come articoli ordinabili, senza cambiare il flusso ordini attuale.

---

## File creati

| Percorso | Descrizione |
|----------|-------------|
| `backend/src/repositories/daily-menu.repository.js` | Repository JSON per il menu del giorno |
| `backend/src/controllers/daily-menu.controller.js` | Controller API |
| `backend/src/routes/daily-menu.routes.js` | Route Express |
| `backend/public/daily-menu/daily-menu.html` | Pagina di gestione (Cucina) |
| `backend/public/daily-menu/daily-menu.css` | Stili pagina gestione |
| `backend/public/daily-menu/daily-menu.js` | Logica frontend gestione |
| `backend/data/daily-menu.json` | File iniziale (per migration) |

---

## File modificati

| Percorso | Modifica |
|----------|----------|
| `backend/src/app.js` | Montaggio API `/api/daily-menu` |
| `backend/src/utils/tenantMigration.js` | Aggiunto `daily-menu.json` |
| `backend/src/service/onboarding.service.js` | Creazione `daily-menu.json` per nuovi tenant |
| `backend/src/middleware/requirePageAuth.middleware.js` | Protezione pagina daily-menu |
| `backend/public/cucina/cucina.html` | Pulsante nav "Menu del Giorno" |
| `backend/public/sala/sala.html` | Card "Menu del Giorno" (sola lettura) |
| `backend/public/sala/sala.js` | Caricamento e render menu in Sala |
| `backend/public/sala/sala.css` | Stili card menu in Sala |
| `backend/public/cassa/cassa.html` | Card "Menu del Giorno" in colonna sinistra |
| `backend/public/cassa/cassa.js` | Caricamento menu in Cassa |
| `backend/public/cassa/cassa.css` | Stili card menu in Cassa |
| `backend/public/dashboard/dashboard.html` | Widget "Menu del Giorno" e link sidebar |
| `backend/public/dashboard/dashboard.js` | Caricamento widget menu |
| `backend/public/dashboard/dashboard.css` | Stili widget menu |
| `backend/public/supervisor/supervisor.html` | Card menu in tab Menù + link sidebar |
| `backend/public/supervisor/supervisor.js` | Caricamento menu in Supervisor |

---

## API Endpoints

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | `/api/daily-menu` | Restituisce tutto (meta + dishes) |
| GET | `/api/daily-menu/active` | Menu attivo + piatti attivi |
| GET | `/api/daily-menu/categories` | Elenco categorie |
| POST | `/api/daily-menu` | Crea nuovo piatto |
| PUT | `/api/daily-menu/:id` | Aggiorna piatto |
| DELETE | `/api/daily-menu/:id` | Elimina piatto |
| PATCH | `/api/daily-menu/:id/toggle` | Attiva/disattiva singolo piatto |
| PATCH | `/api/daily-menu/active` | Attiva/disattiva menu (body: `{ active: true/false }`) |

---

## Struttura dati

```json
{
  "menuActive": false,
  "updatedAt": "2026-03-11T...",
  "dishes": [
    {
      "id": 1,
      "name": "Risotto ai funghi",
      "description": "con funghi porcini",
      "category": "primo",
      "price": 12.5,
      "active": true,
      "allergens": "glutine",
      "order": 0
    }
  ]
}
```

**Categorie:** antipasto, primo, secondo, contorno, dolce, bevanda, extra

---

## Ruoli e accesso

- **Gestione:** owner, cucina, kitchen, kitchen_manager
- **Visualizzazione:** tutti i reparti con accesso (Sala, Cassa, Dashboard, Supervisor)
