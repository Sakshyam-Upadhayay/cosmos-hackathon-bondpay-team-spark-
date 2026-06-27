"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bonds_controller_1 = require("../controllers/bonds.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.post('/issue', auth_middleware_1.requireAuth, bonds_controller_1.issueBonds);
router.get('/active', auth_middleware_1.requireAuth, bonds_controller_1.getActiveBonds);
exports.default = router;
//# sourceMappingURL=bonds.routes.js.map