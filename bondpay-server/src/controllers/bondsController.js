const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { breakDenominations, calculateBondExpiry } = require('../utils/denominations');
const { signBond, getServerPublicKeyHex } = require('../utils/serverKeys');

async function issueBonds(req, res) {
  const client = await db.getClient();

  try {
    const { userId } = req.user;
    const { totalAmount } = req.body;

    if (!totalAmount || totalAmount <= 0) {
      return res.status(400).json({ error: 'Valid total amount is required' });
    }

    if (totalAmount % 5 !== 0) {
      return res.status(400).json({
        error: 'Amount must be a multiple of min denomination (5 paisa)',
        code: 'INVALID_DENOMINATION',
      });
    }

    await client.query('BEGIN');

    const userResult = await client.query(
      'SELECT online_balance, is_frozen FROM users WHERE user_id = $1 FOR UPDATE',
      [userId]
    );

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    if (user.is_frozen) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Account is frozen', code: 'FRAUD_FLAGGED' });
    }

    if (user.online_balance < totalAmount) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Insufficient online balance',
        code: 'INSUFFICIENT_BALANCE',
      });
    }

    const denominations = breakDenominations(totalAmount);
    const serverPublicKey = getServerPublicKeyHex();
    const issuedAt = new Date().toISOString();
    const expiresAt = calculateBondExpiry(72);

    const bonds = [];

    for (const value of denominations) {
      const bondId = `BOND-${uuidv4()}`;
      const bondPayload = `${bondId}:${value}:${userId}:${issuedAt}:${expiresAt}:v1`;
      const serverSignature = await signBond(bondPayload);

      await client.query(
        `INSERT INTO issued_bonds (bond_id, value, owner_id, issued_at, expires_at, server_key_version, server_signature, status)
         VALUES ($1, $2, $3, $4, $5, 'v1', $6, 'active')`,
        [bondId, value, userId, issuedAt, expiresAt, serverSignature]
      );

      bonds.push({
        bondId,
        value,
        ownerId: userId,
        issuedAt: Math.floor(new Date(issuedAt).getTime() / 1000),
        expiresAt: Math.floor(new Date(expiresAt).getTime() / 1000),
        issuedByServer: serverPublicKey,
        serverSignature,
      });
    }

    const newBalance = user.online_balance - totalAmount;
    await client.query('UPDATE users SET online_balance = $1 WHERE user_id = $2', [newBalance, userId]);

    await client.query('COMMIT');

    res.json({ bonds, newOnlineBalance: newBalance });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Bond issuance error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

async function getUserBonds(req, res) {
  try {
    const { userId } = req.user;

    const result = await db.query(
      `SELECT bond_id, value, owner_id, issued_at, expires_at, server_key_version, server_signature, status
       FROM issued_bonds WHERE owner_id = $1 AND status = 'active'`,
      [userId]
    );

    const bonds = result.rows.map((row) => ({
      bondId: row.bond_id,
      value: row.value,
      ownerId: row.owner_id,
      issuedAt: Math.floor(new Date(row.issued_at).getTime() / 1000),
      expiresAt: Math.floor(new Date(row.expires_at).getTime() / 1000),
      issuedByServer: getServerPublicKeyHex(),
      serverSignature: row.server_signature,
    }));

    res.json({ bonds });
  } catch (err) {
    console.error('Get bonds error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { issueBonds, getUserBonds };
