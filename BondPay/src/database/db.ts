import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export const getDB = async () => {
  if (!db) {
    db = await SQLite.openDatabaseAsync('bondpay.db');
  }
  return db;
};

export const initDB = async () => {
  const database = await getDB();
  
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS bonds (
      bond_id           TEXT PRIMARY KEY,
      value             INTEGER NOT NULL,
      owner_id          TEXT NOT NULL,
      issued_at         INTEGER NOT NULL,
      expires_at        INTEGER NOT NULL,
      issued_by_server  TEXT NOT NULL,
      server_signature  TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'available',
      local_tx_id       TEXT,
      received_at       INTEGER,
      created_at        INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_bonds_status ON bonds(status);
    CREATE INDEX IF NOT EXISTS idx_bonds_owner ON bonds(owner_id);

    CREATE TABLE IF NOT EXISTS transactions (
      tx_id              TEXT PRIMARY KEY,
      sender_id          TEXT NOT NULL,
      receiver_id        TEXT NOT NULL,
      total_amount       INTEGER NOT NULL,
      timestamp          INTEGER NOT NULL,
      nonce              TEXT NOT NULL,
      sender_public_key  TEXT NOT NULL,
      sender_signature   TEXT NOT NULL,
      role               TEXT NOT NULL,
      sync_status        TEXT NOT NULL DEFAULT 'pending',
      synced_at          INTEGER,
      rejection_reason   TEXT,
      message            TEXT,
      created_at         INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tx_sync_status ON transactions(sync_status);

    CREATE TABLE IF NOT EXISTS transaction_bonds (
      tx_id     TEXT NOT NULL,
      bond_id   TEXT NOT NULL,
      direction TEXT NOT NULL,
      PRIMARY KEY (tx_id, bond_id)
    );
  `);

  try {
    await database.execAsync(`ALTER TABLE transactions ADD COLUMN message TEXT;`);
  } catch (e) {
    // Column might already exist, safe to ignore
  }
};
