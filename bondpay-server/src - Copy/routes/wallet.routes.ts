import { Router } from 'express';
import { topup, transferOnline, reverseBonds, getHistory, transferPending, claimPending } from '../controllers/wallet.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.post('/topup', requireAuth, topup);
router.post('/transfer-online', requireAuth, transferOnline);
router.post('/reverse-bond', requireAuth, reverseBonds);
router.post('/transfer-pending', requireAuth, transferPending);
router.post('/claim-pending', requireAuth, claimPending);
router.get('/history', requireAuth, getHistory);

export default router;
