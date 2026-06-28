import { Router } from 'express';
import { register, login, logout, me, updateProfile, changePassword, registerPublicKey, lookupUserByPhone } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, me);
router.get('/lookup', requireAuth, lookupUserByPhone);
router.post('/profile', requireAuth, updateProfile);
router.post('/change-password', requireAuth, changePassword);
router.post('/public-key', requireAuth, registerPublicKey);

export default router;
