"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const wallet_controller_1 = require("../controllers/wallet.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.post('/topup', auth_middleware_1.requireAuth, wallet_controller_1.topup);
router.post('/transfer-online', auth_middleware_1.requireAuth, wallet_controller_1.transferOnline);
router.post('/reverse-bond', auth_middleware_1.requireAuth, wallet_controller_1.reverseBonds);
router.post('/transfer-pending', auth_middleware_1.requireAuth, wallet_controller_1.transferPending);
router.post('/claim-pending', auth_middleware_1.requireAuth, wallet_controller_1.claimPending);
router.get('/history', auth_middleware_1.requireAuth, wallet_controller_1.getHistory);
exports.default = router;
//# sourceMappingURL=wallet.routes.js.map