-- ============================================================
-- ESQUEMA DE LA BASE DE DATOS - Tarjetas de sellos digitales
-- ============================================================

-- Un registro por cada negocio cliente (Cloud's Cookies, el siguiente, etc.)
CREATE TABLE IF NOT EXISTS businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,              -- ej. 'cloudscookies' -> tudominio.com/cloudscookies/...
  name TEXT NOT NULL,                     -- ej. "Cloud's Cookies"

  -- identidad visual
  logo_base64 TEXT NOT NULL,
  color_page_bg TEXT NOT NULL DEFAULT '#DCEAF4',
  color_card_bg TEXT NOT NULL DEFAULT '#FFFCF5',
  color_brown TEXT NOT NULL DEFAULT '#593212',
  color_brown_deep TEXT NOT NULL DEFAULT '#3E2107',
  color_brown_soft TEXT NOT NULL DEFAULT '#8A5A34',
  color_pink TEXT NOT NULL DEFAULT '#F4D3DF',
  color_butter_mid TEXT NOT NULL DEFAULT '#F9E6B2',
  color_butter_light TEXT NOT NULL DEFAULT '#FBEFD2',

  -- hasta 4 variantes de color del sello (se van rotando)
  sello_1_base64 TEXT NOT NULL,
  sello_2_base64 TEXT NOT NULL,
  sello_3_base64 TEXT NOT NULL,
  sello_4_base64 TEXT NOT NULL,

  total_stamps INTEGER NOT NULL DEFAULT 10,
  greeting_eyebrow TEXT NOT NULL DEFAULT '¡Hello!',
  reward_heading TEXT NOT NULL DEFAULT 'Tu premio, cada vez más cerca',
  reward_text TEXT NOT NULL,              -- ej. "Al llegar a tu sello #10, recibes una cookie gratis por tu compra."
  reward_emoji TEXT NOT NULL DEFAULT '⭐',

  instagram_handle TEXT,                  -- ej. '@clouds.cookiess'
  instagram_url TEXT,

  staff_pin_hash TEXT NOT NULL,           -- PIN del staff, guardado como hash (nunca en texto plano)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Un registro por cada cliente final de cada negocio
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  code TEXT UNIQUE NOT NULL,              -- ej. 'CC-JB2317', va en el link y en el QR
  name TEXT NOT NULL,
  phone TEXT,
  stamps INTEGER NOT NULL DEFAULT 0,
  cycle INTEGER NOT NULL DEFAULT 1,       -- se suma 1 cada vez que canjea el premio
  redeemed_at TEXT,                       -- fecha del último canje, NULL si no ha canjeado este ciclo
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(code);
CREATE INDEX IF NOT EXISTS idx_customers_business ON customers(business_id);
