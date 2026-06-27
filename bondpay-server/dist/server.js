"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dns_1 = __importDefault(require("dns"));
dns_1.default.setDefaultResultOrder('ipv4first');
const config_1 = require("./config");
const crypto_service_1 = require("./services/crypto.service");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const bonds_routes_1 = __importDefault(require("./routes/bonds.routes"));
const transactions_routes_1 = __importDefault(require("./routes/transactions.routes"));
const wallet_routes_1 = __importDefault(require("./routes/wallet.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Support cPanel subdirectory routing (strips /bondpay prefix if present)
app.use((req, res, next) => {
    if (req.url.startsWith('/bondpay')) {
        req.url = req.url.substring(8);
        if (req.url === '')
            req.url = '/';
    }
    next();
});
// Routes
app.use('/auth', auth_routes_1.default);
app.use('/bonds', bonds_routes_1.default);
app.use('/transactions', transactions_routes_1.default);
app.use('/wallet', wallet_routes_1.default);
app.use('/admin/api', admin_routes_1.default);
app.get('/admin', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, 'admin/index.html'));
});
const config_service_1 = require("./services/config.service");
app.get('/server/public-key', (req, res) => {
    res.status(200).json({
        publicKey: crypto_service_1.CryptoService.getPublicKeyBase64(),
        keyVersion: config_1.config.serverKeyVersion
    });
});
app.get('/server/config', async (req, res) => {
    try {
        const configs = await config_service_1.ConfigService.getConfigs();
        res.status(200).json({
            min_denomination: parseInt(configs.min_denomination || '5', 10),
            max_offline_capacity: parseInt(configs.max_offline_capacity || '10000', 10),
            qr_switching_delay: parseInt(configs.qr_switching_delay || '333', 10),
            max_bonds_per_request: parseInt(configs.max_bonds_per_request || '50', 10),
            bond_ttl_days: parseInt(configs.bond_ttl_days || '30', 10)
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
const db_1 = require("./database/db");
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});
app.get('/db-test', async (req, res) => {
    try {
        const dbRes = await (0, db_1.query)('SELECT 1 + 1 AS result');
        res.status(200).json({ success: true, result: dbRes.rows[0].result, message: 'Database connection successful!' });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message || err, message: 'Failed to connect to database. Check your DATABASE_URL environment variable!' });
    }
});
const startServer = async () => {
    try {
        await crypto_service_1.CryptoService.init();
        console.log('CryptoService initialized. Server Public Key:', crypto_service_1.CryptoService.getPublicKeyBase64());
        app.listen(config_1.config.port, () => {
            console.log(`BondPay Server listening on port ${config_1.config.port}`);
        });
    }
    catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};
startServer();
//# sourceMappingURL=server.js.map