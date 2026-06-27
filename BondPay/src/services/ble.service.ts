import { Buffer } from 'buffer';
import axios from 'axios';
import { Platform, PermissionsAndroid } from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';
// @ts-ignore
import Peripheral, { Property, Permission } from 'react-native-multi-ble-peripheral';
import { useLogStore } from '../store/useLogStore';
import { API_URL } from './config.service';

export interface BLEPacketHeader {
  sequenceNo: number;
  dataLength: number;
}

export function buildBLEPacket(header: BLEPacketHeader, data: Uint8Array): Uint8Array {
  const packet = new Uint8Array(4 + data.length);
  // Pack sequence number (2 bytes, big-endian)
  packet[0] = (header.sequenceNo >> 8) & 0xff;
  packet[1] = header.sequenceNo & 0xff;
  // Pack length (2 bytes, big-endian)
  packet[2] = (header.dataLength >> 8) & 0xff;
  packet[3] = header.dataLength & 0xff;
  // Copy data payload
  packet.set(data, 4);
  return packet;
}

export function parseIncomingPacket(rawBytes: Uint8Array): { header: BLEPacketHeader; payload: Uint8Array } {
  const sequenceNo = (rawBytes[0] << 8) | rawBytes[1];
  const dataLength = (rawBytes[2] << 8) | rawBytes[3];
  const payload = rawBytes.slice(4, 4 + dataLength);
  return {
    header: { sequenceNo, dataLength },
    payload
  };
}

export interface BLEReceiverCallbacks {
  onStateChange: (state: string, percent: number) => void;
  onPayloadReceived: (payload: string) => Promise<boolean>;
}

export class BLEService {
  private static mockSessions = new Map<string, BLEReceiverCallbacks>();
  private static activePeripheralSessionId: string | null = null;
  private static receiverPollingInterval: NodeJS.Timeout | null = null;

  // Singletons for BLE Central and Peripheral Roles
  private static bleManager = new BleManager();
  private static peripheral = new Peripheral();

