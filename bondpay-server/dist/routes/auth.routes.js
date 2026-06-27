"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.post('/register', auth_controller_1.register);
router.post('/login', auth_controller_1.login);
router.post('/logout', auth_middleware_1.requireAuth, auth_controller_1.logout);
router.get('/me', auth_middleware_1.requireAuth, auth_controller_1.me);
router.get('/lookup', auth_middleware_1.requireAuth, auth_controller_1.lookupUserByPhone);
router.post('/profile', auth_middleware_1.requireAuth, auth_controller_1.updateProfile);
router.post('/change-password', auth_middleware_1.requireAuth, auth_controller_1.changePassword);
router.post('/public-key', auth_middleware_1.requireAuth, auth_controller_1.registerPublicKey);
exports.default = router;
//# sourceMappingURL=auth.routes.js.map