import 'react-native-get-random-values';
import { Buffer } from 'buffer';
global.Buffer = Buffer;
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Platform,
  SafeAreaView,
  Dimensions,
  Clipboard,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';

// Local database imports
import {
  initializeLocalDatabase,
  getAvailableBonds,
  insertBond,
  insertTransaction,
  insertTransactionBond,
  getAllTransactions,
  getAllBonds,
  updateBondStatus,
} from './src/database/db';

// Cryptographic imports
import {
  generateUserKeyPair,
  signTransaction,
  verifySenderSignature,
  signBondWithServerKey,
  getPrivateKey,
} from './src/services/crypto.service';

// Algorithm imports
import { solveExactChange, generateSecureNonce } from './src/utils/algorithms';

// Service API imports
import {
  register as apiRegister,
  login as apiLogin,
  issueBonds as apiIssueBonds,
  syncBatch as apiSyncBatch,
  setAuthToken,
} from './src/services/api.service';

// Sync service helper
import { syncWithServer, isCurrentlySyncing } from './src/services/sync.service';

const { width } = Dimensions.get('window');

// Default user profiles for local testing & P2P simulation
const USER_A_ID = 'user_01hj8w6t4d0z9r4e5k7q7b1f3a'; // Sender
const USER_B_ID = 'user_01hj8w7p5d1y8t3e4a2b9c5f6e'; // Merchant/Receiver

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'wallet' | 'send' | 'receive' | 'sync'>('wallet');
  
  // Active User Context (allows testing both Sender and Receiver perspectives in-app)
  const [activeUser, setActiveUser] = useState<'A' | 'B'>('A');
  const userId = activeUser === 'A' ? USER_A_ID : USER_B_ID;
  const otherUserId = activeUser === 'A' ? USER_B_ID : USER_A_ID;

  // Wallet State
  const [balance, setBalance] = useState<number>(0);
  const [availableBonds, setAvailableBonds] = useState<any[]>([]);
  const [transactionsList, setTransactionsList] = useState<any[]>([]);
  const [allUserBonds, setAllUserBonds] = useState<any[]>([]);

  // Send Form State
  const [sendAmount, setSendAmount] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [manualQRText, setManualQRText] = useState<string>('');

  // Receive Form State
  const [receiveAmount, setReceiveAmount] = useState<string>('');
  const [activeReceiveSession, setActiveReceiveSession] = useState<any | null>(null);

  // Sync / Cloud Setup State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isSyncingState, setIsSyncingState] = useState(false);
  const [onlineBalance, setOnlineBalance] = useState(0);

  // BLE / Mock Protocol Simulation Log Trace
  const [simulationLogs, setSimulationLogs] = useState<string[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);

  // 1. Initialize DB & Keys
  useEffect(() => {
    async function init() {
      try {
        await initializeLocalDatabase();
        
        // Pre-generate cryptographic keys for both mock users if not present
        const pubKeyA = await generateUserKeyPair(USER_A_ID);
        const pubKeyB = await generateUserKeyPair(USER_B_ID);
        console.log('Keys configured:', { pubKeyA, pubKeyB });

        setDbReady(true);
        loadWalletData();
      } catch (err) {
        setError('Database initialization failed');
        console.error(err);
      }
    }
    init();
  }, []);

  // Reload wallet data when switching tabs/profiles
  useEffect(() => {
    if (dbReady) {
      loadWalletData();
    }
  }, [dbReady, activeUser, activeTab]);

  const loadWalletData = async () => {
    try {
      const bonds = await getAvailableBonds(userId);
      const allB = await getAllBonds(userId);
      const txs = await getAllTransactions(userId);
      
      const total = bonds.reduce((sum, b) => sum + b.value, 0);
      setBalance(total);
      setAvailableBonds(bonds);
      setAllUserBonds(allB);
      setTransactionsList(txs);
    } catch (err) {
      console.error('Failed to load wallet data:', err);
    }
  };

  const addLog = (msg: string) => {
    setSimulationLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  // Seeder: Fund wallet locally with signed bonds
  const seedMockBonds = async () => {
    try {
      addLog('Generating Rs. 50.00 (5000 Paisa) of server-signed bonds...');
      const denominations = [1000, 1000, 1000, 500, 500, 500, 200, 200, 100, 50, 50];
      const issuedAt = Math.floor(Date.now() / 1000);
      const expiresAt = issuedAt + 72 * 3600; // 72 hours TTL

      for (const val of denominations) {
        const bondId = `BOND-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        // Sign using server keys internally
        const serverSig = await signBondWithServerKey(bondId, val, userId, issuedAt, expiresAt);
        
        await insertBond({
          bondId,
          value: val,
          ownerId: userId,
          currentOwnerId: userId,
          issuedAt,
          expiresAt,
          issuedByServer: '365f48509ab750f7bc01a32336216b2cb3ad26616e3a757945bd9b874e3daf2d',
          serverSignature: serverSig,
          status: 'available',
        });
      }
      
      Alert.alert('Success', 'Loaded 5000 Paisa of server-signed bonds locally!');
      loadWalletData();
    } catch (err) {
      Alert.alert('Error', 'Seeding bonds failed');
      console.error(err);
    }
  };

  // Simulate Cloud Topup
  const simulateOnlineBalance = () => {
    setOnlineBalance((prev) => prev + 10000); // Add 10,000 Paisa (Rs 100) online
    Alert.alert('Online Wallet Topup', 'Added 10,000 Paisa to online balance.');
  };

  // Connect to Local Express Backend & Load Real Bonds
  const loadBondsFromServer = async () => {
    if (!isLoggedIn) {
      Alert.alert('Sync Required', 'Please register or login to connect to the backend server.');
      return;
    }

    try {
      addLog('Requesting bond issuance from cloud server...');
      const response = await apiIssueBonds(5000); // Issue 5000 Paisa
      
      for (const b of response.bonds) {
        await insertBond({
          bondId: b.bondId,
          value: b.value,
          ownerId: b.ownerId,
          currentOwnerId: userId,
          issuedAt: b.issuedAt,
          expiresAt: b.expiresAt,
          issuedByServer: b.issuedByServer,
          serverSignature: b.serverSignature,
          status: 'available',
        });
      }

      setOnlineBalance(response.newOnlineBalance);
      Alert.alert('Success', 'Successfully issued and loaded bonds from Express Server!');
      loadWalletData();
    } catch (err: any) {
      Alert.alert('Issuance Failed', err.error || 'Server error. Is the server running?');
    }
  };

  // Trigger Online clearing of offline transactions
  const syncOfflineTransactions = async () => {
    if (!isLoggedIn) {
      Alert.alert('Sync Required', 'Please login to sync transactions with PostgreSQL.');
      return;
    }
    
    setIsSyncingState(true);
    try {
      addLog('Syncing offline transaction logs with PostgreSQL database...');
      const result = await syncWithServer();
      if (result) {
        Alert.alert(
          'Sync Completed',
          `Accepted: ${result.accepted.length}\nRejected: ${result.rejected.length}\nFlagged (Double Spend): ${result.flagged.length}`
        );
      } else {
        Alert.alert('Sync Completed', 'No pending transactions to clear.');
      }
      loadWalletData();
    } catch (err) {
      Alert.alert('Sync Failed', 'Could not reach server.');
    } finally {
      setIsSyncingState(false);
    }
  };

  // Local Offline BLE Handshake & Transfer Simulation
  const executeSimulation = async (amount: number, sessionMetadata: any) => {
    setIsSimulating(true);
    setSimulationLogs([]);
    addLog(`Starting BLE Offline Handshake simulation to transfer ${amount} Paisa...`);

    try {
      // 1. Solve Exact Change
      await new Promise((resolve) => setTimeout(resolve, 600));
      addLog('GATT Central: Searching for available denominations matching amount...');
      const selectedBonds = solveExactChange(availableBonds, amount);
      
      if (!selectedBonds) {
        addLog('ERROR: exact change breakdown not possible with current denominations.');
        setIsSimulating(false);
        Alert.alert('Error', 'No exact change combination matches this amount!');
        return;
      }
      
      addLog(`Subset-Sum Solver found match: ${selectedBonds.length} bonds. Resolving:`);
      selectedBonds.forEach(b => addLog(` - ${b.bondId} (${b.value} Paisa)`));

      // 2. Handshake Phase
      await new Promise((resolve) => setTimeout(resolve, 800));
      addLog('GATT Client: Sending STAGE_HANDSHAKE...');
      addLog('GATT Server: ACK_HANDSHAKE received.');

      // 3. Metadata Phase
      await new Promise((resolve) => setTimeout(resolve, 800));
      addLog('GATT Client: Sending MTU configuration (MTU size: 512 bytes).');
      addLog(`GATT Client: Payload metadata - Total segments: ${Math.ceil(JSON.stringify(selectedBonds).length / 508)}.`);

      // 4. Cryptographic Signatures inside Secure Enclave
      await new Promise((resolve) => setTimeout(resolve, 900));
      addLog('Secure Enclave: Computing transaction hash...');
      const nonce = generateSecureNonce();
      const txId = `TX-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      const timestamp = Math.floor(Date.now() / 1000);
      
      const sortedBondIds = selectedBonds.map(b => b.bondId).sort().join(',');
      const txPayload = `${txId}:${userId}:${otherUserId}:${amount}:${timestamp}:${nonce}:${sortedBondIds}`;
      
      addLog('Secure Enclave: Generating Ed25519 signature of transaction...');
      const signature = await signTransaction(txPayload, userId);
      if (!signature) throw new Error('Signature generation failed');
      addLog(`Signature generated: ${signature.slice(0, 20)}...`);

      // 5. Send chunks over Bluetooth
      await new Promise((resolve) => setTimeout(resolve, 1000));
      addLog('GATT Client: Streaming transaction payload over data characteristic (003)...');
      addLog(' - Packet 1: Handshake and Security context sent.');
      addLog(' - Packet 2: Bond structures and signatures stream started.');
      addLog(' - Packet 3: Payload chunks complete.');

      // 6. Server/Receiver processes and validates signatures
      await new Promise((resolve) => setTimeout(resolve, 1000));
      addLog('GATT Server: Validating server signature version v1 on incoming bonds...');
      // Validate each bond
      addLog('GATT Server: Verifying transaction signature using Sender Public Key...');
      
      const senderPubKey = await generateUserKeyPair(userId); // Get public key
      const sigValid = await verifySenderSignature(txPayload, signature, senderPubKey);
      addLog(`GATT Server: Signature verification: ${sigValid ? 'SUCCESS' : 'FAILED'}`);

      if (!sigValid) {
        throw new Error('Receiver signature validation failed');
      }

      // 7. Update SQLite
      addLog('GATT Server: Writing transaction and bonds metadata to database...');
      
      // Update Sender Bonds -> Spent
      for (const b of selectedBonds) {
        await updateBondStatus(b.bondId, 'spent', txId);
        // Insert bond duplicate for Receiver
        await insertBond({
          ...b,
          currentOwnerId: otherUserId,
          status: 'received_pending_sync',
          localTxId: txId,
          receivedAt: timestamp,
        });
      }

      // Record transaction
      const transactionRecord = {
        txId,
        senderId: userId,
        receiverId: otherUserId,
        totalAmount: amount,
        timestamp,
        nonce,
        senderPublicKey: senderPubKey,
        senderSignature: signature,
        role: activeUser === 'A' ? 'sender' as const : 'receiver' as const,
        syncStatus: 'pending' as const,
        createdAt: timestamp,
      };

      await insertTransaction(transactionRecord);

      // Link transaction bonds
      for (const b of selectedBonds) {
        await insertTransactionBond({
          txId,
          bondId: b.bondId,
          direction: 'outgoing',
        });
      }

      addLog('GATT Server: Sending ACK_COMPLETE. Closing BLE session...');
      addLog('GATT Central: BLE Connection terminated gracefully.');
      setIsSimulating(false);
      
      Alert.alert(
        'Payment Sent',
        `Successfully transferred ${amount} Paisa offline. Switch profiles to see changes in Receiver wallet!`
      );
      loadWalletData();
    } catch (err) {
      addLog(`ERROR: Transaction failed. Details: ${err}`);
      setIsSimulating(false);
    }
  };

  // Perform a Real BLE scan using the camera code scanned from QR
  const handleRealBLETransfer = async (qrData: string) => {
    try {
      const session = JSON.parse(qrData);
      if (!session.requestedAmount || !session.receiverId) {
        Alert.alert('Error', 'Invalid QR code schema.');
        return;
      }
      
      Alert.alert(
        'Session Detected',
        `Initiating BLE connection to Receiver: ${session.receiverId.slice(0, 8)}\nAmount: ${session.requestedAmount} Paisa.\nPress proceed to start simulation of actual protocol over this session details.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Proceed', onPress: () => executeSimulation(session.requestedAmount, session) }
        ]
      );
    } catch (err) {
      Alert.alert('Scan Error', 'Could not parse scanned QR details.');
    }
  };

  // Receive Session Generation
  const createReceiveSession = () => {
    const amountNum = parseInt(receiveAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Invalid Amount', 'Please type a valid amount of Paisa to receive.');
      return;
    }
    
    const newSession = {
      receiverId: userId,
      sessionId: `SESS-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      serviceUUID: 'E3F1C990-2B3A-4D78-95D9-23CE6305C001',
      nonce: generateSecureNonce(),
      timestamp: Math.floor(Date.now() / 1000),
      protocolVersion: 1,
      requestedAmount: amountNum,
    };
    
    setActiveReceiveSession(newSession);
    addLog(`BLE GATT server opened. Advertising Service UUID ${newSession.serviceUUID}`);
  };

  // Cloud API Register / Login
  const handleRegister = async () => {
    try {
      const pubKey = await generateUserKeyPair(userId);
      const res = await apiRegister(phoneNumber, email, fullName, password, pubKey, 'mobile_dev_1');
      setAuthToken(res.jwt);
      setIsLoggedIn(true);
      Alert.alert('Success', 'Registered successfully!');
    } catch (err: any) {
      Alert.alert('Failed', err.error || 'Server error.');
    }
  };

  const handleLogin = async () => {
    try {
      const res = await apiLogin(email, password, 'mobile_dev_1');
      setAuthToken(res.jwt);
      setIsLoggedIn(true);
      setOnlineBalance(res.onlineBalance);
      Alert.alert('Success', `Logged in! Online Balance: ${res.onlineBalance} Paisa`);
    } catch (err: any) {
      Alert.alert('Failed', err.error || 'Server error.');
    }
  };

  // Main UI render
  if (error) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar style="light" />
        <Text style={styles.errorText}>{error}</Text>
      </SafeAreaView>
    );
  }

  if (!dbReady) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Initializing BondPay local database...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      
      {/* Header bar */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>BondPay</Text>
          <Text style={styles.headerSubtitle}>Offline P2P Secure Bonds</Text>
        </View>
        
        {/* Toggle User Profile switch */}
        <TouchableOpacity
          style={styles.profileToggle}
          onPress={() => setActiveUser(activeUser === 'A' ? 'B' : 'A')}
        >
          <Text style={styles.profileToggleLabel}>Active Profile</Text>
          <Text style={styles.profileToggleValue}>
            {activeUser === 'A' ? 'User A (Sender)' : 'User B (Receiver)'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Tabs content */}
      <ScrollView style={styles.contentContainer} contentContainerStyle={{ paddingBottom: 32 }}>
        
        {activeTab === 'wallet' && (
          <View>
            {/* Wallet balance Card */}
            <View style={styles.balanceCard}>
              <Text style={styles.balanceTitle}>OFFLINE BALANCE</Text>
              <Text style={styles.balanceAmount}>
                Rs. {(balance / 100).toFixed(2)}
              </Text>
              <Text style={styles.balanceSubtext}>
                {balance} Paisa | {availableBonds.length} cryptographically secure bonds
              </Text>

              {availableBonds.length === 0 && (
                <TouchableOpacity style={styles.seedButton} onPress={seedMockBonds}>
                  <Text style={styles.seedButtonText}>Seed 5000 Paisa (Mock Bonds)</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* List of Bonds */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Local Bonds inventory</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bondsRow}>
              {allUserBonds.length === 0 ? (
                <Text style={styles.emptyText}>No bonds currently in wallet database.</Text>
              ) : (
                allUserBonds.map((bond, idx) => (
                  <View
                    key={bond.bondId}
                    style={[
                      styles.bondCard,
                      bond.status === 'spent' ? styles.bondSpent : 
                      bond.status === 'received_pending_sync' ? styles.bondPending : null
                    ]}
                  >
                    <Text style={styles.bondValue}>{bond.value} Paisa</Text>
                    <Text style={styles.bondIdLabel}>{bond.bondId.slice(0, 12)}...</Text>
                    <View style={[
                      styles.bondStatusBadge,
                      bond.status === 'available' ? styles.badgeAvailable :
                      bond.status === 'spent' ? styles.badgeSpent : styles.badgePending
                    ]}>
                      <Text style={styles.bondStatusText}>{bond.status}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            {/* List of Transactions */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Transaction History</Text>
            </View>

            {transactionsList.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.emptyText}>No offline transactions logged yet.</Text>
              </View>
            ) : (
              transactionsList.map((tx) => (
                <View key={tx.txId} style={styles.txCard}>
                  <View style={styles.txHeader}>
                    <Text style={styles.txId}>{tx.txId}</Text>
                    <Text style={[
                      styles.txBadge,
                      tx.syncStatus === 'synced' ? styles.txSynced : styles.txPending
                    ]}>
                      {tx.syncStatus}
                    </Text>
                  </View>
                  <View style={styles.txBody}>
                    <Text style={styles.txDetail}>
                      {tx.role === 'sender' ? 'Sent to' : 'Received from'}:{' '}
                      {tx.role === 'sender' ? tx.receiverId.slice(0, 10) : tx.senderId.slice(0, 10)}...
                    </Text>
                    <Text style={styles.txAmount}>
                      {tx.role === 'sender' ? '-' : '+'} Rs. {(tx.totalAmount / 100).toFixed(2)}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === 'send' && (
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Send Payment Offline</Text>
              <Text style={styles.label}>Amount to Send (Paisa):</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 1500"
                placeholderTextColor="#64748B"
                keyboardType="numeric"
                value={sendAmount}
                onChangeText={setSendAmount}
              />

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: '#3B82F6' }]}
                  onPress={async () => {
                    const amt = parseInt(sendAmount);
                    if (isNaN(amt) || amt <= 0) {
                      Alert.alert('Invalid Amount', 'Enter valid amount.');
                      return;
                    }
                    executeSimulation(amt, {});
                  }}
                >
                  <Text style={styles.actionButtonText}>Mock Send (Local P2P)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: '#10B981' }]}
                  onPress={async () => {
                    if (!cameraPermission || !cameraPermission.granted) {
                      const res = await requestCameraPermission();
                      if (!res.granted) {
                        Alert.alert('Permission Denied', 'Camera permission required to scan receiver QR.');
                        return;
                      }
                    }
                    setIsScanning(true);
                  }}
                >
                  <Text style={styles.actionButtonText}>Scan Receiver QR</Text>
                </TouchableOpacity>
              </View>

              {/* Camera Scanner View */}
              {isScanning && (
                <View style={styles.scannerWrapper}>
                  <CameraView
                    style={StyleSheet.absoluteFillObject}
                    onBarcodeScanned={({ data }) => {
                      setIsScanning(false);
                      handleRealBLETransfer(data);
                    }}
                  />
                  <TouchableOpacity
                    style={styles.closeScannerButton}
                    onPress={() => setIsScanning(false)}
                  >
                    <Text style={styles.closeScannerText}>Cancel Scan</Text>
                  </TouchableOpacity>
                </View>
              )}

              <Text style={styles.orText}>- OR INPUT QR MANUAL DETAILS -</Text>
              <TextInput
                style={[styles.input, { height: 60 }]}
                placeholder="Paste Session JSON payload here"
                placeholderTextColor="#64748B"
                value={manualQRText}
                onChangeText={setManualQRText}
              />
              <TouchableOpacity
                style={styles.simulateButton}
                onPress={() => handleRealBLETransfer(manualQRText)}
              >
                <Text style={styles.simulateButtonText}>Connect using Manual QR Text</Text>
              </TouchableOpacity>
            </View>

            {/* Trace logs */}
            {(isSimulating || simulationLogs.length > 0) && (
              <View style={styles.consoleCard}>
                <Text style={styles.consoleTitle}>BLE Handshake Console Trace</Text>
                {simulationLogs.map((log, i) => (
                  <Text key={i} style={styles.consoleLogLine}>{log}</Text>
                ))}
                {isSimulating && <ActivityIndicator color="#3B82F6" style={{ marginTop: 8 }} />}
              </View>
            )}
          </View>
        )}

        {activeTab === 'receive' && (
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Receive Payment Offline</Text>
              <Text style={styles.label}>Amount to Request (Paisa):</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 1500"
                placeholderTextColor="#64748B"
                keyboardType="numeric"
                value={receiveAmount}
                onChangeText={setReceiveAmount}
              />

              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: '#10B981' }]}
                onPress={createReceiveSession}
              >
                <Text style={styles.primaryButtonText}>Generate Payment QR Session</Text>
              </TouchableOpacity>

              {activeReceiveSession && (
                <View style={styles.qrSection}>
                  <Text style={styles.label}>Share this QR containing BLE Session Details:</Text>
                  
                  {/* Generated QR code image */}
                  <View style={styles.qrCodeContainer}>
                    <Text style={{ color: '#94A3B8', marginBottom: 8, fontSize: 12 }}>
                      (Scannable by other devices)
                    </Text>
                    {/* Rendered using API */}
                    <Text style={styles.sessionBox}>
                      {JSON.stringify(activeReceiveSession, null, 2)}
                    </Text>
                    
                    <TouchableOpacity
                      style={styles.copyButton}
                      onPress={() => {
                        Clipboard.setString(JSON.stringify(activeReceiveSession));
                        Alert.alert('Copied', 'Session JSON copied to clipboard!');
                      }}
                    >
                      <Text style={styles.copyButtonText}>Copy Session JSON</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.statusLabel}>BLE GATT Server Status: </Text>
                  <Text style={styles.statusValue}>ADVERTISING (Central connects automatically)</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {activeTab === 'sync' && (
          <View>
            {/* Supabase backend configs */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Supabase Cloud Integration</Text>
              <Text style={styles.cardSub}>
                Connect local SQLite and sign offline transaction logs directly with backend PostgreSQL audit DB.
              </Text>

              {!isLoggedIn ? (
                <View>
                  <TextInput
                    style={styles.input}
                    placeholder="Full name (Registration only)"
                    placeholderTextColor="#64748B"
                    value={fullName}
                    onChangeText={setFullName}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Phone number (Registration only)"
                    placeholderTextColor="#64748B"
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor="#64748B"
                    value={email}
                    onChangeText={setEmail}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor="#64748B"
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                  />

                  <View style={styles.buttonRow}>
                    <TouchableOpacity style={styles.actionButton} onPress={handleLogin}>
                      <Text style={styles.actionButtonText}>Login</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton} onPress={handleRegister}>
                      <Text style={styles.actionButtonText}>Register</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View>
                  <Text style={styles.loggedInLabel}>Logged in as: {email}</Text>
                  <Text style={styles.onlineBalanceText}>
                    Online Balance: Rs. {(onlineBalance / 100).toFixed(2)} ({onlineBalance} Paisa)
                  </Text>

                  <View style={styles.buttonCol}>
                    <TouchableOpacity style={styles.primaryButton} onPress={simulateOnlineBalance}>
                      <Text style={styles.primaryButtonText}>Add Fund (Simulated Rs. 100)</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.primaryButton, { backgroundColor: '#3B82F6' }]}
                      onPress={loadBondsFromServer}
                    >
                      <Text style={styles.primaryButtonText}>Load Rs. 50.00 of Cryptographic Bonds</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.primaryButton, { backgroundColor: '#10B981' }]}
                      onPress={syncOfflineTransactions}
                      disabled={isSyncingState}
                    >
                      {isSyncingState ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryButtonText}>Clear Offline Transactions (Sync)</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Tabs Navigator Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'wallet' && styles.tabActive]}
          onPress={() => setActiveTab('wallet')}
        >
          <Text style={[styles.tabText, activeTab === 'wallet' && styles.tabTextActive]}>Wallet</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'send' && styles.tabActive]}
          onPress={() => setActiveTab('send')}
        >
          <Text style={[styles.tabText, activeTab === 'send' && styles.tabTextActive]}>Send</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'receive' && styles.tabActive]}
          onPress={() => setActiveTab('receive')}
        >
          <Text style={[styles.tabText, activeTab === 'receive' && styles.tabTextActive]}>Receive</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'sync' && styles.tabActive]}
          onPress={() => setActiveTab('sync')}
        >
          <Text style={[styles.tabText, activeTab === 'sync' && styles.tabTextActive]}>Sync</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#3B82F6',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  profileToggle: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'flex-end',
  },
  profileToggleLabel: {
    fontSize: 9,
    color: '#64748B',
    textTransform: 'uppercase',
  },
  profileToggleValue: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#10B981',
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  balanceCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  balanceTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  balanceSubtext: {
    fontSize: 12,
    color: '#64748B',
  },
  seedButton: {
    marginTop: 16,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  seedButtonText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionHeader: {
    marginBottom: 12,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  bondsRow: {
    marginBottom: 20,
  },
  bondCard: {
    backgroundColor: '#1E293B',
    width: 130,
    height: 100,
    borderRadius: 12,
    padding: 12,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'space-between',
  },
  bondSpent: {
    opacity: 0.4,
    borderColor: '#EF4444',
  },
  bondPending: {
    borderColor: '#F59E0B',
  },
  bondValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  bondIdLabel: {
    fontSize: 10,
    color: '#64748B',
  },
  bondStatusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeAvailable: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  badgeSpent: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  badgePending: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  bondStatusText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#F8FAFC',
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  cardSub: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0F172A',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#F8FAFC',
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 0.48,
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: '#F8FAFC',
    fontWeight: '600',
    fontSize: 12,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#F8FAFC',
    fontWeight: 'bold',
    fontSize: 14,
  },
  buttonCol: {
    marginTop: 8,
  },
  emptyText: {
    color: '#64748B',
    textAlign: 'center',
    paddingVertical: 20,
  },
  txCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  txHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  txId: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  txBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  txSynced: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    color: '#10B981',
  },
  txPending: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    color: '#F59E0B',
  },
  txBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txDetail: {
    fontSize: 14,
    color: '#F8FAFC',
  },
  txAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  orText: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 11,
    marginVertical: 12,
    fontWeight: '600',
  },
  simulateButton: {
    backgroundColor: '#475569',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  simulateButtonText: {
    color: '#F8FAFC',
    fontWeight: '600',
    fontSize: 12,
  },
  scannerWrapper: {
    height: 250,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 16,
    position: 'relative',
  },
  closeScannerButton: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  closeScannerText: {
    color: '#EF4444',
    fontWeight: 'bold',
  },
  consoleCard: {
    backgroundColor: '#000',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  consoleTitle: {
    color: '#10B981',
    fontWeight: 'bold',
    fontSize: 13,
    marginBottom: 8,
    letterSpacing: 1,
  },
  consoleLogLine: {
    color: '#34D399',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 11,
    marginBottom: 4,
  },
  qrSection: {
    marginTop: 20,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 20,
  },
  qrCodeContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  sessionBox: {
    backgroundColor: '#0F172A',
    color: '#34D399',
    padding: 12,
    borderRadius: 8,
    width: '100%',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 10,
  },
  copyButton: {
    marginTop: 12,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  copyButtonText: {
    color: '#F8FAFC',
    fontWeight: '600',
    fontSize: 12,
  },
  statusLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 8,
  },
  statusValue: {
    color: '#10B981',
    fontWeight: 'bold',
    fontSize: 12,
    marginTop: 4,
  },
  loggedInLabel: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  onlineBalanceText: {
    color: '#10B981',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    height: 56,
    backgroundColor: '#0F172A',
  },
  tabItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabActive: {
    borderTopWidth: 2,
    borderTopColor: '#3B82F6',
  },
  tabText: {
    fontSize: 12,
    color: '#64748B',
  },
  tabTextActive: {
    color: '#3B82F6',
    fontWeight: 'bold',
  },
});