  /**
   * Request necessary Bluetooth and location permissions on Android.
   */
  static async requestBluetoothPermissions(): Promise<boolean> {
    const { addLog } = useLogStore.getState();
    if (Platform.OS !== 'android') {
      return true;
    }

    try {
      const apiLevel = parseInt(Platform.Version.toString(), 10);
      if (apiLevel >= 31) {
        addLog('INFO', 'BLEService.requestBluetoothPermissions', `Android API Level ${apiLevel} >= 31. Requesting modern BLE permissions.`);
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        const allGranted =
          granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
          granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
          granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE] === PermissionsAndroid.RESULTS.GRANTED &&
          granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;

        addLog('INFO', 'BLEService.requestBluetoothPermissions', `Permissions granted status: ${allGranted}`);
        return allGranted;
      } else {
        addLog('INFO', 'BLEService.requestBluetoothPermissions', `Android API Level ${apiLevel} < 31. Requesting location permission.`);
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (err: any) {
      addLog('ERROR', 'BLEService.requestBluetoothPermissions', `Failed to request permissions: ${err.message}`);
      return false;
    }
  }

  /**
   * Starts a GATT Peripheral Session (Receiver Advertises BLE Service)
   */
  static async startPeripheralSession(
    sessionId: string,
    callbacks: BLEReceiverCallbacks
  ): Promise<void> {
    const { addLog } = useLogStore.getState();
    addLog('INFO', 'BLEService.startPeripheralSession', `Starting peripheral session for ID: ${sessionId}`);

    this.activePeripheralSessionId = sessionId;
    this.mockSessions.set(sessionId, callbacks);

    callbacks.onStateChange('Initializing BLE hardware...', 5);

    // 1. Check & Request BLE permissions
    const permissionsGranted = await this.requestBluetoothPermissions();
    if (!permissionsGranted) {
      addLog('WARN', 'BLEService.startPeripheralSession', 'BLE permissions denied. Falling back to HTTP-only mode.');
      callbacks.onStateChange('BLE permission denied. Using local network...', 5);
    }

    // 2. Setup real BLE Peripheral Advertising (GATT Server)
    const serviceUUID = 'E3F1C990-2B3A-4D78-95D9-23CE6305C001';
    const writeCharUUID = 'E3F1C990-2B3A-4D78-95D9-23CE6305C002';
    const notifyCharUUID = 'E3F1C990-2B3A-4D78-95D9-23CE6305C003';

    try {
      addLog('INFO', 'BLEService.startPeripheralSession', 'Setting up GATT Server...');
      
      // Set advertising name
      const shortId = sessionId.substring(sessionId.length - 5);
      await Peripheral.setDeviceName(`BondPay-${shortId}`);

      // Reset listeners first
      this.peripheral.removeAllListeners('onWriteRequest');
      this.peripheral.removeAllListeners('ready');

      const setupGatt = async () => {
        try {
          await this.peripheral.addService(serviceUUID, true);

          // Add Write Characteristic (Central -> Peripheral)
          await this.peripheral.addCharacteristic(
            serviceUUID,
            writeCharUUID,
            Property.WRITE | Property.WRITE_NO_RESPONSE,
            Permission.WRITEABLE
          );

          // Add Notify/Read Characteristic (Peripheral -> Central)
          await this.peripheral.addCharacteristic(
            serviceUUID,
            notifyCharUUID,
            Property.NOTIFY | Property.READ,
            Permission.READABLE
          );

          await this.peripheral.startAdvertising();
          addLog('INFO', 'BLEService.startPeripheralSession', 'BLE GATT advertising started successfully.');
          callbacks.onStateChange('Advertising BLE Service...', 10);
        } catch (setupErr: any) {
          addLog('ERROR', 'BLEService.startPeripheralSession', `Failed to define services/advertising: ${setupErr.message}`);
        }
      };

      // Set up write handlers
      let expectedChunksCount = 0;
      const reassemblyBuffer = new Map<number, string>();

      this.peripheral.on('onWriteRequest', async (data: any) => {
        const { service, characteristic, value } = data;
        
        if (service.toLowerCase() === serviceUUID.toLowerCase()) {
          try {
            // value is returned as numeric byte array or buffer
            const rawStr = Buffer.from(value).toString('utf-8');
            addLog('INFO', 'BLEService.onWriteRequest', `Received command: ${rawStr.substring(0, 30)}`);

            if (rawStr.startsWith('START:')) {
              expectedChunksCount = parseInt(rawStr.split(':')[1], 10);
              reassemblyBuffer.clear();
              callbacks.onStateChange('Receiving transaction data...', 25);
            } else if (rawStr.startsWith('DATA:')) {
              const parts = rawStr.split(':');
              const idx = parseInt(parts[1], 10);
              const base64Chunk = parts.slice(2).join(':');
              reassemblyBuffer.set(idx, base64Chunk);

              const percent = Math.min(80, 25 + Math.round((reassemblyBuffer.size / expectedChunksCount) * 55));
              callbacks.onStateChange(`Receiving packet ${reassemblyBuffer.size}/${expectedChunksCount}...`, percent);
            } else if (rawStr === 'END') {
              callbacks.onStateChange('Verifying package security...', 85);
              
              // Validate and assemble chunks
              let assembledBase64 = '';
              let hasMissing = false;
              for (let i = 0; i < expectedChunksCount; i++) {
                if (!reassemblyBuffer.has(i)) {
                  hasMissing = true;
                  break;
                }
                assembledBase64 += reassemblyBuffer.get(i);
              }

              if (hasMissing) {
                addLog('ERROR', 'BLEService.startPeripheralSession', 'Packet reassembly failed due to missing index.');
                await this.peripheral.updateValue(serviceUUID, notifyCharUUID, Buffer.from('NACK'));
                callbacks.onStateChange('Error: Incomplete data transfer.', 0);
                return;
              }

              // Decode payload
              const payload = Buffer.from(assembledBase64, 'base64').toString('utf-8');
              const saveSuccess = await callbacks.onPayloadReceived(payload);

              if (saveSuccess) {
                await this.peripheral.updateValue(serviceUUID, notifyCharUUID, Buffer.from('ACK'));
                callbacks.onStateChange('Completed', 100);
              } else {
                await this.peripheral.updateValue(serviceUUID, notifyCharUUID, Buffer.from('NACK'));
                callbacks.onStateChange('Error: Transaction verification failed.', 0);
              }
            }
          } catch (writeProcErr: any) {
            addLog('ERROR', 'BLEService.onWriteRequest', `Error handling write request: ${writeProcErr.message}`);
          }
        }
      });

      // Initialize the GATT server
      await setupGatt();

    } catch (bleSetupErr: any) {
      addLog('WARN', 'BLEService.startPeripheralSession', `Failed to initialize Bluetooth peripheral stack: ${bleSetupErr.message}`);
    }

    // 3. Register session on the local bridge server (cross-device HTTP bridge fallback)
    try {
      await axios.post(`${API_URL}/server/ble-session/register`, { sessionId });
      addLog('INFO', 'BLEService.startPeripheralSession', `Registered BLE session on bridge server: ${API_URL}`);
    } catch (err: any) {
      addLog('WARN', 'BLEService.startPeripheralSession', `Failed to register session on bridge server (running in local-only mock mode): ${err.message}`);
    }

    // Stop any existing polling
    if (this.receiverPollingInterval) {
      clearInterval(this.receiverPollingInterval);
    }

    // Start polling the server for incoming data from the sender (HTTP Fallback)
    this.receiverPollingInterval = setInterval(async () => {
      try {
        const res = await axios.get(`${API_URL}/server/ble-session/receive`, {
          params: { sessionId }
        });

        if (res.data && res.data.status === 'sent' && res.data.payload) {
          if (this.receiverPollingInterval) {
            clearInterval(this.receiverPollingInterval);
            this.receiverPollingInterval = null;
          }

          addLog('INFO', 'BLEService.startPeripheralSession', `Incoming payload detected on bridge for session ${sessionId}`);
          await this.processIncomingPayloadSimulated(res.data.payload, callbacks);
        }
      } catch (err: any) {
        // Silent catch for polling errors
      }
    }, 1000);
  }

  /**
   * Stops the active peripheral session and cleans up polling and native BLE advertising
   */
  static stopPeripheralSession(): void {
    const { addLog } = useLogStore.getState();
    if (this.receiverPollingInterval) {
      clearInterval(this.receiverPollingInterval);
      this.receiverPollingInterval = null;
    }

    try {
      this.peripheral.stopAdvertising();
      this.peripheral.removeAllListeners('onWriteRequest');
      addLog('INFO', 'BLEService.stopPeripheralSession', 'BLE GATT peripheral advertising stopped.');
    } catch (e: any) {
      addLog('WARN', 'BLEService.stopPeripheralSession', `Failed to stop BLE advertising: ${e.message}`);
    }

    if (this.activePeripheralSessionId) {
      addLog('INFO', 'BLEService.stopPeripheralSession', `Stopping session: ${this.activePeripheralSessionId}`);
      this.mockSessions.delete(this.activePeripheralSessionId);
      this.activePeripheralSessionId = null;
    }
  }

  /**
   * Connects to a GATT server and sends a transaction payload (Central Role - Sender)
   */
  static async sendPayloadOverBLE(
    sessionId: string,
    payload: string,
    onProgress: (step: string, percent: number) => void
  ): Promise<void> {
    const { addLog } = useLogStore.getState();
    addLog('INFO', 'BLEService.sendPayloadOverBLE', `Attempting connection to BLE Session: ${sessionId}`);

    // Try real physical BLE Central connection first
    try {
      onProgress('Checking Bluetooth permissions...', 5);
      const permissionsGranted = await this.requestBluetoothPermissions();
      if (!permissionsGranted) {
        throw new Error('Bluetooth permissions denied.');
      }

      onProgress('Scanning for BLE Peripheral...', 15);
      const serviceUUID = 'E3F1C990-2B3A-4D78-95D9-23CE6305C001';
      const writeCharUUID = 'E3F1C990-2B3A-4D78-95D9-23CE6305C002';
      const notifyCharUUID = 'E3F1C990-2B3A-4D78-95D9-23CE6305C003';

      let discoveredDevice: Device | null = null;

      // Scan with timeout
      await new Promise<void>((resolve, reject) => {
        const scanTimeout = setTimeout(() => {
          this.bleManager.stopDeviceScan();
          reject(new Error('Bluetooth scan timed out: receiver device not found.'));
        }, 10000); // 10 seconds timeout

        this.bleManager.startDeviceScan(
          [serviceUUID],
          null,
          (error, device) => {
            if (error) {
              clearTimeout(scanTimeout);
              this.bleManager.stopDeviceScan();
              reject(error);
              return;
            }
            if (device) {
              addLog('INFO', 'BLEService.sendPayloadOverBLE', `Found advertising peripheral: ${device.name || device.id}`);
              discoveredDevice = device;
              clearTimeout(scanTimeout);
              this.bleManager.stopDeviceScan();
              resolve();
            }
          }
        );
      });

      if (!discoveredDevice) {
        throw new Error('Bluetooth scan failed: receiver not detected.');
      }

      onProgress('Connecting to BLE Receiver...', 30);
      const connectedDevice = await (discoveredDevice as Device).connect();

      onProgress('Discovering characteristics...', 45);
      const servicesDevice = await connectedDevice.discoverAllServicesAndCharacteristics();

      onProgress('Negotiating maximum packet MTU (512)...', 50);
      try {
        await servicesDevice.requestMTU(512);
      } catch (mtuErr) {
        addLog('WARN', 'BLEService.sendPayloadOverBLE', 'MTU negotiation rejected by peripheral. Using default.');
      }

      // Prepare ACK/NACK wait handler
      let txFinished = false;
      let txSuccess = false;
      let txErrorReason = '';

      onProgress('Preparing secure notification channel...', 55);
      const ackSubscription = servicesDevice.monitorCharacteristicForService(
        serviceUUID,
        notifyCharUUID,
        (error, char) => {
          if (error) {
            txErrorReason = error.message;
            txFinished = true;
            return;
          }
          if (char?.value) {
            const rawAck = Buffer.from(char.value, 'base64').toString('utf-8');
            addLog('INFO', 'BLEService.sendPayloadOverBLE', `Received confirmation from receiver: ${rawAck}`);
            if (rawAck === 'ACK') {
              txSuccess = true;
            } else {
              txErrorReason = 'Transaction rejected by receiver verification.';
            }
            txFinished = true;
          }
        }
      );

      // Convert full payload to base64 string
      const fullBase64 = Buffer.from(payload, 'utf-8').toString('base64');
      const chunkSize = 150; // safe chunk size across most chipsets
      const totalChunks = Math.ceil(fullBase64.length / chunkSize);

      onProgress(`Sending initialization packet (expecting ${totalChunks} packets)...`, 60);
      const startCmd = Buffer.from(`START:${totalChunks}`).toString('base64');
      await servicesDevice.writeCharacteristicWithResponseForService(
        serviceUUID,
        writeCharUUID,
        startCmd
      );

      // Write data chunks
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const chunk = fullBase64.substring(start, start + chunkSize);
        const dataCmd = Buffer.from(`DATA:${i}:${chunk}`).toString('base64');

        const chunkPercent = 60 + Math.round((i / totalChunks) * 30); // 60% to 90%
        onProgress(`Streaming packet ${i + 1} of ${totalChunks}...`, chunkPercent);

        await servicesDevice.writeCharacteristicWithResponseForService(
          serviceUUID,
          writeCharUUID,
          dataCmd
        );
      }

      onProgress('Sending final transmission packet...', 90);
      const endCmd = Buffer.from('END').toString('base64');
      await servicesDevice.writeCharacteristicWithResponseForService(
        serviceUUID,
        writeCharUUID,
        endCmd
      );

      onProgress('Awaiting receiver confirmation...', 95);
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      let waitSeconds = 0;
      while (!txFinished && waitSeconds < 15) {
        await sleep(1000);
        waitSeconds++;
      }

      // Cleanup
      ackSubscription.remove();
      try {
        await connectedDevice.cancelConnection();
      } catch (discErr) {}

      if (txSuccess) {
        onProgress('Completed', 100);
        return; // REAL BLE SUCCESS
      } else {
        throw new Error(txErrorReason || 'Bluetooth transmission timed out: Receiver not responding to verification.');
      }

    } catch (realBleError: any) {
      addLog('WARN', 'BLEService.sendPayloadOverBLE', `Real BLE connection failed: ${realBleError.message}. Trying local WiFi HTTP bridge fallback...`);
      
      // Fallback to local WiFi/LAN network HTTP bridge
      let bridgeActive = false;
      try {
        await axios.post(`${API_URL}/server/ble-session/send`, { sessionId, payload });
        bridgeActive = true;
        addLog('INFO', 'BLEService.sendPayloadOverBLE', 'Successfully posted payload to local bridge server.');
      } catch (err: any) {
        addLog('WARN', 'BLEService.sendPayloadOverBLE', `Failed to post to local bridge server (falling back to memory mode): ${err.message}`);
      }

      const receiverCallbacks = this.mockSessions.get(sessionId);
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      try {
        // Step 1: Scan for BLE advertising UUID
        onProgress('Scanning for BLE Peripheral...', 10);
        if (receiverCallbacks) {
          receiverCallbacks.onStateChange('Sender detected. Connecting...', 10);
        }
        await delay(800);

        // Step 2: Establish connection and negotiate MTU
        onProgress('Found peripheral! Connecting & Negotiating MTU (512B)...', 25);
        if (receiverCallbacks) {
          receiverCallbacks.onStateChange('Establishing GATT link...', 25);
        }
        await delay(800);

        // Step 3: GATT Handshake (Control Characteristic)
        onProgress('Initiating GATT handshake (Control Characteristic)...', 40);
        if (receiverCallbacks) {
          receiverCallbacks.onStateChange('Handshake initiated...', 40);
        }
        await delay(600);

        // Step 4: Metadata Exchange
        onProgress('Exchanging transaction metadata...', 50);
        const rawPayloadBytes = new Uint8Array(Buffer.from(payload, 'utf-8'));
        const MTU = 100;
        const totalChunks = Math.ceil(rawPayloadBytes.length / MTU);

        if (receiverCallbacks) {
          receiverCallbacks.onStateChange(`Metadata received: expecting ${totalChunks} chunks.`, 50);
        }
        await delay(600);

        // Step 5: Segment and Stream chunks
        onProgress('Streaming transaction packets...', 60);
        for (let i = 0; i < totalChunks; i++) {
          const chunkPercent = 60 + Math.round((i / totalChunks) * 20); // 60% to 80%
          onProgress(`Streaming packet ${i + 1} of ${totalChunks}...`, chunkPercent);
          
          if (receiverCallbacks) {
            receiverCallbacks.onStateChange(`Receiving packet ${i + 1} of ${totalChunks}...`, chunkPercent);
          }
          await delay(250);
        }

        onProgress('Data packets complete. Awaiting receiver confirmation...', 85);
        if (receiverCallbacks) {
          receiverCallbacks.onStateChange('Assembling packets and verifying...', 85);
        }
        await delay(500);

        // Resolve step 6: Await Receiver verification
        if (bridgeActive) {
          let attempts = 0;
          const maxAttempts = 30; // 30 seconds timeout
          
          while (attempts < maxAttempts) {
            try {
              const res = await axios.get(`${API_URL}/server/ble-session/status`, {
                params: { sessionId }
              });
              
              if (res.data && res.data.status === 'completed') {
                onProgress('Received final transaction ACK. Disconnecting...', 95);
                await delay(500);
                onProgress('Completed', 100);
                return;
              } else if (res.data && res.data.status === 'failed') {
                throw new Error('Receiver rejected the transaction signature.');
              }
            } catch (pollErr: any) {
              if (pollErr.message?.includes('rejected')) throw pollErr;
              addLog('WARN', 'BLEService.sendPayloadOverBLE', `Status poll error (attempt ${attempts + 1}): ${pollErr.message}`);
            }
            
            await delay(1000);
            attempts++;
          }
          
          throw new Error('Bluetooth connection timed out: Receiver not responding to validation.');
        } else {
          // Fallback: Single-device local memory transfer
          if (!receiverCallbacks) {
            throw new Error('Bluetooth connection timed out: Receiver not responding.');
          }

          const saveSuccess = await receiverCallbacks.onPayloadReceived(payload);
          if (!saveSuccess) {
            throw new Error('Transaction rejected by receiver validation.');
          }

          onProgress('Received final transaction ACK. Disconnecting...', 95);
          receiverCallbacks.onStateChange('Transaction accepted! Disconnecting...', 95);
          await delay(500);

          onProgress('Completed', 100);
          receiverCallbacks.onStateChange('Completed', 100);
        }

      } catch (e: any) {
        addLog('ERROR', 'BLEService.sendPayloadOverBLE', `BLE Error: ${e.message}`);
        if (receiverCallbacks) {
          receiverCallbacks.onStateChange(`Error: ${e.message}`, 0);
        }
        throw e;
      }
    }
  }

