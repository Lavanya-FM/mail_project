// src/lib/p2p-engine/Relay.ts
import { P2P_CONFIG } from './types';
import { WorkerPool } from '../WorkerPool';

export class RelayManager {
    private lastSpeedCheck: number = Date.now();
    private slowThroughputCount: number = 0;
    private offlineStartTime: number | null = null;
    private workerPool: WorkerPool;

    constructor() {
        this.workerPool = new WorkerPool(2); // Use 2 dedicated workers for relay encryption
    }

    public shouldTriggerFallback(
        currentSpeed: number,
        isReceiverOnline: boolean,
        eta: number
    ): boolean {
        const now = Date.now();

        // Trigger 1: Throughput < 5MB/s for 15s (using raw Bps value)
        if (currentSpeed < P2P_CONFIG.RELAY_SPEED_THRESHOLD) {
            this.slowThroughputCount += (now - this.lastSpeedCheck) / 1000;
            if (this.slowThroughputCount >= P2P_CONFIG.RELAY_SPEED_TIMEOUT) {
                return true;
            }
        } else {
            this.slowThroughputCount = 0;
        }
        this.lastSpeedCheck = now;

        // Trigger 2: Receiver offline > 60 seconds
        if (!isReceiverOnline) {
            if (!this.offlineStartTime) this.offlineStartTime = now;
            if ((now - this.offlineStartTime) / 1000 > P2P_CONFIG.RELAY_OFFLINE_TIMEOUT) {
                return true;
            }
        } else {
            this.offlineStartTime = null;
        }

        // Trigger 3: ETA exceeds threshold (e.g. 2 hours)
        if (eta > 7200) return true;

        return false;
    }

    public async uploadToRelay(
        messageId: string,
        file: File | Blob,
        encryptionKey: CryptoKey
    ): Promise<any> {
        const fileName = (file as File).name || 'encrypted-file';
        console.log('[Relay] Starting encrypted upload for', fileName);

        // In a real production system, we would stream the file to the worker
        // For this implementation, we handle it in macro-chunks to avoid memory bloat
        const chunkSize = 16 * 1024 * 1024; // 16MB macro-chunk
        const totalChunks = Math.ceil(file.size / chunkSize);

        // We'll upload each chunk as it's encrypted
        for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(file.size, start + chunkSize);
            const buffer = await file.slice(start, end).arrayBuffer();

            // Encrypt via worker
            const { iv, data: encryptedData } = await this.workerPool.execute('encrypt', {
                key: encryptionKey,
                data: buffer
            }, [buffer]);

            // Append to Relay (Simplified: Uploading segment by segment)
            await this.uploadSegment(messageId, i, encryptedData, iv);
        }

        return { success: true, relayUrl: `/api/p2p/relay/${messageId}` };
    }

    private async uploadSegment(messageId: string, index: number, data: ArrayBuffer, iv: Uint8Array) {
        const formData = new FormData();
        formData.append('messageId', messageId);
        formData.append('index', index.toString());
        formData.append('iv', btoa(String.fromCharCode(...iv)));
        formData.append('file', new Blob([data]));

        const res = await fetch('/api/emails/relay-segment', {
            method: 'POST',
            body: formData
        });
        if (!res.ok) throw new Error('Relay upload failed');
    }
}
