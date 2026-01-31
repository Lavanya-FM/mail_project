/**
 * callService.ts
 * Core call management service
 * Handles call lifecycle, signaling, and state management
 */

import { p2pService } from './p2pService';

export interface CallParticipant {
    email: string;
    userId: number;
    audio: boolean;
    video: boolean;
}

export interface CallSession {
    callId: string;
    threadId?: string;
    caller: string;
    callerName?: string;
    callee: string;
    calleeName?: string;
    callType: 'audio' | 'video';
    status: 'ringing' | 'connecting' | 'connected' | 'ended' | 'missed' | 'rejected';
    startedAt: Date;
    connectedAt?: Date;
    endedAt?: Date;
    duration: number;
}

export type CallEventType =
    | 'CALL_INVITE'
    | 'CALL_ACCEPT'
    | 'CALL_REJECT'
    | 'CALL_CANCEL'
    | 'RTC_OFFER'
    | 'RTC_ANSWER'
    | 'RTC_ICE'
    | 'CALL_STATE'
    | 'MEDIA_UPDATE'
    | 'CALL_REACTION'
    | 'CALL_HAND'
    | 'CALL_CHAT'
    | 'CALL_END';

export interface CallEvent {
    v: number;
    type: 'CALL_EVENT';
    event: CallEventType;
    callId: string;
    from: string;
    to: string[];
    timestamp: number;
    payload: any;
}

type CallEventHandler = (event: CallEvent) => void;

type CallStateChangeHandler = () => void;

function getUserEmail(): string {
    try {
        const u = localStorage.getItem('user');
        return u ? JSON.parse(u).email || '' : '';
    } catch {
        return '';
    }
}

function getUserName(): string {
    try {
        const u = localStorage.getItem('user');
        return u ? JSON.parse(u).full_name || JSON.parse(u).name || '' : '';
    } catch {
        return '';
    }
}

class CallService {
    private eventHandlers: Map<CallEventType, Set<CallEventHandler>> = new Map();
    private stateChangeHandlers: Set<CallStateChangeHandler> = new Set();
    private activeCalls: Map<string, CallSession> = new Map();

    /**
     * Subscribe to global state changes
     */
    onStateChange(handler: CallStateChangeHandler) {
        this.stateChangeHandlers.add(handler);
    }

    /**
     * Unsubscribe from global state changes
     */
    offStateChange(handler: CallStateChangeHandler) {
        this.stateChangeHandlers.delete(handler);
    }

    /**
     * Notify all state listeners
     */
    private notifyStateChange() {
        this.stateChangeHandlers.forEach(handler => handler());
    }

    /**
     * Initialize call service
     */
    private initialized = false;

    /**
     * Initialize call service
     */
    init() {
        if (this.initialized) return;
        this.initialized = true;

        // Listen for call events from P2P WebSocket
        if (typeof window !== 'undefined') {
            window.addEventListener('p2p-message', this.handleP2PMessage.bind(this));
            // NEW: Listen for secure connection ready
            window.addEventListener('p2p-connection-ready', this.handleConnectionReady.bind(this));
        }

        console.log('[CallService] Initialized');
    }

    /**
     * Handle P2P connection ready
     */
    private handleConnectionReady(event: any) {
        const { peer } = event.detail;
        console.log(`[CallService] Secure connection ready with ${peer}`);

        // FIX 3: Promote call to ACTIVE/CONNECTED state
        // Find any call with this peer that is pending
        const activeCall = Array.from(this.activeCalls.values()).find(c =>
            (c.caller === peer || c.callee === peer) &&
            (c.status === 'ringing' || c.status === 'connecting')
        );

        if (activeCall) {
            console.log(`[CallService] Promoting call ${activeCall.callId} to CONNECTED`);
            // Force status update
            activeCall.status = 'connected';
            activeCall.connectedAt = new Date();
            this.notifyStateChange();
        } else {
            console.log(`[CallService] Connection ready for ${peer}, but no pending call found.`);
        }
    }

