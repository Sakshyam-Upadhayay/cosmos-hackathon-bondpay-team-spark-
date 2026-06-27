import express from 'express';
import cors from 'cors';
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');
import { config } from './config';
import { CryptoService } from './services/crypto.service';
import authRoutes from './routes/auth.routes';
import bondsRoutes from './routes/bonds.routes';
import transactionsRoutes from './routes/transactions.routes';
import walletRoutes from './routes/wallet.routes';
import adminRoutes from './routes/admin.routes';
import path from 'path';

const app = express();

app.use(cors());
app.use(express.json());

// Support cPanel subdirectory routing (strips /bondpay prefix if present)
app.use((req, res, next) => {
  if (req.url.startsWith('/bondpay')) {
    req.url = req.url.substring(8);
    if (req.url === '') req.url = '/';
  }
  next();
});

// Routes
app.use('/auth', authRoutes);
app.use('/bonds', bondsRoutes);
app.use('/transactions', transactionsRoutes);
app.use('/wallet', walletRoutes);
app.use('/admin/api', adminRoutes);

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin/index.html'));
});

import { ConfigService } from './services/config.service';

app.get('/server/public-key', (req, res) => {
  res.status(200).json({
    publicKey: CryptoService.getPublicKeyBase64(),
    keyVersion: config.serverKeyVersion
  });
});

app.get('/server/config', async (req, res) => {
  try {
    const configs = await ConfigService.getConfigs();
    res.status(200).json({
      min_denomination: parseInt(configs.min_denomination || '5', 10),
      max_offline_capacity: parseInt(configs.max_offline_capacity || '10000', 10),
      qr_switching_delay: parseInt(configs.qr_switching_delay || '333', 10),
      max_bonds_per_request: parseInt(configs.max_bonds_per_request || '50', 10),
      bond_ttl_days: parseInt(configs.bond_ttl_days || '30', 10)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

import { query } from './database/db';

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/db-test', async (req, res) => {
  try {
    const dbRes = await query('SELECT 1 + 1 AS result');
    res.status(200).json({ success: true, result: dbRes.rows[0].result, message: 'Database connection successful!' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || err, message: 'Failed to connect to database. Check your DATABASE_URL environment variable!' });
  }
});

const startServer = async () => {
  try {
    await CryptoService.init();
    console.log('CryptoService initialized. Server Public Key:', CryptoService.getPublicKeyBase64());

    app.listen(config.port, () => {
      console.log(`BondPay Server listening on port ${config.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
