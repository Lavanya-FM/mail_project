/**
 * webrtcManager.ts
 * WebRTC peer connection management
 * Handles media streams, ICE negotiation, and connection state
 */

import { callService } from './callService';
import { backgroundProcessor } from './backgroundProcessor';

export interface WebRTCConfig {
    iceServers: RTCIceServer[];
}

export interface MediaConstraints {
    audio: boolean | MediaTrackConstraints;
    video: boolean | MediaTrackConstraints;
}

const DEFAULT_CONFIG: WebRTCConfig = {
    iceServers: [
        // Google STUN
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        // OpenRelay (Free TURN for testing)
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ]
};

const DEFAULT_MEDIA_CONSTRAINTS: MediaConstraints = {
    audio: true,
    video: false // Audio-only MVP
};

class WebRTCManager {
    private peerConnections: Map<string, RTCPeerConnection> = new Map();
    private localStreams: Map<string, MediaStream> = new Map();
    private remoteStreams: Map<string, MediaStream> = new Map();
    private iceCandidateQueue: Map<string, RTCIceCandidateInit[]> = new Map(); // Queue for early candidates
    private config: WebRTCConfig = DEFAULT_CONFIG;

    /**
     * Create peer connection for a call
     */
    async createPeerConnection(
        callId: string,
        remotePeer: string,
        isInitiator: boolean,
        enableVideo: boolean = false
    ): Promise<RTCPeerConnection> {
        console.log(`[WebRTC] Creating peer connection for ${callId}, initiator: ${isInitiator}, video: ${enableVideo}`);

        // Create RTCPeerConnection
        const pc = new RTCPeerConnection(this.config);
        this.peerConnections.set(callId, pc);

        // Get local media stream
        const constraints = { ...DEFAULT_MEDIA_CONSTRAINTS, video: enableVideo };
        const stream = await this.getLocalStream(callId, constraints);

        // Add tracks to peer connection
        stream.getTracks().forEach(track => {
            pc.addTrack(track, stream);
            console.log(`[WebRTC] Added ${track.kind} track`);
        });

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('[WebRTC] ICE candidate:', event.candidate);
                callService.sendIceCandidate(callId, event.candidate, remotePeer);
            }
        };

        // Handle connection state changes
        pc.onconnectionstatechange = () => {
            console.log(`[WebRTC] Connection state: ${pc.connectionState}`);

            if (pc.connectionState === 'connected') {
                this.onConnected(callId);
            } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                this.onDisconnected(callId);
            }
        };

        // Handle ICE connection state
        pc.oniceconnectionstatechange = () => {
            console.log(`[WebRTC] ICE connection state: ${pc.iceConnectionState}`);
        };

        // Handle remote stream
        // Handle remote stream
        pc.ontrack = (event) => {
            console.log(`[WebRTC] Received remote ${event.track.kind} track`);

            let stream = event.streams[0];
            if (!stream) {
                // Fallback for browsers that don't send stream in ontrack
                stream = this.remoteStreams.get(callId) || new MediaStream();
                stream.addTrack(event.track);
            }

            this.remoteStreams.set(callId, stream);
            this.onRemoteStream(callId, stream);

            // Re-dispatch if a second track comes in for same stream
            stream.onaddtrack = () => {
                this.onRemoteStream(callId, stream);
            };
        };

        // If initiator, create and send offer
        if (isInitiator) {
            await this.createOffer(callId, remotePeer, enableVideo);
        }

        return pc;
    }

    /**
     * Get local media stream
     */
    async getLocalStream(callId: string, constraints?: MediaConstraints): Promise<MediaStream> {
        // Check if we already have a stream
        const existing = this.localStreams.get(callId);
        if (existing) return existing;

        try {
            const stream = await navigator.mediaDevices.getUserMedia(
                constraints || DEFAULT_MEDIA_CONSTRAINTS
            );

            this.localStreams.set(callId, stream);
            console.log('[WebRTC] Got local stream:', stream.getTracks().map(t => t.kind));

            return stream;
        } catch (error) {
            console.error('[WebRTC] Failed to get local stream:', error);
            throw new Error('Failed to access microphone');
        }
    }

    /**
     * Create and send offer
     */
    async createOffer(callId: string, remotePeer: string, enableVideo: boolean = false): Promise<void> {
        const pc = this.peerConnections.get(callId);
        if (!pc) throw new Error('Peer connection not found');

        try {
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: enableVideo
            });

            await pc.setLocalDescription(offer);

            console.log('[WebRTC] Created offer');
            await callService.sendOffer(callId, offer.sdp!, remotePeer);
        } catch (error) {
            console.error('[WebRTC] Failed to create offer:', error);
            throw error;
        }
    }

    /**
     * Handle incoming offer
     */
    async handleOffer(callId: string, sdp: string, remotePeer: string): Promise<void> {
        const pc = this.peerConnections.get(callId);
        if (!pc) throw new Error('Peer connection not found');

        try {
            await pc.setRemoteDescription(new RTCSessionDescription({
                type: 'offer',
                sdp
            }));

            // Process queued candidates
            this.processIceQueue(callId);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            console.log('[WebRTC] Created answer');
            await callService.sendAnswer(callId, answer.sdp!, remotePeer);
        } catch (error) {
            console.error('[WebRTC] Failed to handle offer:', error);
            throw error;
        }
    }

    /**
     * Handle incoming answer
     */
    async handleAnswer(callId: string, sdp: string): Promise<void> {
        const pc = this.peerConnections.get(callId);
        if (!pc) throw new Error('Peer connection not found');

        try {
            await pc.setRemoteDescription(new RTCSessionDescription({
                type: 'answer',
                sdp
            }));

            // Process queued candidates
            this.processIceQueue(callId);

            console.log('[WebRTC] Set remote answer');
        } catch (error) {
            console.error('[WebRTC] Failed to handle answer:', error);
            throw error;
        }
    }

    /**
     * Handle incoming ICE candidate
     */
    async handleIceCandidate(callId: string, candidate: RTCIceCandidateInit): Promise<void> {
        const pc = this.peerConnections.get(callId);
        if (!pc) {
            console.warn('[WebRTC] Peer connection not found for ICE candidate');
            return;
        }

        try {
            if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('[WebRTC] Added ICE candidate');
            } else {
                // Queue candidate
                const queue = this.iceCandidateQueue.get(callId) || [];
                queue.push(candidate);
                this.iceCandidateQueue.set(callId, queue);
                console.log('[WebRTC] Queued ICE candidate (remote desc pending)');
            }
        } catch (error) {
            console.error('[WebRTC] Failed to add ICE candidate:', error);
        }
    }

    /**
     * Process queued ICE candidates
     */
    private async processIceQueue(callId: string) {
        const pc = this.peerConnections.get(callId);
        const queue = this.iceCandidateQueue.get(callId);

        if (pc && queue && queue.length > 0) {
            console.log(`[WebRTC] Processing ${queue.length} queued ICE candidates for ${callId}`);
            for (const candidate of queue) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {
                    console.error('[WebRTC] Failed to add queued candidate:', e);
                }
            }
            this.iceCandidateQueue.delete(callId);
        }
    }

    /**
     * Mute/unmute audio
     */
    toggleAudio(callId: string, enabled: boolean): void {
        const stream = this.localStreams.get(callId);
        if (!stream) return;

        stream.getAudioTracks().forEach(track => {
            track.enabled = enabled;
        });

        console.log(`[WebRTC] Audio ${enabled ? 'enabled' : 'disabled'}`);
        callService.updateMedia(callId, enabled);
    }

    /**
     * Mute/unmute video
     */
    toggleVideo(callId: string, enabled: boolean): void {
        const stream = this.localStreams.get(callId);
        if (!stream) return;

        stream.getVideoTracks().forEach(track => {
            track.enabled = enabled;
        });

        console.log(`[WebRTC] Video ${enabled ? 'enabled' : 'disabled'}`);
        callService.updateMedia(callId, undefined, enabled);
    }

    /**
     * Start screen share
     */
    async startScreenShare(callId: string): Promise<void> {
        const pc = this.peerConnections.get(callId);
        if (!pc) throw new Error('Peer connection not found');

        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = stream.getVideoTracks()[0];

            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
                await sender.replaceTrack(screenTrack);
            } else {
                stream.getTracks().forEach(t => t.stop());
                throw new Error('Video must be enabled to share screen');
            }

            // Update local stream
            const localStream = this.localStreams.get(callId);
            if (localStream) {
                const oldTrack = localStream.getVideoTracks()[0];
                if (oldTrack) localStream.removeTrack(oldTrack);
                localStream.addTrack(screenTrack);
            }

            // Handle stop share
            screenTrack.onended = () => {
                this.stopScreenShare(callId);
            };

            console.log('[WebRTC] Started screen share');
        } catch (error) {
            console.error('[WebRTC] Failed to start screen share:', error);
            throw error;
        }
    }

    /**
     * Stop screen share
     */
    async stopScreenShare(callId: string): Promise<void> {
        const pc = this.peerConnections.get(callId);
        const localStream = this.localStreams.get(callId);

        if (!pc || !localStream) return;

        try {
            // Re-acquire camera
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            const cameraTrack = stream.getVideoTracks()[0];

            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
                await sender.replaceTrack(cameraTrack);
            }

            // Remove screen track
            const screenTrack = localStream.getVideoTracks()[0];
            if (screenTrack) {
                screenTrack.stop();
                localStream.removeTrack(screenTrack);
            }
            localStream.addTrack(cameraTrack);

            console.log('[WebRTC] Stopped screen share');
        } catch (error) {
            console.error('[WebRTC] Failed to stop screen share:', error);
        }
    }

    /**
     * Get available media devices
     */
    async getAvailableDevices(): Promise<MediaDeviceInfo[]> {
        return await navigator.mediaDevices.enumerateDevices();
    }

    /**
     * Switch video input device
     */
    async switchVideoDevice(callId: string, deviceId: string): Promise<void> {
        const pc = this.peerConnections.get(callId);
        const localStream = this.localStreams.get(callId);
        if (!pc || !localStream) return;

        try {
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: { exact: deviceId } }
            });
            const newTrack = newStream.getVideoTracks()[0];

            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
                await sender.replaceTrack(newTrack);
            }

            // Update local stream
            const oldTrack = localStream.getVideoTracks()[0];
            if (oldTrack) {
                oldTrack.stop();
                localStream.removeTrack(oldTrack);
            }
            localStream.addTrack(newTrack);

            console.log(`[WebRTC] Switched video to ${deviceId}`);
        } catch (error) {
            console.error('[WebRTC] Failed to switch video device', error);
            throw error;
        }
    }

    /**
     * Switch audio input device
     */
    async switchAudioDevice(callId: string, deviceId: string): Promise<void> {
        const pc = this.peerConnections.get(callId);
        const localStream = this.localStreams.get(callId);
        if (!pc || !localStream) return;

        try {
            const newStream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: { exact: deviceId } }
            });
            const newTrack = newStream.getAudioTracks()[0];

            const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
            if (sender) {
                await sender.replaceTrack(newTrack);
            }

            // Update local stream
            const oldTrack = localStream.getAudioTracks()[0];
            if (oldTrack) {
                oldTrack.stop();
                localStream.removeTrack(oldTrack);
            }
            localStream.addTrack(newTrack);

            console.log(`[WebRTC] Switched audio to ${deviceId}`);
        } catch (error) {
            console.error('[WebRTC] Failed to switch audio device', error);
            throw error;
        }
    }

    /**
     * Get local stream for UI
     */
    getLocalStreamForCall(callId: string): MediaStream | undefined {
        return this.localStreams.get(callId);
    }

    /**
     * Get remote stream for UI
     */
    getRemoteStreamForCall(callId: string): MediaStream | undefined {
        return this.remoteStreams.get(callId);
    }

    /**
     * Close peer connection and cleanup
     */
    closePeerConnection(callId: string): void {
        console.log(`[WebRTC] Closing peer connection for ${callId}`);

        // Stop local stream
        const localStream = this.localStreams.get(callId);
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            this.localStreams.delete(callId);
        }

        // Close peer connection
        const pc = this.peerConnections.get(callId);
        if (pc) {
            pc.close();
            this.peerConnections.delete(callId);
        }

        // Remove remote stream
        this.remoteStreams.delete(callId);
    }

    /**
     * Callback when connection established
     */
    private onConnected(callId: string) {
        console.log(`[WebRTC] Call ${callId} connected`);
        window.dispatchEvent(new CustomEvent('call-connected', { detail: { callId } }));
    }

    /**
     * Callback when connection lost
     */
    private onDisconnected(callId: string) {
        console.log(`[WebRTC] Call ${callId} disconnected`);
        window.dispatchEvent(new CustomEvent('call-disconnected', { detail: { callId } }));
    }

    /**
     * Callback when remote stream received
     */
    private onRemoteStream(callId: string, stream: MediaStream) {
        console.log(`[WebRTC] Remote stream received for ${callId}`);
        window.dispatchEvent(new CustomEvent('remote-stream', {
            detail: { callId, stream }
        }));
    }

    /**
     * Toggle Virtual Background
     */
    async toggleVirtualBackground(callId: string, mode: 'blur' | 'image' | 'none'): Promise<void> {
        const pc = this.peerConnections.get(callId);
        const localStream = this.localStreams.get(callId);

        if (!pc || !localStream) return;

        if (mode === 'none') {
            backgroundProcessor.stopProcessing();
            // Re-acquire default camera
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            const newTrack = stream.getVideoTracks()[0];

            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (sender) await sender.replaceTrack(newTrack);

            const oldTrack = localStream.getVideoTracks()[0];
            if (oldTrack) {
                oldTrack.stop();
                localStream.removeTrack(oldTrack);
            }
            localStream.addTrack(newTrack);
        } else {
            backgroundProcessor.setMode(mode);
            // Clone current track to serve as input
            const sourceStream = new MediaStream(localStream.getVideoTracks().map(t => t.clone()));

            const processedStream = await backgroundProcessor.startProcessing(sourceStream);
            const processedTrack = processedStream.getVideoTracks()[0];

            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (sender) await sender.replaceTrack(processedTrack);

            const oldTrack = localStream.getVideoTracks()[0];
            if (oldTrack) {
                // Don't stop it if it's being used by processor? 
                // Actually, processor uses the CLONED track.
                // So we can stop this track if it was a previous processed track.
                // If it was the original, stopping it might stop the input to the processor if we passed reference.
                // But we passed a clone.
                oldTrack.stop();
                localStream.removeTrack(oldTrack);
            }
            localStream.addTrack(processedTrack);
        }
    }

    /**
     * Get connection stats
     */
    async getStats(callId: string): Promise<RTCStatsReport | null> {
        const pc = this.peerConnections.get(callId);
        if (!pc) return null;

        return await pc.getStats();
    }

    /**
     * Start bandwidth monitoring
     */
    startMonitoring(callId: string, onStats: (stats: any) => void) {
        let prevBytesSent = 0;
        let prevBytesReceived = 0;
        let prevTime = Date.now();

        const interval = setInterval(async () => {
            const pc = this.peerConnections.get(callId);
            if (!pc || pc.connectionState !== 'connected') {
                if (!pc) clearInterval(interval);
                return;
            }

            try {
                const stats = await pc.getStats();
                let bytesSent = 0;
                let bytesReceived = 0;

                stats.forEach(report => {
                    if (report.type === 'transport') {
                        bytesSent = report.bytesSent || 0;
                        bytesReceived = report.bytesReceived || 0;
                    }
                });

                const now = Date.now();
                const timeDiff = (now - prevTime) / 1000; // seconds
                if (timeDiff > 0) {
                    const uploadSpeed = (bytesSent - prevBytesSent) / timeDiff; // bytes/sec
                    const downloadSpeed = (bytesReceived - prevBytesReceived) / timeDiff; // bytes/sec

                    // Convert to KB/s or MB/s
                    const formatSpeed = (bytes: number) => {
                        if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB/s`;
                        return `${(bytes / 1024).toFixed(0)} KB/s`;
                    };

                    const totalMB = ((bytesSent + bytesReceived) / (1024 * 1024)).toFixed(2);

                    onStats({
                        uploadSpeed: formatSpeed(uploadSpeed),
                        downloadSpeed: formatSpeed(downloadSpeed),
                        totalUsage: `${totalMB} MB`,
                        rawUploadRate: uploadSpeed,
                        rawDownloadRate: downloadSpeed
                    });

                    prevBytesSent = bytesSent;
                    prevBytesReceived = bytesReceived;
                    prevTime = now;
                }
            } catch (e) {
                console.error('Stats error', e);
            }
        }, 1000);

        return () => clearInterval(interval);
    }

    /**
     * Check if microphone permission granted
     */
    async checkMicrophonePermission(): Promise<boolean> {
        try {
            const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
            return result.state === 'granted';
        } catch (error) {
            // Fallback: try to get stream
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(track => track.stop());
                return true;
            } catch {
                return false;
            }
        }
    }
}

// Singleton instance
export const webrtcManager = new WebRTCManager();
