import axios from 'axios';
import { getDB } from '../database/db';
import { useAppStore } from '../store/useAppStore';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config.service';

let isSyncing = false;

export class SyncService {
  static async sync() {
    if (isSyncing) return;
    isSyncing = true;
    try {
      const db = await getDB();
      const jwt = useAppStore.getState().user.jwt;
      
      if (!jwt) {
        throw new Error('Not authenticated');
      }

      // Fetch pending transactions and pickup claims
      const pendingTxs = await db.getAllAsync(`
        SELECT * FROM transactions WHERE sync_status IN ('pending', 'pending_pickup')
      `);

      // Process Mode 2 pickup claims individually first
      const claimsToSync = (pendingTxs as any[]).filter(tx => tx.sync_status === 'pending_pickup');
      for (const claim of claimsToSync) {
        try {
          await axios.post(
            `${API_URL}/wallet/claim-pending`, 
            { pickupId: claim.tx_id },
            { headers: { Authorization: `Bearer ${jwt}` } }
          );
          // Mark as synced locally
          await db.runAsync(`UPDATE transactions SET sync_status = 'synced', synced_at = ? WHERE tx_id = ?`, [Math.floor(Date.now() / 1000), claim.tx_id]);
        } catch (e: any) {
          console.warn(`Failed to sync pickup claim ${claim.tx_id}:`, e.message);
        }
      }

      // Filter standard P2P pending offline transactions
      const standardPending = (pendingTxs as any[]).filter(tx => tx.sync_status === 'pending');

      if (standardPending.length === 0) {
        console.log('No pending standard transactions to sync.');
        await this.fetchBonds(jwt);
        await this.fetchOnlineBalance(jwt);
        
        // Recalculate pending online balance
        const pendingResult = await db.getFirstAsync(`
          SELECT COALESCE(SUM(total_amount), 0) as total FROM transactions WHERE role = 'receiver' AND sync_status IN ('pending', 'pending_pickup')
        `) as { total: number };
        useAppStore.getState().setBalance({ pendingOnline: pendingResult.total });
        return;
      }

      const incoming: any[] = [];
      const outgoing: any[] = [];

      for (const tx of standardPending) {
        const txBonds = await db.getAllAsync(`
          SELECT b.*, tb.direction 
          FROM bonds b 
          JOIN transaction_bonds tb ON b.bond_id = tb.bond_id 
          WHERE tb.tx_id = ?
        `, [tx.tx_id]);

        const bondsPayload = txBonds.map((b: any) => ({
          bondId: b.bond_id,
          value: b.value,
          ownerId: b.owner_id,
          issuedAt: b.issued_at,
          expiresAt: b.expires_at,
          issuedByServer: b.issued_by_server,
          serverSignature: b.server_signature
        }));

        const txPayload = {
          transaction: {
            txId: tx.tx_id,
            senderId: tx.sender_id,
            receiverId: tx.receiver_id,
            totalAmount: tx.total_amount,
            timestamp: tx.timestamp,
            nonce: tx.nonce,
            senderPublicKey: tx.sender_public_key,
            senderSignature: tx.sender_signature,
            message: tx.message || ''
          },
          bonds: bondsPayload
        };

        if (tx.role === 'sender') {
          outgoing.push(txPayload);
        } else {
          incoming.push(txPayload);
        }
      }

      const batchId = Crypto.randomUUID();

      const response = await axios.post(
        `${API_URL}/transactions/sync`,
        { batchId, incoming, outgoing },
        { headers: { Authorization: `Bearer ${jwt}` } }
      );

      const { accepted, rejected, flagged, updatedOnlineBalance } = response.data;

      // Update local db
      await db.execAsync('BEGIN TRANSACTION');
      try {
        for (const item of accepted) {
          await db.runAsync(`UPDATE transactions SET sync_status = 'synced', synced_at = ? WHERE tx_id = ?`, [Math.floor(Date.now() / 1000), item.txId]);
          // Delete standard spent/received bonds from local SQLite
          if (item.bondIds) {
             for (const bId of item.bondIds) {
                 await db.runAsync(`DELETE FROM bonds WHERE bond_id = ?`, [bId]);
             }
          }
        }

        for (const item of rejected) {
          await db.runAsync(`UPDATE transactions SET sync_status = 'failed', rejection_reason = ? WHERE tx_id = ?`, [item.reason, item.txId]);
        }

        for (const item of flagged) {
          await db.runAsync(`UPDATE transactions SET sync_status = 'flagged', rejection_reason = ? WHERE tx_id = ?`, [item.reason, item.txId]);
        }

        await db.execAsync('COMMIT');

        // Update online balance
        useAppStore.getState().setBalance({ online: updatedOnlineBalance });

      } catch (e) {
        await db.execAsync('ROLLBACK');
        console.error('Failed to update local db after sync:', e);
      }

      // Fetch fresh active bonds
      await this.fetchBonds(jwt);
      // Fetch fresh online balance
      await this.fetchOnlineBalance(jwt);

      // Recalculate pending online balance
      const pendingResult = await db.getFirstAsync(`
        SELECT COALESCE(SUM(total_amount), 0) as total FROM transactions WHERE role = 'receiver' AND sync_status IN ('pending', 'pending_pickup')
      `) as { total: number };
      useAppStore.getState().setBalance({ pendingOnline: pendingResult.total });

    } catch (error) {
      console.error('Sync failed:', error);
      throw error;
    } finally {
      isSyncing = false;
    }
  }

