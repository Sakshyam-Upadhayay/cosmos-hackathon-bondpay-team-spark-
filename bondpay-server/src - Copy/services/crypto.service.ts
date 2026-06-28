import * as crypto from 'crypto';
import { config } from '../config';

const ED25519_PRIVATE_DER_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const ED25519_PUBLIC_DER_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export class CryptoService {
  private static privateKey: crypto.KeyObject;
  private static publicKey: crypto.KeyObject;
  private static publicKeyBase64: string;

  static async init() {
    if (!config.serverPrivateKeyBase64) {
      throw new Error('SERVER_ED25519_PRIVATE_KEY is not configured');
    }
    const privBytes = Buffer.from(config.serverPrivateKeyBase64, 'base64');
    
    this.privateKey = crypto.createPrivateKey({
      key: Buffer.concat([ED25519_PRIVATE_DER_PREFIX, privBytes]),
      format: 'der',
      type: 'pkcs8'
    });
    
    this.publicKey = crypto.createPublicKey(this.privateKey);
    const spkiDer = this.publicKey.export({ format: 'der', type: 'spki' });
    this.publicKeyBase64 = spkiDer.slice(-32).toString('base64');
  }

  static getPublicKeyBase64(): string {
    return this.publicKeyBase64;
  }

  static async signBond(dataString: string): Promise<string> {
    const dataHash = crypto.createHash('sha256').update(dataString, 'utf8').digest();
    const signature = crypto.sign(null, dataHash, this.privateKey);
    return signature.toString('base64');
  }

  static async verifySignature(dataString: string, signatureBase64: string, publicKeyBase64: string): Promise<boolean> {
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
    } catch (e) {
      return false;
    }
  }
}
