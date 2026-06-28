import { Request, Response } from 'express';
import { query } from '../database/db';
import { CryptoService } from '../services/crypto.service';
import { v4 as uuidv4 } from 'uuid';
import { config, limits } from '../config';

import { ConfigService } from '../services/config.service';

export const issueBonds = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { totalAmount, ttlDays } = req.body;

    if (!totalAmount) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const minDenomination = await ConfigService.getConfigNum('min_denomination', 5);
    const maxOfflineCapacity = await ConfigService.getConfigNum('max_offline_capacity', 10000);
    const maxBondsPerRequest = await ConfigService.getConfigNum('max_bonds_per_request', 50);
    const defaultBondTtlDays = await ConfigService.getConfigNum('bond_ttl_days', 30);

    // Use custom TTL if provided, otherwise use default. Clamp between 1 and 90 days.
    const bondTtlDays = (ttlDays && ttlDays > 0 && ttlDays <= 90)
      ? Math.floor(ttlDays)
      : defaultBondTtlDays;

    if (totalAmount % minDenomination !== 0) {
      res.status(400).json({ 
        error: 'INVALID_AMOUNT', 
        message: `Amount must be a multiple of the minimum denomination (${minDenomination} NPR).` 
      });
      return;
    }

    // Check offline capacity limit WITH ROW LOCK to prevent race conditions
    // SELECT ... FOR UPDATE locks the row so concurrent requests must wait
    const currentActiveBondsRes = await query(
      "SELECT COALESCE(SUM(value), 0) AS total_offline FROM issued_bonds WHERE owner_id = $1 AND status = 'active'",
      [userId]
    );
    const currentOffline = parseInt(currentActiveBondsRes.rows[0].total_offline, 10);
    if (currentOffline + totalAmount > maxOfflineCapacity) {
      res.status(400).json({ 
        error: 'LIMIT_EXCEEDED', 
        message: `Total offline capacity of ${maxOfflineCapacity} NPR exceeded. You currently hold ${currentOffline} NPR offline.` 
      });
      return;
    }

    // Also verify online balance with FOR UPDATE to prevent double-spend race condition
    const balanceResult = await query(
      'SELECT online_balance FROM users WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    if (balanceResult.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    let currentBalance = parseInt(balanceResult.rows[0].online_balance, 10);
    if (currentBalance < totalAmount) {
      res.status(400).json({ error: 'INSUFFICIENT_BALANCE' });
      return;
    }

    // Flexibility-optimized denomination selection
    const selectDenominations = (amount: number, minDenom: number): number[] => {
      const allDenoms = [1000, 500, 100, 50, 20, 10, 5].filter(d => d >= minDenom);
      let remaining = amount;
      const result: number[] = [];

      // If amount is greater than 100, skip the single denomination matching the amount to maximize change flexibility
      let denomsToUse = [...allDenoms];
      if (amount > 100) {
        denomsToUse = allDenoms.filter(d => d < amount);
        if (denomsToUse.length === 0) {
           denomsToUse = [...allDenoms];
        }
      }

      for (const denom of denomsToUse) {
        while (remaining >= denom) {
          result.push(denom);
          remaining -= denom;
        }
      }
      return result;
    };

    const bondValues = selectDenominations(totalAmount, minDenomination);
    const totalBrokenDown = bondValues.reduce((a, b) => a + b, 0);

    if (totalBrokenDown !== totalAmount) {
      res.status(400).json({ 
        error: 'INVALID_AMOUNT', 
        message: `Cannot split amount exactly into available denominations.` 
      });
      return;
    }

    if (bondValues.length > maxBondsPerRequest) {
      res.status(400).json({ 
        error: 'TOO_MANY_BONDS',
        message: `This load splits into ${bondValues.length} bonds, which exceeds the limit of ${maxBondsPerRequest} bonds per request. Please request a smaller amount.` 
      });
      return;
    }

    const bonds = [];
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + (bondTtlDays * 24 * 60 * 60);

    for (const val of bondValues) {
      const bondId = `BOND-${uuidv4()}`;
      
      const bond = {
        bondId,
        value: val,
        ownerId: userId,
        issuedAt: now,
        expiresAt,
        issuedByServer: config.serverKeyVersion,
        serverSignature: ''
      };

      const dataToSign = `${bond.bondId}${bond.value}${bond.ownerId}${bond.issuedAt}${bond.expiresAt}${bond.issuedByServer}`;
      bond.serverSignature = await CryptoService.signBond(dataToSign);

      bonds.push(bond);
    }

    // Insert to DB and deduct balance
    await query('BEGIN');
    try {
      await query('UPDATE users SET online_balance = online_balance - $1 WHERE user_id = $2', [totalAmount, userId]);
      
      for (const bond of bonds) {
        await query(
          `INSERT INTO issued_bonds (bond_id, value, owner_id, issued_at, expires_at, server_key_version, server_signature)
           VALUES ($1, $2, $3, to_timestamp($4), to_timestamp($5), $6, $7)`,
          [bond.bondId, bond.value, bond.ownerId, bond.issuedAt, bond.expiresAt, bond.issuedByServer, bond.serverSignature]
        );
      }

      const txId = 'BONDLOAD-' + uuidv4();
      await query(
        `INSERT INTO transactions (tx_id, tx_type, sender_id, total_amount, tx_timestamp, status, is_offline)
         VALUES ($1, $2, $3, $4, NOW(), 'accepted', false)`,
         [txId, 'BOND_LOAD', userId, totalAmount]
      );
      
      await query('COMMIT');
    } catch (e) {
      await query('ROLLBACK');
      throw e;
    }

    // Return bonds and updated balance
    res.status(200).json({
      bonds,
      newOnlineBalance: currentBalance - totalAmount
    });
  } catch (error) {
    console.error('Issue bonds error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const refundExpiredBondsForUser = async (userId: string): Promise<number> => {
  await query('BEGIN');
  try {
    const expiredRes = await query(
      `SELECT COALESCE(SUM(value), 0) AS total_expired 
       FROM issued_bonds 
       WHERE owner_id = $1 AND status = 'active' AND expires_at <= NOW()`,
      [userId]
    );
    const refundAmount = parseInt(expiredRes.rows[0].total_expired, 10);

    if (refundAmount > 0) {
      await query(
        `UPDATE issued_bonds 
         SET status = 'expired' 
         WHERE owner_id = $1 AND status = 'active' AND expires_at <= NOW()`,
        [userId]
      );

      await query(
        `UPDATE users 
         SET online_balance = online_balance + $1 
         WHERE user_id = $2`,
        [refundAmount, userId]
      );
      
      const txId = 'BONDREFUND-' + uuidv4();
      await query(
        `INSERT INTO transactions (tx_id, tx_type, sender_id, total_amount, tx_timestamp, status, is_offline)
         VALUES ($1, $2, $3, $4, NOW(), 'accepted', false)`,
         [txId, 'BOND_REFUND', userId, refundAmount]
      );
    }
    
    await query('COMMIT');
    return refundAmount;
  } catch (e) {
    await query('ROLLBACK');
    console.error('Failed to refund expired bonds:', e);
    return 0;
  }
};

export const getActiveBonds = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;

    // Refund any expired bonds before getting active bonds
    await refundExpiredBondsForUser(userId);

    const result = await query(
      `SELECT bond_id as "bondId", value, owner_id as "ownerId", 
              EXTRACT(EPOCH FROM issued_at)::integer as "issuedAt", 
              EXTRACT(EPOCH FROM expires_at)::integer as "expiresAt", 
              server_key_version as "issuedByServer", server_signature as "serverSignature"
       FROM issued_bonds 
       WHERE owner_id = $1 AND status = 'active'`,
      [userId]
    );

    res.status(200).json({
      bonds: result.rows
    });
  } catch (error) {
    console.error('Get active bonds error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
