DROP TABLE IF EXISTS sync_batches CASCADE;
DROP TABLE IF EXISTS fraud_flags CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS bond_redemptions CASCADE;
DROP TABLE IF EXISTS issued_bonds CASCADE;
DROP TABLE IF EXISTS pending_pickups CASCADE;
DROP TABLE IF EXISTS system_config CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users
CREATE TABLE IF NOT EXISTS users (
  user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number  TEXT UNIQUE NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  full_name     TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  public_key    TEXT,              -- Base64 Ed25519 public key (can be set from device later)
  online_balance BIGINT NOT NULL DEFAULT 0, -- In paisa
  is_frozen     BOOLEAN NOT NULL DEFAULT false,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active_device_id TEXT,           -- Tracks single active device instance
  ttl_hours     INTEGER DEFAULT 72 -- User-configured offline bond TTL in hours
);

-- Server-issued bonds (authoritative ledger)
CREATE TABLE IF NOT EXISTS issued_bonds (
  bond_id           TEXT PRIMARY KEY,
  value             BIGINT NOT NULL,
  owner_id          UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  issued_at         TIMESTAMPTZ NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  server_key_version TEXT NOT NULL,
  server_signature  TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active'
                    -- 'active' | 'redeemed' | 'expired' | 'revoked'
);

CREATE INDEX IF NOT EXISTS idx_issued_bonds_owner ON issued_bonds(owner_id);
CREATE INDEX IF NOT EXISTS idx_issued_bonds_status ON issued_bonds(status);

-- Pending online balance transfers (Mode 2: sender online, receiver offline)
CREATE TABLE IF NOT EXISTS pending_pickups (
  pickup_id     TEXT PRIMARY KEY,
  sender_id     UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  receiver_id   UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  amount        BIGINT NOT NULL,
  pickup_code   TEXT UNIQUE NOT NULL,
  server_sig    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'claimed' | 'expired'
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  claimed_at    TIMESTAMPTZ
);

-- Redemption ledger (one row per redeemed bond — authoritative double-spend check)
CREATE TABLE IF NOT EXISTS bond_redemptions (
  bond_id       TEXT PRIMARY KEY REFERENCES issued_bonds(bond_id) ON DELETE CASCADE,
  tx_id         TEXT NOT NULL,
  redeemed_by   UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  redeemed_from UUID REFERENCES users(user_id) ON DELETE SET NULL,
  redeemed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  batch_id      TEXT NOT NULL
);

-- Transactions (server's record)
CREATE TABLE IF NOT EXISTS transactions (
  tx_id             TEXT PRIMARY KEY,
  tx_type           TEXT NOT NULL DEFAULT 'P2P_OFFLINE',
  sender_id         UUID REFERENCES users(user_id) ON DELETE SET NULL,
  receiver_id       UUID REFERENCES users(user_id) ON DELETE SET NULL,
  total_amount      BIGINT NOT NULL,
  tx_timestamp      TIMESTAMPTZ NOT NULL,
  nonce             TEXT,
  sender_signature  TEXT,
  message           TEXT,
  is_offline        BOOLEAN NOT NULL DEFAULT false,
  status            TEXT NOT NULL DEFAULT 'accepted',
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fraud flags
CREATE TABLE IF NOT EXISTS fraud_flags (
  flag_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  tx_id       TEXT,
  bond_id     TEXT,
  flag_type   TEXT NOT NULL,  -- 'DOUBLE_SPEND' | 'VELOCITY' | 'REVIEW'
  severity    TEXT NOT NULL,  -- 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Sync batch log
CREATE TABLE IF NOT EXISTS sync_batches (
  batch_id    TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  result      JSONB
);

-- System Configuration Parameters
CREATE TABLE IF NOT EXISTS system_config (
  config_key   TEXT PRIMARY KEY,
  config_value TEXT NOT NULL,
  description  TEXT,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Default configuration rows
INSERT INTO system_config (config_key, config_value, description) VALUES
('min_denomination', '5', 'Minimum bond denomination in NPR'),
('max_offline_capacity', '10000', 'Maximum offline bond capacity in NPR per user'),
('qr_switching_delay', '333', 'Delay in milliseconds between switching QR frames in multi-QR carousel'),
('max_bonds_per_request', '50', 'Maximum number of bonds that can be generated in a single issue request'),
('bond_ttl_days', '30', 'Default bond validity duration in days')
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  description = EXCLUDED.description;

