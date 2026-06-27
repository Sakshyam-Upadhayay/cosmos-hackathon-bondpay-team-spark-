const express = require('express');
const router = express.Router();
const { syncBatch } = require('../controllers/syncController');
const { authenticateToken } = require('../middleware/auth');

router.post('/', authenticateToken, syncBatch);

module.exports = router;
