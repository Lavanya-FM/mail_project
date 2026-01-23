/**
 * CallManager.tsx
 * Global call manager component
 * Handles incoming calls and active call UI
 */

import { useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { useCall, unlockAudio } from '../hooks/useCall';
import { authService } from '../lib/authService';
import { callService } from '../lib/callService';
import IncomingCall from './IncomingCall';
import ActiveCall from './ActiveCall';

export default function CallManager() {
    const user = authService.getCurrentUser();
    const notifiedCalls = useRef(new Set<string>());
    const notificationIdRef = useRef<string | null>(null);

    const {
        activeCall,
        incomingCall,
        isConnected,
        isMuted,
        isVideoEnabled,
        localStream,
        remoteStream,
        acceptCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleVideo,
        toggleScreenShare,
        isScreenSharing,
        availableDevices,
        switchCamera,
        switchMicrophone,
        toggleVirtualBackground,
        chatMessages,
        sendChat,
        sendReaction,
        toggleHand,
        remoteHandRaised,
    } = useCall({
        userEmail: user?.email || '',
        userId: user?.id || 0,
        onIncomingCall: (callId, caller) => {
            if (notifiedCalls.current.has(callId)) return;
            notifiedCalls.current.add(callId);

            console.log(`[CallManager] Incoming call from ${caller}`);
            console.log(`[CallManager] Incoming call from ${caller}`);
            notificationIdRef.current = toast(`Incoming call from ${caller}`, { icon: '📞', duration: 10000 });

            // Could show browser notification here
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('Incoming Call', {
                    body: `Call from ${caller}`,
                    icon: '/phone-icon.png',
                    tag: callId
                });
            }
        },
        onCallEnded: (callId) => {
            console.log(`[CallManager] Call ${callId} ended`);
        }
    });

    useEffect(() => {
        console.log('[CallManager] Debug:', { user, activeCall, incomingCall });
    }, [user, activeCall, incomingCall]);

    // Dismiss notification when call accepted or ended
    useEffect(() => {
        if (activeCall || !incomingCall) {
            if (notificationIdRef.current) {
                toast.dismiss(notificationIdRef.current);
                notificationIdRef.current = null;
            }
        }
    }, [activeCall, incomingCall]);

    // Initialize call service
    useEffect(() => {
        if (user) {
            callService.init();
        }
    }, [user]);

    // Request notification permission
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    // Listen for incoming chat messages
    useEffect(() => {
        const handleP2PMessage = (e: any) => {
            const msg = e.detail;
            if (msg.type === 'secure-message' && msg.payload?.content) {
                // Determine if we should show notification
                // Only show if it's not from self (obviously)
                if (msg.from !== user?.email) {
                    toast(`New message from ${msg.from}`, { icon: '💬', duration: 4000 });
                }
            }
        };
        window.addEventListener('p2p-message', handleP2PMessage);
        return () => window.removeEventListener('p2p-message', handleP2PMessage);
        return () => window.removeEventListener('p2p-message', handleP2PMessage);
    }, [user]);

    // Unlock audio context on first interaction
    useEffect(() => {
        const handleInteraction = () => {
            unlockAudio();
            window.removeEventListener('click', handleInteraction);
            window.removeEventListener('keydown', handleInteraction);
        };

        window.addEventListener('click', handleInteraction);
        window.addEventListener('keydown', handleInteraction);

        return () => {
            window.removeEventListener('click', handleInteraction);
            window.removeEventListener('keydown', handleInteraction);
        };
    }, []);

    if (!user) return null;

    return (
        <>
            {/* Incoming call notification */}
            {incomingCall && !activeCall && (
                <IncomingCall
                    caller={incomingCall.callerName || incomingCall.caller}
                    onAccept={acceptCall}
                    onReject={rejectCall}
                />
            )}

            {/* Active call UI */}
            {activeCall && activeCall.status !== 'ended' && (
                <ActiveCall
                    remotePeer={activeCall.caller === user.email ? activeCall.callee : activeCall.caller}
                    remotePeerName={activeCall.caller === user.email ? (activeCall.calleeName || activeCall.callee) : (activeCall.callerName || activeCall.caller)}
                    isConnected={isConnected}
                    isMuted={isMuted}
                    isVideoEnabled={isVideoEnabled}
                    localStream={localStream}
                    remoteStream={remoteStream}
                    onToggleMute={toggleMute}
                    onEndCall={endCall}
                    onToggleVideo={toggleVideo}
                    isOutbound={activeCall.caller === user.email}
                    isVideo={activeCall.callType === 'video'}
                    isScreenSharing={isScreenSharing}
                    onToggleScreenShare={toggleScreenShare}
                    availableDevices={availableDevices}
                    onSwitchCamera={switchCamera}
                    onSwitchMicrophone={switchMicrophone}
                    onToggleVirtualBackground={toggleVirtualBackground}
                    chatMessages={chatMessages}
                    onSendChat={sendChat}
                    onSendReaction={sendReaction}
                    onToggleHand={toggleHand}
                    remoteHandRaised={remoteHandRaised}
                />
            )}
        </>
    );
}
