-- ============================================================
-- ESQUEMA DE LA BASE DE DATOS — Tarjetas de sellos digitales
-- ============================================================
-- Este archivo refleja el estado REAL de tu base de datos en Cloudflare,
-- reconstruido a partir de todo lo que index.js usa. El schema.sql viejo
-- se había quedado desactualizado: con el tiempo se fueron agregando
-- columnas nuevas directo en la consola de D1 (colores personalizados,
-- plan, Wallet, bloqueo de PIN, recordatorios) pero nunca se guardaron
-- aquí. Este archivo es solo documentación / respaldo para reconstruir
-- la base de datos desde cero si algún día hiciera falta — tu base de
-- datos en Cloudflare ya tiene todas estas columnas, no necesitas correr
-- nada de esto ahora.
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

  -- bordes personalizables de cada elemento de la tarjeta
  color_border_card TEXT,
  color_border_progress TEXT,
  color_border_qr TEXT,
  color_border_reward TEXT,
  color_border_stamp_ring TEXT DEFAULT '#FFF8EC',

  -- fondos personalizables adicionales
  color_instagram_bg TEXT,
  color_qr_bg TEXT,
  color_stamp_bg TEXT DEFAULT '#593212',

  -- colores del propio código QR (para que combine con la marca)
  color_qr_pattern_dark TEXT,
  color_qr_pattern_light TEXT,

  -- colores de texto personalizables
  color_reward_heading TEXT,
  color_reward_text TEXT,
  color_text_credit TEXT,
  color_text_instagram TEXT,
  color_text_progress_label TEXT,
  color_text_progress_number TEXT,
  color_text_progress_pct TEXT,
  color_text_qr_code TEXT,
  color_text_qr_instruction TEXT,

  -- hasta 4 variantes de color del sello (se van rotando)
  sello_1_base64 TEXT NOT NULL,
  sello_2_base64 TEXT NOT NULL,
  sello_3_base64 TEXT NOT NULL,
  sello_4_base64 TEXT NOT NULL,

  -- estilo del sello: círculo clásico o "forma libre" (el ícono ES el sello)
  stamp_style TEXT DEFAULT 'circle',
  stamp_style_scope TEXT DEFAULT 'both',   -- 'both' | 'wallet' (dónde aplica el estilo)

  -- imagen de fondo de la franja superior (Wallet / tarjeta web)
  strip_bg_base64 TEXT,
  strip_bg_scope TEXT DEFAULT 'both',      -- 'both' | 'wallet'

  -- tipografía elegida y variantes (negrita / cursiva) por bloque de texto
  font_family TEXT,
  eyebrow_bold INTEGER NOT NULL DEFAULT 0,
  eyebrow_italic INTEGER NOT NULL DEFAULT 0,
  font_bold INTEGER NOT NULL DEFAULT 0,
  font_italic INTEGER NOT NULL DEFAULT 0,
  reward_bold INTEGER NOT NULL DEFAULT 0,
  reward_italic INTEGER NOT NULL DEFAULT 0,

  total_stamps INTEGER NOT NULL DEFAULT 10,
  greeting_eyebrow TEXT NOT NULL DEFAULT '¡Hello!',
  reward_heading TEXT NOT NULL DEFAULT 'Tu premio, cada vez más cerca',
  reward_text TEXT NOT NULL,              -- ej. "Al llegar a tu sello #10, recibes una cookie gratis por tu compra."
  reward_emoji TEXT NOT NULL DEFAULT '⭐',
  instruction_text TEXT,                  -- texto que le dice al cliente cómo sumar su sello

  instagram_handle TEXT,                  -- ej. '@clouds.cookiess'
  instagram_url TEXT,

  -- tipo de cliente de Hey Tapp (para tu propio panel interno)
  client_type TEXT DEFAULT 'cliente',     -- 'cliente' | 'influencer'
  plan TEXT DEFAULT 'wallet',             -- 'digital' | 'fisico' | 'wallet'
  last_payment_date TEXT,
  next_payment_date TEXT,
  is_suspended INTEGER NOT NULL DEFAULT 0,

  -- Apple Wallet
  wallet_enabled INTEGER NOT NULL DEFAULT 0,
  wallet_location_lat REAL,
  wallet_location_lng REAL,

  -- acceso del staff del negocio (panel de sellado)
  staff_pin_hash TEXT NOT NULL,           -- PIN del staff, guardado como hash (nunca en texto plano)
  staff_pin_note TEXT,                    -- copia del PIN en texto plano, solo para que TÚ lo puedas recordar
  staff_login_fails INTEGER NOT NULL DEFAULT 0,
  staff_login_locked_until TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Un registro por cada cliente final de cada negocio
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  code TEXT UNIQUE NOT NULL,              -- ej. 'CC-JB2317', va en el link y en el QR
  name TEXT NOT NULL,
  phone TEXT,
  cedula TEXT,
  stamps INTEGER NOT NULL DEFAULT 0,
  cycle INTEGER NOT NULL DEFAULT 1,       -- se suma 1 cada vez que canjea el premio
  redeemed_at TEXT,                       -- fecha del último canje, NULL si no ha canjeado este ciclo
  last_visit TEXT,

  -- Apple Wallet
  en_wallet INTEGER NOT NULL DEFAULT 0,
  wallet_auth_token TEXT,

  -- recordatorios automáticos a clientes inactivos
  reminder_text TEXT,
  reminder_nonce INTEGER NOT NULL DEFAULT 0,
  last_reminder_sent_at TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(code);
CREATE INDEX IF NOT EXISTS idx_customers_business ON customers(business_id);

-- ============================================================
-- Tabla de solicitudes de info / leads (se agregó después, por eso
-- vive aparte de las dos de arriba)
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  instagram TEXT,
  business_type TEXT,
  emailed INTEGER NOT NULL DEFAULT 0,
  payment_email_sent_at TEXT,
  plan_confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
