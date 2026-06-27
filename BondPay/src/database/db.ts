import * as SQLite from 'expo-sqlite';
import { Bond, Transaction, TransactionBond } from '../types';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('bondpay.db');
  return db;
}

export async function initializeLocalDatabase(): Promise<void> {
  const database = await getDatabase();

  let needsRecreate = false;
  try {
    await database.getFirstAsync('SELECT current_owner_id FROM bonds LIMIT 1');
  } catch (e) {
    const errStr = String(e);
    if (errStr.includes('no such column')) {
      needsRecreate = true;
    }
  }

  if (needsRecreate) {
    console.log('Schema mismatch detected, dropping and recreating tables...');
    await database.execAsync(`
      DROP TABLE IF EXISTS transaction_bonds;
      DROP TABLE IF EXISTS transactions;
      DROP TABLE IF EXISTS bonds;
      DROP TABLE IF EXISTS sync_log;
    `);
  }

  await database.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS bonds (
        bond_id TEXT PRIMARY KEY,
        value INTEGER NOT NULL,
        owner_id TEXT NOT NULL,
        current_owner_id TEXT NOT NULL,
        issued_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        issued_by_server TEXT NOT NULL,
        server_signature TEXT NOT NULL,
        status TEXT DEFAULT 'available' CHECK (status IN ('available', 'spent', 'received_pending_sync', 'failed', 'frozen')),
        local_tx_id TEXT,
        received_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS transactions (
        tx_id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        receiver_id TEXT NOT NULL,
        total_amount INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        nonce TEXT NOT NULL,
        sender_public_key TEXT NOT NULL,
        sender_signature TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('sender', 'receiver')),
        sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'rejected', 'flagged')),
        message TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS transaction_bonds (
        tx_id TEXT NOT NULL,
        bond_id TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('outgoing', 'incoming')),
        PRIMARY KEY (tx_id, bond_id),
        FOREIGN KEY(tx_id) REFERENCES transactions(tx_id) ON DELETE CASCADE,
        FOREIGN KEY(bond_id) REFERENCES bonds(bond_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sync_log (
        batch_id TEXT PRIMARY KEY,
        submitted_at INTEGER NOT NULL,
        status TEXT NOT NULL,
        tx_count INTEGER NOT NULL,
        accepted INTEGER,
        rejected INTEGER,
        flagged INTEGER,
        error_message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_bonds_status ON bonds(status);
    CREATE INDEX IF NOT EXISTS idx_bonds_owner ON bonds(current_owner_id);
    CREATE INDEX IF NOT EXISTS idx_tx_sync ON transactions(sync_status);
  `);
}

export async function insertBond(bond: Bond): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT OR REPLACE INTO bonds (bond_id, value, owner_id, current_owner_id, issued_at, expires_at, issued_by_server, server_signature, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      bond.bondId,
      bond.value,
      bond.ownerId,
      bond.currentOwnerId,
      bond.issuedAt,
      bond.expiresAt,
      bond.issuedByServer,
      bond.serverSignature,
      bond.status,
    ]
  );
}

export async function getAvailableBonds(ownerId: string): Promise<Bond[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<any>(
    `SELECT bond_id as bondId, value, owner_id as ownerId, current_owner_id as currentOwnerId,
            issued_at as issuedAt, expires_at as expiresAt, issued_by_server as issuedByServer,
            server_signature as serverSignature, status, local_tx_id as localTxId, received_at as receivedAt
     FROM bonds WHERE current_owner_id = ? AND status = 'available' AND expires_at > ?`,
    [ownerId, Math.floor(Date.now() / 1000)]
  );

  return rows;
}

export async function updateBondStatus(
  bondId: string,
  status: Bond['status'],
  txId?: string
): Promise<void> {
  const database = await getDatabase();
  if (txId) {
    await database.runAsync(
      'UPDATE bonds SET status = ?, local_tx_id = ? WHERE bond_id = ?',
      [status, txId, bondId]
    );
  } else {
    await database.runAsync('UPDATE bonds SET status = ? WHERE bond_id = ?', [status, bondId]);
  }
}

export async function upsertBond(bond: Bond): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT OR REPLACE INTO bonds (bond_id, value, owner_id, current_owner_id, issued_at, expires_at, issued_by_server, server_signature, status, local_tx_id, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      bond.bondId,
      bond.value,
      bond.ownerId,
      bond.currentOwnerId,
      bond.issuedAt,
      bond.expiresAt,
      bond.issuedByServer,
      bond.serverSignature,
      bond.status,
      bond.localTxId || null,
      bond.receivedAt || null,
    ]
  );
}

export async function insertTransaction(transaction: Transaction): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT OR REPLACE INTO transactions (tx_id, sender_id, receiver_id, total_amount, timestamp, nonce, sender_public_key, sender_signature, role, sync_status, message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      transaction.txId,
      transaction.senderId,
      transaction.receiverId,
      transaction.totalAmount,
      transaction.timestamp,
      transaction.nonce,
      transaction.senderPublicKey,
      transaction.senderSignature,
      transaction.role,
      transaction.syncStatus,
      transaction.message || null,
    ]
  );
}

export async function updateTransactionStatus(
  txId: string,
  syncStatus: Transaction['syncStatus']
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('UPDATE transactions SET sync_status = ? WHERE tx_id = ?', [
    syncStatus,
    txId,
  ]);
}

export async function insertTransactionBond(bond: TransactionBond): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'INSERT OR REPLACE INTO transaction_bonds (tx_id, bond_id, direction) VALUES (?, ?, ?)',
    [bond.txId, bond.bondId, bond.direction]
  );
}

export async function getPendingTransactions(): Promise<Transaction[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<any>(
    `SELECT tx_id as txId, sender_id as senderId, receiver_id as receiverId,
            total_amount as totalAmount, timestamp, nonce, sender_public_key as senderPublicKey,
            sender_signature as senderSignature, role, sync_status as syncStatus, message, created_at as createdAt
     FROM transactions WHERE sync_status = 'pending'`
  );

  return rows;
}

export async function getBondsForTx(
  txId: string,
  direction: 'outgoing' | 'incoming'
): Promise<Bond[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<any>(
    `SELECT b.bond_id as bondId, b.value, b.owner_id as ownerId, b.current_owner_id as currentOwnerId,
            b.issued_at as issuedAt, b.expires_at as expiresAt, b.issued_by_server as issuedByServer,
            b.server_signature as serverSignature, b.status, b.local_tx_id as localTxId, b.received_at as receivedAt
     FROM bonds b
     INNER JOIN transaction_bonds tb ON b.bond_id = tb.bond_id
     WHERE tb.tx_id = ? AND tb.direction = ?`,
    [txId, direction]
  );

  return rows;
}

export async function deleteSpentBondsForTx(txId: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `DELETE FROM bonds WHERE bond_id IN (
       SELECT bond_id FROM transaction_bonds WHERE tx_id = ? AND direction = 'outgoing'
     ) AND status = 'spent'`,
    [txId]
  );
}

export async function updateBondsStatusForTx(
  txId: string,
  status: Bond['status']
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE bonds SET status = ? WHERE bond_id IN (
       SELECT bond_id FROM transaction_bonds WHERE tx_id = ? AND direction = 'incoming'
     )`,
    [status, txId]
  );
}

export async function transactionExists(txId: string): Promise<boolean> {
  const database = await getDatabase();
  const result = await database.getFirstAsync<any>(
    'SELECT 1 FROM transactions WHERE tx_id = ?',
    [txId]
  );
  return !!result;
}

export async function getAllTransactions(userId: string): Promise<Transaction[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<any>(
    `SELECT tx_id as txId, sender_id as senderId, receiver_id as receiverId,
            total_amount as totalAmount, timestamp, nonce, sender_public_key as senderPublicKey,
            sender_signature as senderSignature, role, sync_status as syncStatus, message, created_at as createdAt
     FROM transactions 
     WHERE sender_id = ? OR receiver_id = ?
     ORDER BY timestamp DESC`,
    [userId, userId]
  );
  return rows;
}

export async function getAllBonds(userId: string): Promise<Bond[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<any>(
    `SELECT bond_id as bondId, value, owner_id as ownerId, current_owner_id as currentOwnerId,
            issued_at as issuedAt, expires_at as expiresAt, issued_by_server as issuedByServer,
            server_signature as serverSignature, status, local_tx_id as localTxId, received_at as receivedAt
     FROM bonds 
     WHERE current_owner_id = ?`,
    [userId]
  );
  return rows;
}
