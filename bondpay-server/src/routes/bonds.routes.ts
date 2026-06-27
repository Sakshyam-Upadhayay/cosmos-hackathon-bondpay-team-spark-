import { Router } from 'express';
import { issueBonds, getActiveBonds } from '../controllers/bonds.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.post('/issue', requireAuth, issueBonds);
router.get('/active', requireAuth, getActiveBonds);

export default router;
