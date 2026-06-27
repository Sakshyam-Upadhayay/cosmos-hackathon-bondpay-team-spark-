const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { verifyBondSignature } = require('../utils/serverKeys');
const ed = require('@noble/ed25519');
const crypto = require('crypto');

// Polyfill esh256 / sha256 for noble-ed25519 compatibility on Node server
ed.esh256 = (message) => {
  const hash = crypto.createHash('sha256').update(message).digest();
  return Promise.resolve(new Uint8Array(hash));
};
ed.sha256 = (message) => {
  const hash = crypto.createHash('sha256').update(message).digest();
  return Promise.resolve(new Uint8Array(hash));
};

async function syncBatch(req, res) {
  const client = await db.getClient();

  try {
    const { userId } = req.user;
    const { batchId, incoming, outgoing } = req.body;

    if (!batchId) {
      return res.status(400).json({ error: 'Batch ID is required' });
    }

    const cached = await client.query(
      'SELECT result FROM sync_batches WHERE batch_id = $1',
      [batchId]
    );

    if (cached.rows.length > 0) {
      return res.json(cached.rows[0].result);
    }

    await client.query('BEGIN');

    const accepted = [];
    const rejected = [];
    const flagged = [];

    for (const item of incoming || []) {
      const { transaction, bonds } = item;

      let isValid = true;

      for (const bond of bonds) {
        const bondPayload = `${bond.bondId}:${bond.value}:${bond.ownerId}:${new Date(bond.issuedAt * 1000).toISOString()}:${new Date(bond.expiresAt * 1000).toISOString()}:v1`;
        const validSig = await verifyBondSignature(bondPayload, bond.serverSignature);

        if (!validSig) {
          rejected.push(transaction.txId);
          isValid = false;
          break;
        }

        const expiry = new Date(bond.expiresAt * 1000);
        if (expiry < new Date()) {
          rejected.push(transaction.txId);
          isValid = false;
          break;
        }
      }

      if (!isValid) continue;

      const sortedBondIds = bonds
        .map((b) => b.bondId)
        .sort()
        .join(',');

      const txPayload = `${transaction.txId}:${transaction.senderId}:${transaction.receiverId}:${transaction.totalAmount}:${transaction.timestamp}:${transaction.nonce}:${sortedBondIds}`;
      const txHash = new TextEncoder().encode(txPayload);
      const txHashDigest = await ed.esh256(txHash);

      const senderPubKey = Buffer.from(transaction.senderPublicKey, 'hex');
      const txSig = Buffer.from(transaction.senderSignature, 'base64');

      const sigValid = await ed.verifyAsync(txSig, txHashDigest, senderPubKey);

      if (!sigValid) {
        rejected.push(transaction.txId);
        continue;
      }

      let isDoubleSpent = false;
      for (const bond of bonds) {
        const existing = await client.query(
          'SELECT bond_id FROM bond_redemptions WHERE bond_id = $1',
          [bond.bondId]
        );

        if (existing.rows.length > 0) {
          isDoubleSpent = true;
          await client.query(
            `INSERT INTO fraud_flags (user_id, tx_id, bond_id, flag_type, severity, details)
             VALUES ($1, $2, $3, 'DOUBLE_SPEND', 'HIGH', $4)`,
            [
              transaction.senderId,
              transaction.txId,
              bond.bondId,
              JSON.stringify({ reason: 'Bond already redeemed' }),
            ]
          );
        }
      }

      if (isDoubleSpent) {
        flagged.push(transaction.txId);
        continue;
      }

      const bondRedemptionBatchId = batchId;
      for (const bond of bonds) {
        await client.query(
          `INSERT INTO bond_redemptions (bond_id, tx_id, redeemed_by, redeemed_from, batch_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [bond.bondId, transaction.txId, transaction.receiverId, transaction.senderId, bondRedemptionBatchId]
        );

        await client.query(
          `UPDATE issued_bonds SET status = 'redeemed' WHERE bond_id = $1`,
          [bond.bondId]
        );
      }

      await client.query(
        `INSERT INTO transactions (tx_id, tx_type, sender_id, receiver_id, total_amount, tx_timestamp, nonce, sender_signature, status)
         VALUES ($1, 'P2P_OFFLINE', $2, $3, $4, $5, $6, $7, 'accepted')
         ON CONFLICT (tx_id) DO NOTHING`,
        [
          transaction.txId,
          transaction.senderId,
          transaction.receiverId,
          transaction.totalAmount,
          new Date(transaction.timestamp * 1000).toISOString(),
          transaction.nonce,
          transaction.senderSignature,
        ]
      );

      await client.query(
        'UPDATE users SET online_balance = online_balance + $1 WHERE user_id = $2',
        [transaction.totalAmount, transaction.receiverId]
      );

      accepted.push(transaction.txId);
    }

    for (const txId of outgoing || []) {
      accepted.push(txId);
    }

    const senderResult = await client.query(
      'SELECT online_balance FROM users WHERE user_id = $1',
      [userId]
    );

    const result = {
      accepted,
      rejected,
      flagged,
      updatedOnlineBalance: senderResult.rows[0]?.online_balance || 0,
    };

    await client.query(
      `INSERT INTO sync_batches (batch_id, user_id, submitted_at, processed_at, result)
       VALUES ($1, $2, NOW(), NOW(), $3)`,
      [batchId, userId, JSON.stringify(result)]
    );

    await client.query('COMMIT');

    res.json(result);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Sync error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

module.exports = { syncBatch };
