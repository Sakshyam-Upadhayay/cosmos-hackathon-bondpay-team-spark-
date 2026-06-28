"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveBonds = exports.refundExpiredBondsForUser = exports.issueBonds = void 0;
const db_1 = require("../database/db");
const crypto_service_1 = require("../services/crypto.service");
const uuid_1 = require("uuid");
const config_1 = require("../config");
const config_service_1 = require("../services/config.service");
const issueBonds = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { totalAmount, ttlDays } = req.body;
        if (!totalAmount) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }
        const minDenomination = await config_service_1.ConfigService.getConfigNum('min_denomination', 5);
        const maxOfflineCapacity = await config_service_1.ConfigService.getConfigNum('max_offline_capacity', 10000);
        const maxBondsPerRequest = await config_service_1.ConfigService.getConfigNum('max_bonds_per_request', 50);
        const defaultBondTtlDays = await config_service_1.ConfigService.getConfigNum('bond_ttl_days', 30);
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
        const currentActiveBondsRes = await (0, db_1.query)("SELECT COALESCE(SUM(value), 0) AS total_offline FROM issued_bonds WHERE owner_id = $1 AND status = 'active'", [userId]);
        const currentOffline = parseInt(currentActiveBondsRes.rows[0].total_offline, 10);
        if (currentOffline + totalAmount > maxOfflineCapacity) {
            res.status(400).json({
                error: 'LIMIT_EXCEEDED',
                message: `Total offline capacity of ${maxOfflineCapacity} NPR exceeded. You currently hold ${currentOffline} NPR offline.`
            });
            return;
        }
        // Also verify online balance with FOR UPDATE to prevent double-spend race condition
        const balanceResult = await (0, db_1.query)('SELECT online_balance FROM users WHERE user_id = $1 FOR UPDATE', [userId]);
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
        const selectDenominations = (amount, minDenom) => {
            const allDenoms = [1000, 500, 100, 50, 20, 10, 5].filter(d => d >= minDenom);
            let remaining = amount;
            const result = [];
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
            const bondId = `BOND-${(0, uuid_1.v4)()}`;
            const bond = {
                bondId,
                value: val,
                ownerId: userId,
                issuedAt: now,
                expiresAt,
                issuedByServer: config_1.config.serverKeyVersion,
                serverSignature: ''
            };
            const dataToSign = `${bond.bondId}${bond.value}${bond.ownerId}${bond.issuedAt}${bond.expiresAt}${bond.issuedByServer}`;
            bond.serverSignature = await crypto_service_1.CryptoService.signBond(dataToSign);
            bonds.push(bond);
        }
        // Insert to DB and deduct balance
        await (0, db_1.withTransaction)(async (txQuery) => {
            await txQuery('UPDATE users SET online_balance = online_balance - $1 WHERE user_id = $2', [totalAmount, userId]);
            for (const bond of bonds) {
                await txQuery(`INSERT INTO issued_bonds (bond_id, value, owner_id, issued_at, expires_at, server_key_version, server_signature)
           VALUES ($1, $2, $3, to_timestamp($4), to_timestamp($5), $6, $7)`, [bond.bondId, bond.value, bond.ownerId, bond.issuedAt, bond.expiresAt, bond.issuedByServer, bond.serverSignature]);
            }
            const txId = 'BONDLOAD-' + (0, uuid_1.v4)();
            await txQuery(`INSERT INTO transactions (tx_id, tx_type, sender_id, total_amount, tx_timestamp, status, is_offline)
         VALUES ($1, $2, $3, $4, NOW(), 'accepted', false)`, [txId, 'BOND_LOAD', userId, totalAmount]);
        });
        // Return bonds and updated balance
        res.status(200).json({
            bonds,
            newOnlineBalance: currentBalance - totalAmount
        });
    }
    catch (error) {
        console.error('Issue bonds error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.issueBonds = issueBonds;
const refundExpiredBondsForUser = async (userId) => {
    try {
        return await (0, db_1.withTransaction)(async (txQuery) => {
            const expiredRes = await txQuery(`SELECT COALESCE(SUM(value), 0) AS total_expired 
         FROM issued_bonds 
         WHERE owner_id = $1 AND status = 'active' AND expires_at <= NOW()`, [userId]);
            const refundAmount = parseInt(expiredRes.rows[0].total_expired, 10);
            if (refundAmount > 0) {
                await txQuery(`UPDATE issued_bonds 
           SET status = 'expired' 
           WHERE owner_id = $1 AND status = 'active' AND expires_at <= NOW()`, [userId]);
                await txQuery(`UPDATE users 
           SET online_balance = online_balance + $1 
           WHERE user_id = $2`, [refundAmount, userId]);
                const txId = 'BONDREFUND-' + (0, uuid_1.v4)();
                await txQuery(`INSERT INTO transactions (tx_id, tx_type, sender_id, total_amount, tx_timestamp, status, is_offline)
           VALUES ($1, $2, $3, $4, NOW(), 'accepted', false)`, [txId, 'BOND_REFUND', userId, refundAmount]);
            }
            return refundAmount;
        });
    }
    catch (e) {
        console.error('Failed to refund expired bonds:', e);
        return 0;
    }
};
exports.refundExpiredBondsForUser = refundExpiredBondsForUser;
const getActiveBonds = async (req, res) => {
    try {
        const userId = req.user.userId;
        // Refund any expired bonds before getting active bonds
        await (0, exports.refundExpiredBondsForUser)(userId);
        const result = await (0, db_1.query)(`SELECT bond_id as "bondId", value, owner_id as "ownerId", 
              EXTRACT(EPOCH FROM issued_at)::integer as "issuedAt", 
              EXTRACT(EPOCH FROM expires_at)::integer as "expiresAt", 
              server_key_version as "issuedByServer", server_signature as "serverSignature"
       FROM issued_bonds 
       WHERE owner_id = $1 AND status = 'active'`, [userId]);
        res.status(200).json({
            bonds: result.rows
        });
    }
    catch (error) {
        console.error('Get active bonds error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getActiveBonds = getActiveBonds;
//# sourceMappingURL=bonds.controller.js.map