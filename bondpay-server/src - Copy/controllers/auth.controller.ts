import { Request, Response } from 'express';
import { query } from '../database/db';
import * as jwt from 'jsonwebtoken';
import { config } from '../config';
import bcrypt from 'bcrypt';
import { refundExpiredBondsForUser } from './bonds.controller';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber, email, fullName, password, publicKey, deviceId } = req.body;

    if (!phoneNumber || !email || !fullName || !password) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user
    const result = await query(
      `INSERT INTO users (phone_number, email, full_name, password_hash, public_key, online_balance, active_device_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING user_id, full_name, email, phone_number, public_key`,
      [phoneNumber, email, fullName, passwordHash, publicKey || null, 0, deviceId || null]
    );

    const user = result.rows[0];

    // Generate JWT
    const token = jwt.sign({ userId: user.user_id }, config.jwtSecret, { expiresIn: '30d' });

    res.status(201).json({
      userId: user.user_id,
      fullName: user.full_name,
      email: user.email,
      phoneNumber: user.phone_number,
      publicKey: user.public_key,
      jwt: token,
      expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    });
  } catch (error: any) {
    if (error.code === '23505') { // unique_violation
      if (error.constraint === 'users_phone_number_key') {
        res.status(409).json({ error: 'Phone number already registered' });
      } else if (error.constraint === 'users_email_key') {
        res.status(409).json({ error: 'Email already registered' });
      } else {
        res.status(409).json({ error: 'User already exists' });
      }
      return;
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { loginId, password, deviceId, forceLogin } = req.body; // loginId can be phone or email

    if (!loginId || !password) {
      res.status(400).json({ error: 'Missing login credentials' });
      return;
    }

    // Check if loginId looks like an email
    const isEmail = loginId.includes('@');
    
    let result;
    if (isEmail) {
      result = await query('SELECT user_id, full_name, email, phone_number, public_key, password_hash, active_device_id, online_balance FROM users WHERE email = $1', [loginId]);
    } else {
      result = await query('SELECT user_id, full_name, email, phone_number, public_key, password_hash, active_device_id, online_balance FROM users WHERE phone_number = $1', [loginId]);
    }

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = result.rows[0];

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    let finalOnlineBalance = parseInt(user.online_balance, 10);

    // Single Active Device logic
    if (user.active_device_id && deviceId && user.active_device_id !== deviceId) {
      if (!forceLogin) {
        res.status(409).json({
          requiresForceLogin: true,
          message: 'Account is active on another device. Logging in here will invalidate offline bonds on the other device.'
        });
        return;
      } else {
        // Force Login - Revoke all active bonds on server, credit to online balance
        const activeBondsRes = await query(
          "SELECT COALESCE(SUM(value), 0) AS total_value FROM issued_bonds WHERE owner_id = $1 AND status = 'active'",
          [user.user_id]
        );
        const refundAmount = parseInt(activeBondsRes.rows[0].total_value, 10);

        // Mark bonds as revoked
        await query(
          "UPDATE issued_bonds SET status = 'revoked' WHERE owner_id = $1 AND status = 'active'",
          [user.user_id]
        );

        // Credit to balance & update active_device_id
        await query(
          "UPDATE users SET online_balance = online_balance + $1, active_device_id = $2 WHERE user_id = $3",
          [refundAmount, deviceId, user.user_id]
        );

        finalOnlineBalance += refundAmount;
      }
    } else if (deviceId) {
      // Just update deviceId
      await query('UPDATE users SET active_device_id = $1 WHERE user_id = $2', [deviceId, user.user_id]);
    }

    const token = jwt.sign({ userId: user.user_id }, config.jwtSecret, { expiresIn: '30d' });

    res.status(200).json({
      userId: user.user_id,
      fullName: user.full_name,
      email: user.email,
      phoneNumber: user.phone_number,
      publicKey: user.public_key,
      jwt: token,
      onlineBalance: finalOnlineBalance,
      expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    await query('UPDATE users SET active_device_id = NULL WHERE user_id = $1', [userId]);
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const registerPublicKey = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { publicKey } = req.body;

    if (!publicKey) {
      res.status(400).json({ error: 'Public key is required' });
      return;
    }

    await query('UPDATE users SET public_key = $1 WHERE user_id = $2', [publicKey, userId]);
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Register public key error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export const me = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    
    // Auto-refund any expired offline bonds before fetching info/balance
    await refundExpiredBondsForUser(userId);

    const result = await query('SELECT user_id, full_name, email, phone_number, online_balance, public_key FROM users WHERE user_id = $1', [userId]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.status(200).json({
      userId: result.rows[0].user_id,
      fullName: result.rows[0].full_name,
      email: result.rows[0].email,
      phoneNumber: result.rows[0].phone_number,
      onlineBalance: parseInt(result.rows[0].online_balance, 10),
      publicKey: result.rows[0].public_key
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { fullName, phoneNumber, email } = req.body;

    if (!fullName || !phoneNumber || !email) {
      res.status(400).json({ error: 'Full name, phone number, and email are required' });
      return;
    }

    const result = await query(
      'UPDATE users SET full_name = $1, phone_number = $2, email = $3 WHERE user_id = $4 RETURNING full_name, phone_number, email',
      [fullName, phoneNumber, email, userId]
    );

    res.status(200).json({ 
      fullName: result.rows[0].full_name,
      phoneNumber: result.rows[0].phone_number,
      email: result.rows[0].email
    });
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'Phone number or email already in use' });
      return;
    }
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current and new password are required' });
      return;
    }

    const result = await query('SELECT password_hash FROM users WHERE user_id = $1', [userId]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    
    if (!isMatch) {
      res.status(401).json({ error: 'Incorrect current password' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    await query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [newPasswordHash, userId]);

    res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const lookupUserByPhone = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber } = req.query;
    if (!phoneNumber) {
      res.status(400).json({ error: 'Phone number is required' });
      return;
    }

    const result = await query(
      'SELECT user_id, full_name, public_key FROM users WHERE phone_number = $1',
      [phoneNumber]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found with this phone number' });
      return;
    }

    const user = result.rows[0];
    res.status(200).json({
      userId: user.user_id,
      fullName: user.full_name,
      publicKey: user.public_key
    });
  } catch (error) {
    console.error('Lookup user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
