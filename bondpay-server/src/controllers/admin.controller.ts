import { Request, Response } from 'express';
import { query } from '../database/db';
import * as jwt from 'jsonwebtoken';
import { config } from '../config';
import bcrypt from 'bcrypt';
import { CryptoService } from '../services/crypto.service';
import { v4 as uuidv4 } from 'uuid';

export const adminLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (username === 'admin' && password === 'admin') {
      const token = jwt.sign({ isAdmin: true, username: 'admin' }, config.jwtSecret, { expiresIn: '24h' });
      res.status(200).json({ success: true, token });
    } else {
      res.status(401).json({ success: false, error: 'Invalid admin credentials' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
};

export const getStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const usersCount = await query('SELECT COUNT(*) as count FROM users');
    const onlineSum = await query('SELECT COALESCE(SUM(online_balance), 0) as total FROM users');
    const activeBondsCount = await query("SELECT COUNT(*) as count FROM issued_bonds WHERE status = 'active'");
    const activeBondsSum = await query("SELECT COALESCE(SUM(value), 0) as total FROM issued_bonds WHERE status = 'active'");
    const txsCount = await query('SELECT COUNT(*) as count FROM transactions');
    const fraudCount = await query('SELECT COUNT(*) as count FROM fraud_flags');

    res.status(200).json({
      totalUsers: parseInt(usersCount.rows[0].count, 10),
      totalOnlineBalance: parseInt(onlineSum.rows[0].total, 10),
      totalActiveBondsCount: parseInt(activeBondsCount.rows[0].count, 10),
      totalOfflineBalance: parseInt(activeBondsSum.rows[0].total, 10),
      totalTransactions: parseInt(txsCount.rows[0].count, 10),
      totalFraudFlags: parseInt(fraudCount.rows[0].count, 10)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Users CRUD
export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await query('SELECT user_id, phone_number, email, full_name, online_balance, is_frozen, registered_at, active_device_id, ttl_hours FROM users ORDER BY registered_at DESC');
    res.status(200).json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber, email, fullName, password, publicKey, onlineBalance, isFrozen, ttlHours } = req.body;
    if (!phoneNumber || !email || !fullName || !password) {
      res.status(400).json({ error: 'PhoneNumber, email, fullName, and password are required' });
      return;
    }
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (phone_number, email, full_name, password_hash, public_key, online_balance, is_frozen, ttl_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING user_id`,
      [phoneNumber, email, fullName, hash, publicKey || null, onlineBalance || 0, isFrozen || false, ttlHours || 72]
    );
    res.status(201).json({ success: true, userId: result.rows[0].user_id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { phoneNumber, email, fullName, onlineBalance, isFrozen, activeDeviceId, ttlHours } = req.body;
    await query(
      `UPDATE users 
       SET phone_number = $1, email = $2, full_name = $3, online_balance = $4, is_frozen = $5, active_device_id = $6, ttl_hours = $7
       WHERE user_id = $8`,
      [phoneNumber, email, fullName, onlineBalance, isFrozen, activeDeviceId || null, ttlHours, id]
    );
    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await query('DELETE FROM users WHERE user_id = $1', [id]);
    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Bonds CRUD
export const getBonds = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await query(`
      SELECT bond_id, value, owner_id, status, 
             EXTRACT(EPOCH FROM issued_at)::integer as issued_at, 
             EXTRACT(EPOCH FROM expires_at)::integer as expires_at, 
             server_key_version, server_signature 
      FROM issued_bonds 
      ORDER BY issued_at DESC
    `);
    res.status(200).json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createBond = async (req: Request, res: Response): Promise<void> => {
  try {
    const { ownerId, value, ttlDays } = req.body;
    if (!ownerId || !value) {
      res.status(400).json({ error: 'Owner ID and Value are required' });
      return;
    }
    const bondId = `BOND-${uuidv4()}`;
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + ((ttlDays || 30) * 24 * 60 * 60);

    const dataToSign = `${bondId}${value}${ownerId}${now}${expiresAt}${config.serverKeyVersion}`;
    const serverSignature = await CryptoService.signBond(dataToSign);

    await query(
      `INSERT INTO issued_bonds (bond_id, value, owner_id, issued_at, expires_at, server_key_version, server_signature, status)
       VALUES ($1, $2, $3, to_timestamp($4), to_timestamp($5), $6, $7, 'active')`,
      [bondId, value, ownerId, now, expiresAt, config.serverKeyVersion, serverSignature]
    );

    res.status(201).json({ success: true, bondId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateBond = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, ownerId } = req.body;
    await query('UPDATE issued_bonds SET status = $1, owner_id = $2 WHERE bond_id = $3', [status, ownerId, id]);
    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteBond = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await query('DELETE FROM issued_bonds WHERE bond_id = $1', [id]);
    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Transactions CRUD
export const getTransactions = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await query(`
      SELECT tx_id, tx_type, sender_id, receiver_id, total_amount, 
             EXTRACT(EPOCH FROM tx_timestamp)::integer as tx_timestamp, 
             nonce, sender_signature, message, is_offline, status 
      FROM transactions 
      ORDER BY tx_timestamp DESC
    `);
    res.status(200).json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createTransaction = async (req: Request, res: Response): Promise<void> => {
  try {
    const { txId, txType, senderId, receiverId, totalAmount, message, isOffline, status } = req.body;
    const finalTxId = txId || 'TX-MANUAL-' + uuidv4();
    await query(
      `INSERT INTO transactions (tx_id, tx_type, sender_id, receiver_id, total_amount, tx_timestamp, message, is_offline, status)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8)`,
      [finalTxId, txType || 'P2P_ONLINE', senderId || null, receiverId || null, totalAmount, message || null, isOffline || false, status || 'accepted']
    );
    res.status(201).json({ success: true, txId: finalTxId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateTransaction = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { txType, senderId, receiverId, totalAmount, message, isOffline, status } = req.body;
    await query(
      `UPDATE transactions 
       SET tx_type = $1, sender_id = $2, receiver_id = $3, total_amount = $4, message = $5, is_offline = $6, status = $7
       WHERE tx_id = $8`,
      [txType, senderId || null, receiverId || null, totalAmount, message || null, isOffline, status, id]
    );
    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteTransaction = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await query('DELETE FROM transactions WHERE tx_id = $1', [id]);
    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// Configs
export const getConfigs = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await query('SELECT config_key, config_value, description, updated_at FROM system_config ORDER BY config_key');
    res.status(200).json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    await query('UPDATE system_config SET config_value = $1, updated_at = NOW() WHERE config_key = $2', [value, key]);
    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
