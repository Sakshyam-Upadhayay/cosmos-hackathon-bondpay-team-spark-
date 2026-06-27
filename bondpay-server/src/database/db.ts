import { Pool } from 'pg';
import { config } from '../config';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

console.log('[DB] DATABASE_URL loaded:', process.env.DATABASE_URL?.replace(/:([^:@]+)@/, ':****@') || 'UNDEFINED');

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// JSON file fallback path
const FALLBACK_FILE = path.join(__dirname, '../../db_fallback.json');

interface FallbackDB {
  users: any[];
  issued_bonds: any[];
  transactions: any[];
  pending_pickups: any[];
  bond_redemptions: any[];
  sync_batches: any[];
  system_config: any[];
}

let dbMemory: FallbackDB = {
  users: [],
  issued_bonds: [],
  transactions: [],
  pending_pickups: [],
  bond_redemptions: [],
  sync_batches: [],
  system_config: [
    { config_key: 'min_denomination', config_value: '5' },
    { config_key: 'max_offline_capacity', config_value: '10000' },
    { config_key: 'qr_switching_delay', config_value: '333' },
    { config_key: 'max_bonds_per_request', config_value: '50' },
    { config_key: 'bond_ttl_days', config_value: '30' }
  ]
};

// Load existing db if available
try {
  if (fs.existsSync(FALLBACK_FILE)) {
    dbMemory = JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf-8'));
  }
} catch (e) {
  console.warn('Failed to load JSON db fallback:', e);
}

