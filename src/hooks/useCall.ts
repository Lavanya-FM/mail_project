/**
 * useCall.ts
 * React hook for call management
 * Provides easy integration with components
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { callService, CallSession, CallEvent } from '../lib/callService';
import { webrtcManager } from '../lib/webrtcManager';
import { backgroundProcessor } from '../lib/backgroundProcessor';
import toast from 'react-hot-toast';

export interface UseCallOptions {
    userEmail: string;
    userId: number;
    onIncomingCall?: (callId: string, caller: string) => void;
    onCallEnded?: (callId: string) => void;
}

export interface UseCallReturn {
    // State
    activeCall: CallSession | null;
    incomingCall: CallSession | null;
    isRinging: boolean;
    isConnected: boolean;
    isMuted: boolean;
    isVideoEnabled: boolean;
    isScreenSharing: boolean;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;

    // Actions
    initiateCall: (callee: string, type?: 'audio' | 'video', threadId?: string) => Promise<void>;
    acceptCall: () => Promise<void>;
    rejectCall: () => Promise<void>;
    endCall: () => Promise<void>;
    toggleMute: () => void;
    toggleVideo: () => void;
    toggleScreenShare: () => Promise<void>;

    // Status
    callDuration: number;
    connectionStats?: { upload: string; download: string; total: string };
    availableDevices: { audio: MediaDeviceInfo[], video: MediaDeviceInfo[] };
    switchCamera: (deviceId: string) => Promise<void>;
    switchMicrophone: (deviceId: string) => Promise<void>;
    toggleVirtualBackground: (mode: 'blur' | 'image' | 'none') => Promise<void>;

    // Interaction
    chatMessages: Array<{ sender: string; content: string; timestamp: number; type?: string; fileUrl?: string; fileName?: string }>;
    sendChat: (message: string) => void;
    sendReaction: (reaction: string) => void;
    toggleHand: () => void;
    remoteHandRaised: boolean;
}

export function useCall(options: UseCallOptions): UseCallReturn {
    const { userEmail, onIncomingCall, onCallEnded } = options;

    const [activeCall, setActiveCall] = useState<CallSession | null>(null);
    const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(false); // Default to false, will be updated on call start
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [callDuration, setCallDuration] = useState(0);
    const [connectionStats, setConnectionStats] = useState({ upload: '0 KB/s', download: '0 KB/s', total: '0 MB' });
    const [availableDevices, setAvailableDevices] = useState<{ audio: MediaDeviceInfo[], video: MediaDeviceInfo[] }>({ audio: [], video: [] });
    const [chatMessages, setChatMessages] = useState<Array<{ sender: string; content: string; timestamp: number; type?: string; fileUrl?: string; fileName?: string }>>([]);
    const [remoteHandRaised, setRemoteHandRaised] = useState(false);
    const [isHandRaised, setIsHandRaised] = useState(false);

    const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const deviceId = useRef(`device_${Date.now()}`);

    const isRinging = activeCall?.status === 'ringing' || incomingCall !== null;

    /**
     * Handle incoming call invitation
     */
    const handleCallInvite = useCallback((event: CallEvent) => {
        if (event.from === userEmail) return; // Ignore own calls

        console.log('[useCall] Incoming call from:', event.from);

        const call: CallSession = {
            callId: event.callId,
            threadId: event.payload.context?.threadId,
            caller: event.from,
            callerName: event.payload.callerName,
            callee: userEmail,
            callType: event.payload.mode || 'audio',
            status: 'ringing',
            startedAt: new Date(event.timestamp),
            duration: 0
        };

        setIncomingCall(call);
        setIsVideoEnabled(call.callType === 'video');
        onIncomingCall?.(event.callId, event.from);

        // Play ringtone
        playRingtone();
    }, [userEmail, onIncomingCall]);

    /**
     * Handle call acceptance
     */
    const handleCallAccept = useCallback(async (event: CallEvent) => {
        console.log('[useCall] Call accepted');

        const call = activeCall || callService.getCall(event.callId);
        if (!call) return;

        setActiveCall(call);
        setIncomingCall(null);
        setIsVideoEnabled(call.callType === 'video');
        stopRingtone();

        try {
            // Create peer connection (as initiator)
            const remotePeer = call.callee;
            const enableVideo = call.callType === 'video';
            await webrtcManager.createPeerConnection(event.callId, remotePeer, true, enableVideo);

            // Get local stream
            const stream = webrtcManager.getLocalStreamForCall(event.callId);
            if (stream) {
                setLocalStream(stream);
            }
        } catch (error: any) {
            console.error('[useCall] Connection setup failed:', error);
            toast.error('Failed to establish connection: ' + error.message);
            // Should probably end call?
            await callService.endCall(event.callId, 'hangup');
        }
    }, [activeCall]);

    /**
     * Handle call rejection
     */
    const handleCallReject = useCallback((event: CallEvent) => {
        console.log('[useCall] Call rejected:', event.payload.reason);

        setActiveCall(null);
        setIncomingCall(null);
        stopRingtone();

        toast.error(`Call ${event.payload.reason === 'BUSY' ? 'busy' : 'declined'}`);
    }, []);

    /**
     * Handle call end
     */
    const handleCallEnd = useCallback((event: CallEvent) => {
        console.log('[useCall] Call ended:', event.payload.reason);

        const callId = event.callId;

        // Cleanup WebRTC
        webrtcManager.closePeerConnection(callId);

        // Stop Virtual Background
        backgroundProcessor.stopProcessing();

        // Ensure local stream tracks are stopped
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }

        // Clear state
        setActiveCall(null);
        setIncomingCall(null);
        setIsConnected(false);
        setLocalStream(null);
        setRemoteStream(null);
        setCallDuration(0);
        setChatMessages([]); // Clear chat history
        setRemoteHandRaised(false); // Reset hand state
        setIsHandRaised(false); // Reset local hand
        stopRingtone();

        // Stop duration timer
        if (durationIntervalRef.current) {
            clearInterval(durationIntervalRef.current);
            durationIntervalRef.current = null;
        }

        onCallEnded?.(callId);

        if (event.payload.reason === 'hangup') {
            toast('Call ended');
        } else if (event.payload.reason === 'timeout') {
            toast.error('Call not answered');
        }
    }, [onCallEnded]);

    /**
     * Handle WebRTC offer
     */
    const handleRTCOffer = useCallback(async (event: CallEvent) => {
        console.log('[useCall] Received WebRTC offer');

        const call = incomingCall || activeCall;
        if (!call) return;

        try {
            // Check if PC exists
            let pc = webrtcManager.getPeerConnection(event.callId);

            if (!pc) {
                // Create peer connection (as answerer) if new
                const enableVideo = call.callType === 'video';
                await webrtcManager.createPeerConnection(event.callId, event.from, false, enableVideo);
            }

            // Handle the offer
            await webrtcManager.handleOffer(event.callId, event.payload.sdp, event.from);

            // Get local stream (if changed/added)
            const stream = webrtcManager.getLocalStreamForCall(event.callId);
            if (stream) {
                setLocalStream(stream);
            }
        } catch (error: any) {
            console.error('[useCall] Offer handling failed:', error);
        }
    }, [incomingCall, activeCall]);

    /**
     * Handle WebRTC answer
     */
    const handleRTCAnswer = useCallback(async (event: CallEvent) => {
        console.log('[useCall] Received WebRTC answer');

        await webrtcManager.handleAnswer(event.callId, event.payload.sdp);
    }, []);

    /**
     * Handle ICE candidate
     */
    const handleRTCIce = useCallback(async (event: CallEvent) => {
        console.log('[useCall] Received ICE candidate');

        await webrtcManager.handleIceCandidate(event.callId, event.payload.candidate);
    }, []);

    /**
     * Handle media update
     */
    const handleMediaUpdate = useCallback((event: CallEvent) => {
        console.log('[useCall] Media update:', event.payload);
        // Remote peer muted/unmuted - could update UI
    }, []);

    // Get available devices
    useEffect(() => {
        webrtcManager.getAvailableDevices().then(devs => {
            setAvailableDevices({
                audio: devs.filter(d => d.kind === 'audioinput'),
                video: devs.filter(d => d.kind === 'videoinput')
            });
        });
    }, []);

    /**
     * Switch Camera
     */
    const switchCamera = useCallback(async (deviceId: string) => {
        if (!activeCall) return;
        await webrtcManager.switchVideoDevice(activeCall.callId, deviceId);
    }, [activeCall]);

    /**
     * Switch Microphone
     */
    const switchMicrophone = useCallback(async (deviceId: string) => {
        if (!activeCall) return;
        await webrtcManager.switchAudioDevice(activeCall.callId, deviceId);
    }, [activeCall]);

    /**
     * Toggle Virtual Background
     */
    const toggleVirtualBackground = useCallback(async (mode: 'blur' | 'image' | 'none') => {
        if (!activeCall) return;
        await webrtcManager.toggleVirtualBackground(activeCall.callId, mode);
    }, [activeCall]);


    /**
     * Interaction methods
     */
    const sendChat = useCallback((message: string) => {
        if (!activeCall) return;
        callService.sendChatMessage(activeCall.callId, message);
        setChatMessages(prev => [...prev, { sender: 'You', content: message, timestamp: Date.now() }]);
    }, [activeCall]);

    const sendReaction = useCallback((reaction: string) => {
        if (!activeCall) return;
        callService.sendReaction(activeCall.callId, reaction);
    }, [activeCall]);

    const toggleHand = useCallback(() => {
        if (!activeCall) return;
        const newState = !isHandRaised;
        setIsHandRaised(newState);
        callService.sendHandRaise(activeCall.callId, newState);
    }, [activeCall, isHandRaised]);


    /**
     * Initiate outgoing call
     */
    const initiateCall = useCallback(async (callee: string, type: 'audio' | 'video' = 'audio', threadId?: string) => {
        try {
            // Check microphone permission
            const hasPermission = await webrtcManager.checkMicrophonePermission();
            if (!hasPermission) {
                toast.error('Microphone permission required');
                return;
            }

            const callId = await callService.initiateCall(callee, type, threadId);

            const call = callService.getCall(callId);
            if (call) {
                setActiveCall(call);
                setIsVideoEnabled(type === 'video');
            }

            toast(`Calling ${callee}...`);
        } catch (error: any) {
            console.error('[useCall] Failed to initiate call:', error);
            toast.error(error.message || 'Failed to start call');
        }
    }, []);

    /**
     * Accept incoming call
     */
    const acceptCall = useCallback(async () => {
        if (!incomingCall) return;

        try {
            // Check permission before accepting
            const hasPermission = await webrtcManager.checkMicrophonePermission();
            if (!hasPermission) {
                toast.error('Microphone access required');
                return;
            }

            await callService.acceptCall(incomingCall.callId, deviceId.current);
            setActiveCall(incomingCall);
            setIncomingCall(null);
            setIsVideoEnabled(incomingCall.callType === 'video');
            stopRingtone();

            toast.success('Call connected');
        } catch (error: any) {
            console.error('[useCall] Failed to accept call:', error);
            toast.error('Failed to accept call');
        }
    }, [incomingCall]);

    /**
     * Reject incoming call
     */
    const rejectCall = useCallback(async () => {
        if (!incomingCall) return;

        await callService.rejectCall(incomingCall.callId, 'DECLINED');
        setIncomingCall(null);
        stopRingtone();
    }, [incomingCall]);

    /**
     * End active call
     */
    // Monitor connection stats
    useEffect(() => {
        let cleanup: (() => void) | undefined;

        if (isConnected && activeCall) {
            cleanup = webrtcManager.startMonitoring(activeCall.callId, (stats) => {
                setConnectionStats({
                    upload: stats.uploadSpeed,
                    download: stats.downloadSpeed,
                    total: stats.totalUsage
                });
            });
        }

        return () => {
            if (cleanup) cleanup();
        };
    }, [isConnected, activeCall]);

    /**
     *  End active call
     */
    const endCall = useCallback(async () => {
        if (!activeCall) return;

        await callService.endCall(activeCall.callId, 'hangup');
    }, [activeCall]);

    /**
     * Toggle mute
     */
    const toggleMute = useCallback(() => {
        if (!activeCall) return;

        const newMutedState = !isMuted;
        webrtcManager.toggleAudio(activeCall.callId, !newMutedState);
        setIsMuted(newMutedState);
    }, [activeCall, isMuted]);

    /**
     * Toggle video
     */
    const toggleVideo = useCallback(() => {
        if (!activeCall) return;

        const newState = !isVideoEnabled;
        webrtcManager.toggleVideo(activeCall.callId, newState);
        setIsVideoEnabled(newState);
    }, [activeCall, isVideoEnabled]);

    /**
     * Toggle screen share
     */
    const toggleScreenShare = useCallback(async () => {
        if (!activeCall) return;

        try {
            if (isScreenSharing) {
                await webrtcManager.stopScreenShare(activeCall.callId);
                setIsScreenSharing(false);
            } else {
                await webrtcManager.startScreenShare(activeCall.callId);
                setIsScreenSharing(true);
            }
        } catch (error: any) {
            console.error('[useCall] Failed to toggle screen share:', error);
            toast.error('Screen sharing failed');
        }
    }, [activeCall, isScreenSharing]);

    /**
     * Setup event listeners
     */
    /**
     * Setup event listeners and state sync
     */
    useEffect(() => {
        const handleStateChange = () => {
            const calls = callService.getActiveCalls();

            // Find call where I am caller or callee
            const myCall = calls.find(c =>
                c.caller === userEmail || c.callee === userEmail
            );

            if (myCall) {
                if (myCall.status === 'ringing' && myCall.callee === userEmail) {
                    setIncomingCall(myCall);
                } else {
                    setActiveCall(myCall);
                    // If call became connected, clear incoming
                    if (myCall.status !== 'ringing') {
                        setIncomingCall(null);
                    }
                }
            } else {
                // No active call found (ended)
                if (activeCall) {
                    setActiveCall(null);
                    setIncomingCall(null);
                    setIsConnected(false);
                    stopRingtone();
                }
            }
        };

        const handleCallChat = (event: CallEvent) => {
            setChatMessages(prev => [...prev, {
                sender: event.from,
                content: event.payload.message,
                timestamp: event.timestamp,
                type: event.payload.type,
                fileUrl: event.payload.fileUrl,
                fileName: event.payload.fileName
            }]);
        };

        const handleCallHand = (event: CallEvent) => {

            setRemoteHandRaised(event.payload.raised);
            // Toast handled by ActiveCall floating UI
        };

        const handleCallReaction = (event: CallEvent) => {

            // Dispatch generic event for UI to pick up because reaction is ephemeral
            window.dispatchEvent(new CustomEvent('remote-reaction', { detail: event.payload.reaction }));
            // Toast handled by ActiveCall floating UI
        };

        // Initial check
        handleStateChange();

        callService.on('CALL_INVITE', handleCallInvite);
        callService.on('CALL_ACCEPT', handleCallAccept);
        callService.on('CALL_REJECT', handleCallReject);
        callService.on('CALL_END', handleCallEnd);
        callService.on('RTC_OFFER', handleRTCOffer);
        callService.on('RTC_ANSWER', handleRTCAnswer);
        callService.on('RTC_ICE', handleRTCIce);
        callService.on('MEDIA_UPDATE', handleMediaUpdate);
        callService.on('CALL_CHAT', handleCallChat);
        callService.on('CALL_HAND', handleCallHand);
        callService.on('CALL_REACTION', handleCallReaction);
        callService.onStateChange(handleStateChange);

        return () => {
            callService.off('CALL_INVITE', handleCallInvite);
            callService.off('CALL_ACCEPT', handleCallAccept);
            callService.off('CALL_REJECT', handleCallReject);
            callService.off('CALL_END', handleCallEnd);
            callService.off('RTC_OFFER', handleRTCOffer);
            callService.off('RTC_ANSWER', handleRTCAnswer);
            callService.off('RTC_ICE', handleRTCIce);
            callService.off('MEDIA_UPDATE', handleMediaUpdate);
            callService.off('CALL_CHAT', handleCallChat);
            callService.off('CALL_HAND', handleCallHand);
            callService.off('CALL_REACTION', handleCallReaction);
            callService.offStateChange(handleStateChange);
        };
    }, [
        userEmail,
        activeCall,
        // ... handlers
        handleCallInvite,
        handleCallAccept,
        handleCallReject,
        handleCallEnd,
        handleRTCOffer,
        handleRTCAnswer,
        handleRTCIce,
        handleMediaUpdate
    ]);

    /**
     * Listen for remote stream
     */
    useEffect(() => {
        const handleRemoteStream = (event: any) => {
            const { callId, stream } = event.detail;
            if (activeCall?.callId === callId) {
                // Force new reference to trigger React updates
                setRemoteStream(new MediaStream(stream.getTracks()));
                setIsConnected(true);

                // Start duration timer
                durationIntervalRef.current = setInterval(() => {
                    setCallDuration(prev => prev + 1);
                }, 1000);
            }
        };

        window.addEventListener('remote-stream', handleRemoteStream);

        return () => {
            window.removeEventListener('remote-stream', handleRemoteStream);
        };
    }, [activeCall]);

    return {
        activeCall,
        incomingCall,
        isRinging,
        isConnected,
        isMuted,
        isVideoEnabled,
        isScreenSharing,
        localStream,
        remoteStream,
        initiateCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleVideo,
        toggleScreenShare,
        callDuration,
        connectionStats,
        availableDevices,
        switchCamera,
        switchMicrophone,
        toggleVirtualBackground,
        chatMessages,
        sendChat,
        sendReaction,
        toggleHand,
        remoteHandRaised
    };
}