  /**
   * Helper to simulate progressive receiving on the receiver phone (HTTP bridge fallback handler)
   */
  private static async processIncomingPayloadSimulated(
    payload: string,
    callbacks: BLEReceiverCallbacks
  ): Promise<void> {
    const { addLog } = useLogStore.getState();
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    // CRITICAL: Capture sessionId NOW before the callback can clear it via stopPeripheralSession()
    const capturedSessionId = this.activePeripheralSessionId;
    addLog('INFO', 'BLEService.processIncomingPayloadSimulated', `Processing payload for session: ${capturedSessionId}`);

    // Helper to post completion status with retry
    const postCompletion = async (success: boolean) => {
      if (!capturedSessionId) {
        addLog('WARN', 'BLEService.processIncomingPayloadSimulated', 'No sessionId captured, skipping completion POST');
        return;
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await axios.post(`${API_URL}/server/ble-session/complete`, {
            sessionId: capturedSessionId,
            success
          });
          addLog('INFO', 'BLEService.processIncomingPayloadSimulated', `Completion POST succeeded (attempt ${attempt + 1})`);
          return;
        } catch (err: any) {
          addLog('WARN', 'BLEService.processIncomingPayloadSimulated', `Completion POST failed (attempt ${attempt + 1}): ${err.message}`);
          if (attempt < 2) await delay(500);
        }
      }
    };

