import { Router } from 'express';
import { 
  adminLogin, getStats, 
  getUsers, createUser, updateUser, deleteUser,
  getBonds, createBond, updateBond, deleteBond,
  getTransactions, createTransaction, updateTransaction, deleteTransaction,
  getConfigs, updateConfig
} from '../controllers/admin.controller';
import { requireAdmin } from '../middleware/admin.middleware';

const router = Router();

// Public login
router.post('/login', adminLogin);

// Protected CRUD & Stats
router.get('/stats', requireAdmin, getStats);

router.get('/users', requireAdmin, getUsers);
router.post('/users', requireAdmin, createUser);
router.put('/users/:id', requireAdmin, updateUser);
router.delete('/users/:id', requireAdmin, deleteUser);

router.get('/bonds', requireAdmin, getBonds);
router.post('/bonds', requireAdmin, createBond);
router.put('/bonds/:id', requireAdmin, updateBond);
router.delete('/bonds/:id', requireAdmin, deleteBond);

router.get('/transactions', requireAdmin, getTransactions);
router.post('/transactions', requireAdmin, createTransaction);
router.put('/transactions/:id', requireAdmin, updateTransaction);
router.delete('/transactions/:id', requireAdmin, deleteTransaction);

router.get('/configs', requireAdmin, getConfigs);
router.put('/configs/:key', requireAdmin, updateConfig);

export default router;
