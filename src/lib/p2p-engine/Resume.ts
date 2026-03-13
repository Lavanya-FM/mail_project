// src/lib/p2p-engine/Resume.ts
import { getReceivedChunkIndexes } from '../p2pStorage';

export class ResumeManager {
    private messageId: string;

    constructor(messageId: string) {
        this.messageId = messageId;
    }

    public async getMissingSegments(totalSegments: number): Promise<number[]> {
        const received = await getReceivedChunkIndexes(this.messageId);
        const receivedSet = new Set(received);
        const missing: number[] = [];

        for (let i = 0; i < totalSegments; i++) {
            if (!receivedSet.has(i)) {
                missing.push(i);
            }
        }
        return missing;
    }

    public async isComplete(totalSegments: number): Promise<boolean> {
        const received = await getReceivedChunkIndexes(this.messageId);
        return received.length === totalSegments;
    }

    public async getProgress(totalSegments: number): Promise<number> {
        const received = await getReceivedChunkIndexes(this.messageId);
        return totalSegments > 0 ? (received.length / totalSegments) * 100 : 0;
    }

    public async getBytesReceived(): Promise<number> {
        const received = await getReceivedChunkIndexes(this.messageId);
        // Assuming uniform segment size for simplification in progress calculation, 
        // but actual bytes should ideally be stored.
        // For now, count * 1MB
        return received.length * 1024 * 1024;
    }

    public async getMissingReport(totalSegments: number): Promise<string> {
        const missing = await this.getMissingSegments(totalSegments);
        return JSON.stringify(missing);
    }
}