    /**
     * Handle incoming P2P messages
     */
    private handleP2PMessage(event: any) {
        const msg = event.detail;
        console.log('[CallService] Received P2P message:', msg.type, msg.event);

        if (msg.type === 'CALL_EVENT') {
            console.log('[CallService] Processing CALL_EVENT:', msg.event, msg);
            this.handleCallEvent(msg);
        }
    }

    /**
     * Handle call event
     */
    private handleCallEvent(event: CallEvent) {
        console.log(`[CallService] ${event.event}:`, event);

        // Update active call state
        if (event.event === 'CALL_INVITE') {
            this.activeCalls.set(event.callId, {
                callId: event.callId,
                threadId: event.payload.context?.threadId,
                caller: event.from,
                callerName: event.payload.callerName,
                callee: event.to[0],
                callType: event.payload.mode || 'audio',
                status: 'ringing',
                startedAt: new Date(event.timestamp),
                duration: 0
            });
            this.notifyStateChange();
        } else if (event.event === 'CALL_ACCEPT') {
            const call = this.activeCalls.get(event.callId);
            if (call) {
                call.status = 'connecting';
                call.connectedAt = new Date();
                if (event.payload.calleeName) {
                    call.calleeName = event.payload.calleeName;
                }
                this.notifyStateChange();
            }
        } else if (event.event === 'CALL_END') {
            const call = this.activeCalls.get(event.callId);
            if (call) {
                // Determine status based on reason
                const reason = event.payload.reason;
                if (reason === 'timeout') call.status = 'missed';
                else if (reason === 'busy' || reason === 'declined') call.status = 'rejected';
                else call.status = 'ended';

                call.endedAt = new Date();
                call.duration = event.payload.duration || 0;
                this.saveCallToHistory(call);
                this.notifyStateChange();

                // Remove from active calls after 5 seconds
                setTimeout(() => {
                    this.activeCalls.delete(event.callId);
                    this.notifyStateChange();
                }, 5000);
            }
        } else if (event.event === 'CALL_REJECT') {
            const call = this.activeCalls.get(event.callId);
            if (call) {
                call.status = 'rejected';
                call.endedAt = new Date();
                this.saveCallToHistory(call);
                this.notifyStateChange();

                setTimeout(() => {
                    this.activeCalls.delete(event.callId);
                    this.notifyStateChange();
                }, 5000);
            }
        }

        // Notify handlers
        const handlers = this.eventHandlers.get(event.event);
        if (handlers) {
            handlers.forEach(handler => handler(event));
        }
    }

    /**
     * Initiate a call
     */
    async initiateCall(
        callee: string,
        callType: 'audio' | 'video' = 'audio',
        threadId?: string
    ): Promise<string> {
        const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const userEmail = getUserEmail();

        console.log('[CallService] Initiating call', { callId, userEmail, callee });

        const event: CallEvent = {
            v: 1,
            type: 'CALL_EVENT',
            event: 'CALL_INVITE',
            callId,
            from: userEmail,
            to: [callee],
            timestamp: Date.now(),
            payload: {
                mode: callType,
                callerName: getUserName(),
                context: {
                    threadId
                },
                capabilities: {
                    video: callType === 'video',
                    audio: true,
                    screenShare: false
                },
                timeoutSec: 30
            }
        };

        // Send via P2P WebSocket
        this.sendCallEvent(event);

        // Create local call session
        this.activeCalls.set(callId, {
            callId,
            threadId,
            caller: userEmail,
            callerName: getUserName(),
            callee,
            callType,
            status: 'ringing',
            startedAt: new Date(),
            duration: 0
        });
        this.notifyStateChange();

        console.log(`[CallService] Initiated call ${callId} to ${callee}`);
        return callId;
    }

