export interface Bond {
  bondId: string;
  value: number;
  ownerId: string;
  currentOwnerId: string;
  issuedAt: number;
  expiresAt: number;
  issuedByServer: string;
  serverSignature: string;
  status: 'available' | 'spent' | 'received_pending_sync' | 'failed' | 'frozen';
  localTxId?: string;
  receivedAt?: number;
}

export interface Transaction {
  txId: string;
  senderId: string;
  receiverId: string;
  totalAmount: number;
  timestamp: number;
  nonce: string;
  senderPublicKey: string;
  senderSignature: string;
  role: 'sender' | 'receiver';
  syncStatus: 'pending' | 'synced' | 'rejected' | 'flagged';
  message?: string;
  createdAt: number;
}

export interface TransactionBond {
  txId: string;
  bondId: string;
  direction: 'outgoing' | 'incoming';
}

export interface SessionMetadata {
  receiverId: string;
  sessionId: string;
  serviceUUID: string;
  nonce: string;
  timestamp: number;
  protocolVersion: number;
  requestedAmount: number;
}

export interface PaymentPayload {
  transaction: Transaction;
  bonds: Bond[];
}

export interface SyncBatch {
  batchId: string;
  incoming: Array<{
    transaction: Transaction;
    bonds: Bond[];
  }>;
  outgoing: Array<{
    transaction: Transaction;
    bonds: Bond[];
  }>;
}

export interface SyncResponse {
  accepted: string[];
  rejected: string[];
  flagged: string[];
  updatedOnlineBalance: number;
}

export interface UserKeys {
  privateKeyHex: string;
  publicKeyHex: string;
}

export interface BLEPacketHeader {
  sequenceNo: number;
  dataLength: number;
}

export interface BLETransferMetadata {
  totalChunks: number;
  checksum: number;
  sessionId: string;
}
