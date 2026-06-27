import { v4 as uuidv4 } from 'uuid';
import {
  getPendingTransactions,
  getBondsForTx,
  updateTransactionStatus,
  deleteSpentBondsForTx,
  updateBondsStatusForTx,
} from '../database/db';
import { syncBatch as apiSyncBatch } from './api.service';
import { Transaction, Bond, SyncBatch } from '../types';

let isSyncing = false;

export async function syncWithServer(): Promise<{
  accepted: string[];
  rejected: string[];
  flagged: string[];
} | null> {
  if (isSyncing) {
    return null;
  }

  isSyncing = true;

  try {
    const pendingTx = await getPendingTransactions();

    if (pendingTx.length === 0) {
      return null;
    }

    const batch: SyncBatch = {
      batchId: uuidv4(),
      incoming: [],
      outgoing: [],
    };

    for (const tx of pendingTx) {
      const bonds = await getBondsForTx(tx.txId, tx.role === 'receiver' ? 'incoming' : 'outgoing');

      const txData: Transaction = {
        txId: tx.txId,
        senderId: tx.senderId,
        receiverId: tx.receiverId,
        totalAmount: tx.totalAmount,
        timestamp: tx.timestamp,
        nonce: tx.nonce,
        senderPublicKey: tx.senderPublicKey,
        senderSignature: tx.senderSignature,
        role: tx.role,
        syncStatus: tx.syncStatus,
        message: tx.message,
        createdAt: tx.createdAt,
      };

      if (tx.role === 'receiver') {
        batch.incoming.push({ transaction: txData, bonds });
      } else {
        batch.outgoing.push({ transaction: txData, bonds });
      }
    }

    const response = await apiSyncBatch(batch);

    for (const txId of response.accepted) {
      await updateTransactionStatus(txId, 'synced');
      await deleteSpentBondsForTx(txId);
      await updateBondsStatusForTx(txId, 'available');
    }

    for (const txId of response.rejected) {
      await updateTransactionStatus(txId, 'rejected');
      await updateBondsStatusForTx(txId, 'failed');
    }

    for (const txId of response.flagged) {
      await updateTransactionStatus(txId, 'flagged');
      await updateBondsStatusForTx(txId, 'frozen');
    }

    return {
      accepted: response.accepted,
      rejected: response.rejected,
      flagged: response.flagged,
    };
  } catch (err) {
    console.error('Sync failed:', err);
    return null;
  } finally {
    isSyncing = false;
  }
}

export function isCurrentlySyncing(): boolean {
  return isSyncing;
}
