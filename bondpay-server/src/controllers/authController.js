const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const config = require('../config/env');

async function register(req, res) {
  try {
    const { phoneNumber, email, fullName, password, publicKey, deviceId } = req.body;

    if (!phoneNumber || !email || !fullName || !password || !publicKey || !deviceId) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingUser = await db.query(
      'SELECT user_id FROM users WHERE phone_number = $1 OR email = $2',
      [phoneNumber, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Phone number or email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    await db.query(
      `INSERT INTO users (user_id, phone_number, email, full_name, password_hash, public_key, active_device_id, online_balance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0)`,
      [userId, phoneNumber, email, fullName, passwordHash, publicKey, deviceId]
    );

    const jwtToken = jwt.sign({ userId, deviceId }, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRES_IN,
    });

    res.status(201).json({
      userId,
      jwt: jwtToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function login(req, res) {
  try {
    const { loginId, password, deviceId, forceLogin } = req.body;

    if (!loginId || !password || !deviceId) {
      return res.status(400).json({ error: 'Login ID, password, and device ID are required' });
    }

    const userResult = await db.query(
      'SELECT * FROM users WHERE phone_number = $1 OR email = $1',
      [loginId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];

    if (user.is_frozen) {
      return res.status(403).json({ error: 'Account is frozen', code: 'FRAUD_FLAGGED' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.active_device_id && user.active_device_id !== deviceId) {
      if (!forceLogin) {
        return res.status(409).json({
          error: 'Device conflict',
          code: 'DEVICE_CONFLICT',
          activeDeviceId: user.active_device_id,
        });
      }

      await db.query(
        `UPDATE issued_bonds SET status = 'revoked' WHERE owner_id = $1 AND status = 'active'`,
        [user.user_id]
      );

      await db.query(
        `UPDATE users SET active_device_id = $1 WHERE user_id = $2`,
        [deviceId, user.user_id]
      );
    } else {
      await db.query(
        `UPDATE users SET active_device_id = $1 WHERE user_id = $2`,
        [deviceId, user.user_id]
      );
    }

    const jwtToken = jwt.sign(
      { userId: user.user_id, deviceId },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN }
    );

    res.json({
      userId: user.user_id,
      fullName: user.full_name,
      publicKey: user.public_key,
      jwt: jwtToken,
      onlineBalance: user.online_balance,
      encryptedKeyBackup: user.encrypted_key_backup,
      keyBackupSalt: user.key_backup_salt,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function updateKeyBackup(req, res) {
  try {
    const { userId } = req.user;
    const { encryptedKeyBackup, keyBackupSalt } = req.body;

    await db.query(
      'UPDATE users SET encrypted_key_backup = $1, key_backup_salt = $2 WHERE user_id = $3',
      [encryptedKeyBackup, keyBackupSalt, userId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Key backup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { register, login, updateKeyBackup };
