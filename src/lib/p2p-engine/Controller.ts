// src/lib/p2p-engine/Controller.ts
import { P2P_CONFIG } from './types';

export class AdaptiveSpeedController {
    private windowSize: number = P2P_CONFIG.MIN_WINDOW;
    private currentMacroChunkSize: number = P2P_CONFIG.INITIAL_MACRO_CHUNK;
    private rttValues: number[] = [];
    private lastSendTime: Map<number, number> = new Map();
    private byteHistory: { time: number; bytes: number }[] = [];

    constructor() { }

    public recordSend(segmentId: number) {
        this.lastSendTime.set(segmentId, performance.now());
    }

    public recordAck(segmentId: number, bytes: number) {
        const now = performance.now();
        const sendTime = this.lastSendTime.get(segmentId);
        if (sendTime) {
            const rtt = now - sendTime;
            this.updateRTT(rtt);
            this.lastSendTime.delete(segmentId);
        }

        this.byteHistory.push({ time: now, bytes });
        this.cleanHistory(now);
        this.adjustWindow();
    }

    private updateRTT(rtt: number) {
        this.rttValues.push(rtt);
        if (this.rttValues.length > 20) this.rttValues.shift();
    }

    private cleanHistory(now: number) {
        const threshold = now - 5000; // 5 second window for speed calc
        this.byteHistory = this.byteHistory.filter(h => h.time > threshold);
    }

    private adjustWindow() {
        const avgRTT = this.getAvgRTT();
        const currentSpeed = this.getCurrentSpeed(); // Bytes per ms

        // Formula: Window = (Bandwidth * RTT) / SegmentSize
        // Bandwidth here is currentSpeed (bytes/ms)
        // RTT is avgRTT (ms)
        let idealWindow = Math.ceil((currentSpeed * avgRTT) / P2P_CONFIG.SEGMENT_SIZE);

        this.windowSize = Math.max(P2P_CONFIG.MIN_WINDOW, Math.min(P2P_CONFIG.MAX_WINDOW, idealWindow));

        // Adaptive Macro-Chunk Scaling (4 -> 8 -> 16 -> 32)
        if (currentSpeed > 20 * 1024 * 1024 / 1000) { // > 20MB/s
            this.currentMacroChunkSize = Math.min(P2P_CONFIG.MAX_MACRO_CHUNK, this.currentMacroChunkSize * 2);
        } else if (currentSpeed < 5 * 1024 * 1024 / 1000) { // < 5MB/s
            this.currentMacroChunkSize = Math.max(P2P_CONFIG.INITIAL_MACRO_CHUNK, this.currentMacroChunkSize / 2);
        }
    }

    public getAvgRTT(): number {
        if (this.rttValues.length === 0) return 100; // Default 100ms
        return this.rttValues.reduce((a, b) => a + b, 0) / this.rttValues.length;
    }

    public getCurrentSpeed(): number {
        if (this.byteHistory.length < 2) return 0;
        const totalBytes = this.byteHistory.reduce((a, b) => a + b.bytes, 0);
        const timeSpan = this.byteHistory[this.byteHistory.length - 1].time - this.byteHistory[0].time;
        return timeSpan > 0 ? totalBytes / timeSpan : 0;
    }

    public getWindowSize(): number {
        return this.windowSize;
    }

    public getMacroChunkSize(): number {
        return this.currentMacroChunkSize;
    }
}
