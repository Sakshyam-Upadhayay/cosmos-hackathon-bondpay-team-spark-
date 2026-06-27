import { Router } from 'express';
import { syncTransactions } from '../controllers/transactions.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.post('/sync', requireAuth, syncTransactions);

export default router;
