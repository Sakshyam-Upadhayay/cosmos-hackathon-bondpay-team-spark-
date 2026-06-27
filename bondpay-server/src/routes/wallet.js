const express = require('express');
const router = express.Router();
const { getBalance, transferOnline, topUp } = require('../controllers/walletController');
const { authenticateToken } = require('../middleware/auth');

router.get('/balance', authenticateToken, getBalance);
router.post('/transfer-online', authenticateToken, transferOnline);
router.post('/topup', authenticateToken, topUp);

module.exports = router;
