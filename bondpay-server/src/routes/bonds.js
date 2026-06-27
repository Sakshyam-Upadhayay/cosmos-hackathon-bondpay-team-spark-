const express = require('express');
const router = express.Router();
const { issueBonds, getUserBonds } = require('../controllers/bondsController');
const { authenticateToken } = require('../middleware/auth');

router.post('/issue', authenticateToken, issueBonds);
router.get('/', authenticateToken, getUserBonds);

module.exports = router;
