const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

async function getBalance(req, res) {
  try {
    const { userId } = req.user;

    const result = await db.query(
      'SELECT online_balance FROM users WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ onlineBalance: result.rows[0].online_balance });
  } catch (err) {
    console.error('Get balance error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function transferOnline(req, res) {
  const client = await db.getClient();

  try {
    const { userId } = req.user;
    const { receiverId, amount } = req.body;

    if (!receiverId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Receiver ID and valid amount are required' });
    }

    if (userId === receiverId) {
      return res.status(400).json({ error: 'Cannot transfer to yourself' });
    }

    await client.query('BEGIN');

    const senderResult = await client.query(
      'SELECT online_balance, is_frozen FROM users WHERE user_id = $1 FOR UPDATE',
      [userId]
    );

    if (senderResult.rows.length === 0 || senderResult.rows[0].is_frozen) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Sender account unavailable' });
    }

    if (senderResult.rows[0].online_balance < amount) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Insufficient balance',
        code: 'INSUFFICIENT_BALANCE',
      });
    }

    const receiverResult = await client.query(
      'SELECT user_id, is_frozen FROM users WHERE user_id = $1 FOR UPDATE',
      [receiverId]
    );

    if (receiverResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Receiver not found' });
    }

    if (receiverResult.rows[0].is_frozen) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Receiver account is frozen' });
    }

    const txId = `TX-${uuidv4()}`;
    const nonce = require('crypto').randomBytes(16).toString('hex');
    const timestamp = new Date().toISOString();

    await client.query(
      `INSERT INTO transactions (tx_id, tx_type, sender_id, receiver_id, total_amount, tx_timestamp, nonce, status)
       VALUES ($1, 'P2P_ONLINE', $2, $3, $4, $5, $6, 'accepted')`,
      [txId, userId, receiverId, amount, timestamp, nonce]
    );

    await client.query(
      'UPDATE users SET online_balance = online_balance - $1 WHERE user_id = $2',
      [amount, userId]
    );

    await client.query(
      'UPDATE users SET online_balance = online_balance + $1 WHERE user_id = $2',
      [amount, receiverId]
    );

    await client.query('COMMIT');

    const newBalance = senderResult.rows[0].online_balance - amount;

    res.json({
      txId,
      newOnlineBalance: newBalance,
      status: 'accepted',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Transfer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

async function topUp(req, res) {
  const client = await db.getClient();

  try {
    const { userId } = req.user;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    await client.query('BEGIN');

    await client.query(
      'UPDATE users SET online_balance = online_balance + $1 WHERE user_id = $2',
      [amount, userId]
    );

    const txId = `TX-${uuidv4()}`;
    const nonce = require('crypto').randomBytes(16).toString('hex');

    await client.query(
      `INSERT INTO transactions (tx_id, tx_type, sender_id, total_amount, tx_timestamp, nonce, status)
       VALUES ($1, 'TOPUP', $2, $3, NOW(), $4, 'accepted')`,
      [txId, userId, amount, nonce]
    );

    await client.query('COMMIT');

    const result = await client.query(
      'SELECT online_balance FROM users WHERE user_id = $1',
      [userId]
    );

    res.json({
      txId,
      newOnlineBalance: result.rows[0].online_balance,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Top up error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

module.exports = { getBalance, transferOnline, topUp };
