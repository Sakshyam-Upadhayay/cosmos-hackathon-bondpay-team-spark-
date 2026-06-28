import { Buffer } from 'buffer';
import * as SecureStore from 'expo-secure-store';
import { hashes, getPublicKeyAsync, signAsync, verifyAsync } from '@noble/ed25519';
import * as Crypto from 'expo-crypto';
import { sha512, sha256 } from '@noble/hashes/sha2.js';
import { useLogStore } from '../store/useLogStore';

hashes.sha512 = sha512;
hashes.sha512Async = async (message) => sha512(message);

const PRIVATE_KEY_ALIAS = 'bondpay_user_private_key';

export class CryptoService {
  static async generateTempKeys(): Promise<string> {
    const tempKey = await Crypto.getRandomBytesAsync(32);
    const hex = Buffer.from(tempKey).toString('hex');
    await SecureStore.setItemAsync('bondpay_temp_private_key', hex);
    const pubKey = await getPublicKeyAsync(tempKey);
    return Buffer.from(pubKey).toString('base64');
  }

  static async initializeUserKeys(userId: string): Promise<string> {
    const alias = `bondpay_user_private_key_${userId}`;
    let privKeyStr = await SecureStore.getItemAsync(alias);
    let privKey: Uint8Array;

    if (!privKeyStr) {
      // Check if there is a temp private key first (from registration)
      const tempKey = await SecureStore.getItemAsync('bondpay_temp_private_key');
      if (tempKey) {
        privKeyStr = tempKey;
        await SecureStore.setItemAsync(alias, tempKey);
        await SecureStore.deleteItemAsync('bondpay_temp_private_key');
      } else {
        privKey = await Crypto.getRandomBytesAsync(32);
        const hex = Buffer.from(privKey).toString('hex');
        await SecureStore.setItemAsync(alias, hex);
        privKeyStr = hex;
      }
    }

    privKey = new Uint8Array(Buffer.from(privKeyStr, 'hex'));
    const pubKey = await getPublicKeyAsync(privKey);
    return Buffer.from(pubKey).toString('base64');
  }

  static async signTransaction(dataString: string, userId: string): Promise<string> {
    const { addLog } = useLogStore.getState();
    addLog('INFO', 'CryptoService.signTransaction', 'Starting transaction signing', { dataString, userId });

    try {
      const alias = `bondpay_user_private_key_${userId}`;
      const privKeyStr = await SecureStore.getItemAsync(alias);
      if (!privKeyStr) throw new Error('Private key not found');
      const privKey = new Uint8Array(Buffer.from(privKeyStr, 'hex'));
      
      const dataHash = sha256(new TextEncoder().encode(dataString));
      addLog('INFO', 'CryptoService.signTransaction', 'Data hashed', { hashHex: Buffer.from(dataHash).toString('hex') });

      const signature = await signAsync(dataHash, privKey);
      const signatureBase64 = Buffer.from(signature).toString('base64');
      addLog('INFO', 'CryptoService.signTransaction', 'Signature generated', { signatureBase64 });
      
      return signatureBase64;
    } catch (e: any) {
      addLog('ERROR', 'CryptoService.signTransaction', 'Signing failed', { error: e.message });
      throw e;
    }
  }

  static async verifyServerBondSignature(dataString: string, signatureBase64: string, serverPublicKeyBase64: string): Promise<boolean> {
    try {
      const dataHash = sha256(new TextEncoder().encode(dataString));
      const sigBytes = new Uint8Array(Buffer.from(signatureBase64, 'base64'));
      const pubKeyBytes = new Uint8Array(Buffer.from(serverPublicKeyBase64, 'base64'));
      
      return await verifyAsync(sigBytes, dataHash, pubKeyBytes);
    } catch (e) {
      return false;
    }
  }

  static async verifySenderSignature(dataString: string, signatureBase64: string, senderPublicKeyBase64: string): Promise<boolean> {
    const { addLog } = useLogStore.getState();
    addLog('INFO', 'CryptoService.verifySenderSignature', 'Starting signature verification', { 
      dataString, 
      signatureBase64, 
      senderPublicKeyBase64 
    });

    try {
      const dataHash = sha256(new TextEncoder().encode(dataString));
      addLog('INFO', 'CryptoService.verifySenderSignature', 'Data hashed for verification', { hashHex: Buffer.from(dataHash).toString('hex') });

      const sigBytes = new Uint8Array(Buffer.from(signatureBase64, 'base64'));
      const pubKeyBytes = new Uint8Array(Buffer.from(senderPublicKeyBase64, 'base64'));
      
      const isValid = await verifyAsync(sigBytes, dataHash, pubKeyBytes);
      
      if (isValid) {
        addLog('INFO', 'CryptoService.verifySenderSignature', 'Signature IS VALID');
      } else {
        addLog('WARN', 'CryptoService.verifySenderSignature', 'Signature IS INVALID');
      }

      return isValid;
    } catch (e: any) {
      addLog('ERROR', 'CryptoService.verifySenderSignature', 'Verification threw an error', { error: e.message || e });
      return false;
    }
  }

  static generateNonce(): string {
    const bytes = Crypto.getRandomBytes(16);
    return Buffer.from(bytes).toString('hex');
  }
}
