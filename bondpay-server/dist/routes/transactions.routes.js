"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const transactions_controller_1 = require("../controllers/transactions.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.post('/sync', auth_middleware_1.requireAuth, transactions_controller_1.syncTransactions);
exports.default = router;
//# sourceMappingURL=transactions.routes.js.map