    /**
     * Accept incoming call
     */
    async acceptCall(callId: string, deviceId: string): Promise<void> {
        const call = this.activeCalls.get(callId);
        if (!call) {
            throw new Error('Call not found');
        }

        const userEmail = getUserEmail();

        const event: CallEvent = {
            v: 1,
            type: 'CALL_EVENT',
            event: 'CALL_ACCEPT',
            callId,
            from: userEmail,
            to: [call.caller],
            timestamp: Date.now(),
            payload: {
                deviceId,
                preferredMode: call.callType,
                calleeName: getUserName()
            }
        };

        this.sendCallEvent(event);

        call.status = 'connecting';
        call.connectedAt = new Date();
        this.notifyStateChange();

        console.log(`[CallService] Accepted call ${callId}`);
    }

    /**
     * Reject incoming call
     */
    async rejectCall(callId: string, reason: string = 'DECLINED'): Promise<void> {
        const call = this.activeCalls.get(callId);
        if (!call) return;

        const userEmail = getUserEmail();

        const event: CallEvent = {
            v: 1,
            type: 'CALL_EVENT',
            event: 'CALL_REJECT',
            callId,
            from: userEmail,
            to: [call.caller],
            timestamp: Date.now(),
            payload: { reason }
        };

        this.sendCallEvent(event);

        call.status = 'rejected';
        this.activeCalls.delete(callId);
        this.notifyStateChange();

        console.log(`[CallService] Rejected call ${callId}`);
    }

    /**
     * Cancel outgoing call
     */
    async cancelCall(callId: string): Promise<void> {
        const call = this.activeCalls.get(callId);
        if (!call) return;

        const userEmail = getUserEmail();

        const event: CallEvent = {
            v: 1,
            type: 'CALL_EVENT',
            event: 'CALL_CANCEL',
            callId,
            from: userEmail,
            to: [call.callee],
            timestamp: Date.now(),
            payload: {}
        };

        this.sendCallEvent(event);

        call.status = 'ended';
        this.activeCalls.delete(callId);
        this.notifyStateChange();

        console.log(`[CallService] Cancelled call ${callId}`);
    }

    /**
     * End active call
     */
    async endCall(callId: string, reason: string = 'hangup'): Promise<void> {
        const call = this.activeCalls.get(callId);
        if (!call) return;

        const userEmail = getUserEmail();
        const duration = call.connectedAt
            ? Math.floor((Date.now() - call.connectedAt.getTime()) / 1000)
            : 0;

        const event: CallEvent = {
            v: 1,
            type: 'CALL_EVENT',
            event: 'CALL_END',
            callId,
            from: userEmail,
            to: [call.caller === userEmail ? call.callee : call.caller],
            timestamp: Date.now(),
            payload: {
                reason,
                durationSec: duration
            }
        };

        this.sendCallEvent(event);

        // Handle locally to trigger listeners and cleanup
        this.handleCallEvent(event);
    }

    /**
     * Send WebRTC offer
     */
    async sendOffer(callId: string, sdp: string, to: string): Promise<void> {
        const userEmail = getUserEmail();

        const event: CallEvent = {
            v: 1,
            type: 'CALL_EVENT',
            event: 'RTC_OFFER',
            callId,
            from: userEmail,
            to: [to],
            timestamp: Date.now(),
            payload: { sdp }
        };

        this.sendCallEvent(event);
    }

    /**
     * Send WebRTC answer
     */
    async sendAnswer(callId: string, sdp: string, to: string): Promise<void> {
        const userEmail = getUserEmail();

        const event: CallEvent = {
            v: 1,
            type: 'CALL_EVENT',
            event: 'RTC_ANSWER',
            callId,
            from: userEmail,
            to: [to],
            timestamp: Date.now(),
            payload: { sdp }
        };

        this.sendCallEvent(event);
    }

    /**
     * Send ICE candidate
     */
    async sendIceCandidate(callId: string, candidate: any, to: string): Promise<void> {
        const userEmail = getUserEmail();

        const event: CallEvent = {
            v: 1,
            type: 'CALL_EVENT',
            event: 'RTC_ICE',
            callId,
            from: userEmail,
            to: [to],
            timestamp: Date.now(),
            payload: { candidate }
        };

        this.sendCallEvent(event);
    }

