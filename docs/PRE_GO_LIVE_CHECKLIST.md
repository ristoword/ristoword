# Checklist operativo pre go-live — RistoWord

Documento di verifica **prima** di mettere in produzione un’istanza o un nuovo tenant.  
Seguire in ordine; spuntare ogni voce quando completata.

---

## 1. Server e ambiente

- [ ] **Node.js** versione supportata (LTS consigliata) installata sul server.
- [ ] **`NODE_ENV=production`** impostato.
- [ ] Process manager (**systemd**, **PM2**, **Railway**, ecc.) configurato con **restart automatico** in caso di crash.
- [ ] **HTTPS** attivo (certificato valido); niente solo HTTP in produzione per sessioni e cookie `secure`.
- [ ] **Dominio** e DNS puntano all’istanza corretta.
- [ ] Variabile **`RISTOWORD_VERSION`** (opzionale) per tracciare il deploy.

---

## 2. Segreti e sicurezza (obbligatori)

- [ ] **`SESSION_SECRET`**: stringa lunga, casuale, **unica** per ambiente (mai default o copiata da esempi pubblici).
- [ ] **`TENANT_SMTP_SECRET`**: impostata in produzione se usate **email SMTP per tenant** (Console owner); lunga e segreta.
- [ ] File **`.env` non committato** nel repository; backup dei segreti in **password manager** o vault, non in chat.
- [ ] Utenti **default** di test disattivati o password cambiate.
- [ ] Accesso **SSH / pannello hosting** con MFA dove possibile.

---

## 3. Stripe e pagamenti

- [ ] **Chiavi Stripe live** (non test) in ambiente produzione.
- [ ] **`STRIPE_WEBHOOK_SECRET`** configurato e uguale a quello mostrato nel Dashboard Stripe per l’endpoint webhook.
- [ ] URL pubblico **`/api/stripe/webhook`** raggiungibile da internet (Stripe deve poter fare POST).
- [ ] **`PUBLIC_APP_URL`** / URL di successo/cancel checkout coerenti con il dominio reale (vedi warning in avvio se mancanti).
- [ ] **`STRIPE_ALLOW_DEV_ROUTES`** / route mock: **disattivate** in produzione (o accessibili solo da IP interni).
- [ ] Test manuale: un pagamento di prova in **importo minimo** e verifica licenza/attivazione.

---

## 4. Email (globale e per tenant)

- [ ] **SMTP globale** (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) se volete invii senza config per tenant.
- [ ] Oppure: istruzioni al cliente per **Console owner → Email operativa** (SMTP del locale).
- [ ] Test invio: **lista spesa** (Cucina) o **email magazzino** verso una casella di test.
- [ ] SPF/DKIM sul dominio del mittente (consigliato per deliverability).

---

## 5. Licenza e multi-tenant

- [ ] **Licenza attiva** per ogni `restaurantId` che deve operare (file/licenza coerenti con il processo GS / onboarding in uso).
- [ ] Sessione utente con **`restaurantId`** corretto dopo login (verifica su Sala/Cucina che i dati siano del tenant giusto).
- [ ] Cartella **`data/tenants/<id>/`** presente e scrivibile dal processo Node.

---

## 6. Backup e disaster recovery

- [ ] **Backup schedulato** della cartella `data/` (almeno giornaliero) + retention definita.
- [ ] Prova di **restore** su ambiente di staging (non solo teoria).
- [ ] Documentato **chi** ripristina e **in quanto tempo** (RTO/RPO concordati con il cliente).

---

## 7. Rete e accessi applicativi

- [ ] **`/dev-access`** non esposto pubblicamente senza protezione (VPN, IP allowlist, o disabilitato in prod).
- [ ] **Super-admin**: credenziali forti; cookie `super_admin_session` non su macchine condivise in modo non sicuro.
- [ ] (Opzionale ma consigliato) **Rate limiting** sul login a livello reverse proxy (Nginx, Cloudflare, ecc.).

---

## 8. Funzioni core — smoke test

Eseguire rapidamente su **un tenant reale** o di staging:

- [ ] Login owner / sala / cucina / cassa.
- [ ] Creazione ordine Sala → visibile Cucina → cambio stato → coerenza mappa/WS.
- [ ] **Corsi / marcia** (se usati): invio multi-corso, marcia, colori KDS.
- [ ] Chiusura ordine / cassa (percorso usato dal locale).
- [ ] Magazzino: ricezione o movimento minimo (se modulo attivo).

---

## 9. Monitoraggio

- [ ] **`GET /api/health`** incluso in monitor (UptimeRobot, Pingdom, health check del PaaS).
- [ ] Log applicativi accessibili (stdout o file) per diagnostica errori.
- [ ] Alert su **5xx** o downtime (anche minimi).

---

## 10. Legale e commerciale (responsabilità)

- [ ] **Privacy / GDPR**: informativa su trattamento dati clienti finali; dove risiedono i dati (`data/` sul server).
- [ ] **Contratto / SLA** con il cliente: cosa è incluso (backup, ore assistenza, aggiornamenti).
- [ ] Piano **aggiornamenti** e **manutenzione** post vendita.

---

## Riepilogo “semáforo”

| Area            | Senza questa voce…                          |
|-----------------|---------------------------------------------|
| SESSION_SECRET  | Rischio sessioni compromesse                |
| HTTPS + cookie  | Sessioni esposte / non funzionanti          |
| Backup `data/`  | Perdita totale in caso di incidente         |
| Stripe webhook  | Pagamenti ok ma licenza/sync non aggiornati |
| Test smoke core | Sorprese in prima giornata operativa        |

---

*Ultimo aggiornamento: checklist generica RistoWord — adattare nomi variabili ai file `.env` del progetto.*

---

## Riferimento hardening blocco 1 (bootstrap)

All’avvio, `backend/src/server.js` emette warning se `NODE_ENV` ≠ production, `SESSION_SECRET` assente o &lt; 20 caratteri, mancanza di `PUBLIC_APP_URL` / `BASE_URL` / `APP_URL`, e dopo `listen` stampa `[Ristoword] MODE|PORT|BASE_URL|SECURITY`. Dettagli anche in `backend/src/config/validateConfig.js`.
