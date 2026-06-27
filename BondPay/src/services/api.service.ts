import { API_BASE_URL } from '../constants';
import { SyncBatch, SyncResponse } from '../types';

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

async function apiRequest<T>(
  endpoint: string,
  method: string = 'GET',
  body?: any
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();

  if (!response.ok) {
    throw { status: response.status, ...data };
  }

  return data as T;
}

export async function register(
  phoneNumber: string,
  email: string,
  fullName: string,
  password: string,
  publicKey: string,
  deviceId: string
) {
  return apiRequest<{ userId: string; jwt: string; expiresAt: string }>(
    '/auth/register',
    'POST',
    { phoneNumber, email, fullName, password, publicKey, deviceId }
  );
}

export async function login(
  loginId: string,
  password: string,
  deviceId: string,
  forceLogin: boolean = false
) {
  return apiRequest<{
    userId: string;
    fullName: string;
    publicKey: string;
    jwt: string;
    onlineBalance: number;
    encryptedKeyBackup?: string;
    keyBackupSalt?: string;
    expiresAt: string;
  }>('/auth/login', 'POST', { loginId, password, deviceId, forceLogin });
}

export async function updateKeyBackup(encryptedKeyBackup: string, keyBackupSalt: string) {
  return apiRequest<{ success: boolean }>('/auth/key-backup', 'POST', {
    encryptedKeyBackup,
    keyBackupSalt,
  });
}

export async function issueBonds(totalAmount: number) {
  return apiRequest<{
    bonds: Array<{
      bondId: string;
      value: number;
      ownerId: string;
      issuedAt: number;
      expiresAt: number;
      issuedByServer: string;
      serverSignature: string;
    }>;
    newOnlineBalance: number;
  }>('/bonds/issue', 'POST', { totalAmount });
}

export async function getUserBonds() {
  return apiRequest<{
    bonds: Array<{
      bondId: string;
      value: number;
      ownerId: string;
      issuedAt: number;
      expiresAt: number;
      issuedByServer: string;
      serverSignature: string;
    }>;
  }>('/bonds');
}

export async function getBalance() {
  return apiRequest<{ onlineBalance: number }>('/wallet/balance');
}

export async function transferOnline(receiverId: string, amount: number) {
  return apiRequest<{
    txId: string;
    newOnlineBalance: number;
    status: string;
  }>('/wallet/transfer-online', 'POST', { receiverId, amount });
}

export async function topUp(amount: number) {
  return apiRequest<{
    txId: string;
    newOnlineBalance: number;
  }>('/wallet/topup', 'POST', { amount });
}

export async function syncBatch(batch: SyncBatch): Promise<SyncResponse> {
  return apiRequest<SyncResponse>('/transactions/sync', 'POST', batch);
}
