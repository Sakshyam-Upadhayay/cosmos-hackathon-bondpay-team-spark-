import { BLEPacketHeader, BLETransferMetadata } from '../types';
import { BLE_MAX_MTU, BLE_HEADER_SIZE } from '../constants';
import { calculateDJB2 } from '../utils/algorithms';

export function buildBLEPacket(header: BLEPacketHeader, data: Uint8Array): Uint8Array {
  const packet = new Uint8Array(4 + data.length);
  packet[0] = (header.sequenceNo >> 8) & 0xff;
  packet[1] = header.sequenceNo & 0xff;
  packet[2] = (header.dataLength >> 8) & 0xff;
  packet[3] = header.dataLength & 0xff;
  packet.set(data, 4);
  return packet;
}

export function parseIncomingPacket(rawBytes: Uint8Array): {
  header: BLEPacketHeader;
  payload: Uint8Array;
} {
  const sequenceNo = (rawBytes[0] << 8) | rawBytes[1];
  const dataLength = (rawBytes[2] << 8) | rawBytes[3];
  const payload = rawBytes.slice(4, 4 + dataLength);
  return {
    header: { sequenceNo, dataLength },
    payload,
  };
}

export function chunkPayload(data: Uint8Array, mtuSize: number = BLE_MAX_MTU): Uint8Array[] {
  const chunkSize = mtuSize - BLE_HEADER_SIZE;
  const chunks: Uint8Array[] = [];

  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.slice(i, i + chunkSize));
  }

  return chunks;
}

export function buildTransferMetadata(
  data: Uint8Array,
  sessionId: string
): BLETransferMetadata {
  return {
    totalChunks: Math.ceil(data.length / (BLE_MAX_MTU - BLE_HEADER_SIZE)),
    checksum: calculateDJB2(data),
    sessionId,
  };
}

export function serializeMetadata(metadata: BLETransferMetadata): Uint8Array {
  const json = JSON.stringify(metadata);
  return new TextEncoder().encode(json);
}

export function deserializeMetadata(data: Uint8Array): BLETransferMetadata {
  const json = new TextDecoder().decode(data);
  return JSON.parse(json);
}

export function buildStagePayload(stage: string, data?: any): Uint8Array {
  const payload = { stage, data };
  return new TextEncoder().encode(JSON.stringify(payload));
}

export function parseStagePayload(data: Uint8Array): { stage: string; data?: any } {
  const json = new TextDecoder().decode(data);
  return JSON.parse(json);
}

export function assembleChunks(chunks: Map<number, Uint8Array>, totalChunks: number): Uint8Array | null {
  const totalSize = Array.from(chunks.values()).reduce((acc, chunk) => acc + chunk.length, 0);
  const assembled = new Uint8Array(totalSize);
  let offset = 0;

  for (let i = 0; i < totalChunks; i++) {
    const chunk = chunks.get(i);
    if (!chunk) return null;
    assembled.set(chunk, offset);
    offset += chunk.length;
  }

  return assembled;
}