  static async fetchOnlineBalance(jwt: string) {
    try {
      const response = await axios.get(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${jwt}` }
      });
      if (response.data) {
        if (response.data.onlineBalance !== undefined) {
          useAppStore.getState().setBalance({ online: response.data.onlineBalance });
        }

        // Sync user details to ensure local session cache matches the server (Self-healing)
        const userState = useAppStore.getState().user;
        if (response.data.fullName || response.data.email || response.data.phoneNumber) {
          useAppStore.getState().setUser({
            fullName: response.data.fullName || userState.fullName,
            email: response.data.email || userState.email,
            phoneNumber: response.data.phoneNumber || userState.phoneNumber,
          });

          // Sync with SecureStore
          try {
            const sessionStr = await SecureStore.getItemAsync('bondpay_session');
            if (sessionStr) {
              const session = JSON.parse(sessionStr);
              let modified = false;
              if (response.data.fullName && session.fullName !== response.data.fullName) {
                session.fullName = response.data.fullName;
                modified = true;
              }
              if (response.data.email && session.email !== response.data.email) {
                session.email = response.data.email;
                modified = true;
              }
              if (response.data.phoneNumber && session.phoneNumber !== response.data.phoneNumber) {
                session.phoneNumber = response.data.phoneNumber;
                modified = true;
              }
              if (modified) {
                await SecureStore.setItemAsync('bondpay_session', JSON.stringify(session));
              }
            }
          } catch (err) {
            console.error('Failed to update SecureStore session during self-healing sync:', err);
          }
        }

        const localPubKey = useAppStore.getState().user.publicKey;
        if (response.data.publicKey && localPubKey && response.data.publicKey !== localPubKey) {
          console.warn('Server public key out of sync! Updating server to match local key.');
          try {
            await axios.post(`${API_URL}/auth/public-key`, { publicKey: localPubKey }, {
              headers: { Authorization: `Bearer ${jwt}` }
            });
            console.log('Successfully updated server public key to match local key');
          } catch (updateErr) {
            console.error('Failed to update server public key:', updateErr);
          }
        }
      }
    } catch (error: any) {
      console.error('Failed to fetch online balance:', error);
      if (error.response?.status === 401) {
        SecureStore.deleteItemAsync('bondpay_session').catch(() => {});
        useAppStore.getState().logout();
      }
    }
  }

  static async fetchBonds(jwt: string) {
    try {
      const response = await axios.get(`${API_URL}/bonds/active`, {
        headers: { Authorization: `Bearer ${jwt}` }
      });

      const { bonds } = response.data;
      const db = await getDB();

      await db.execAsync('BEGIN TRANSACTION');
      try {
        // Clear available server bonds and re-insert
        // We only delete available bonds to not mess up spent bonds that aren't synced yet
        await db.runAsync(`DELETE FROM bonds WHERE status = 'available'`);

        for (const bond of bonds) {
          const bondVal = parseInt(bond.value, 10);
          await db.runAsync(`
            INSERT OR IGNORE INTO bonds (bond_id, value, owner_id, issued_at, expires_at, issued_by_server, server_signature, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'available')
          `, [bond.bondId, bondVal, bond.ownerId, bond.issuedAt, bond.expiresAt, bond.issuedByServer, bond.serverSignature]);
        }

        const nowSec = Math.floor(Date.now() / 1000);
        const availableBonds = await db.getAllAsync(`SELECT SUM(value) as total FROM bonds WHERE status = 'available' AND expires_at > ?`, [nowSec]) as any[];
        const offlineTotal = availableBonds[0]?.total || 0;

        await db.execAsync('COMMIT');
        
        useAppStore.getState().setBalance({ offline: offlineTotal, lastSyncedAt: Date.now() });
      } catch (e) {
        await db.execAsync('ROLLBACK');
        throw e;
      }
    } catch (error: any) {
      console.error('Failed to fetch bonds:', error);
      if (error.response?.status === 401) {
        SecureStore.deleteItemAsync('bondpay_session').catch(() => {});
        useAppStore.getState().logout();
      }
    }
  }
}
