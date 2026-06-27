import { Buffer } from 'buffer';
import axios from 'axios';
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

    // Initial state update
    callbacks.onStateChange('Advertising BLE Service...', 0);

    // Register session on the local bridge server
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

    // Start polling the server for incoming data from the sender
    this.receiverPollingInterval = setInterval(async () => {
      try {
        const res = await axios.get(`${API_URL}/server/ble-session/receive`, {
          params: { sessionId }
        });

        if (res.data && res.data.status === 'sent' && res.data.payload) {
          // Clear interval immediately to prevent duplicate runs
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
   * Stops the active peripheral session and cleans up polling
   */
  static stopPeripheralSession(): void {
    const { addLog } = useLogStore.getState();
    if (this.receiverPollingInterval) {
      clearInterval(this.receiverPollingInterval);
      this.receiverPollingInterval = null;
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

    // Try posting the payload to the local server first (cross-device bridge)
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
      const checksum = this.computeChecksum(payload);

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
        // Wait for receiver to process and confirm via local server bridge status
        let attempts = 0;
        const maxAttempts = 15; // 15 seconds timeout
        
        while (attempts < maxAttempts) {
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

  /**
   * Helper to simulate progressive receiving on the receiver phone
   */
  private static async processIncomingPayloadSimulated(
    payload: string,
    callbacks: BLEReceiverCallbacks
  ): Promise<void> {
    const { addLog } = useLogStore.getState();
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    try {
      // Simulate initial connect
      callbacks.onStateChange('Sender detected. Connecting...', 10);
      await delay(800);
      callbacks.onStateChange('Establishing GATT link...', 25);
      await delay(800);
      callbacks.onStateChange('Handshake initiated...', 40);
      await delay(600);

      const rawPayloadBytes = new Uint8Array(Buffer.from(payload, 'utf-8'));
      const MTU = 100;
      const totalChunks = Math.ceil(rawPayloadBytes.length / MTU);
      
      callbacks.onStateChange(`Metadata received: expecting ${totalChunks} chunks.`, 50);
      await delay(600);

      // Simulate chunk progression
      for (let i = 0; i < totalChunks; i++) {
        const chunkPercent = 60 + Math.round((i / totalChunks) * 20); // 60% to 80%
        callbacks.onStateChange(`Receiving packet ${i + 1} of ${totalChunks}...`, chunkPercent);
        await delay(250);
      }

      callbacks.onStateChange('Assembling packets and verifying...', 85);
      await delay(800);

      // Trigger actual verification and save to SQLite
      const saveSuccess = await callbacks.onPayloadReceived(payload);

      // Update bridge status on server
      try {
        await axios.post(`${API_URL}/server/ble-session/complete`, {
          sessionId: this.activePeripheralSessionId,
          success: saveSuccess
        });
      } catch (err) {}

      if (saveSuccess) {
        callbacks.onStateChange('Transaction accepted! Disconnecting...', 95);
        await delay(500);
        callbacks.onStateChange('Completed', 100);
      } else {
        callbacks.onStateChange('Error: Transaction verification failed.', 0);
      }

    } catch (e: any) {
      addLog('ERROR', 'BLEService.processIncomingPayloadSimulated', `Verification error: ${e.message}`);
      callbacks.onStateChange(`Error: ${e.message}`, 0);
      try {
        await axios.post(`${API_URL}/server/ble-session/complete`, {
          sessionId: this.activePeripheralSessionId,
          success: false
        });
      } catch (err) {}
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
