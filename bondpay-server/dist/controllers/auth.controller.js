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
exports.lookupUserByPhone = exports.changePassword = exports.updateProfile = exports.me = exports.registerPublicKey = exports.logout = exports.login = exports.register = void 0;
const db_1 = require("../database/db");
const jwt = __importStar(require("jsonwebtoken"));
const config_1 = require("../config");
const bcrypt_1 = __importDefault(require("bcrypt"));
const bonds_controller_1 = require("./bonds.controller");
const register = async (req, res) => {
    try {
        const { phoneNumber, email, fullName, password, publicKey, deviceId } = req.body;
        if (!phoneNumber || !email || !fullName || !password) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }
        const passwordHash = await bcrypt_1.default.hash(password, 10);
        // Insert user
        const result = await (0, db_1.query)(`INSERT INTO users (phone_number, email, full_name, password_hash, public_key, online_balance, active_device_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING user_id, full_name, email, phone_number, public_key`, [phoneNumber, email, fullName, passwordHash, publicKey || null, 0, deviceId || null]);
        const user = result.rows[0];
        // Generate JWT
        const token = jwt.sign({ userId: user.user_id }, config_1.config.jwtSecret, { expiresIn: '30d' });
        res.status(201).json({
            userId: user.user_id,
            fullName: user.full_name,
            email: user.email,
            phoneNumber: user.phone_number,
            publicKey: user.public_key,
            jwt: token,
            expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        });
    }
    catch (error) {
        if (error.code === '23505') { // unique_violation
            if (error.constraint === 'users_phone_number_key') {
                res.status(409).json({ error: 'Phone number already registered' });
            }
            else if (error.constraint === 'users_email_key') {
                res.status(409).json({ error: 'Email already registered' });
            }
            else {
                res.status(409).json({ error: 'User already exists' });
            }
            return;
        }
        console.error('Register error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.register = register;
const login = async (req, res) => {
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
            result = await (0, db_1.query)('SELECT user_id, full_name, email, phone_number, public_key, password_hash, active_device_id, online_balance FROM users WHERE email = $1', [loginId]);
        }
        else {
            result = await (0, db_1.query)('SELECT user_id, full_name, email, phone_number, public_key, password_hash, active_device_id, online_balance FROM users WHERE phone_number = $1', [loginId]);
        }
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const user = result.rows[0];
        const match = await bcrypt_1.default.compare(password, user.password_hash);
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
            }
            else {
                // Force Login - Revoke all active bonds on server, credit to online balance
                const activeBondsRes = await (0, db_1.query)("SELECT COALESCE(SUM(value), 0) AS total_value FROM issued_bonds WHERE owner_id = $1 AND status = 'active'", [user.user_id]);
                const refundAmount = parseInt(activeBondsRes.rows[0].total_value, 10);
                // Mark bonds as revoked
                await (0, db_1.query)("UPDATE issued_bonds SET status = 'revoked' WHERE owner_id = $1 AND status = 'active'", [user.user_id]);
                // Credit to balance & update active_device_id
                await (0, db_1.query)("UPDATE users SET online_balance = online_balance + $1, active_device_id = $2 WHERE user_id = $3", [refundAmount, deviceId, user.user_id]);
                finalOnlineBalance += refundAmount;
            }
        }
        else if (deviceId) {
            // Just update deviceId
            await (0, db_1.query)('UPDATE users SET active_device_id = $1 WHERE user_id = $2', [deviceId, user.user_id]);
        }
        const token = jwt.sign({ userId: user.user_id }, config_1.config.jwtSecret, { expiresIn: '30d' });
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
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.login = login;
const logout = async (req, res) => {
    try {
        const userId = req.user.userId;
        await (0, db_1.query)('UPDATE users SET active_device_id = NULL WHERE user_id = $1', [userId]);
        res.status(200).json({ success: true, message: 'Logged out successfully' });
    }
    catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.logout = logout;
const registerPublicKey = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { publicKey } = req.body;
        if (!publicKey) {
            res.status(400).json({ error: 'Public key is required' });
            return;
        }
        await (0, db_1.query)('UPDATE users SET public_key = $1 WHERE user_id = $2', [publicKey, userId]);
        res.status(200).json({ success: true });
    }
    catch (error) {
        console.error('Register public key error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.registerPublicKey = registerPublicKey;
const me = async (req, res) => {
    try {
        const userId = req.user.userId;
        // Auto-refund any expired offline bonds before fetching info/balance
        await (0, bonds_controller_1.refundExpiredBondsForUser)(userId);
        const result = await (0, db_1.query)('SELECT user_id, full_name, email, phone_number, online_balance, public_key FROM users WHERE user_id = $1', [userId]);
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
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.me = me;
const updateProfile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { fullName, phoneNumber, email } = req.body;
        if (!fullName || !phoneNumber || !email) {
            res.status(400).json({ error: 'Full name, phone number, and email are required' });
            return;
        }
        const result = await (0, db_1.query)('UPDATE users SET full_name = $1, phone_number = $2, email = $3 WHERE user_id = $4 RETURNING full_name, phone_number, email', [fullName, phoneNumber, email, userId]);
        res.status(200).json({
            fullName: result.rows[0].full_name,
            phoneNumber: result.rows[0].phone_number,
            email: result.rows[0].email
        });
    }
    catch (error) {
        if (error.code === '23505') {
            res.status(409).json({ error: 'Phone number or email already in use' });
            return;
        }
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.updateProfile = updateProfile;
const changePassword = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            res.status(400).json({ error: 'Current and new password are required' });
            return;
        }
        const result = await (0, db_1.query)('SELECT password_hash FROM users WHERE user_id = $1', [userId]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const user = result.rows[0];
        const isMatch = await bcrypt_1.default.compare(currentPassword, user.password_hash);
        if (!isMatch) {
            res.status(401).json({ error: 'Incorrect current password' });
            return;
        }
        const salt = await bcrypt_1.default.genSalt(10);
        const newPasswordHash = await bcrypt_1.default.hash(newPassword, salt);
        await (0, db_1.query)('UPDATE users SET password_hash = $1 WHERE user_id = $2', [newPasswordHash, userId]);
        res.status(200).json({ success: true, message: 'Password updated successfully' });
    }
    catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.changePassword = changePassword;
const lookupUserByPhone = async (req, res) => {
    try {
        const { phoneNumber } = req.query;
        if (!phoneNumber) {
            res.status(400).json({ error: 'Phone number is required' });
            return;
        }
        const result = await (0, db_1.query)('SELECT user_id, full_name, public_key FROM users WHERE phone_number = $1', [phoneNumber]);
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
    }
    catch (error) {
        console.error('Lookup user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.lookupUserByPhone = lookupUserByPhone;
//# sourceMappingURL=auth.controller.js.map