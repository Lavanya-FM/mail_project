// src/lib/p2p-engine/Telemetry.ts
import { TransferStats, TransportType } from './types';

export class TelemetryManager {
    private startTime: number = 0;
    private peakSpeed: number = 0;

    private totalRTT: number = 0;
    private rttSamples: number = 0;
    private resumeCount: number = 0;
    private fallbackTriggered: boolean = false;
    private transportUsed: TransportType = 'WEBSOCKET';

    constructor() {
        this.startTime = Date.now();
    }

    public recordProgress(_bytesSent: number, currentSpeed: number, rtt: number) {
        if (currentSpeed > this.peakSpeed) this.peakSpeed = currentSpeed;
        this.totalRTT += rtt;
        this.rttSamples++;
    }

    public recordResume() {
        this.resumeCount++;
    }

    public recordFallback() {
        this.fallbackTriggered = true;
        this.transportUsed = 'RELAY';
    }

    public setTransport(type: TransportType) {
        this.transportUsed = type;
    }

    public finalize(fileSize: number): TransferStats {
        const duration = (Date.now() - this.startTime) / 1000;
        const avgSpeed = duration > 0 ? fileSize / duration : 0;
        const avgRTT = this.rttSamples > 0 ? this.totalRTT / this.rttSamples : 0;

        return {
            fileSize,
            duration,
            avgSpeed,
            peakSpeed: this.peakSpeed,
            avgRTT,
            packetLoss: 0, // Simplified for now
            resumeCount: this.resumeCount,
            fallbackTriggered: this.fallbackTriggered,
            transportUsed: this.transportUsed
        };
    }

    public async sendToBackend(stats: TransferStats) {
        try {
            console.log('[Telemetry] Reporting stats to backend:', stats);
            await fetch('/api/p2p/telemetry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(stats)
            });
        } catch (e) {
            console.error('[Telemetry] Failed to send telemetry', e);
        }
    }
}
