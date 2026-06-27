import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useAppStore } from '../store/useAppStore';
import { useLogStore } from '../store/useLogStore';
import { CryptoService } from '../services/crypto.service';
import { getDB } from '../database/db';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import axios from 'axios';
import { SyncService } from '../services/sync.service';
import { MultiQRScanner } from '../components/MultiQRScanner';
import { ConfigService, SystemConfig } from '../services/config.service';

import { BLEService } from '../services/ble.service';

import { API_URL } from '../services/config.service';

// Embedded default server public key (will be verified dynamically if possible)
const SERVER_PUBLIC_KEY = 'LB9g3x5Dq84TTCLvnQe47jhvh21LNDbz74gAkOsmGgc=';

export const ReceiveScreen = () => {
  const navigation = useNavigation();
  const isProcessingRef = useRef(false);
  const route = useRoute<any>();
  const isOnline = route.params?.isOnline || false;
  
  const { userId, fullName, publicKey, jwt } = useAppStore((state) => state.user);
  const balance = useAppStore((state) => state.balance);
  const isDark = useAppStore((state) => state.preferences.darkTheme);
  const [amount, setAmount] = useState('');
  const [qrGenerated, setQrGenerated] = useState(false);
  const [validatorMode, setValidatorMode] = useState(false);
  const [polling, setPolling] = useState(false);
  const [sysConfig, setSysConfig] = useState<SystemConfig | null>(null);

  // Bluetooth states
  const [bleSessionId, setBleSessionId] = useState<string | null>(null);
  const [bleState, setBleState] = useState<string>('');
  const [blePercent, setBlePercent] = useState<number>(0);

  useEffect(() => {
    const loadConfigs = async () => {
      const config = await ConfigService.fetchConfigs();
      setSysConfig(config);
    };
    loadConfigs();

    // Request BLE permissions early
    BLEService.requestBluetoothPermissions();

    // Clean up BLE on unmount
    return () => {
      BLEService.stopPeripheralSession();
    };
  }, []);

  // Mode 1: Poll for balance change if receiving online
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (qrGenerated && isOnline) {
      setPolling(true);
      const initialBalance = balance.online;
      interval = setInterval(async () => {
        try {
          const res = await axios.get(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${jwt}` } });
          const newBalance = res.data.onlineBalance;
          if (newBalance > initialBalance) {
             Alert.alert('Payment Received!', `You have successfully received रू ${newBalance - initialBalance} online!`, [
               { text: 'OK', onPress: () => navigation.goBack() }
             ]);
             useAppStore.getState().setBalance({ online: newBalance });
             clearInterval(interval);
          }
        } catch (e) {
          console.error('Polling error', e);
        }
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [qrGenerated, isOnline, balance.online]);

  const handleGenerateQR = () => {
    const amountVal = parseInt(amount, 10);
    if (isNaN(amountVal) || amountVal <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }

    const sessionId = `bp-ble-${userId?.substring(0, 5)}-${Date.now()}`;
    setBleSessionId(sessionId);
    setBleState('Advertising BLE Service...');
    setBlePercent(0);
    setQrGenerated(true);

    // Initialize BLE peripheral session
    BLEService.startPeripheralSession(sessionId, {
      onStateChange: (state, percent) => {
        setBleState(state);
        setBlePercent(percent);
      },
      onPayloadReceived: async (data) => {
        return await handlePaymentReceived(data);
      }
    });
  };

  const handleStartScan = () => {
    isProcessingRef.current = false;
    setValidatorMode(true);
  };

  const handleCancelScan = () => {
    isProcessingRef.current = false;
    setValidatorMode(false);
  };

  // Called when MultiQR progressive scan or BLE payload receipt completes
  const handlePaymentReceived = async (data: string): Promise<boolean> => {
    if (isProcessingRef.current) return false;
    isProcessingRef.current = true;
    
    const { addLog } = useLogStore.getState();
    addLog('INFO', 'ReceiveScreen', 'Payment payload received', { rawData: data });

    try {
      const payload = JSON.parse(data);
      addLog('INFO', 'ReceiveScreen', 'Payload parsed', payload);

      // Handle MODE 2: Online-Offline Pending Pickup Claim
      if (payload.type === 'BONDPAY_PICKUP') {
        const demandedAmount = parseInt(amount, 10);
        if (payload.amount !== demandedAmount) {
          Alert.alert('Invalid Transaction', `Amount mismatch. Expected रू ${demandedAmount}, got रू ${payload.amount}.`);
          isProcessingRef.current = false;
          return false;
        }

        // Verify Server Signature on this pickup claim
        const dataToVerify = `${payload.pickupId}${payload.senderId || ''}${userId}${payload.amount}${payload.expiresAt}`;
        const isServerSigned = await CryptoService.verifyServerBondSignature(
          dataToVerify,
          payload.serverSig,
          SERVER_PUBLIC_KEY
        );

        if (!isServerSigned) {
          Alert.alert('Security Alert', 'This pickup payload has an invalid server signature. Rejected.');
          isProcessingRef.current = false;
          return false;
        }

        const db = await getDB();
        const existingTx = await db.getAllAsync('SELECT tx_id FROM transactions WHERE tx_id = ?', [payload.pickupId]);
        if (existingTx.length > 0) {
          Alert.alert('Duplicate Claim', 'You have already scanned this pickup code.');
          isProcessingRef.current = false;
          return false;
        }

        // Store claim in transactions as role='receiver', sync_status='pending_pickup'
        await db.runAsync(`
          INSERT INTO transactions (tx_id, sender_id, receiver_id, total_amount, timestamp, nonce, sender_public_key, sender_signature, role, sync_status, message)
          VALUES (?, ?, ?, ?, ?, '', '', ?, 'receiver', 'pending_pickup', ?)
        `, [
          payload.pickupId, payload.senderName || 'Sender', userId, payload.amount, Math.floor(Date.now() / 1000), payload.serverSig, 'Pending Online Pickup Claim'
        ]);

        // Update pending balance
        const pendingRes = await db.getFirstAsync(`
          SELECT COALESCE(SUM(total_amount), 0) as total FROM transactions WHERE role = 'receiver' AND sync_status IN ('pending', 'pending_pickup')
        `) as { total: number };
        
        useAppStore.getState().setBalance({ pendingOnline: pendingRes.total });

        // Stop BLE peripheral since payment has been received
        BLEService.stopPeripheralSession();

        // If receiver is online, trigger immediate sync/claim
        if (isOnline) {
          try {
            await axios.post(`${API_URL}/wallet/claim-pending`, { pickupId: payload.pickupId }, { headers: { Authorization: `Bearer ${jwt}` } });
            await db.runAsync("UPDATE transactions SET sync_status = 'synced' WHERE tx_id = ?", [payload.pickupId]);
            await SyncService.fetchOnlineBalance(jwt!);
            
            // Recalculate pending
            const pendingRecalc = await db.getFirstAsync(`
              SELECT COALESCE(SUM(total_amount), 0) as total FROM transactions WHERE role = 'receiver' AND sync_status IN ('pending', 'pending_pickup')
            `) as { total: number };
            useAppStore.getState().setBalance({ pendingOnline: pendingRecalc.total });

            Alert.alert('Payment Claimed!', `रू ${demandedAmount} has been claimed and added to your ONLINE balance!`, [
              { text: 'OK', onPress: () => navigation.goBack() }
            ]);
            return true;
          } catch (e: any) {
            console.warn('Failed to claim online immediately, will sync later.', e.message);
          }
        }

        Alert.alert('Pickup Saved Offline', `रू ${demandedAmount} will be credited to your online balance once you go online.`, [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
        return true;
      }

      // Handle MODE 3 & 4: Offline Bond Transfer Receipt
      if (payload.txId && payload.senderId && payload.amount && payload.sig && payload.bonds) {
        if (payload.receiverId !== userId) {
          addLog('ERROR', 'ReceiveScreen', 'Receiver ID mismatch', { expected: userId, received: payload.receiverId });
          Alert.alert('Invalid Transaction', 'This transaction is not meant for you.');
          isProcessingRef.current = false;
          return false;
        }

        const demandedAmount = parseInt(amount, 10);
        if (payload.amount !== demandedAmount) {
          Alert.alert('Invalid Transaction', `Amount mismatch. Expected रू ${demandedAmount}, got रू ${payload.amount}.`);
          isProcessingRef.current = false;
          return false;
        }

        // 1. Verify Server signature on EVERY bond to prevent forgery (Bug #6 Fix)
        for (const bond of payload.bonds) {
          const bondDataToVerify = `${bond.id}${bond.value}${bond.ownerId}${bond.issuedAt}${bond.expiresAt}${bond.issuedByServer}`;
          const isServerSigned = await CryptoService.verifyServerBondSignature(
            bondDataToVerify,
            bond.serverSignature,
            SERVER_PUBLIC_KEY
          );
          if (!isServerSigned) {
            Alert.alert('Security Alert', `Bond ${bond.id.substring(0,8)} failed server validation. Payment REJECTED.`);
            isProcessingRef.current = false;
            return false;
          }

          // Check if bond is expired
          const nowSec = Math.floor(Date.now() / 1000);
          if (bond.expiresAt <= nowSec) {
            Alert.alert('Invalid Transaction', `Bond ${bond.id.substring(0,8)} has expired. Payment REJECTED.`);
            isProcessingRef.current = false;
            return false;
          }
        }

        const bondIds = payload.bonds.map((b: any) => b.id);
        bondIds.sort();
        const bondIdsString = bondIds.join(',');
        const message = payload.message || '';

        // 2. Verify Sender signature
        const dataToSign = `${payload.txId}${payload.senderId}${userId}${payload.amount}${payload.timestamp}${payload.nonce}${bondIdsString}${message}`;
        addLog('INFO', 'ReceiveScreen', 'Constructed dataToSign', { dataToSign });

        const isValid = await CryptoService.verifySenderSignature(dataToSign, payload.sig, payload.senderPubKey);

        if (!isValid) {
          addLog('ERROR', 'ReceiveScreen', 'Signature validation failed in UI layer');
          Alert.alert('Invalid Signature', 'The sender signature is invalid.');
          isProcessingRef.current = false;
          return false;
        }

        let totalBondValue = 0;
        for (const bond of payload.bonds) {
          totalBondValue += bond.value;
        }

        if (totalBondValue !== demandedAmount) {
           Alert.alert('Invalid Bonds', 'The provided bonds do not match the transaction amount.');
           isProcessingRef.current = false;
           return false;
        }

        const db = await getDB();
        
        // Check duplicate transaction ID
        const existingTx = await db.getAllAsync('SELECT tx_id FROM transactions WHERE tx_id = ?', [payload.txId]);
        if (existingTx.length > 0) {
          Alert.alert('Duplicate', 'You have already processed this transaction.');
          isProcessingRef.current = false;
          return false;
        }

        await db.execAsync('BEGIN TRANSACTION');
        try {
          await db.runAsync(`
            INSERT INTO transactions (tx_id, sender_id, receiver_id, total_amount, timestamp, nonce, sender_public_key, sender_signature, role, sync_status, message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'receiver', 'pending', ?)
          `, [
            payload.txId, payload.senderId, userId, payload.amount, payload.timestamp, payload.nonce, payload.senderPubKey, payload.sig, message
          ]);

          for (const bond of payload.bonds) {
            // Save bond with current_owner_id = receiver's userId, and state = 'received_pending_sync' (Bug #5 Fix & A->B->C lock)
            await db.runAsync(`
              INSERT OR REPLACE INTO bonds (bond_id, value, owner_id, issued_at, expires_at, issued_by_server, server_signature, status, local_tx_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'received_pending_sync', ?)
            `, [bond.id, bond.value, bond.ownerId, bond.issuedAt, bond.expiresAt, bond.issuedByServer, bond.serverSignature, payload.txId]);

            await db.runAsync(`
              INSERT OR IGNORE INTO transaction_bonds (tx_id, bond_id, direction) VALUES (?, ?, 'incoming')
            `, [payload.txId, bond.id]);
          }

          await db.execAsync('COMMIT');

          // Update local pending balance (Orange)
          const pendingRes = await db.getFirstAsync(`
            SELECT COALESCE(SUM(total_amount), 0) as total FROM transactions WHERE role = 'receiver' AND sync_status IN ('pending', 'pending_pickup')
          `) as { total: number };
          useAppStore.getState().setBalance({ pendingOnline: pendingRes.total });

          // Stop BLE peripheral session
          BLEService.stopPeripheralSession();

          // MODE 3: Receiver is online. Immediately trigger sync for this transaction to settle on server.
          if (isOnline) {
            try {
              // Immediately call sync
              await SyncService.sync();
              Alert.alert('Payment Received & Synced!', `रू ${demandedAmount} has been settled and added to your ONLINE balance!`, [
                { text: 'OK', onPress: () => navigation.goBack() }
              ]);
              return true;
            } catch (syncError) {
              console.warn('Immediate sync failed, queued for later background sync.');
            }
          }

          // MODE 4: Offline-Offline
          Alert.alert('Payment Received Offline!', `रू ${demandedAmount} received offline. Settle it by syncing when you are online.`, [
            { text: 'OK', onPress: () => navigation.goBack() }
          ]);
          return true;
        } catch (e) {
          await db.execAsync('ROLLBACK');
          console.error('Failed to save incoming transaction:', e);
          Alert.alert('Error', 'Failed to save the transaction locally.');
          return false;
        }

      } else {
        addLog('ERROR', 'ReceiveScreen', 'Invalid QR Code structure', { payload });
        Alert.alert('Invalid QR Code', 'The scanned QR code is not a valid transaction payload.');
        return false;
      }
    } catch (error: any) {
      addLog('ERROR', 'ReceiveScreen', 'Failed to parse or verify QR code', { error: error.message });
      console.error(error);
      Alert.alert('Error', 'Failed to parse payment QR code.');
      return false;
    } finally {
      isProcessingRef.current = false;
    }
  };

  const receivePayload = JSON.stringify({
    id: userId,
    name: fullName,
    pubKey: publicKey,
    amount: parseInt(amount, 10) || 0,
    mode: isOnline ? 'online' : 'offline',
    bleServiceUuid: 'E3F1C990-2B3A-4D78-95D9-23CE6305C001',
    bleSessionId: bleSessionId
  });

  return (
    <View style={[styles.container, isDark && styles.darkContainer]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={isDark ? "#FFF" : "#000"} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isDark && styles.darkText]}>Receive Money</Text>
        <View style={{ width: 24 }} />
      </View>

      {validatorMode ? (
         <MultiQRScanner 
           onComplete={handlePaymentReceived} 
           onCancel={handleCancelScan} 
           isDark={isDark} 
         />
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.modeBadgeContainer}>
            <Text style={[styles.modeBadge, { backgroundColor: isOnline ? '#2ECC71' : '#F39C12' }]}>
              {isOnline ? 'ONLINE RECEIVE' : 'OFFLINE RECEIVE'}
            </Text>
          </View>

          {!qrGenerated ? (
            <View style={styles.formContainer}>
              <Text style={[styles.label, isDark && styles.darkSubtitle]}>Amount to receive</Text>
              <TextInput
                style={[styles.amountInput, isDark && styles.darkText]}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
                placeholder="रू 0.00"
                placeholderTextColor={isDark ? "#666" : "#CCC"}
              />
              <TouchableOpacity style={styles.generateButton} onPress={handleGenerateQR}>
                <Text style={styles.generateButtonText}>Generate QR</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.qrCard, isDark && styles.darkQrCard]}>
              <Text style={[styles.scanLabel, isDark && styles.darkSubtitle]}>Ask Sender to Scan</Text>
              
              <View style={styles.qrWrapper}>
                <QRCode
                  value={receivePayload}
                  size={220}
                  color="#000000"
                  backgroundColor="#FFFFFF"
                />
              </View>

              <Text style={[styles.amountDisplay, isDark && styles.darkText]}>रू {amount}</Text>
              
              {isOnline && (
                <View style={styles.pollingContainer}>
                  <ActivityIndicator size="small" color="#2D46B9" />
                  <Text style={[styles.pollingText, isDark && styles.darkSubtitle]}>Waiting for payment...</Text>
                </View>
              )}

              {bleSessionId && (
                <View style={[styles.bluetoothCard, isDark && styles.darkBluetoothCard]}>
                  <View style={styles.bluetoothHeader}>
                    <Ionicons 
                      name={blePercent === 100 ? "bluetooth" : "bluetooth-outline"} 
                      size={20} 
                      color={blePercent === 100 ? "#2ECC71" : "#2D46B9"} 
                      style={styles.bluetoothIcon} 
                    />
                    <Text style={[styles.bluetoothTitle, isDark && styles.darkText]}>
                      Bluetooth P2P Offline Link
                    </Text>
                  </View>
                  <Text style={[styles.bluetoothStatus, isDark && styles.darkSubtitle]}>
                    {bleState}
                  </Text>
                  {blePercent > 0 && blePercent < 100 && (
                    <View style={styles.bluetoothProgressBg}>
                      <View style={[styles.bluetoothProgressFill, { width: `${blePercent}%` }]} />
                    </View>
                  )}
                </View>
              )}
              
              <View style={styles.offlineActionContainer}>
                <Text style={[styles.offlineHelperText, isDark && styles.darkSubtitle]}>
                  {isOnline 
                    ? "If the sender is offline, they will generate a Payment QR. Tap below to scan it."
                    : "After the sender confirms, they will show you a Payment QR. Scan it to complete."}
                </Text>
                <TouchableOpacity style={styles.verifyButton} onPress={handleStartScan}>
                  <Ionicons name="scan" size={24} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.verifyButtonText}>Verify & Scan Receipt</Text>
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity style={styles.changeAmountButton} onPress={() => {
                BLEService.stopPeripheralSession();
                setBleSessionId(null);
                setBleState('');
                setBlePercent(0);
                setQrGenerated(false);
              }}>
                <Text style={styles.changeAmountText}>Change Amount</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  darkContainer: { backgroundColor: '#121212' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backButton: { padding: 5 },
  headerTitle: { color: '#000', fontSize: 18, fontWeight: 'bold' },
  darkText: { color: '#FFF' },
  darkSubtitle: { color: '#AAA' },
  scrollContent: { flexGrow: 1, alignItems: 'center', padding: 20 },
  modeBadgeContainer: { marginBottom: 30, alignItems: 'center' },
  modeBadge: { paddingHorizontal: 15, paddingVertical: 5, borderRadius: 20, color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  formContainer: { width: '100%', alignItems: 'center', marginTop: 20 },
  label: { fontSize: 16, color: '#666', marginBottom: 20 },
  amountInput: { fontSize: 48, fontWeight: 'bold', color: '#2D46B9', textAlign: 'center', marginBottom: 40 },
  generateButton: { backgroundColor: '#2D46B9', paddingVertical: 18, paddingHorizontal: 40, borderRadius: 12, width: '100%', alignItems: 'center' },
  generateButtonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  qrCard: { 
    backgroundColor: '#FFFFFF', 
    padding: 30, 
    borderRadius: 16, 
    alignItems: 'center', 
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    marginBottom: 30,
  },
  darkQrCard: { backgroundColor: '#1E1E1E', borderColor: '#333' },
  scanLabel: { color: '#666', fontSize: 16, fontWeight: 'bold', marginBottom: 20 },
  qrWrapper: { padding: 10, backgroundColor: '#FFF', marginBottom: 20 },
  amountDisplay: { color: '#000', fontSize: 32, fontWeight: 'bold', marginBottom: 10 },
  pollingContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 15 },
  pollingText: { marginLeft: 10, color: '#666', fontSize: 14 },
  bluetoothCard: {
    backgroundColor: '#F5F6FA',
    borderRadius: 12,
    padding: 15,
    width: '100%',
    marginVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E1E4E8',
  },
  darkBluetoothCard: {
    backgroundColor: '#242526',
    borderColor: '#3A3B3C',
  },
  bluetoothHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  bluetoothIcon: {
    marginRight: 8,
  },
  bluetoothTitle: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#2D46B9',
  },
  bluetoothStatus: {
    fontSize: 12,
    color: '#555',
    textAlign: 'center',
    marginBottom: 10,
  },
  bluetoothProgressBg: {
    width: '100%',
    height: 6,
    backgroundColor: '#E1E4E8',
    borderRadius: 3,
    overflow: 'hidden',
  },
  bluetoothProgressFill: {
    height: '100%',
    backgroundColor: '#2D46B9',
  },
  offlineActionContainer: { width: '100%', marginTop: 15, alignItems: 'center' },
  offlineHelperText: { textAlign: 'center', color: '#666', fontSize: 12, marginBottom: 15, paddingHorizontal: 10 },
  verifyButton: { flexDirection: 'row', backgroundColor: '#E74C3C', paddingVertical: 15, paddingHorizontal: 20, borderRadius: 12, width: '100%', alignItems: 'center', justifyContent: 'center' },
  verifyButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  changeAmountButton: { marginTop: 20, padding: 10 },
  changeAmountText: { color: '#2D46B9', fontWeight: 'bold' },
});
