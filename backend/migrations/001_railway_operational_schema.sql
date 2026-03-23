-- Ristoword — schema operativo MySQL (Railway)
-- Eseguire dopo backup JSON. Idempotente: CREATE IF NOT EXISTS.

-- Store generico per JSON per-tenant (menu, bookings, staff, inventory, …)
CREATE TABLE IF NOT EXISTS tenant_json_store (
  tenant_id VARCHAR(128) NOT NULL,
  store_key VARCHAR(64) NOT NULL,
  payload JSON NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, store_key),
  KEY idx_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Utenti login (da users.json)
CREATE TABLE IF NOT EXISTS app_users (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  username_norm VARCHAR(255) NOT NULL,
  password_hash TEXT,
  name VARCHAR(255) NULL,
  surname VARCHAR(255) NULL,
  email VARCHAR(255) NULL,
  role VARCHAR(64) NOT NULL DEFAULT 'staff',
  restaurant_id VARCHAR(128) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  hourly_rate DECIMAL(14,4) NULL,
  employment_type VARCHAR(64) NULL,
  leave_balances JSON NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_username_norm (username_norm),
  KEY idx_restaurant (restaurant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Ristoranti onboarding (da restaurants.json)
CREATE TABLE IF NOT EXISTS restaurants_registry (
  id VARCHAR(128) NOT NULL PRIMARY KEY,
  slug VARCHAR(255) NULL,
  admin_email VARCHAR(255) NULL,
  payload JSON NOT NULL,
  created_at DATETIME NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_slug (slug(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Licenze subscription per ristorante (da licenses.json — non confondere con tabella `licenses` header API)
CREATE TABLE IF NOT EXISTS subscription_licenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  restaurant_id VARCHAR(128) NULL,
  activation_code VARCHAR(255) NULL,
  plan VARCHAR(64) NULL,
  status VARCHAR(64) NULL,
  expires_at DATETIME NULL,
  source VARCHAR(64) NULL,
  payload JSON NOT NULL,
  UNIQUE KEY uq_sub_restaurant (restaurant_id),
  KEY idx_sub_activation (activation_code(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Note: orders / order_items / cash_sessions / cash_transactions / licenses (API key)
-- sono già create dal codice applicativo (ensure* / repository SQL).
