const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config/env');

const authRoutes = require('./routes/auth');
const bondsRoutes = require('./routes/bonds');
const walletRoutes = require('./routes/wallet');
const syncRoutes = require('./routes/sync');

const app = express();

app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN }));
app.use(express.json({ limit: '10mb' }));

app.use('/auth', authRoutes);
app.use('/bonds', bondsRoutes);
app.use('/wallet', walletRoutes);
app.use('/transactions/sync', syncRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = config.PORT;
app.listen(PORT, () => {
  console.log(`BondPay server running on port ${PORT}`);
});

module.exports = app;
