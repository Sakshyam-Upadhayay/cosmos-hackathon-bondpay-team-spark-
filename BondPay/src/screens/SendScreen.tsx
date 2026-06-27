import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import { useAppStore } from '../store/useAppStore';
import { useLogStore } from '../store/useLogStore';
import { CryptoService } from '../services/crypto.service';
import { getDB } from '../database/db';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import axios from 'axios';
import { SyncService } from '../services/sync.service';
import { ConfigService, SystemConfig } from '../services/config.service';
import { MultiQRDisplay } from '../components/MultiQRDisplay';
import * as LocalAuthentication from 'expo-local-authentication';
import { BLEService } from '../services/ble.service';

import { API_URL } from '../services/config.service';

export const SendScreen = () => {
  const navigation = useNavigation();
  const isProcessingRef = useRef(false);
  const route = useRoute<any>();
  const isOnline = route.params?.isOnline || false;

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [receiverInfo, setReceiverInfo] = useState<{ userId: string; displayName: string; publicKey: string; amount: number; mode?: string } | null>(null);
  const [editableAmount, setEditableAmount] = useState('');
  const [message, setMessage] = useState('');
  const [receiptPayload, setReceiptPayload] = useState<string | null>(null);
  const [onlineSuccess, setOnlineSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [availableBonds, setAvailableBonds] = useState<any[]>([]);
  const [sysConfig, setSysConfig] = useState<SystemConfig | null>(null);
  const [sendMode, setSendMode] = useState<'qr' | 'phone'>('qr');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [searchingUser, setSearchingUser] = useState(false);

  // Bluetooth states
  const [bleSessionId, setBleSessionId] = useState<string | null>(null);
  const [bleServiceUuid, setBleServiceUuid] = useState<string | null>(null);
  const [isBleSending, setIsBleSending] = useState(false);
  const [bleProgressStep, setBleProgressStep] = useState('');
  const [bleProgressPercent, setBleProgressPercent] = useState(0);
  
  const { userId, publicKey, jwt, fullName } = useAppStore((state) => state.user);
  const balance = useAppStore((state) => state.balance);
  const isDark = useAppStore((state) => state.preferences.darkTheme);

  useEffect(() => {
    const loadBonds = async () => {
      if (!userId) return;
      try {
        const db = await getDB();
        const nowSec = Math.floor(Date.now() / 1000);
        const bonds = await db.getAllAsync(`
          SELECT * FROM bonds WHERE status = 'available' AND owner_id = ? AND expires_at > ? ORDER BY value DESC
        `, [userId, nowSec]);
        setAvailableBonds(bonds);
      } catch (error) {
        console.error('Failed to load bonds:', error);
      }
    };
    loadBonds();
    
    const loadConfigs = async () => {
      const config = await ConfigService.fetchConfigs();
      setSysConfig(config);
    };
    loadConfigs();

    // Request Bluetooth/BLE permissions early
    BLEService.requestBluetoothPermissions();
  }, [userId]);

  const getDenominationsString = (bondsList: any[]) => {
    const counts: { [key: number]: number } = {};
    for (const bond of bondsList) {
      counts[bond.value] = (counts[bond.value] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([val, count]) => `रू ${val} × ${count}`)
      .join(', ');
  };

  useEffect(() => {
    const getCameraPermissions = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    };
    getCameraPermissions();
  }, []);

  const handleRescan = () => {
    isProcessingRef.current = false;
    setScanned(false);
  };

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setScanned(true);
    try {
      const payload = JSON.parse(data);
      if (payload.id && payload.name && payload.pubKey !== undefined) {
        setReceiverInfo({ 
          userId: payload.id, 
          displayName: payload.name, 
          publicKey: payload.pubKey, 
          amount: payload.amount || 0,
          mode: payload.mode || 'offline'
        });
        setBleSessionId(payload.bleSessionId || null);
        setBleServiceUuid(payload.bleServiceUuid || null);
        setEditableAmount(payload.amount ? payload.amount.toString() : '');
      } else {
        Alert.alert('Invalid QR Code', 'The scanned QR code is missing required information.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to parse QR code.');
    }
  };

  const resetBleState = () => {
    setBleSessionId(null);
    setBleServiceUuid(null);
    setIsBleSending(false);
    setBleProgressStep('');
    setBleProgressPercent(0);
  };

  const sendPayloadViaBluetooth = async (payloadToSend: string, sessionId: string) => {
    setIsBleSending(true);
    setBleProgressStep('Searching for Bluetooth link...');
    setBleProgressPercent(0);
    
    try {
      await BLEService.sendPayloadOverBLE(sessionId, payloadToSend, (step, percent) => {
        setBleProgressStep(step);
        setBleProgressPercent(percent);
      });
      
      setOnlineSuccess(true);
      setIsBleSending(false);
    } catch (err: any) {
      console.error("BLE transfer failed:", err);
      Alert.alert(
        "Bluetooth Transfer Failed",
        `${err.message || 'Unable to establish connection.'}\n\nWould you like to display the QR code instead?`,
        [
          { 
            text: "Show QR Code", 
            onPress: () => {
              setIsBleSending(false);
            } 
          },
          {
            text: "Retry Bluetooth",
            onPress: () => sendPayloadViaBluetooth(payloadToSend, sessionId)
          }
        ]
      );
    }
  };

  // Perform FaceID/Fingerprint check, fall back to PIN
  const authenticateUser = async (): Promise<boolean> => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      
      const authOptions = {
        promptMessage: 'Authenticate to authorize payment transaction',
        fallbackLabel: 'Use Passcode',
        disableDeviceFallback: false,
      };

      const result = await LocalAuthentication.authenticateAsync(authOptions);
      return result.success;
    } catch (e) {
      console.warn('Authentication helper failed', e);
      return false;
    }
  };

  // MODE 1: Sender Online, Receiver Online
  const processOnlinePayment = async () => {
    if (!receiverInfo || !userId || !jwt) return;
    const amountVal = parseInt(editableAmount, 10);
    
    if (isNaN(amountVal) || amountVal <= 0) {
       Alert.alert('Invalid Amount', 'Please enter a valid amount.');
       return;
    }

    if (balance.online < amountVal) {
      Alert.alert('Insufficient Balance', 'You do not have enough online balance.');
      return;
    }

    const authSuccess = await authenticateUser();
    if (!authSuccess) {
      Alert.alert('Authentication Failed', 'Device authorization is required to send money.');
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/wallet/transfer-online`, {
        receiverId: receiverInfo.userId,
        amount: amountVal,
        message: message.trim()
      }, { headers: { Authorization: `Bearer ${jwt}` } });

      // Save to local DB for complete history
      const db = await getDB();
      const txId = res.data.txId || `TX-ONLINE-${Date.now()}`;
      await db.runAsync(`
        INSERT OR IGNORE INTO transactions (tx_id, sender_id, receiver_id, total_amount, timestamp, nonce, sender_public_key, sender_signature, role, sync_status, message)
        VALUES (?, ?, ?, ?, ?, '', ?, '', 'sender', 'synced', ?)
      `, [txId, userId, receiverInfo.userId, amountVal, Math.floor(Date.now() / 1000), publicKey || '', message.trim()]);

      await SyncService.fetchOnlineBalance(jwt);
      setOnlineSuccess(true);
    } catch (e: any) {
      console.error(e);
      Alert.alert('Transfer Failed', e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  // MODE 2: Sender Online, Receiver Offline
  const processOnlineOfflinePayment = async () => {
    if (!receiverInfo || !userId || !jwt) return;
    const amountVal = parseInt(editableAmount, 10);

    if (isNaN(amountVal) || amountVal <= 0) {
       Alert.alert('Invalid Amount', 'Please enter a valid amount.');
       return;
    }

    if (balance.online < amountVal) {
      Alert.alert('Insufficient Balance', 'You do not have enough online balance.');
      return;
    }

    const authSuccess = await authenticateUser();
    if (!authSuccess) {
      Alert.alert('Authentication Failed', 'Device authorization is required to send money.');
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/wallet/transfer-pending`, {
        receiverId: receiverInfo.userId,
        amount: amountVal
      }, { headers: { Authorization: `Bearer ${jwt}` } });

      const pickupPayload = {
        type: 'BONDPAY_PICKUP',
        pickupId: res.data.pickupId,
        pickupCode: res.data.pickupCode,
        amount: amountVal,
        senderName: fullName,
        serverSig: res.data.serverSig,
        expiresAt: res.data.expiresAt
      };

      const db = await getDB();
      await db.runAsync(`
        INSERT OR IGNORE INTO transactions (tx_id, sender_id, receiver_id, total_amount, timestamp, nonce, sender_public_key, sender_signature, role, sync_status, message)
        VALUES (?, ?, ?, ?, ?, '', ?, '', 'sender', 'synced', ?)
      `, [res.data.pickupId, userId, receiverInfo.userId, amountVal, Math.floor(Date.now() / 1000), publicKey || '', 'Online-Offline Pickup Pending']);

      await SyncService.fetchOnlineBalance(jwt);
      const payloadStr = JSON.stringify(pickupPayload);
      setReceiptPayload(payloadStr);

      if (bleSessionId) {
        await sendPayloadViaBluetooth(payloadStr, bleSessionId);
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert('Transfer Pending Setup Failed', e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  // MODE 3 & MODE 4: Offline Sending (using offline bonds)
  const processOfflinePayment = async () => {
    if (!receiverInfo || !userId || !publicKey) return;

    const amountVal = parseInt(editableAmount, 10);
    if (isNaN(amountVal) || amountVal <= 0) {
       Alert.alert('Invalid Amount', 'Please enter a valid amount.');
       return;
    }

    if (balance.offline < amountVal) {
      Alert.alert('Insufficient Balance', 'You do not have enough offline balance.');
      return;
    }

    const db = await getDB();
    const nowSec = Math.floor(Date.now() / 1000);
    const availableBondsResult = await db.getAllAsync(`
      SELECT * FROM bonds WHERE status = 'available' AND owner_id = ? AND expires_at > ? ORDER BY value DESC
    `, [userId, nowSec]);

    // Backtracking subset-sum solver to find an exact combination of bonds
    const findExactChange = (bondsList: any[], target: number): any[] | null => {
      const memo = new Map<string, any[] | null>();
      const search = (index: number, currentTarget: number): any[] | null => {
        if (currentTarget === 0) return [];
        if (index >= bondsList.length || currentTarget < 0) return null;
        
        const key = `${index}-${currentTarget}`;
        if (memo.has(key)) return memo.get(key)!;
        
        const withCurrent = search(index + 1, currentTarget - bondsList[index].value);
        if (withCurrent !== null) {
          const result = [bondsList[index], ...withCurrent];
          memo.set(key, result);
          return result;
        }
        
        const withoutCurrent = search(index + 1, currentTarget);
        memo.set(key, withoutCurrent);
        return withoutCurrent;
      };
      return search(0, target);
    };

    const selectedBonds = findExactChange(availableBondsResult, amountVal);

    if (!selectedBonds) {
      const totalAvailable = balance.offline;
      const denomString = getDenominationsString(availableBondsResult);
      Alert.alert(
        'Insufficient Exact Change',
        `You have a total offline balance of रू ${totalAvailable}, but you do not have a combination of bonds that adds up exactly to रू ${amountVal}.\n\nYour available bonds: ${denomString || 'None'}\n\nBondPay requires exact combinations for offline transfers.`
      );
      return;
    }

    const authSuccess = await authenticateUser();
    if (!authSuccess) {
      Alert.alert('Authentication Failed', 'Device authorization is required to send money.');
      return;
    }

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = CryptoService.generateNonce();
      const txId = `TX-${nonce}`;

      const bondIds = selectedBonds.map(b => b.bond_id);
      bondIds.sort();
      const bondIdsString = bondIds.join(',');

      const dataToSign = `${txId}${userId}${receiverInfo.userId}${amountVal}${timestamp}${nonce}${bondIdsString}${message.trim()}`;
      
      const { addLog } = useLogStore.getState();
      addLog('INFO', 'SendScreen', 'Constructed dataToSign for sending', { dataToSign });

      const senderSignature = await CryptoService.signTransaction(dataToSign, userId);
      addLog('INFO', 'SendScreen', 'Sender signature successfully generated', { senderSignature });

      const bondsPayload = selectedBonds.map(b => ({
        id: b.bond_id,
        value: b.value,
        ownerId: b.owner_id,
        issuedAt: b.issued_at,
        expiresAt: b.expires_at,
        issuedByServer: b.issued_by_server,
        serverSignature: b.server_signature
      }));

      await db.execAsync('BEGIN TRANSACTION');
      try {
        await db.runAsync(`
          INSERT INTO transactions (tx_id, sender_id, receiver_id, total_amount, timestamp, nonce, sender_public_key, sender_signature, role, sync_status, message)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sender', 'pending', ?)
        `, [
          txId, userId, receiverInfo.userId, amountVal, timestamp, nonce, publicKey, senderSignature, message.trim()
        ]);

        for (const bond of selectedBonds) {
          await db.runAsync(`
            UPDATE bonds SET status = 'spent', local_tx_id = ? WHERE bond_id = ?
          `, [txId, bond.bond_id]);

          await db.runAsync(`
            INSERT INTO transaction_bonds (tx_id, bond_id, direction) VALUES (?, ?, 'outgoing')
          `, [txId, bond.bond_id]);
        }

        await db.execAsync('COMMIT');

        useAppStore.getState().setBalance({ offline: balance.offline - amountVal });

        const receipt = {
          txId,
          senderId: userId,
          receiverId: receiverInfo.userId,
          amount: amountVal,
          timestamp,
          nonce,
          senderPubKey: publicKey,
          sig: senderSignature,
          bonds: bondsPayload,
          message: message.trim(),
          mode: isOnline ? 'offline_online' : 'offline_offline'
        };

        addLog('INFO', 'SendScreen', 'Final receipt payload created', receipt);
        const payloadStr = JSON.stringify(receipt);
        setReceiptPayload(payloadStr);

        if (bleSessionId) {
          await sendPayloadViaBluetooth(payloadStr, bleSessionId);
        }

      } catch (e: any) {
        await db.execAsync('ROLLBACK');
        useLogStore.getState().addLog('ERROR', 'SendScreen', 'Transaction database error', { error: e.message || e });
        console.error('Transaction failed:', e);
        Alert.alert('Error', 'Payment failed due to an internal error.');
      }
    } catch (error: any) {
      useLogStore.getState().addLog('ERROR', 'SendScreen', 'Signing process failed', { error: error.message || error });
      console.error('Signing failed:', error);
      Alert.alert('Error', 'Failed to sign the transaction.');
    }
  };

  const handlePhoneLookup = async () => {
    if (!phoneNumber || phoneNumber.trim() === '') {
      Alert.alert('Required', 'Please enter a recipient phone number.');
      return;
    }
    setSearchingUser(true);
    try {
      const res = await axios.get(`${API_URL}/auth/lookup`, {
        params: { phoneNumber: phoneNumber.trim() },
        headers: { Authorization: `Bearer ${jwt}` }
      });
      
      if (res.data) {
        setReceiverInfo({
          userId: res.data.userId,
          displayName: res.data.fullName,
          publicKey: res.data.publicKey || '',
          amount: 0,
          mode: 'online'
        });
      }
    } catch (e: any) {
      console.warn("User lookup failed:", e);
      Alert.alert('Not Found', e.response?.data?.error || 'Recipient user not found.');
    } finally {
      setSearchingUser(false);
    }
  };

  if (hasPermission === null) return <View style={styles.container} />;
  if (hasPermission === false) return <Text style={{color: '#000', marginTop: 50, textAlign: 'center'}}>No access to camera</Text>;

  const getWorkflowMode = (): string => {
    if (!receiverInfo) return 'UNKNOWN';
    const rxMode = receiverInfo.mode || 'offline';
    if (isOnline && rxMode === 'online') return 'Mode 1: Online → Online';
    if (isOnline && rxMode === 'offline') return 'Mode 2: Online → Offline';
    if (!isOnline && rxMode === 'online') return 'Mode 3: Offline → Online';
    return 'Mode 4: Offline → Offline';
  };

  return (
    <View style={[styles.container, isDark && styles.darkContainer]}>
      <View style={[styles.header, isDark && styles.darkHeader]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={isDark ? "#FFF" : "#000"} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isDark && styles.darkText]}>Send Money</Text>
        <View style={{ width: 24 }} />
      </View>

      {!receiverInfo && !receiptPayload && !onlineSuccess ? (
        <View style={{ flex: 1 }}>
          {isOnline && (
            <View style={styles.tabContainer}>
              <TouchableOpacity 
                style={[styles.tabButton, sendMode === 'qr' && styles.tabButtonActive, isDark && styles.darkTabButton]}
                onPress={() => setSendMode('qr')}
              >
                <Ionicons name="qr-code-outline" size={18} color={sendMode === 'qr' ? '#FFF' : (isDark ? '#AAA' : '#555')} style={{ marginRight: 6 }} />
                <Text style={[styles.tabText, sendMode === 'qr' && styles.tabTextActive, isDark && { color: sendMode === 'qr' ? '#FFF' : '#AAA' }]}>Scan QR</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.tabButton, sendMode === 'phone' && styles.tabButtonActive, isDark && styles.darkTabButton]}
                onPress={() => setSendMode('phone')}
              >
                <Ionicons name="call-outline" size={18} color={sendMode === 'phone' ? '#FFF' : (isDark ? '#AAA' : '#555')} style={{ marginRight: 6 }} />
                <Text style={[styles.tabText, sendMode === 'phone' && styles.tabTextActive, isDark && { color: sendMode === 'phone' ? '#FFF' : '#AAA' }]}>Phone Number</Text>
              </TouchableOpacity>
            </View>
          )}

          {sendMode === 'qr' ? (
            <View style={styles.cameraContainer}>
              <Text style={styles.scanLabelTop}>Scan Receiver's Request QR</Text>
              <CameraView
                onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                style={StyleSheet.absoluteFillObject}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              />
              <View style={styles.reticleContainer}>
                <View style={styles.reticle} />
              </View>
              <View style={styles.modeBadgeContainer}>
                 <Text style={[styles.modeBadge, { backgroundColor: isOnline ? '#2ECC71' : '#F39C12' }]}>
                    {isOnline ? 'ONLINE SEND' : 'OFFLINE SEND'}
                 </Text>
              </View>
              {scanned && (
                <TouchableOpacity style={styles.rescanButton} onPress={handleRescan}>
                  <Text style={styles.rescanButtonText}>Tap to Scan Again</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.phoneFormContainer}>
              <View style={[styles.phoneCard, isDark && styles.darkPhoneCard]}>
                <Ionicons name="airplane-outline" size={48} color="#2D46B9" style={{ marginBottom: 15 }} />
                <Text style={[styles.phoneCardTitle, isDark && styles.darkText]}>Air Transfer</Text>
                <Text style={[styles.phoneCardSub, isDark && styles.darkSubtitle]}>Send money instantly over any distance using the recipient's phone number.</Text>
                
                <TextInput
                  style={[styles.phoneInput, isDark && styles.darkInput]}
                  placeholder="Recipient Phone Number"
                  placeholderTextColor={isDark ? "#888" : "#999"}
                  keyboardType="phone-pad"
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                />

                <TouchableOpacity 
                  style={styles.searchBtn} 
                  onPress={handlePhoneLookup}
                  disabled={searchingUser}
                >
                  {searchingUser ? <ActivityIndicator size="small" color="#FFF" /> : (
                    <>
                      <Ionicons name="search" size={20} color="#FFF" style={{ marginRight: 8 }} />
                      <Text style={styles.searchBtnText}>Find Recipient</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      ) : receiverInfo && !receiptPayload && !onlineSuccess ? (
        <ScrollView style={styles.formContainer}>
          <View style={[styles.walletCard, { backgroundColor: isOnline ? '#2D46B9' : '#1A2A6C' }]}>
            <Text style={styles.walletLabel}>{isOnline ? 'Online Balance' : 'Offline Balance'}</Text>
            <Text style={styles.walletAmount}>रू {isOnline ? balance.online.toLocaleString() : balance.offline.toLocaleString()}</Text>
            {!isOnline && availableBonds.length > 0 && (
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 10 }}>
                Bonds: {getDenominationsString(availableBonds)}
              </Text>
            )}
          </View>

          <View style={[styles.recipientCard, isDark && styles.darkRecipientCard]}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{receiverInfo.displayName.charAt(0)}</Text>
            </View>
            <View style={styles.recipientInfo}>
              <Text style={[styles.recipientName, isDark && styles.darkText]}>{receiverInfo.displayName}</Text>
              <Text style={[styles.recipientId, isDark && styles.darkSubtitle]}>ID: {receiverInfo.userId.substring(0,8)}...</Text>
              <Text style={{ fontSize: 11, color: '#F39C12', fontWeight: 'bold', marginTop: 4 }}>{getWorkflowMode()}</Text>
            </View>
            <TouchableOpacity onPress={() => { setReceiverInfo(null); handleRescan(); resetBleState(); }}>
              <Text style={styles.changeText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.amountContainer}>
            <Text style={[styles.amountLabel, isDark && styles.darkSubtitle]}>Amount to pay</Text>
            <TextInput
               style={[styles.amountInput, isDark && styles.darkText, isDark && { borderColor: '#333' }]}
               value={editableAmount}
               onChangeText={setEditableAmount}
               keyboardType="numeric"
               placeholder="0"
               placeholderTextColor={isDark ? "#666" : "#CCC"}
            />
          </View>

          <View style={styles.messageContainer}>
            <TextInput
               style={[styles.messageInput, isDark && styles.darkInput]}
               value={message}
               onChangeText={setMessage}
               placeholder="What's this for? (Optional)"
               placeholderTextColor={isDark ? "#888" : "#999"}
               maxLength={100}
            />
          </View>

          <View style={{ height: 40 }} />

          <TouchableOpacity 
            style={styles.sendButton} 
            onPress={() => {
              const rxMode = receiverInfo?.mode || 'offline';
              if (isOnline && rxMode === 'online') {
                processOnlinePayment();
              } else if (isOnline && rxMode === 'offline') {
                processOnlineOfflinePayment();
              } else {
                processOfflinePayment();
              }
            }}
            disabled={loading}
          >
            {loading ? <ActivityIndicator size="small" color="#FFF" /> : (
               <>
                 <Text style={styles.sendButtonText}>
                   {(isOnline && receiverInfo?.mode === 'online') ? 'Confirm Transfer' : 'Confirm & Generate Receipt'}
                 </Text>
                 <Ionicons name="chevron-forward-outline" size={20} color="#FFF" />
               </>
            )}
          </TouchableOpacity>
        </ScrollView>
      ) : onlineSuccess ? (
        <View style={styles.receiptContainer}>
          <View style={styles.successHeader}>
            <Ionicons name="checkmark-circle" size={80} color="#2ECC71" />
            <Text style={styles.successTitle}>Transfer Successful!</Text>
            <Text style={styles.successSub}>You sent रू {editableAmount} to {receiverInfo?.displayName}.</Text>
          </View>
          <TouchableOpacity style={styles.doneButton} onPress={() => navigation.goBack()}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : receiptPayload ? (
        <ScrollView contentContainerStyle={styles.receiptContainer}>
          {isBleSending ? (
            <View style={[styles.qrCard, isDark && styles.darkQrCard, { minHeight: 320, justifyContent: 'center', paddingVertical: 40 }]}>
              <Ionicons name="bluetooth" size={64} color="#2D46B9" style={{ marginBottom: 15 }} />
              <ActivityIndicator size="small" color="#2D46B9" style={{ marginBottom: 15 }} />
              <Text style={[styles.bleProgressTitle, isDark && styles.darkText]}>
                Sending via Bluetooth P2P
              </Text>
              <Text style={[styles.bleProgressStep, isDark && styles.darkSubtitle]}>
                {bleProgressStep}
              </Text>
              <View style={styles.bleProgressBg}>
                <View style={[styles.bleProgressFill, { width: `${bleProgressPercent}%` }]} />
              </View>
              <Text style={[styles.bleProgressPercent, isDark && styles.darkText]}>
                {bleProgressPercent}%
              </Text>

              <TouchableOpacity 
                style={[styles.verifyButton, { backgroundColor: '#7F8C8D', marginTop: 25, width: '100%' }]}
                onPress={() => setIsBleSending(false)}
              >
                <Ionicons name="qr-code-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.verifyButtonText}>Show QR Code Instead</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.successHeader}>
                <Ionicons name="checkmark-circle" size={60} color="#4CAF50" />
                <Text style={styles.successTitle}>Payment Processed</Text>
                <Text style={[styles.successSub, isDark && styles.darkSubtitle]}>Show this QR code sequence to the receiver to finalize.</Text>
              </View>

              <View style={[styles.qrCard, isDark && styles.darkQrCard]}>
                <MultiQRDisplay 
                  payload={receiptPayload} 
                  delayMs={sysConfig?.qr_switching_delay || 333} 
                  size={220}
                />
                <Text style={[styles.receiptAmount, isDark && styles.darkText]}>रू {editableAmount}</Text>
                <Text style={[styles.receiptTo, isDark && styles.darkSubtitle]}>To: {receiverInfo?.displayName}</Text>
              </View>
            </>
          )}

          <TouchableOpacity 
            style={styles.doneButton} 
            onPress={() => {
              resetBleState();
              navigation.goBack();
            }}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  darkContainer: { backgroundColor: '#121212' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  darkHeader: { backgroundColor: '#1E1E1E', borderBottomColor: '#333' },
  backButton: { padding: 5 },
  headerTitle: { color: '#000', fontSize: 18, fontWeight: 'bold' },
  darkText: { color: '#FFF' },
  darkSubtitle: { color: '#AAA' },
  amountLabel: { fontSize: 16, color: '#666', marginBottom: 10 },
  cameraContainer: { flex: 1, overflow: 'hidden', margin: 20, backgroundColor: '#EEE', position: 'relative', borderRadius: 16 },
  scanLabelTop: { position: 'absolute', top: 20, alignSelf: 'center', zIndex: 10, color: '#FFF', fontSize: 16, fontWeight: 'bold', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
  modeBadgeContainer: { position: 'absolute', top: 70, alignSelf: 'center', zIndex: 10 },
  modeBadge: { paddingHorizontal: 15, paddingVertical: 5, borderRadius: 20, color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  reticleContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  reticle: { width: 250, height: 250, borderWidth: 2, borderColor: '#2D46B9', backgroundColor: 'rgba(45,70,185,0.1)' },
  rescanButton: { position: 'absolute', bottom: 30, alignSelf: 'center', backgroundColor: '#333', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  rescanButtonText: { color: '#FFF', fontWeight: 'bold' },
  formContainer: { flex: 1, padding: 20 },
  walletCard: { padding: 25, borderRadius: 12, marginBottom: 20 },
  walletLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  walletAmount: { color: '#FFF', fontSize: 24, fontWeight: 'bold', marginTop: 5 },
  recipientCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9F9F9', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#EEE', marginBottom: 30 },
  darkRecipientCard: { backgroundColor: '#1E1E1E', borderColor: '#333' },
  avatar: { width: 40, height: 40, backgroundColor: '#333', borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  avatarText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  recipientInfo: { flex: 1 },
  recipientName: { fontSize: 16, fontWeight: '600', color: '#000' },
  recipientId: { fontSize: 12, color: '#888' },
  changeText: { color: '#D32F2F', fontWeight: 'bold', fontSize: 14 },
  amountContainer: { alignItems: 'center', marginVertical: 20 },
  amountInput: { fontSize: 48, fontWeight: 'bold', color: '#2D46B9', textAlign: 'center', minWidth: 150, borderBottomWidth: 2, borderColor: '#EEE' },
  messageContainer: { marginVertical: 10 },
  messageInput: { backgroundColor: '#F5F5F5', borderRadius: 8, padding: 15, fontSize: 16, color: '#333' },
  darkInput: { backgroundColor: '#333', color: '#FFF' },
  sendButton: { backgroundColor: '#2D46B9', padding: 20, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  sendButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginRight: 10 },
  receiptContainer: { flexGrow: 1, alignItems: 'center', padding: 20, justifyContent: 'center' },
  successHeader: { alignItems: 'center', marginBottom: 30 },
  successTitle: { fontSize: 22, fontWeight: 'bold', color: '#2ECC71', marginTop: 10 },
  successSub: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 5 },
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
  receiptAmount: { fontSize: 32, fontWeight: 'bold', color: '#000' },
  receiptTo: { fontSize: 16, color: '#666', marginTop: 5 },
  doneButton: { backgroundColor: '#2D46B9', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 12, width: '100%', alignItems: 'center' },
  doneButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  tabContainer: { flexDirection: 'row', justifyContent: 'center', backgroundColor: '#F5F6FA', borderRadius: 10, padding: 4, marginHorizontal: 20, marginTop: 10, marginBottom: 15 },
  tabButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 10, borderRadius: 8 },
  tabButtonActive: { backgroundColor: '#2D46B9' },
  darkTabButton: { backgroundColor: '#1E1E1E' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#666' },
  tabTextActive: { color: '#FFF' },
  phoneFormContainer: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 10 },
  phoneCard: { backgroundColor: '#FFFFFF', padding: 25, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#EEEEEE', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  darkPhoneCard: { backgroundColor: '#1E1E1E', borderColor: '#333' },
  phoneCardTitle: { fontSize: 20, fontWeight: 'bold', color: '#000', marginBottom: 10 },
  phoneCardSub: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 25, lineHeight: 18 },
  phoneInput: { width: '100%', backgroundColor: '#F5F6FA', color: '#000', padding: 16, borderRadius: 12, fontSize: 16, borderWidth: 1, borderColor: '#EEE', marginBottom: 20, textAlign: 'center' },
  searchBtn: { flexDirection: 'row', backgroundColor: '#2D46B9', paddingVertical: 15, width: '100%', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  searchBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  bleProgressTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2D46B9',
    marginBottom: 8,
  },
  bleProgressStep: {
    fontSize: 13,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  bleProgressBg: {
    width: '80%',
    height: 8,
    backgroundColor: '#E1E4E8',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  bleProgressFill: {
    height: '100%',
    backgroundColor: '#2D46B9',
  },
  bleProgressPercent: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
  },
  verifyButton: {
    flexDirection: 'row',
    backgroundColor: '#E74C3C',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
