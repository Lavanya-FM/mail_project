// src/lib/p2p-engine/Transport.ts
import { TransportType } from './types';

export interface ITransport {
    type: TransportType;
    send(data: ArrayBuffer | string): void;
    onMessage(callback: (data: any) => void): void;
    onClose(callback: () => void): void;
    onError(callback: (err: any) => void): void;
    close(): void;
    getBufferedAmount(): number;
    isReady(): boolean;
}

export class WebSocketTransport implements ITransport {
    public type: TransportType = 'WEBSOCKET';
    private ws: WebSocket;
    private messageCallback: ((data: any) => void) | null = null;

    constructor(url: string) {
        this.ws = new WebSocket(url);
        this.ws.binaryType = 'arraybuffer';
        this.ws.onmessage = (e) => this.messageCallback?.(e.data);
    }

    send(data: ArrayBuffer | string) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(data);
        }
    }

    onMessage(callback: (data: any) => void) { this.messageCallback = callback; }
    onClose(callback: () => void) { this.ws.onclose = callback; }
    onError(callback: (err: any) => void) { this.ws.onerror = callback; }
    close() { this.ws.close(); }
    getBufferedAmount() { return this.ws.bufferedAmount; }
    isReady() { return this.ws.readyState === WebSocket.OPEN; }
}

export class WebRTCTransport implements ITransport {
    public type: TransportType = 'WEBRTC';
    private pc: RTCPeerConnection;
    private dc: RTCDataChannel | null = null;
    private messageCallback: ((data: any) => void) | null = null;
    private closeCallback: (() => void) | null = null;
    private errorCallback: ((err: any) => void) | null = null;

    constructor(iceServers: RTCIceServer[]) {
        this.pc = new RTCPeerConnection({ iceServers });
        this.setupPC();
    }

    private setupPC() {
        this.pc.onicecandidate = (e) => {
            if (e.candidate) {
                // Emit candidate to signaling channel
                window.dispatchEvent(new CustomEvent('p2p-ice-candidate', { detail: e.candidate }));
            }
        };
        this.pc.onconnectionstatechange = () => {
            if (this.pc.connectionState === 'disconnected' || this.pc.connectionState === 'failed') {
                this.closeCallback?.();
            }
        };
    }

    public createDataChannel(label: string = 'file-transfer') {
        this.dc = this.pc.createDataChannel(label, { ordered: true });
        this.setupDC();
    }

    public setRemoteDataChannel(dc: RTCDataChannel) {
        this.dc = dc;
        this.setupDC();
    }

    private setupDC() {
        if (!this.dc) return;
        this.dc.binaryType = 'arraybuffer';
        this.dc.onmessage = (e) => this.messageCallback?.(e.data);
        this.dc.onclose = () => this.closeCallback?.();
        this.dc.onerror = (e) => this.errorCallback?.(e);
    }

    send(data: ArrayBuffer | string) {
        if (this.dc?.readyState === 'open') {
            this.dc.send(data as any);
        }
    }

    onMessage(callback: (data: any) => void) { this.messageCallback = callback; }
    onClose(callback: () => void) { this.closeCallback = callback; }
    onError(callback: (err: any) => void) { this.errorCallback = callback; }
    close() { this.dc?.close(); this.pc.close(); }
    getBufferedAmount() { return this.dc?.bufferedAmount || 0; }
    isReady() { return this.dc?.readyState === 'open'; }

    // SDP Negotiation helpers
    async createOffer(): Promise<RTCSessionDescriptionInit> {
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        return offer;
    }

    async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
        await this.pc.setRemoteDescription(offer);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        return answer;
    }

    async handleAnswer(answer: RTCSessionDescriptionInit) {
        await this.pc.setRemoteDescription(answer);
    }

    async addIceCandidate(candidate: RTCIceCandidateInit) {
        await this.pc.addIceCandidate(candidate);
    }
}