function saveDB() {
  try {
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(dbMemory, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save JSON db fallback:', e);
  }
}

// Mock query router
const runMockQuery = (text: string, params: any[] = []): { rows: any[]; rowCount: number } => {
  const norm = text.replace(/\s+/g, ' ').trim().toLowerCase();
  
  // Transactions
  if (norm.startsWith('begin') || norm.startsWith('commit') || norm.startsWith('rollback')) {
    return { rows: [], rowCount: 0 };
  }

  // 1. System Config
  if (norm.includes('from system_config')) {
    return { rows: dbMemory.system_config, rowCount: dbMemory.system_config.length };
  }

  // 2. Auth: Register
  if (norm.startsWith('insert into users')) {
    // phone_number, email, full_name, password_hash, public_key, online_balance, active_device_id
    const newUser = {
      user_id: uuidv4(),
      phone_number: params[0],
      email: params[1],
      full_name: params[2],
      password_hash: params[3],
      public_key: params[4],
      online_balance: 100000, // Pre-fund local user with 100,000 rupees for easy offline testing/loading
      active_device_id: params[6]
    };
    dbMemory.users.push(newUser);
    saveDB();
    return { 
      rows: [{ 
        user_id: newUser.user_id,
        full_name: newUser.full_name,
        email: newUser.email,
        phone_number: newUser.phone_number,
        public_key: newUser.public_key
      }], 
      rowCount: 1 
    };
  }

  // 3. Auth: Login lookup by email or phone
  if (norm.includes('from users') && (norm.includes('where email = $1') || norm.includes('where phone_number = $1'))) {
    const val = params[0];
    const user = dbMemory.users.find(u => u.phone_number === val || u.email === val);
    return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
  }

  // 4. Token lookup / me
  if (norm.includes('from users') && norm.includes('user_id = $1') && !norm.includes('for update')) {
    const user_id = params[0];
    const user = dbMemory.users.find(u => u.user_id === user_id);
    return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
  }

  // 5. User balance lookup (with lock option)
  if (norm.includes('from users') && norm.includes('user_id = $1') && norm.includes('online_balance')) {
    const user_id = params[0];
    const user = dbMemory.users.find(u => u.user_id === user_id);
    return { rows: user ? [{ online_balance: user.online_balance, public_key: user.public_key }] : [], rowCount: user ? 1 : 0 };
  }

  // 6. User verification (general)
  if (norm.includes('from users') && norm.includes('user_id = $1')) {
    const user_id = params[0];
    const user = dbMemory.users.find(u => u.user_id === user_id);
    return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
  }

  // 7. Update balance
  if (norm.startsWith('update users') && norm.includes('online_balance = online_balance - $1')) {
    const amount = parseInt(params[0], 10);
    const user_id = params[1];
    const user = dbMemory.users.find(u => u.user_id === user_id);
    if (user) {
      user.online_balance -= amount;
      saveDB();
    }
    return { rows: [], rowCount: 1 };
  }

  if (norm.startsWith('update users') && norm.includes('online_balance = online_balance + $1')) {
    const amount = parseInt(params[0], 10);
    const user_id = params[1];
    const user = dbMemory.users.find(u => u.user_id === user_id);
    if (user) {
      user.online_balance += amount;
      saveDB();
    }
    return { rows: [], rowCount: 1 };
  }

  if (norm.startsWith('update users') && norm.includes('online_balance = $1')) {
    const amount = parseInt(params[0], 10);
    const user_id = params[1];
    const user = dbMemory.users.find(u => u.user_id === user_id);
    if (user) {
      user.online_balance = amount;
      saveDB();
    }
    return { rows: [], rowCount: 1 };
  }

  // 8. Update public key
  if (norm.startsWith('update users') && norm.includes('public_key = $1')) {
    const pubKey = params[0];
    const user_id = params[1];
    const user = dbMemory.users.find(u => u.user_id === user_id);
    if (user) {
      user.public_key = pubKey;
      saveDB();
    }
    return { rows: [], rowCount: 1 };
  }

  // 9. Check active capacity / sums
  if (norm.includes('from issued_bonds') && norm.includes("status = 'active'")) {
    const owner_id = params[0];
    const active = dbMemory.issued_bonds.filter(b => b.owner_id === owner_id && b.status === 'active');
    const total = active.reduce((sum, b) => sum + b.value, 0);
    return { rows: [{ total_offline: total }], rowCount: 1 };
  }

  // 10. Issue bond
  if (norm.startsWith('insert into issued_bonds')) {
    const newBond = {
      bond_id: params[0],
      value: parseInt(params[1], 10),
      owner_id: params[2],
      issued_at: params[3],
      expires_at: params[4],
      server_key_version: params[5],
      server_signature: params[6],
      status: 'active'
    };
    dbMemory.issued_bonds.push(newBond);
    saveDB();
    return { rows: [], rowCount: 1 };
  }

  // 11. Retrieve active bonds
  if (norm.includes('from issued_bonds') && norm.includes('owner_id = $1') && norm.includes("status = 'active'")) {
    const owner_id = params[0];
    const active = dbMemory.issued_bonds.filter(b => b.owner_id === owner_id && b.status === 'active');
    // Map columns to match query alias
    const mapped = active.map(b => ({
      bondId: b.bond_id,
      value: b.value,
      ownerId: b.owner_id,
      issuedAt: Math.floor(new Date(b.issued_at).getTime() / 1000) || b.issued_at,
      expiresAt: Math.floor(new Date(b.expires_at).getTime() / 1000) || b.expires_at,
      issuedByServer: b.server_key_version,
      serverSignature: b.server_signature
    }));
    return { rows: mapped, rowCount: mapped.length };
  }

  // 12. Check issued_bonds status
  if (norm.includes('from issued_bonds') && norm.includes('bond_id = $1')) {
    const bond_id = params[0];
    const bond = dbMemory.issued_bonds.find(b => b.bond_id === bond_id);
    return { rows: bond ? [{ status: bond.status, owner_id: bond.owner_id }] : [], rowCount: bond ? 1 : 0 };
  }

  // 13. Update bond status
  if (norm.startsWith('update issued_bonds') && norm.includes('status = $1') && norm.includes('bond_id = $2')) {
    const status = params[0];
    const bond_id = params[1];
    const bond = dbMemory.issued_bonds.find(b => b.bond_id === bond_id);
    if (bond) {
      bond.status = status;
      saveDB();
    }
    return { rows: [], rowCount: 1 };
  }

  // 14. Check double spend / redemptions
  if (norm.includes('from bond_redemptions') && norm.includes('bond_id = $1')) {
    const bond_id = params[0];
    const red = dbMemory.bond_redemptions.find(r => r.bond_id === bond_id);
    return { rows: red ? [red] : [], rowCount: red ? 1 : 0 };
  }

  // 15. Insert redemption
  if (norm.startsWith('insert into bond_redemptions')) {
    const red = {
      bond_id: params[0],
      tx_id: params[1],
      redeemed_by: params[2],
      redeemed_from: params[3],
      batch_id: params[4]
    };
    dbMemory.bond_redemptions.push(red);
    saveDB();
    return { rows: [], rowCount: 1 };
  }

  // 16. Insert transaction
  if (norm.startsWith('insert into transactions')) {
    const newTx = {
      tx_id: params[0],
      tx_type: params[1],
      sender_id: params[2],
      receiver_id: params[3],
      total_amount: parseInt(params[4], 10),
      tx_timestamp: params[5],
      nonce: params[6],
      sender_signature: params[7],
      message: params[8],
      is_offline: params[9]
    };
    dbMemory.transactions.push(newTx);
    saveDB();
    return { rows: [], rowCount: 1 };
  }

  // 17. Check transaction
  if (norm.includes('from transactions') && norm.includes('tx_id = $1')) {
    const tx_id = params[0];
    const tx = dbMemory.transactions.find(t => t.tx_id === tx_id);
    return { rows: tx ? [{ tx_id: tx.tx_id }] : [], rowCount: tx ? 1 : 0 };
  }

  // 18. Sync batch check
  if (norm.includes('from sync_batches') && norm.includes('batch_id = $1')) {
    const batch_id = params[0];
    const batch = dbMemory.sync_batches.find(b => b.batch_id === batch_id);
    return { rows: batch ? [{ result: batch.result }] : [], rowCount: batch ? 1 : 0 };
  }

  // 19. Insert sync batch
  if (norm.startsWith('insert into sync_batches')) {
    const newBatch = {
      batch_id: params[0],
      user_id: params[1],
      submitted_at: new Date(),
      processed_at: new Date(),
      result: params[2]
    };
    dbMemory.sync_batches.push(newBatch);
    saveDB();
    return { rows: [], rowCount: 1 };
  }

  // 20. Retrieve history
  if (norm.includes('from transactions') && (norm.includes('sender_id = $1') || norm.includes('receiver_id = $1'))) {
    const user_id = params[0];
    const matched = dbMemory.transactions.filter(t => t.sender_id === user_id || t.receiver_id === user_id);
    // Sort desc by timestamp
    matched.sort((a, b) => new Date(b.tx_timestamp).getTime() - new Date(a.tx_timestamp).getTime());
    return { rows: matched.slice(0, 50), rowCount: matched.length };
  }

  // 21. Pending pickups - Insert
  if (norm.startsWith('insert into pending_pickups')) {
    const newPickup = {
      pickup_id: params[0],
      sender_id: params[1],
      amount: parseInt(params[2], 10),
      status: params[3],
      created_at: new Date(),
      expires_at: params[4],
      claim_code_hash: params[5]
    };
    dbMemory.pending_pickups.push(newPickup);
    saveDB();
    return { rows: [], rowCount: 1 };
  }

  // 22. Pending pickups - Query
  if (norm.includes('from pending_pickups') && norm.includes('pickup_id = $1')) {
    const pickup_id = params[0];
    const pickup = dbMemory.pending_pickups.find(p => p.pickup_id === pickup_id);
    return { rows: pickup ? [pickup] : [], rowCount: pickup ? 1 : 0 };
  }

  // 23. Pending pickups - Update status
  if (norm.startsWith('update pending_pickups') && norm.includes('status = $1') && norm.includes('pickup_id = $2')) {
    const status = params[0];
    const pickup_id = params[1];
    const pickup = dbMemory.pending_pickups.find(p => p.pickup_id === pickup_id);
    if (pickup) {
      pickup.status = status;
      saveDB();
    }
    return { rows: [], rowCount: 1 };
  }

  // Default empty return
  return { rows: [], rowCount: 0 };
};

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    return res;
  } catch (err: any) {
    // If the database connection failed, use our in-memory/JSON fallback DB!
    const isConnErr = err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.message.includes('connect');
    if (isConnErr) {
      console.warn('[DB] Connection error, falling back to JSON mock. Error:', err.code, err.message);
      // Route query to our mock schema
      const mockRes = runMockQuery(text, params);
      return mockRes as any;
    }
    throw err;
  }
};
