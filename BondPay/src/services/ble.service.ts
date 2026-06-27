import { Buffer } from 'buffer';
import { useLogStore } from '../store/useLogStore';

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
  // A global registry for mock sessions (allows sender and receiver screens to communicate in testing)
  private static mockSessions = new Map<string, BLEReceiverCallbacks>();
  private static activePeripheralSessionId: string | null = null;

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

    // Trigger initial state
    callbacks.onStateChange('Advertising BLE Service...', 0);
  }

  /**
   * Stops the active peripheral session
   */
  static stopPeripheralSession(): void {
    const { addLog } = useLogStore.getState();
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

    // Check if the mock session is active (indicating receiver is listening in-app)
    const receiverCallbacks = this.mockSessions.get(sessionId);

    // Define delay helper to simulate BLE network latency and GATT steps
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

      // Step 3: GATT Handshake (Control Characteristic: STAGE_HANDSHAKE)
      onProgress('Initiating GATT handshake (Control Characteristic)...', 40);
      if (receiverCallbacks) {
        receiverCallbacks.onStateChange('Handshake initiated...', 40);
      }
      await delay(600);

      // Step 4: Metadata Exchange (Control Characteristic: STAGE_METADATA)
      onProgress('Exchanging transaction metadata...', 50);
      const rawPayloadBytes = new Uint8Array(Buffer.from(payload, 'utf-8'));
      const MTU = 100; // Simulated MTU packet size for demo chunking visibility
      const totalChunks = Math.ceil(rawPayloadBytes.length / MTU);
      
      const checksum = this.computeChecksum(payload);
      addLog('INFO', 'BLEService.sendPayloadOverBLE', `Metadata: Chunks=${totalChunks}, Checksum=${checksum}`);

      if (receiverCallbacks) {
        receiverCallbacks.onStateChange(`Metadata received: expecting ${totalChunks} chunks.`, 50);
      }
      await delay(600);

      // Step 5: Segment and Stream chunks (Data Characteristic: STAGE_DATA)
      onProgress('Streaming transaction packets...', 60);
      const assembledChunks: Uint8Array[] = new Array(totalChunks);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * MTU;
        const end = Math.min(start + MTU, rawPayloadBytes.length);
        const dataFragment = rawPayloadBytes.slice(start, end);

        // Build header
        const header: BLEPacketHeader = {
          sequenceNo: i,
          dataLength: dataFragment.length,
        };

        // Construct BLE packet bytes [SeqNo: 2B][Length: 2B][Data...]
        const packetBytes = buildBLEPacket(header, dataFragment);

        // Log sending packet
        addLog('INFO', 'BLEService.sendPayloadOverBLE', `Sending packet ${i + 1}/${totalChunks}, bytes=${packetBytes.length}`);

        // Update sender progress
        const chunkPercent = 60 + Math.round((i / totalChunks) * 20); // Scale between 60% and 80%
        onProgress(`Streaming packet ${i + 1} of ${totalChunks}...`, chunkPercent);

        if (receiverCallbacks) {
          // Simulate receiver reassembling packets
          const parsed = parseIncomingPacket(packetBytes);
          assembledChunks[parsed.header.sequenceNo] = parsed.payload;

          receiverCallbacks.onStateChange(
            `Receiving packet ${i + 1} of ${totalChunks}...`,
            chunkPercent
          );
        }

        // Delay to make streaming progress visible and realistic
        await delay(300);
      }

      onProgress('Data packets complete. Verifying signature...', 85);
      if (receiverCallbacks) {
        receiverCallbacks.onStateChange('Assembling packets and verifying...', 85);
      }
      await delay(800);

      // Reassemble and process at the receiver side
      if (!receiverCallbacks) {
        throw new Error('Bluetooth connection timed out: Receiver not responding.');
      }

      // Concatenate all assembled chunks
      let totalLength = 0;
      for (const chunk of assembledChunks) {
        totalLength += chunk.length;
      }
      const fullBytes = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of assembledChunks) {
        fullBytes.set(chunk, offset);
        offset += chunk.length;
      }

      const decodedPayload = Buffer.from(fullBytes).toString('utf-8');
      const computedCs = this.computeChecksum(decodedPayload);

      if (computedCs !== checksum) {
        addLog('ERROR', 'BLEService.sendPayloadOverBLE', 'Data transmission corrupted. Checksum mismatch.');
        throw new Error('Data verification failed (Checksum mismatch). Please try again.');
      }

      // Trigger receiver database save
      const saveSuccess = await receiverCallbacks.onPayloadReceived(decodedPayload);

      if (!saveSuccess) {
        throw new Error('Transaction rejected by receiver validation.');
      }

      // Step 6: Final ACK and Disconnect
      onProgress('Received final transaction ACK. Disconnecting...', 95);
      receiverCallbacks.onStateChange('Transaction accepted! Disconnecting...', 95);
      await delay(600);

      onProgress('Completed', 100);
      receiverCallbacks.onStateChange('Completed', 100);

    } catch (e: any) {
      addLog('ERROR', 'BLEService.sendPayloadOverBLE', `BLE Error: ${e.message}`);
      if (receiverCallbacks) {
        receiverCallbacks.onStateChange(`Error: ${e.message}`, 0);
      }
      throw e;
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
