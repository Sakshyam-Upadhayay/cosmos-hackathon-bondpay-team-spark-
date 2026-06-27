export interface QRChunk {
  v: number;   // version (always 1)
  sid: string; // session ID (links all related chunks)
  i: number;   // chunk index (0-based)
  t: number;   // total chunks
  d: string;   // data fragment
  cs: string;  // checksum of the full payload
}

export class MultiQRService {
  private static computeChecksum(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  // Splits a payload string into multiple QR chunks
  static encode(payload: string, chunkSize: number = 300): string[] {
    const checksum = this.computeChecksum(payload);
    const sid = Math.random().toString(36).substring(2, 8).toUpperCase();
    const chunks: string[] = [];
    
    let position = 0;
    const totalChunks = Math.ceil(payload.length / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      const fragment = payload.substring(position, position + chunkSize);
      position += chunkSize;

      const chunk: QRChunk = {
        v: 1,
        sid,
        i,
        t: totalChunks,
        d: fragment,
        cs: checksum
      };
      
      chunks.push(JSON.stringify(chunk));
    }

    return chunks;
  }

  // Helper class to accumulate incoming chunks
  static createAccumulator(onComplete: (fullPayload: string) => void) {
    const receivedChunks = new Map<string, string[]>(); // sid -> array of chunk data
    const checksums = new Map<string, string>(); // sid -> checksum
    const totalCounts = new Map<string, number>(); // sid -> total count

    return {
      // Processes a raw scanned string, returns progress or final status
      addChunk: (rawChunkStr: string): { 
        success: boolean; 
        progress: number; // 0 to 1
        scannedCount: number;
        totalCount: number;
        sid: string;
        error?: string;
        isComplete: boolean;
      } => {
        try {
          const chunk: QRChunk = JSON.parse(rawChunkStr);
          if (chunk.v !== 1 || !chunk.sid || chunk.i === undefined || !chunk.t || !chunk.d || !chunk.cs) {
            return { success: false, progress: 0, scannedCount: 0, totalCount: 0, sid: '', isComplete: false, error: 'Not a valid MultiQR chunk' };
          }

          const sid = chunk.sid;
          const index = chunk.i;
          const total = chunk.t;

          if (!receivedChunks.has(sid)) {
            receivedChunks.set(sid, new Array(total).fill(''));
            checksums.set(sid, chunk.cs);
            totalCounts.set(sid, total);
          }

          const arr = receivedChunks.get(sid)!;
          arr[index] = chunk.d;

          const scannedCount = arr.filter(f => f !== '').length;
          const progress = scannedCount / total;

          if (scannedCount === total) {
            const fullPayload = arr.join('');
            const computedCs = MultiQRService.computeChecksum(fullPayload);
            const expectedCs = checksums.get(sid);

            if (computedCs !== expectedCs) {
              return { success: false, progress: 1, scannedCount, totalCount: total, sid, isComplete: false, error: 'Checksum mismatch. Data corrupted.' };
            }

            onComplete(fullPayload);
            return { success: true, progress: 1, scannedCount, totalCount: total, sid, isComplete: true };
          }

          return { success: true, progress, scannedCount, totalCount: total, sid, isComplete: false };
        } catch (e) {
          return { success: false, progress: 0, scannedCount: 0, totalCount: 0, sid: '', isComplete: false, error: 'Failed to parse JSON chunk' };
        }
      }
    };
  }
}
