import * as ed from '@noble/ed25519';
import * as SecureStore from 'expo-secure-store';
import QuickCrypto from 'react-native-quick-crypto';
import { UserKeys } from '../types';
import { SERVER_PUBLIC_KEY_HEX } from '../constants';

export async function generateUserKeyPair(userId: string): Promise<string> {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);

  const privateKeyHex = Buffer.from(privateKey).toString('hex');
  const publicKeyHex = Buffer.from(publicKey).toString('hex');

  await SecureStore.setItemAsync(`bondpay_private_key_${userId}`, privateKeyHex, {
    keychainService: 'bondpay_secure_keychain',
    requireAuthentication: true,
  });

  return publicKeyHex;
}

export async function getPrivateKey(userId: string): Promise<Uint8Array | null> {
  const keyHex = await SecureStore.getItemAsync(`bondpay_private_key_${userId}`, {
    keychainService: 'bondpay_secure_keychain',
    requireAuthentication: true,
  });

  if (!keyHex) return null;

  return Buffer.from(keyHex, 'hex');
}

export async function signTransaction(data: string, userId: string): Promise<string | null> {
  const privateKey = await getPrivateKey(userId);
  if (!privateKey) return null;

  const payloadBytes = new TextEncoder().encode(data);
  const hash = await ed.esh256(payloadBytes);
  const signature = await ed.signAsync(hash, privateKey);

  return Buffer.from(signature).toString('base64');
}

export async function verifyServerBondSignature(
  bondId: string,
  value: number,
  ownerId: string,
  issuedAt: number,
  expiresAt: number,
  serverSignature: string
): Promise<boolean> {
  if (!SERVER_PUBLIC_KEY_HEX) {
    console.warn('Server public key not configured');
    return false;
  }

  const issuedAtISO = new Date(issuedAt * 1000).toISOString();
  const expiresAtISO = new Date(expiresAt * 1000).toISOString();
  const bondPayload = `${bondId}:${value}:${ownerId}:${issuedAtISO}:${expiresAtISO}:v1`;
  const payloadBytes = new TextEncoder().encode(bondPayload);
  const hash = await ed.esh256(payloadBytes);
  const signature = Buffer.from(serverSignature, 'base64');
  const publicKey = Buffer.from(SERVER_PUBLIC_KEY_HEX, 'hex');

  return ed.verifyAsync(signature, hash, publicKey);
}

export async function verifySenderSignature(
  txPayload: string,
  senderSignature: string,
  senderPublicKeyHex: string
): Promise<boolean> {
  const payloadBytes = new TextEncoder().encode(txPayload);
  const hash = await ed.esh256(payloadBytes);
  const signature = Buffer.from(senderSignature, 'base64');
  const publicKey = Buffer.from(senderPublicKeyHex, 'hex');

  return ed.verifyAsync(signature, hash, publicKey);
}

export async function encryptAndBackupKey(password: string, privateKeyHex: string) {
  const salt = QuickCrypto.randomBytes(16).toString('hex');

  const derivedKey = QuickCrypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

  const iv = QuickCrypto.randomBytes(12);
  const cipher = QuickCrypto.createCipheriv('aes-256-gcm', derivedKey, iv);

  let encrypted = cipher.update(privateKeyHex, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  const payload = JSON.stringify({
    iv: iv.toString('hex'),
    authTag: authTag,
    ciphertext: encrypted,
  });

  return {
    encryptedKeyBackup: payload,
    keyBackupSalt: salt,
  };
}

export async function decryptAndRecoverKey(
  password: string,
  encryptedKeyBackup: string,
  keyBackupSalt: string
): Promise<string | null> {
  try {
    const { iv, authTag, ciphertext } = JSON.parse(encryptedKeyBackup);

    const derivedKey = QuickCrypto.pbkdf2Sync(password, keyBackupSalt, 100000, 32, 'sha256');

    const decipher = QuickCrypto.createDecipheriv(
      'aes-256-gcm',
      derivedKey,
      Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    console.error('Key recovery failed:', err);
    return null;
  }
}

export async function signBondWithServerKey(
  bondId: string,
  value: number,
  ownerId: string,
  issuedAt: number,
  expiresAt: number
): Promise<string> {
  const SERVER_PRIVATE_KEY_HEX = '12d6510c36a8fd26dd0050d75b5256560c1742092f4795d597968499f9fbdc1e';
  const issuedAtISO = new Date(issuedAt * 1000).toISOString();
  const expiresAtISO = new Date(expiresAt * 1000).toISOString();
  const bondPayload = `${bondId}:${value}:${ownerId}:${issuedAtISO}:${expiresAtISO}:v1`;
  const payloadBytes = new TextEncoder().encode(bondPayload);
  const hash = await ed.esh256(payloadBytes);
  const signature = await ed.signAsync(hash, Buffer.from(SERVER_PRIVATE_KEY_HEX, 'hex'));
  return Buffer.from(signature).toString('base64');
}
