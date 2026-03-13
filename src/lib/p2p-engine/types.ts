// src/lib/p2p-engine/types.ts

export type TransportType = 'WEBSOCKET' | 'WEBRTC' | 'RELAY';

export interface P2PSegment {
    id: number;
    data: ArrayBuffer;
    checksum: string;
}

export interface TransferStats {
    fileSize: number;
    duration: number;
    avgSpeed: number;
    peakSpeed: number;
    avgRTT: number;
    packetLoss: number;
    resumeCount: number;
    fallbackTriggered: boolean;
    transportUsed: TransportType;
}

export interface EngineState {
    messageId: string;
    status: 'IDLE' | 'SENDING' | 'RECEIVING' | 'SEEDING' | 'RESUMING' | 'FALLBACK' | 'COMPLETED' | 'FAILED';
    progress: number;
    speed: number; // Bytes per second
    eta: number; // Seconds
    bytesTransferred: number;
    transport: TransportType;
}

export interface PeerInfo {
    email: string;
    online: boolean;
}

export const P2P_CONFIG = {
    SMTP_THRESHOLD: 25 * 1024 * 1024, // 25MB
    WEBRTC_THRESHOLD: 200 * 1024 * 1024, // 200MB
    SEGMENT_SIZE: 1024 * 1024, // 1MB Physical
    INITIAL_MACRO_CHUNK: 4 * 1024 * 1024, // 4MB
    MAX_MACRO_CHUNK: 32 * 1024 * 1024, // 32MB
    MIN_WINDOW: 16,
    MAX_WINDOW: 128,
    BUFFER_PAUSE_THRESHOLD: 64 * 1024 * 1024, // 64MB
    ACK_INTERVAL: 16, // Every 16 segments
    RELAY_SPEED_THRESHOLD: 5 * 1024 * 1024, // 5MB/s
    RELAY_SPEED_TIMEOUT: 15, // 15 seconds
    RELAY_OFFLINE_TIMEOUT: 60, // 60 seconds
};
