"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncTransactions = void 0;
const db_1 = require("../database/db");
const crypto_service_1 = require("../services/crypto.service");
const bonds_controller_1 = require("./bonds.controller");
const syncTransactions = async (req, res) => {
    try {
        const userId = req.user.userId;
        // Auto-refund any expired offline bonds owned by the syncing user before processing transactions
        await (0, bonds_controller_1.refundExpiredBondsForUser)(userId);
        const { batchId, outgoing, incoming } = req.body;
        if (!batchId) {
            res.status(400).json({ error: 'Missing batchId' });
            return;
        }
        // Check if batch already processed
        const batchCheck = await (0, db_1.query)('SELECT result FROM sync_batches WHERE batch_id = $1', [batchId]);
        if (batchCheck.rows.length > 0) {
            res.status(200).json(batchCheck.rows[0].result);
            return;
        }
        const accepted = [];
        const rejected = [];
        const flagged = [];
        await (0, db_1.query)('BEGIN');
        try {
            // Process Incoming (user is the receiver)
            if (incoming && Array.isArray(incoming)) {
                for (const item of incoming) {
                    const { transaction, bonds } = item;
                    if (transaction.receiverId !== userId) {
                        rejected.push({ txId: transaction.txId, reason: 'Receiver ID mismatch' });
                        continue;
                    }
                    if (!bonds || bonds.length === 0) {
                        rejected.push({ txId: transaction.txId, reason: 'No bonds provided' });
                        continue;
                    }
                    // 1. Verify bond value sum matches transaction amount
                    const totalBondValue = bonds.reduce((sum, b) => sum + b.value, 0);
                    if (totalBondValue !== transaction.totalAmount) {
                        rejected.push({ txId: transaction.txId, reason: 'Bonds value does not match transaction amount' });
                        continue;
                    }
                    const bondIds = bonds.map((b) => b.bondId);
                    bondIds.sort();
                    const bondIdsString = bondIds.join(',');
                    // 2. Verify Sender Signature
                    const senderRes = await (0, db_1.query)('SELECT public_key FROM users WHERE user_id = $1', [transaction.senderId]);
                    if (senderRes.rows.length === 0 || !senderRes.rows[0].public_key) {
                        rejected.push({ txId: transaction.txId, reason: 'Sender public key not found' });
                        continue;
                    }
                    const txDataToVerify = `${transaction.txId}${transaction.senderId}${userId}${transaction.totalAmount}${transaction.timestamp}${transaction.nonce}${bondIdsString}${transaction.message || ''}`;
                    const isTxValid = await crypto_service_1.CryptoService.verifySignature(txDataToVerify, transaction.senderSignature, senderRes.rows[0].public_key);
                    if (!isTxValid) {
                        rejected.push({ txId: transaction.txId, reason: 'INVALID_SENDER_SIGNATURE' });
                        continue;
                    }
                    let allBondsValid = true;
                    for (const bond of bonds) {
                        // Verify if bond is expired
                        const nowSec = Math.floor(Date.now() / 1000);
                        if (bond.expiresAt <= nowSec) {
                            rejected.push({ txId: transaction.txId, bondIds, reason: 'BOND_EXPIRED' });
                            allBondsValid = false;
                            break;
                        }
                        // Verify server signature
                        const dataToVerify = `${bond.bondId}${bond.value}${bond.ownerId}${bond.issuedAt}${bond.expiresAt}${bond.issuedByServer}`;
                        const isValid = await crypto_service_1.CryptoService.verifySignature(dataToVerify, bond.serverSignature, crypto_service_1.CryptoService.getPublicKeyBase64());
                        if (!isValid) {
                            rejected.push({ txId: transaction.txId, bondIds, reason: 'INVALID_SERVER_SIGNATURE' });
                            allBondsValid = false;
                            break;
                        }
                        // Check if bond was issued and verify ownership
                        const issuedCheck = await (0, db_1.query)('SELECT status, owner_id FROM issued_bonds WHERE bond_id = $1', [bond.bondId]);
                        if (issuedCheck.rows.length === 0) {
                            rejected.push({ txId: transaction.txId, bondIds, reason: 'BOND_NOT_ISSUED' });
                            allBondsValid = false;
                            break;
                        }
                        if (issuedCheck.rows[0].owner_id !== transaction.senderId) {
                            rejected.push({ txId: transaction.txId, bondIds, reason: 'BOND_OWNERSHIP_MISMATCH' });
                            allBondsValid = false;
                            break;
                        }
                        // Check redemption ledger (Double spend)
                        const redCheck = await (0, db_1.query)('SELECT tx_id FROM bond_redemptions WHERE bond_id = $1', [bond.bondId]);
                        if (redCheck.rows.length > 0) {
                            flagged.push({ txId: transaction.txId, bondIds, reason: 'DOUBLE_SPEND_DETECTED' });
                            allBondsValid = false;
                            // Record fraud flag
                            await (0, db_1.query)(`INSERT INTO fraud_flags (user_id, tx_id, bond_id, flag_type, severity) VALUES ($1, $2, $3, $4, $5)`, [transaction.senderId, transaction.txId, bond.bondId, 'DOUBLE_SPEND', 'HIGH']);
                            break;
                        }
                    }
                    if (allBondsValid) {
                        // Check if transaction was already inserted
                        const txCheck = await (0, db_1.query)('SELECT tx_id FROM transactions WHERE tx_id = $1', [transaction.txId]);
                        if (txCheck.rows.length === 0) {
                            // Mark bonds as redeemed
                            for (const bond of bonds) {
                                await (0, db_1.query)(`INSERT INTO bond_redemptions (bond_id, tx_id, redeemed_by, redeemed_from, batch_id) VALUES ($1, $2, $3, $4, $5)`, [bond.bondId, transaction.txId, userId, transaction.senderId, batchId]);
                                await (0, db_1.query)('UPDATE issued_bonds SET status = $1 WHERE bond_id = $2', ['redeemed', bond.bondId]);
                            }
                            // Credit receiver
                            await (0, db_1.query)('UPDATE users SET online_balance = online_balance + $1 WHERE user_id = $2', [transaction.totalAmount, userId]);
                            // Record transaction
                            await (0, db_1.query)(`INSERT INTO transactions (tx_id, tx_type, sender_id, receiver_id, total_amount, tx_timestamp, nonce, sender_signature, message, is_offline)
                 VALUES ($1, $2, $3, $4, $5, to_timestamp($6), $7, $8, $9, $10)`, [transaction.txId, 'P2P_OFFLINE', transaction.senderId, transaction.receiverId, transaction.totalAmount, transaction.timestamp, transaction.nonce, transaction.senderSignature, transaction.message || null, true]);
                        }
                        accepted.push({ txId: transaction.txId, bondIds });
                    }
                }
            }
            // Process Outgoing (user is the sender)
            if (outgoing && Array.isArray(outgoing)) {
                for (const item of outgoing) {
                    const { transaction, bonds } = item;
                    if (transaction.senderId !== userId) {
                        rejected.push({ txId: transaction.txId, reason: 'Sender ID mismatch' });
                        continue;
                    }
                    if (!bonds || bonds.length === 0) {
                        rejected.push({ txId: transaction.txId, reason: 'No bonds provided' });
                        continue;
                    }
                    const totalBondValue = bonds.reduce((sum, b) => sum + b.value, 0);
                    if (totalBondValue !== transaction.totalAmount) {
                        rejected.push({ txId: transaction.txId, reason: 'Bonds value does not match transaction amount' });
                        continue;
                    }
                    const bondIds = bonds.map((b) => b.bondId);
                    bondIds.sort();
                    const bondIdsString = bondIds.join(',');
                    // Verify Sender Signature
                    const senderRes = await (0, db_1.query)('SELECT public_key FROM users WHERE user_id = $1', [userId]);
                    if (senderRes.rows.length === 0 || !senderRes.rows[0].public_key) {
                        rejected.push({ txId: transaction.txId, reason: 'Sender public key not found' });
                        continue;
                    }
                    const txDataToVerify = `${transaction.txId}${userId}${transaction.receiverId}${transaction.totalAmount}${transaction.timestamp}${transaction.nonce}${bondIdsString}${transaction.message || ''}`;
                    const isTxValid = await crypto_service_1.CryptoService.verifySignature(txDataToVerify, transaction.senderSignature, senderRes.rows[0].public_key);
                    if (!isTxValid) {
                        rejected.push({ txId: transaction.txId, reason: 'INVALID_SENDER_SIGNATURE' });
                        continue;
                    }
                    let allBondsValid = true;
                    for (const bond of bonds) {
                        // Verify if bond is expired
                        const nowSec = Math.floor(Date.now() / 1000);
                        if (bond.expiresAt <= nowSec) {
                            rejected.push({ txId: transaction.txId, bondIds, reason: 'BOND_EXPIRED' });
                            allBondsValid = false;
                            break;
                        }
                        // Verify server signature
                        const dataToVerify = `${bond.bondId}${bond.value}${bond.ownerId}${bond.issuedAt}${bond.expiresAt}${bond.issuedByServer}`;
                        const isValid = await crypto_service_1.CryptoService.verifySignature(dataToVerify, bond.serverSignature, crypto_service_1.CryptoService.getPublicKeyBase64());
                        if (!isValid) {
                            rejected.push({ txId: transaction.txId, bondIds, reason: 'INVALID_SERVER_SIGNATURE' });
                            allBondsValid = false;
                            break;
                        }
                        // Check issued
                        const issuedCheck = await (0, db_1.query)('SELECT status, owner_id FROM issued_bonds WHERE bond_id = $1', [bond.bondId]);
                        if (issuedCheck.rows.length === 0) {
                            rejected.push({ txId: transaction.txId, bondIds, reason: 'BOND_NOT_ISSUED' });
                            allBondsValid = false;
                            break;
                        }
                        if (issuedCheck.rows[0].owner_id !== userId) {
                            rejected.push({ txId: transaction.txId, bondIds, reason: 'BOND_OWNERSHIP_MISMATCH' });
                            allBondsValid = false;
                            break;
                        }
                        // Check double spend
                        const redCheck = await (0, db_1.query)('SELECT tx_id FROM bond_redemptions WHERE bond_id = $1', [bond.bondId]);
                        if (redCheck.rows.length > 0) {
                            flagged.push({ txId: transaction.txId, bondIds, reason: 'DOUBLE_SPEND_DETECTED' });
                            allBondsValid = false;
                            await (0, db_1.query)(`INSERT INTO fraud_flags (user_id, tx_id, bond_id, flag_type, severity) VALUES ($1, $2, $3, $4, $5)`, [userId, transaction.txId, bond.bondId, 'DOUBLE_SPEND', 'HIGH']);
                            break;
                        }
                    }
                    if (allBondsValid) {
                        const txCheck = await (0, db_1.query)('SELECT tx_id FROM transactions WHERE tx_id = $1', [transaction.txId]);
                        if (txCheck.rows.length === 0) {
                            // Mark bonds as redeemed
                            for (const bond of bonds) {
                                await (0, db_1.query)(`INSERT INTO bond_redemptions (bond_id, tx_id, redeemed_by, redeemed_from, batch_id) VALUES ($1, $2, $3, $4, $5)`, [bond.bondId, transaction.txId, transaction.receiverId, userId, batchId]);
                                await (0, db_1.query)('UPDATE issued_bonds SET status = $1 WHERE bond_id = $2', ['redeemed', bond.bondId]);
                            }
                            // Credit receiver
                            await (0, db_1.query)('UPDATE users SET online_balance = online_balance + $1 WHERE user_id = $2', [transaction.totalAmount, transaction.receiverId]);
                            // Record transaction
                            await (0, db_1.query)(`INSERT INTO transactions (tx_id, tx_type, sender_id, receiver_id, total_amount, tx_timestamp, nonce, sender_signature, message, is_offline)
                 VALUES ($1, $2, $3, $4, $5, to_timestamp($6), $7, $8, $9, $10)`, [transaction.txId, 'P2P_OFFLINE', userId, transaction.receiverId, transaction.totalAmount, transaction.timestamp, transaction.nonce, transaction.senderSignature, transaction.message || null, true]);
                        }
                        accepted.push({ txId: transaction.txId, bondIds });
                    }
                }
            }
            const resultPayload = { accepted, rejected, flagged };
            // Save batch result
            await (0, db_1.query)(`INSERT INTO sync_batches (batch_id, user_id, submitted_at, processed_at, result) VALUES ($1, $2, NOW(), NOW(), $3)`, [batchId, userId, resultPayload]);
            await (0, db_1.query)('COMMIT');
            // Get updated balance
            const balanceResult = await (0, db_1.query)('SELECT online_balance FROM users WHERE user_id = $1', [userId]);
            res.status(200).json({
                ...resultPayload,
                updatedOnlineBalance: parseInt(balanceResult.rows[0].online_balance, 10)
            });
        }
        catch (e) {
            await (0, db_1.query)('ROLLBACK');
            throw e;
        }
    }
    catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.syncTransactions = syncTransactions;
//# sourceMappingURL=transactions.controller.js.map