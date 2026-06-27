-- BondPay Server Schema
-- Run this against your Supabase PostgreSQL instance

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    public_key TEXT,
    online_balance BIGINT NOT NULL DEFAULT 0 CHECK (online_balance >= 0),
    is_frozen BOOLEAN NOT NULL DEFAULT false,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active_device_id TEXT,
    encrypted_key_backup TEXT,
    key_backup_salt TEXT
);

CREATE TABLE issued_bonds (
    bond_id TEXT PRIMARY KEY,
    value BIGINT NOT NULL CHECK (value > 0),
    owner_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    issued_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    server_key_version TEXT NOT NULL,
    server_signature TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'redeemed', 'expired', 'revoked'))
);

CREATE INDEX idx_issued_bonds_owner ON issued_bonds(owner_id);
CREATE INDEX idx_issued_bonds_status ON issued_bonds(status);

CREATE TABLE transactions (
    tx_id TEXT PRIMARY KEY,
    tx_type TEXT NOT NULL DEFAULT 'P2P_OFFLINE' CHECK (tx_type IN ('P2P_OFFLINE', 'P2P_ONLINE', 'P2P_PENDING', 'BOND_LOAD', 'BOND_REVERSE', 'TOPUP')),
    sender_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    receiver_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    total_amount BIGINT NOT NULL CHECK (total_amount > 0),
    tx_timestamp TIMESTAMPTZ NOT NULL,
    nonce TEXT,
    sender_signature TEXT,
    message TEXT,
    status TEXT DEFAULT 'accepted' CHECK (status IN ('accepted', 'pending', 'failed', 'flagged')),
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bond_redemptions (
    bond_id TEXT PRIMARY KEY REFERENCES issued_bonds(bond_id) ON DELETE CASCADE,
    tx_id TEXT NOT NULL REFERENCES transactions(tx_id) ON DELETE CASCADE,
    redeemed_by UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    redeemed_from UUID REFERENCES users(user_id) ON DELETE SET NULL,
    redeemed_at TIMESTAMPTZ DEFAULT NOW(),
    batch_id TEXT NOT NULL
);

CREATE TABLE fraud_flags (
    flag_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    tx_id TEXT REFERENCES transactions(tx_id) ON DELETE CASCADE,
    bond_id TEXT REFERENCES issued_bonds(bond_id) ON DELETE CASCADE,
    flag_type TEXT NOT NULL CHECK (flag_type IN ('DOUBLE_SPEND', 'VELOCITY', 'REVIEW')),
    severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sync_batches (
    batch_id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    submitted_at TIMESTAMPTZ NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    result JSONB
);
