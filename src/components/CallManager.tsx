/**
 * CallManager.tsx
 * Global call manager component
 * Handles incoming calls and active call UI
 */

import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useCall, unlockAudio } from '../hooks/useCall';
import { authService } from '../lib/authService';
import { callService } from '../lib/callService';
import IncomingCall from './IncomingCall';
import ActiveCall from './ActiveCall';
import PostCallScreen from './PostCallScreen';
import { Video } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';

export default function CallManager() {
    const user = authService.getCurrentUser();
    const [showPostCall, setShowPostCall] = useState(false);
    const lastCallRef = useRef<any>(null);
    const notifiedCalls = useRef(new Set<string>());
    const notificationIdRef = useRef<string | null>(null);
    const [allContacts, setAllContacts] = useState<any[]>([]);
    const { addNotification } = useNotifications();

    useEffect(() => {
        const fetchAllUsers = async () => {
            try {
                const res = await authService.fetchWithAuth('/api/users/search');
                if (res.ok) {
                    const data = await res.json();
                    setAllContacts(data.map((u: any) => ({
                        id: u.id,
                        name: u.name || u.full_name,
                        email: u.email
                    })));
                }
            } catch (err) {
                console.error("Failed to fetch users", err);
            }
        };
        if (user) fetchAllUsers();
    }, [user]);

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
        initiateCall,
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
            notificationIdRef.current = toast(`Incoming call from ${caller}`, { icon: '📞', duration: 10000 });

            addNotification({
                title: 'Incoming Call',
                message: `${caller} is calling you`,
                type: 'call'
            });

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
            setShowPostCall(true);
        }
    });

    // Track last active call for rejoin functionality
    useEffect(() => {
        if (activeCall) {
            lastCallRef.current = activeCall;
        }
    }, [activeCall]);

    const handleRejoin = () => {
        if (lastCallRef.current && user) {
            const lastCall = lastCallRef.current;
            // Determine remote peer (if I was caller, it's callee; if I was callee, it's caller)
            const remotePeer = lastCall.caller === user.email ? lastCall.callee : lastCall.caller;
            const callType = lastCall.callType || 'audio';

            setShowPostCall(false);
            initiateCall(remotePeer, callType);
        } else {
            setShowPostCall(false);
            toast.error('Could not find meeting details to rejoin');
        }
    };

    const handleReturnHome = () => {
        setShowPostCall(false);
        // Maybe navigate to home if using router, currently just closes the screen
    };

    useEffect(() => {
        // console.log('[CallManager] Debug:', { user, activeCall, incomingCall });
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

    // Listen for incoming chat messages & files
    useEffect(() => {
        const handleP2PMessage = (e: any) => {
            const msg = e.detail;
            if (msg.type === 'secure-message') {
                const sender = msg.from;
                const payload = msg.payload || {};

                if (payload.type === 'meeting-invite') {
                    // Handle meeting invitation
                    toast((t) => (
                        <div className="flex flex-col gap-2">
                            <span className="font-bold flex items-center gap-2"><Video size={16} /> Meeting Invitation</span>
                            <span className="text-sm">{payload.inviteFrom || sender} invited you to a meeting.</span>
                            <div className="flex gap-2 mt-1">
                                <button
                                    onClick={() => {
                                        toast.dismiss(t.id);
                                        window.dispatchEvent(new CustomEvent('app-navigate', { detail: { path: `/meet/${payload.meetingId}` } }));
                                    }}
                                    className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700"
                                >
                                    Join Now
                                </button>
                                <button
                                    onClick={() => toast.dismiss(t.id)}
                                    className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-300"
                                >
                                    Dismiss
                                </button>
                            </div>
                        </div>
                    ), { duration: 15000, position: 'top-center' });
                    addNotification({
                        title: 'Meeting Invitation',
                        message: `${payload.inviteFrom || sender} invited you to a meeting`,
                        type: 'call',
                        link: `/meet/${payload.meetingId}`
                    });
                    return;
                }

                if (sender !== user?.email) {
                    const content = payload.content || 'New message';
                    toast(`Message from ${sender.split('@')[0]}: ${content}`, { icon: '💬', duration: 4000 });

                    addNotification({
                        title: `Message from ${sender.split('@')[0]}`,
                        message: content,
                        type: 'info'
                    });
                }
            }
        };

        const handleIncomingFile = (e: any) => {
            const { from, fileName } = e.detail;
            if (from !== user?.email) {
                toast(`Incoming file from ${from.split('@')[0]}: ${fileName}`, { icon: '📂', duration: 5000 });

                addNotification({
                    title: 'File Received',
                    message: `${fileName} from ${from.split('@')[0]}`,
                    type: 'file'
                });
            }
        };

        window.addEventListener('p2p-message', handleP2PMessage);
        window.addEventListener('p2p-incoming-file', handleIncomingFile);
        return () => {
            window.removeEventListener('p2p-message', handleP2PMessage);
            window.removeEventListener('p2p-incoming-file', handleIncomingFile);
        };
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
                    allContacts={allContacts}
                />
            )}

            {/* Post Call Screen */}
            {showPostCall && (!activeCall || activeCall.status === 'ended') && !incomingCall && (
                <PostCallScreen
                    onRejoin={handleRejoin}
                    onReturnToHome={handleReturnHome}
                />
            )}
        </>
    );
}