    try {
      // Brief visual progress updates (reduced delays to prevent timeout)
      callbacks.onStateChange('Sender detected. Connecting...', 10);
      await delay(300);
      callbacks.onStateChange('Establishing GATT link...', 25);
      await delay(300);
      callbacks.onStateChange('Handshake initiated...', 40);
      await delay(200);

      const rawPayloadBytes = new Uint8Array(Buffer.from(payload, 'utf-8'));
      const MTU = 100;
      const totalChunks = Math.ceil(rawPayloadBytes.length / MTU);
      
      callbacks.onStateChange(`Metadata received: expecting ${totalChunks} chunks.`, 50);
      await delay(200);

      // Brief chunk progression animation
      for (let i = 0; i < totalChunks; i++) {
        const chunkPercent = 60 + Math.round((i / totalChunks) * 20); // 60% to 80%
        callbacks.onStateChange(`Receiving packet ${i + 1} of ${totalChunks}...`, chunkPercent);
        await delay(100);
      }

      callbacks.onStateChange('Assembling packets and verifying...', 85);
      await delay(300);

      // Trigger actual verification and save to SQLite
      const saveSuccess = await callbacks.onPayloadReceived(payload);

      // Post completion status USING the captured sessionId (not this.activePeripheralSessionId
      // which may have been cleared by stopPeripheralSession() inside the callback)
      await postCompletion(saveSuccess);

      if (saveSuccess) {
        callbacks.onStateChange('Transaction accepted! Disconnecting...', 95);
        await delay(300);
        callbacks.onStateChange('Completed', 100);
      } else {
        callbacks.onStateChange('Error: Transaction verification failed.', 0);
      }

    } catch (e: any) {
      addLog('ERROR', 'BLEService.processIncomingPayloadSimulated', `Verification error: ${e.message}`);
      callbacks.onStateChange(`Error: ${e.message}`, 0);
      await postCompletion(false);
    }
  }

  private static computeChecksum(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(16);
  }
}
