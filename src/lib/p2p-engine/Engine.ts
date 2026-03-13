// src/lib/p2p-engine/Engine.ts
import { P2P_CONFIG, EngineState, P2PSegment } from './types';
import { AdaptiveSpeedController } from './Controller';
import { WebSocketTransport, WebRTCTransport, ITransport } from './Transport';
import { ResumeManager } from './Resume';
import { RelayManager } from './Relay';
import { TelemetryManager } from './Telemetry';

export class P2PEngine {
    private file: File | null = null;
    private _messageId: string;
    private state: EngineState;

    private controller: AdaptiveSpeedController;
    private transport: ITransport | null = null;
    private resumeManager: ResumeManager;
    private relayManager: RelayManager;
    private telemetry: TelemetryManager;

    private totalSegments: number = 0;
    private ackedSegments: Set<number> = new Set();
    private inFlightSegments: Set<number> = new Set();

    private onStateChange: (state: EngineState) => void;

    constructor(messageId: string, onStateChange: (state: EngineState) => void) {
        this._messageId = messageId;
        this.onStateChange = onStateChange;
        this.controller = new AdaptiveSpeedController();
        this.resumeManager = new ResumeManager(messageId);
        this.relayManager = new RelayManager();
        this.telemetry = new TelemetryManager();

        this.state = {
            messageId,
            status: 'IDLE',
            progress: 0,
            speed: 0,
            eta: 0,
            bytesTransferred: 0,
            transport: 'WEBSOCKET'
        };
    }

    public async startSending(file: File, recipientUrl: string) {
        this.file = file;
        this.totalSegments = Math.ceil(file.size / P2P_CONFIG.SEGMENT_SIZE);

        // 1. Selector Transport
        if (file.size > P2P_CONFIG.WEBRTC_THRESHOLD) {
            this.transport = new WebRTCTransport([]); // ICE servers should come from config
            this.state.transport = 'WEBRTC';
        } else {
            this.transport = new WebSocketTransport(recipientUrl);
            this.state.transport = 'WEBSOCKET';
        }

        this.updateState({ status: 'SENDING' });
        this.sendLoop();
    }

    private async sendLoop() {
        if (!this.file || !this.transport) return;

        let nextSegment = 0;
        const missing = await this.resumeManager.getMissingSegments(this.totalSegments);
        let missingIdx = 0;

        const interval = setInterval(() => {
            if (this.state.status !== 'SENDING') {
                clearInterval(interval);
                return;
            }

            // Congestion Control: Check sliding window & BufferedAmount
            if (this.inFlightSegments.size >= this.controller.getWindowSize()) return;
            if (this.transport!.getBufferedAmount() > P2P_CONFIG.BUFFER_PAUSE_THRESHOLD) return;

            // Get next segment to send
            let currentSegId: number;
            if (missingIdx < missing.length) {
                currentSegId = missing[missingIdx++];
            } else if (nextSegment < this.totalSegments) {
                currentSegId = nextSegment++;
                while (this.ackedSegments.has(currentSegId) && nextSegment < this.totalSegments) {
                    currentSegId = nextSegment++;
                }
                if (this.ackedSegments.has(currentSegId)) return;
            } else {
                // All segments sent, waiting for final ACKs
                if (this.ackedSegments.size === this.totalSegments) {
                    this.complete();
                    clearInterval(interval);
                }
                return;
            }

            this.sendSegment(currentSegId);
        }, 10); // High frequency check
    }

    private async sendSegment(id: number) {
        if (!this.file || !this.transport) return;

        const start = id * P2P_CONFIG.SEGMENT_SIZE;
        const end = Math.min(this.file.size, start + P2P_CONFIG.SEGMENT_SIZE);
        const blob = this.file.slice(start, end);
        const arrayBuffer = await blob.arrayBuffer();

        const segment: P2PSegment = {
            id,
            data: arrayBuffer,
            checksum: '' // Should compute hash
        };

        this.inFlightSegments.add(id);
        this.controller.recordSend(id);
        this.transport.send(JSON.stringify({ type: 'DATA', segment }));

        // Update Telemetry
        this.telemetry.recordProgress(this.state.bytesTransferred, this.controller.getCurrentSpeed(), this.controller.getAvgRTT());

        // Check for fallback
        if (this.relayManager.shouldTriggerFallback(this.controller.getCurrentSpeed(), true, this.state.eta)) {
            this.triggerFallback();
        }
    }

    public handleAck(id: number) {
        this.ackedSegments.add(id);
        this.inFlightSegments.delete(id);
        this.controller.recordAck(id, P2P_CONFIG.SEGMENT_SIZE);

        const progress = (this.ackedSegments.size / this.totalSegments) * 100;
        const speed = this.controller.getCurrentSpeed();
        const remainingBytes = (this.totalSegments - this.ackedSegments.size) * P2P_CONFIG.SEGMENT_SIZE;
        const eta = speed > 0 ? remainingBytes / speed : 0;

        this.updateState({
            progress,
            speed,
            eta,
            bytesTransferred: this.ackedSegments.size * P2P_CONFIG.SEGMENT_SIZE
        });
    }

    private triggerFallback() {
        this.updateState({ status: 'FALLBACK' });
        this.telemetry.recordFallback();
        // Logic to switch to RelayManager...
    }

    private complete() {
        this.updateState({ status: 'COMPLETED', progress: 100 });
        const stats = this.telemetry.finalize(this.file?.size || 0);
        this.telemetry.sendToBackend(stats);
    }

    private updateState(patch: Partial<EngineState>) {
        this.state = { ...this.state, ...patch };
        this.onStateChange(this.state);
    }
}
