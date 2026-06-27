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
exports.CryptoService = void 0;
const crypto = __importStar(require("crypto"));
const config_1 = require("../config");
const ED25519_PRIVATE_DER_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const ED25519_PUBLIC_DER_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
class CryptoService {
    static privateKey;
    static publicKey;
    static publicKeyBase64;
    static async init() {
        if (!config_1.config.serverPrivateKeyBase64) {
            throw new Error('SERVER_ED25519_PRIVATE_KEY is not configured');
        }
        const privBytes = Buffer.from(config_1.config.serverPrivateKeyBase64, 'base64');
        this.privateKey = crypto.createPrivateKey({
            key: Buffer.concat([ED25519_PRIVATE_DER_PREFIX, privBytes]),
            format: 'der',
            type: 'pkcs8'
        });
        this.publicKey = crypto.createPublicKey(this.privateKey);
        const spkiDer = this.publicKey.export({ format: 'der', type: 'spki' });
        this.publicKeyBase64 = spkiDer.slice(-32).toString('base64');
    }
    static getPublicKeyBase64() {
        return this.publicKeyBase64;
    }
    static async signBond(dataString) {
        const dataHash = crypto.createHash('sha256').update(dataString, 'utf8').digest();
        const signature = crypto.sign(null, dataHash, this.privateKey);
        return signature.toString('base64');
    }
    static async verifySignature(dataString, signatureBase64, publicKeyBase64) {
        try {
            const dataHash = crypto.createHash('sha256').update(dataString, 'utf8').digest();
            const signatureBytes = Buffer.from(signatureBase64, 'base64');
            const rawPubKey = Buffer.from(publicKeyBase64, 'base64');
            const pubKeyObj = crypto.createPublicKey({
                key: Buffer.concat([ED25519_PUBLIC_DER_PREFIX, rawPubKey]),
                format: 'der',
                type: 'spki'
            });
            return crypto.verify(null, dataHash, pubKeyObj, signatureBytes);
        }
        catch (e) {
            return false;
        }
    }
}
exports.CryptoService = CryptoService;
//# sourceMappingURL=crypto.service.js.map