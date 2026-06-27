"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const admin_controller_1 = require("../controllers/admin.controller");
const admin_middleware_1 = require("../middleware/admin.middleware");
const router = (0, express_1.Router)();
// Public login
router.post('/login', admin_controller_1.adminLogin);
// Protected CRUD & Stats
router.get('/stats', admin_middleware_1.requireAdmin, admin_controller_1.getStats);
router.get('/users', admin_middleware_1.requireAdmin, admin_controller_1.getUsers);
router.post('/users', admin_middleware_1.requireAdmin, admin_controller_1.createUser);
router.put('/users/:id', admin_middleware_1.requireAdmin, admin_controller_1.updateUser);
router.delete('/users/:id', admin_middleware_1.requireAdmin, admin_controller_1.deleteUser);
router.get('/bonds', admin_middleware_1.requireAdmin, admin_controller_1.getBonds);
router.post('/bonds', admin_middleware_1.requireAdmin, admin_controller_1.createBond);
router.put('/bonds/:id', admin_middleware_1.requireAdmin, admin_controller_1.updateBond);
router.delete('/bonds/:id', admin_middleware_1.requireAdmin, admin_controller_1.deleteBond);
router.get('/transactions', admin_middleware_1.requireAdmin, admin_controller_1.getTransactions);
router.post('/transactions', admin_middleware_1.requireAdmin, admin_controller_1.createTransaction);
router.put('/transactions/:id', admin_middleware_1.requireAdmin, admin_controller_1.updateTransaction);
router.delete('/transactions/:id', admin_middleware_1.requireAdmin, admin_controller_1.deleteTransaction);
router.get('/configs', admin_middleware_1.requireAdmin, admin_controller_1.getConfigs);
router.put('/configs/:key', admin_middleware_1.requireAdmin, admin_controller_1.updateConfig);
exports.default = router;
//# sourceMappingURL=admin.routes.js.map