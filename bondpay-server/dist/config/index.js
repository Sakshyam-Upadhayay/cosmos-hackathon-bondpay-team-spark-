"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.limits = exports.config = void 0;
const dotenv = __importStar(require("dotenv"));
dotenv.config();
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
    console.error('WARNING: JWT_SECRET is not set in production. Using insecure default.');
}
exports.config = {
    jwtSecret: process.env.JWT_SECRET || 'super_secret',
    serverPrivateKeyBase64: process.env.SERVER_ED25519_PRIVATE_KEY || '',
    serverKeyVersion: process.env.SERVER_KEY_VERSION || 'v1.0',
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',
    port: process.env.PORT || 3000,
};
exports.limits = {
    MAX_OFFLINE_BOND_PAISA: parseInt(process.env.MAX_OFFLINE_BOND_PAISA || '500000', 10),
    BOND_TTL_DAYS: parseInt(process.env.BOND_TTL_DAYS || '30', 10),
    MAX_BONDS_PER_REQUEST: parseInt(process.env.MAX_BONDS_PER_REQUEST || '50', 10)
};
//# sourceMappingURL=index.js.map