    /**
     * Update media state (mute/unmute)
     */
    async updateMedia(callId: string, audio?: boolean, video?: boolean): Promise<void> {
        const call = this.activeCalls.get(callId);
        if (!call) return;

        const userEmail = getUserEmail();
        const to = call.caller === userEmail ? call.callee : call.caller;

        const event: CallEvent = {
            v: 1,
            type: 'CALL_EVENT',
            event: 'MEDIA_UPDATE',
            callId,
            from: userEmail,
            to: [to],
            timestamp: Date.now(),
            payload: { audio, video }
        };

        this.sendCallEvent(event);
    }

    /**
     * Send reaction
     */
    async sendReaction(callId: string, reaction: string): Promise<void> {
        const call = this.activeCalls.get(callId);
        if (!call) return;
        const userEmail = getUserEmail();
        const to = call.caller === userEmail ? call.callee : call.caller;
        const event: CallEvent = {
            v: 1, type: 'CALL_EVENT', event: 'CALL_REACTION',
            callId, from: userEmail, to: [to], timestamp: Date.now(),
            payload: { reaction }
        };
        this.sendCallEvent(event);
    }

    /**
     * Send hand raise
     */
    async sendHandRaise(callId: string, raised: boolean): Promise<void> {
        const call = this.activeCalls.get(callId);
        if (!call) return;
        const userEmail = getUserEmail();
        const to = call.caller === userEmail ? call.callee : call.caller;
        const event: CallEvent = {
            v: 1, type: 'CALL_EVENT', event: 'CALL_HAND',
            callId, from: userEmail, to: [to], timestamp: Date.now(),
            payload: { raised }
        };
        this.sendCallEvent(event);
    }

    /**
     * Send chat message
     */
    async sendChatMessage(callId: string, message: string, attachment?: { type: 'text' | 'file'; fileUrl?: string; fileName?: string; size?: number }): Promise<void> {
        const call = this.activeCalls.get(callId);
        if (!call) return;
        const userEmail = getUserEmail();
        const to = call.caller === userEmail ? call.callee : call.caller;
        const event: CallEvent = {
            v: 1, type: 'CALL_EVENT', event: 'CALL_CHAT',
            callId, from: userEmail, to: [to], timestamp: Date.now(),
            payload: { message, ...attachment }
        };
        this.sendCallEvent(event);
    }

    /**
     * Send call event via P2P WebSocket
     */
    private sendCallEvent(event: CallEvent) {
        // Use exposed method
        p2pService.sendCallEvent(event);
    }


    /**
     * Register event handler
     */
    on(event: CallEventType, handler: CallEventHandler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, new Set());
        }
        this.eventHandlers.get(event)!.add(handler);
    }

    /**
     * Unregister event handler
     */
    off(event: CallEventType, handler: CallEventHandler) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.delete(handler);
        }
    }

    /**
     * Get active call
     */
    getCall(callId: string): CallSession | undefined {
        return this.activeCalls.get(callId);
    }

    /**
     * Get all active calls
     */
    getActiveCalls(): CallSession[] {
        return Array.from(this.activeCalls.values());
    }

    /**
     * Check if user has active call
     */
    hasActiveCall(): boolean {
        return this.activeCalls.size > 0;
    }

    /**
     * Save call to history
     */
    private saveCallToHistory(call: CallSession) {
        try {
            const userEmail = getUserEmail();
            const history = localStorage.getItem('call_history');
            const calls = history ? JSON.parse(history) : [];

            const log = {
                id: call.callId,
                peer: call.caller === userEmail ? call.callee : call.caller, // Remote peer
                type: call.callType,
                direction: call.caller === userEmail ? 'outbound' : 'inbound',
                timestamp: call.startedAt.getTime(),
                duration: call.duration,
                status: call.status
            };

            // Avoid duplicates if called multiple times
            if (!calls.find((c: any) => c.id === log.id)) {
                calls.unshift(log);
                if (calls.length > 50) calls.pop();
                localStorage.setItem('call_history', JSON.stringify(calls));
            }
        } catch (e) {
            console.error('Failed to save call history', e);
        }
    }
}

// Singleton instance
export const callService = new CallService();
