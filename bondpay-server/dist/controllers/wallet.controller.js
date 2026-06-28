"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.claimPending = exports.transferPending = exports.getHistory = exports.reverseBonds = exports.transferOnline = exports.topup = void 0;
const db_1 = require("../database/db");
const crypto_1 = __importDefault(require("crypto"));
const topup = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { amount } = req.body;
        if (!amount || amount <= 0) {
            res.status(400).json({ error: 'Invalid amount' });
            return;
        }
        const txId = 'TOPUP-' + crypto_1.default.randomUUID();
        const onlineBalance = await (0, db_1.withTransaction)(async (txQuery) => {
            const result = await txQuery('UPDATE users SET online_balance = online_balance + $1 WHERE user_id = $2 RETURNING online_balance', [amount, userId]);
            await txQuery(`INSERT INTO transactions (tx_id, tx_type, receiver_id, total_amount, tx_timestamp, status, is_offline)
         VALUES ($1, $2, $3, $4, NOW(), 'accepted', false)`, [txId, 'TOPUP', userId, amount]);
            return parseInt(result.rows[0].online_balance, 10);
        });
        res.status(200).json({ onlineBalance, txId });
    }
    catch (error) {
        console.error('Topup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.topup = topup;
const transferOnline = async (req, res) => {
    try {
        const senderId = req.user.userId;
        const { receiverId, amount, message } = req.body;
        if (!receiverId || !amount || amount <= 0) {
            res.status(400).json({ error: 'Invalid request' });
            return;
        }
        const txId = 'P2P-ONLINE-' + crypto_1.default.randomUUID();
        const onlineBalance = await (0, db_1.withTransaction)(async (txQuery) => {
            const senderRes = await txQuery('SELECT online_balance FROM users WHERE user_id = $1 FOR UPDATE', [senderId]);
            if (senderRes.rows.length === 0 || senderRes.rows[0].online_balance < amount) {
                throw { status: 400, error: 'Insufficient online balance' };
            }
            const receiverRes = await txQuery('SELECT user_id FROM users WHERE user_id = $1 FOR UPDATE', [receiverId]);
            if (receiverRes.rows.length === 0) {
                throw { status: 404, error: 'Receiver not found' };
            }
            await txQuery('UPDATE users SET online_balance = online_balance - $1 WHERE user_id = $2', [amount, senderId]);
            await txQuery('UPDATE users SET online_balance = online_balance + $1 WHERE user_id = $2', [amount, receiverId]);
            await txQuery(`INSERT INTO transactions (tx_id, tx_type, sender_id, receiver_id, total_amount, tx_timestamp, message, status, is_offline)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6, 'accepted', false)`, [txId, 'P2P_ONLINE', senderId, receiverId, amount, message || null]);
            const newBalanceRes = await txQuery('SELECT online_balance FROM users WHERE user_id = $1', [senderId]);
            return parseInt(newBalanceRes.rows[0].online_balance, 10);
        });
        res.status(200).json({ success: true, onlineBalance, txId });
    }
    catch (error) {
        if (error.status) {
            res.status(error.status).json({ error: error.error });
            return;
        }
        console.error('Transfer online error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.transferOnline = transferOnline;
const reverseBonds = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { bondIds } = req.body;
        if (!Array.isArray(bondIds) || bondIds.length === 0) {
            res.status(400).json({ error: 'Invalid bondIds array' });
            return;
        }
        const { totalReversedValue, onlineBalance } = await (0, db_1.withTransaction)(async (txQuery) => {
            let totalReversed = 0;
            for (const bondId of bondIds) {
                // Find active bond belonging to user
                const bondRes = await txQuery("SELECT value, status FROM issued_bonds WHERE bond_id = $1 AND owner_id = $2 FOR UPDATE", [bondId, userId]);
                if (bondRes.rows.length > 0 && bondRes.rows[0].status === 'active') {
                    // Mark revoked
                    await txQuery("UPDATE issued_bonds SET status = 'revoked' WHERE bond_id = $1", [bondId]);
                    totalReversed += parseInt(bondRes.rows[0].value, 10);
                }
            }
            if (totalReversed > 0) {
                await txQuery('UPDATE users SET online_balance = online_balance + $1 WHERE user_id = $2', [totalReversed, userId]);
                const txId = 'REVERSE-' + crypto_1.default.randomUUID();
                await txQuery(`INSERT INTO transactions (tx_id, tx_type, sender_id, total_amount, tx_timestamp, status, is_offline)
           VALUES ($1, $2, $3, $4, NOW(), 'accepted', false)`, [txId, 'BOND_REVERSE', userId, totalReversed]);
            }
            const newBalanceRes = await txQuery('SELECT online_balance FROM users WHERE user_id = $1', [userId]);
            return {
                totalReversedValue: totalReversed,
                onlineBalance: parseInt(newBalanceRes.rows[0].online_balance, 10)
            };
        });
        res.status(200).json({ success: true, reversedAmount: totalReversedValue, onlineBalance });
    }
    catch (error) {
        console.error('Reverse bonds error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.reverseBonds = reverseBonds;
const getHistory = async (req, res) => {
    try {
        const userId = req.user.userId;
        const historyRes = await (0, db_1.query)(`SELECT tx_id, tx_type, sender_id, receiver_id, total_amount, tx_timestamp, status, message, is_offline 
       FROM transactions 
       WHERE sender_id = $1 OR receiver_id = $1 
       ORDER BY tx_timestamp DESC LIMIT 50`, [userId]);
        res.status(200).json(historyRes.rows);
    }
    catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getHistory = getHistory;
const transferPending = async (req, res) => {
    try {
        const senderId = req.user.userId;
        const { receiverId, amount } = req.body;
        if (!receiverId || !amount || amount <= 0) {
            res.status(400).json({ error: 'Invalid request parameters' });
            return;
        }
        const txId = 'P2P-PENDING-' + crypto_1.default.randomUUID();
        const pickupId = 'PICKUP-' + crypto_1.default.randomUUID();
        const pickupCode = crypto_1.default.randomBytes(3).toString('hex').toUpperCase(); // 6 chars
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours expiry
        const expiresAtSec = Math.floor(expiresAt.getTime() / 1000);
        const dataToSign = `${pickupId}${senderId}${receiverId}${amount}${expiresAtSec}`;
        const { CryptoService } = require('../services/crypto.service');
        const serverSig = await CryptoService.signBond(dataToSign);
        const onlineBalance = await (0, db_1.withTransaction)(async (txQuery) => {
            const senderRes = await txQuery('SELECT online_balance FROM users WHERE user_id = $1 FOR UPDATE', [senderId]);
            if (senderRes.rows.length === 0 || senderRes.rows[0].online_balance < amount) {
                throw { status: 400, error: 'Insufficient online balance' };
            }
            const receiverRes = await txQuery('SELECT user_id FROM users WHERE user_id = $1', [receiverId]);
            if (receiverRes.rows.length === 0) {
                throw { status: 404, error: 'Receiver not found' };
            }
            // Deduct online balance
            await txQuery('UPDATE users SET online_balance = online_balance - $1 WHERE user_id = $2', [amount, senderId]);
            await txQuery(`INSERT INTO pending_pickups (pickup_id, sender_id, receiver_id, amount, pickup_code, server_sig, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)`, [pickupId, senderId, receiverId, amount, pickupCode, serverSig, expiresAt]);
            // Create a transaction record as pending online/offline
            await txQuery(`INSERT INTO transactions (tx_id, tx_type, sender_id, receiver_id, total_amount, tx_timestamp, status, is_offline)
         VALUES ($1, $2, $3, $4, $5, NOW(), 'pending', false)`, [txId, 'P2P_PENDING', senderId, receiverId, amount]);
            const newBalanceRes = await txQuery('SELECT online_balance FROM users WHERE user_id = $1', [senderId]);
            return parseInt(newBalanceRes.rows[0].online_balance, 10);
        });
        res.status(200).json({
            success: true,
            pickupId,
            pickupCode,
            amount,
            expiresAt: expiresAtSec,
            serverSig,
            onlineBalance
        });
    }
    catch (error) {
        if (error.status) {
            res.status(error.status).json({ error: error.error });
            return;
        }
        console.error('Transfer pending error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.transferPending = transferPending;
const claimPending = async (req, res) => {
    try {
        const receiverId = req.user.userId;
        const { pickupId } = req.body;
        if (!pickupId) {
            res.status(400).json({ error: 'Pickup ID is required' });
            return;
        }
        const onlineBalance = await (0, db_1.withTransaction)(async (txQuery) => {
            const pickupRes = await txQuery('SELECT * FROM pending_pickups WHERE pickup_id = $1 FOR UPDATE', [pickupId]);
            if (pickupRes.rows.length === 0) {
                throw { status: 404, error: 'Pending transfer claim not found' };
            }
            const pickup = pickupRes.rows[0];
            if (pickup.status !== 'pending') {
                throw { status: 400, error: 'Transfer already claimed or expired' };
            }
            if (pickup.receiver_id !== receiverId) {
                throw { status: 403, error: 'This transfer is not meant for your account' };
            }
            if (new Date(pickup.expires_at) < new Date()) {
                // Refund sender if expired
                await txQuery('UPDATE users SET online_balance = online_balance + $1 WHERE user_id = $2', [pickup.amount, pickup.sender_id]);
                await txQuery("UPDATE pending_pickups SET status = 'expired' WHERE pickup_id = $1", [pickupId]);
                throw { status: 400, error: 'This transfer has expired and funds have been refunded to the sender' };
            }
            // Credit receiver
            const amountVal = parseInt(pickup.amount, 10);
            const result = await txQuery('UPDATE users SET online_balance = online_balance + $1 WHERE user_id = $2 RETURNING online_balance', [amountVal, receiverId]);
            // Mark pickup claimed
            await txQuery("UPDATE pending_pickups SET status = 'claimed', claimed_at = NOW() WHERE pickup_id = $1", [pickupId]);
            // Update transactions to accepted
            await txQuery("UPDATE transactions SET status = 'accepted', synced_at = NOW() WHERE sender_id = $1 AND receiver_id = $2 AND total_amount = $3 AND status = 'pending'", [pickup.sender_id, receiverId, amountVal]);
            return parseInt(result.rows[0].online_balance, 10);
        });
        res.status(200).json({
            success: true,
            onlineBalance
        });
    }
    catch (error) {
        if (error.status) {
            res.status(error.status).json({ error: error.error });
            return;
        }
        console.error('Claim pending error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.claimPending = claimPending;
//# sourceMappingURL=wallet.controller.js.map