// Shared AudioContext to avoid multiple instances
let sharedAudioContext: AudioContext | null = null;

/**
 * Unlock audio context on user interaction
 */
export function unlockAudio() {
    try {
        if (!sharedAudioContext) {
            sharedAudioContext = new AudioContext();
        }
        if (sharedAudioContext.state === 'suspended') {
            sharedAudioContext.resume();
        }
    } catch (e) {
        // Ignore errors during unlock
    }
}

/**
 * Play ringtone
 */
function playRingtone() {
    // Simple beep using Web Audio API
    try {
        // Create or reuse AudioContext
        if (!sharedAudioContext) {
            sharedAudioContext = new AudioContext();
        }

        // Resume if suspended (browser autoplay policy)
        if (sharedAudioContext.state === 'suspended') {
            sharedAudioContext.resume().catch(() => {
                // Silently fail - user hasn't interacted yet
            });
        }

        // Only play if context is running
        if (sharedAudioContext.state === 'running') {
            const oscillator = sharedAudioContext.createOscillator();
            const gainNode = sharedAudioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(sharedAudioContext.destination);

            oscillator.frequency.value = 440; // A4 note
            gainNode.gain.value = 0.1;

            oscillator.start();
            setTimeout(() => {
                oscillator.stop();
                oscillator.disconnect();
                gainNode.disconnect();
            }, 200);
        }
    } catch (error) {
        // Silently fail - audio is not critical
        console.warn('[useCall] Ringtone skipped:', error);
    }
}

/**
 * Stop ringtone
 */
function stopRingtone() {
    // Ringtone stops automatically after beep
}
