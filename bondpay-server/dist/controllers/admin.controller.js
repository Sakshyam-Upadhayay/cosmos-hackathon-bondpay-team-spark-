"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateConfig = exports.getConfigs = exports.deleteTransaction = exports.updateTransaction = exports.createTransaction = exports.getTransactions = exports.deleteBond = exports.updateBond = exports.createBond = exports.getBonds = exports.deleteUser = exports.updateUser = exports.createUser = exports.getUsers = exports.getStats = exports.adminLogin = void 0;
const db_1 = require("../database/db");
const jwt = __importStar(require("jsonwebtoken"));
const config_1 = require("../config");
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto_service_1 = require("../services/crypto.service");
const uuid_1 = require("uuid");
const adminLogin = async (req, res) => {
    try {
        const { username, password } = req.body;
        if (username === 'admin' && password === 'admin') {
            const token = jwt.sign({ isAdmin: true, username: 'admin' }, config_1.config.jwtSecret, { expiresIn: '24h' });
            res.status(200).json({ success: true, token });
        }
        else {
            res.status(401).json({ success: false, error: 'Invalid admin credentials' });
        }
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
};
exports.adminLogin = adminLogin;
const getStats = async (req, res) => {
    try {
        const usersCount = await (0, db_1.query)('SELECT COUNT(*) as count FROM users');
        const onlineSum = await (0, db_1.query)('SELECT COALESCE(SUM(online_balance), 0) as total FROM users');
        const activeBondsCount = await (0, db_1.query)("SELECT COUNT(*) as count FROM issued_bonds WHERE status = 'active'");
        const activeBondsSum = await (0, db_1.query)("SELECT COALESCE(SUM(value), 0) as total FROM issued_bonds WHERE status = 'active'");
        const txsCount = await (0, db_1.query)('SELECT COUNT(*) as count FROM transactions');
        const fraudCount = await (0, db_1.query)('SELECT COUNT(*) as count FROM fraud_flags');
        res.status(200).json({
            totalUsers: parseInt(usersCount.rows[0].count, 10),
            totalOnlineBalance: parseInt(onlineSum.rows[0].total, 10),
            totalActiveBondsCount: parseInt(activeBondsCount.rows[0].count, 10),
            totalOfflineBalance: parseInt(activeBondsSum.rows[0].total, 10),
            totalTransactions: parseInt(txsCount.rows[0].count, 10),
            totalFraudFlags: parseInt(fraudCount.rows[0].count, 10)
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getStats = getStats;
// Users CRUD
const getUsers = async (req, res) => {
    try {
        const result = await (0, db_1.query)('SELECT user_id, phone_number, email, full_name, online_balance, is_frozen, registered_at, active_device_id, ttl_hours FROM users ORDER BY registered_at DESC');
        res.status(200).json(result.rows);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getUsers = getUsers;
const createUser = async (req, res) => {
    try {
        const { phoneNumber, email, fullName, password, publicKey, onlineBalance, isFrozen, ttlHours } = req.body;
        if (!phoneNumber || !email || !fullName || !password) {
            res.status(400).json({ error: 'PhoneNumber, email, fullName, and password are required' });
            return;
        }
        const hash = await bcrypt_1.default.hash(password, 10);
        const result = await (0, db_1.query)(`INSERT INTO users (phone_number, email, full_name, password_hash, public_key, online_balance, is_frozen, ttl_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING user_id`, [phoneNumber, email, fullName, hash, publicKey || null, onlineBalance || 0, isFrozen || false, ttlHours || 72]);
        res.status(201).json({ success: true, userId: result.rows[0].user_id });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.createUser = createUser;
const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { phoneNumber, email, fullName, onlineBalance, isFrozen, activeDeviceId, ttlHours } = req.body;
        await (0, db_1.query)(`UPDATE users 
       SET phone_number = $1, email = $2, full_name = $3, online_balance = $4, is_frozen = $5, active_device_id = $6, ttl_hours = $7
       WHERE user_id = $8`, [phoneNumber, email, fullName, onlineBalance, isFrozen, activeDeviceId || null, ttlHours, id]);
        res.status(200).json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.updateUser = updateUser;
const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        await (0, db_1.query)('DELETE FROM users WHERE user_id = $1', [id]);
        res.status(200).json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.deleteUser = deleteUser;
// Bonds CRUD
const getBonds = async (req, res) => {
    try {
        const result = await (0, db_1.query)(`
      SELECT bond_id, value, owner_id, status, 
             EXTRACT(EPOCH FROM issued_at)::integer as issued_at, 
             EXTRACT(EPOCH FROM expires_at)::integer as expires_at, 
             server_key_version, server_signature 
      FROM issued_bonds 
      ORDER BY issued_at DESC
    `);
        res.status(200).json(result.rows);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getBonds = getBonds;
const createBond = async (req, res) => {
    try {
        const { ownerId, value, ttlDays } = req.body;
        if (!ownerId || !value) {
            res.status(400).json({ error: 'Owner ID and Value are required' });
            return;
        }
        const bondId = `BOND-${(0, uuid_1.v4)()}`;
        const now = Math.floor(Date.now() / 1000);
        const expiresAt = now + ((ttlDays || 30) * 24 * 60 * 60);
        const dataToSign = `${bondId}${value}${ownerId}${now}${expiresAt}${config_1.config.serverKeyVersion}`;
        const serverSignature = await crypto_service_1.CryptoService.signBond(dataToSign);
        await (0, db_1.query)(`INSERT INTO issued_bonds (bond_id, value, owner_id, issued_at, expires_at, server_key_version, server_signature, status)
       VALUES ($1, $2, $3, to_timestamp($4), to_timestamp($5), $6, $7, 'active')`, [bondId, value, ownerId, now, expiresAt, config_1.config.serverKeyVersion, serverSignature]);
        res.status(201).json({ success: true, bondId });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.createBond = createBond;
const updateBond = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, ownerId } = req.body;
        await (0, db_1.query)('UPDATE issued_bonds SET status = $1, owner_id = $2 WHERE bond_id = $3', [status, ownerId, id]);
        res.status(200).json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.updateBond = updateBond;
const deleteBond = async (req, res) => {
    try {
        const { id } = req.params;
        await (0, db_1.query)('DELETE FROM issued_bonds WHERE bond_id = $1', [id]);
        res.status(200).json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.deleteBond = deleteBond;
// Transactions CRUD
const getTransactions = async (req, res) => {
    try {
        const result = await (0, db_1.query)(`
      SELECT tx_id, tx_type, sender_id, receiver_id, total_amount, 
             EXTRACT(EPOCH FROM tx_timestamp)::integer as tx_timestamp, 
             nonce, sender_signature, message, is_offline, status 
      FROM transactions 
      ORDER BY tx_timestamp DESC
    `);
        res.status(200).json(result.rows);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getTransactions = getTransactions;
const createTransaction = async (req, res) => {
    try {
        const { txId, txType, senderId, receiverId, totalAmount, message, isOffline, status } = req.body;
        const finalTxId = txId || 'TX-MANUAL-' + (0, uuid_1.v4)();
        await (0, db_1.query)(`INSERT INTO transactions (tx_id, tx_type, sender_id, receiver_id, total_amount, tx_timestamp, message, is_offline, status)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8)`, [finalTxId, txType || 'P2P_ONLINE', senderId || null, receiverId || null, totalAmount, message || null, isOffline || false, status || 'accepted']);
        res.status(201).json({ success: true, txId: finalTxId });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.createTransaction = createTransaction;
const updateTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        const { txType, senderId, receiverId, totalAmount, message, isOffline, status } = req.body;
        await (0, db_1.query)(`UPDATE transactions 
       SET tx_type = $1, sender_id = $2, receiver_id = $3, total_amount = $4, message = $5, is_offline = $6, status = $7
       WHERE tx_id = $8`, [txType, senderId || null, receiverId || null, totalAmount, message || null, isOffline, status, id]);
        res.status(200).json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.updateTransaction = updateTransaction;
const deleteTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        await (0, db_1.query)('DELETE FROM transactions WHERE tx_id = $1', [id]);
        res.status(200).json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.deleteTransaction = deleteTransaction;
// Configs
const getConfigs = async (req, res) => {
    try {
        const result = await (0, db_1.query)('SELECT config_key, config_value, description, updated_at FROM system_config ORDER BY config_key');
        res.status(200).json(result.rows);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getConfigs = getConfigs;
const updateConfig = async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        await (0, db_1.query)('UPDATE system_config SET config_value = $1, updated_at = NOW() WHERE config_key = $2', [value, key]);
        res.status(200).json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.updateConfig = updateConfig;
//# sourceMappingURL=admin.controller.js.map