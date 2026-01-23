import { useEffect, useRef, useState } from 'react';
import { Phone, Mic, MicOff, Video, VideoOff, MonitorUp, Smile, Captions, Hand, MoreVertical, Info, Users, MessageSquare, X, Send, Maximize2, Minimize2, Settings } from 'lucide-react';

interface ActiveCallProps {
    remotePeer: string;
    remotePeerName?: string;
    isConnected: boolean;
    isMuted: boolean;
    // duration: number;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    onToggleMute: () => void;
    onEndCall: () => void;
    isOutbound?: boolean;
    isVideo?: boolean; // Is call type video?
    isVideoEnabled?: boolean; // Is camera on?
    onToggleVideo?: () => void;
    isScreenSharing?: boolean;
    onToggleScreenShare?: () => void;
    // connectionStats?: { upload: string; download: string; total: string };
    availableDevices?: { audio: MediaDeviceInfo[], video: MediaDeviceInfo[] };
    onSwitchCamera?: (deviceId: string) => void;
    onSwitchMicrophone?: (deviceId: string) => void;
    onToggleVirtualBackground?: (mode: 'blur' | 'image' | 'none') => void;
    chatMessages?: Array<{ sender: string; content: string; timestamp: number }>;
    onSendChat?: (message: string) => void;
    onSendReaction?: (reaction: string) => void;
    onToggleHand?: () => void;
    remoteHandRaised?: boolean;
}

export default function ActiveCall({
    remotePeer,
    remotePeerName,
    isConnected,
    isMuted,
    // duration,
    localStream,
    remoteStream,
    onToggleMute,
    onEndCall,
    isOutbound = false,
    isVideo = false,
    isVideoEnabled = true,
    onToggleVideo,
    isScreenSharing = false,
    onToggleScreenShare,
    // connectionStats,
    availableDevices,
    onSwitchCamera,
    onSwitchMicrophone,
    onToggleVirtualBackground,
    chatMessages = [],
    onSendChat,
    onSendReaction,
    onToggleHand,
    remoteHandRaised = false
}: ActiveCallProps) {
    const remoteAudioRef = useRef<HTMLAudioElement>(null);
    const localAudioRef = useRef<HTMLAudioElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    // User requested full view by default to avoid options "disappearing"
    const [isExpanded, setIsExpanded] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [showReactions, setShowReactions] = useState(false);
    const [pipMode, setPipMode] = useState<'normal' | 'minimized' | 'expanded'>('normal');
    const [virtualBgMode, setVirtualBgMode] = useState<'none' | 'blur' | 'image'>('none');
    const [activeSidePanel, setActiveSidePanel] = useState<'none' | 'chat' | 'people' | 'info'>('none');
    const [chatMessage, setChatMessage] = useState('');
    const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
    const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // New Features state
    const [reactions, setReactions] = useState<{ id: number, emoji: string, x: number, y: number }[]>([]);
    const [notificationToast, setNotificationToast] = useState<{ id: number, type: 'chat' | 'hand', sender: string, content: string } | null>(null);
    const prevChatLength = useRef(chatMessages.length);
    const prevHandRaised = useRef(remoteHandRaised);

    // Auto-scroll chat
    useEffect(() => {
        if (activeSidePanel === 'chat') {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatMessages, activeSidePanel]);

    // Handle sending chat
    const handleSendChat = () => {
        if (chatMessage.trim() && onSendChat) {
            onSendChat(chatMessage.trim());
            setChatMessage('');
        }
    };

    // Self-healing for audio state mismatch
    useEffect(() => {
        if (localStream) {
            localStream.getAudioTracks().forEach(track => {
                // If UI says muted (isMuted=true), track should be disabled (enabled=false)
                // If UI says unmuted (isMuted=false), track should be enabled (enabled=true)
                if (track.enabled === isMuted) {
                    console.log('[ActiveCall] Fixing audio track state mismatch');
                    track.enabled = !isMuted;
                }
            });
        }
    }, [localStream, isMuted]);

    const handlePointerDown = (e: React.PointerEvent) => {
        // Prevent dragging when interacting with controls or buttons
        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input') || (e.target as HTMLElement).closest('select')) return;

        const element = e.currentTarget as HTMLElement;
        const rect = element.getBoundingClientRect();

        // If first drag, capture current position
        const currentPos = position || { x: rect.left, y: rect.top };

        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            initialX: currentPos.x,
            initialY: currentPos.y
        };
        element.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!dragRef.current) return;

        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;

        setPosition({
            x: dragRef.current.initialX + dx,
            y: dragRef.current.initialY + dy
        });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        dragRef.current = null;
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    };

    const displayName = remotePeerName || (remotePeer.includes('@')
        ? remotePeer.split('@')[0].split(/[._]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : remotePeer);

    // Auto-expand on video/screen share
    useEffect(() => {
        if (isVideo || isScreenSharing) {
            setIsExpanded(true);
        }
    }, [isVideo, isScreenSharing]);

    // Attach remote stream
    useEffect(() => {
        if (remoteStream) {
            if ((isVideo || isExpanded) && remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = remoteStream;
                remoteVideoRef.current.play().catch(e => console.error('Remote video play error', e));
            } else if (remoteAudioRef.current) {
                remoteAudioRef.current.srcObject = remoteStream;
                remoteAudioRef.current.play().catch(err => console.error('Remote audio play error', err));
            }
        }
    }, [remoteStream, isVideo, isExpanded]);

    // Attach local stream
    useEffect(() => {
        if (localStream) {
            if ((isVideo || isExpanded) && localVideoRef.current) {
                localVideoRef.current.srcObject = localStream;
                localVideoRef.current.muted = true;
            } else if (localAudioRef.current) {
                localAudioRef.current.srcObject = localStream;
                localAudioRef.current.muted = true;
            }
        }
    }, [localStream, isVideo, isExpanded]);

    // Ringback tone
    useEffect(() => {
        if (!isOutbound || isConnected) return;
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        let oscillator: OscillatorNode;
        let gain: GainNode;
        let timer: any;

        const playRingback = () => {
            if (ctx.state === 'suspended') ctx.resume();
            oscillator = ctx.createOscillator();
            gain = ctx.createGain();
            oscillator.connect(gain);
            gain.connect(ctx.destination);
            oscillator.frequency.value = 400;
            gain.gain.value = 0.1;
            oscillator.start();
            oscillator.stop(ctx.currentTime + 1.5);
        };

        playRingback();
        timer = setInterval(playRingback, 3000);
        return () => {
            clearInterval(timer);
            if (ctx) ctx.close();
        };
    }, [isOutbound, isConnected]);

    // Existing helper
    // const formatDuration = (seconds: number): string => {
    //     const mins = Math.floor(seconds / 60);
    //     const secs = seconds % 60;
    //     return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    // };

    // Time state
    const [currentTime, setCurrentTime] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
        return () => clearInterval(timer);
    }, []);

    // Handle Reactions
    useEffect(() => {
        const handleReaction = (e: any) => {
            const emoji = e.detail;
            const newReaction = {
                id: Date.now(),
                emoji,
                x: Math.random() * 80 + 10, // 10% to 90% width
                y: Math.random() * 30 + 50  // 50% to 80% height (start from bottom-ish)
            };
            setReactions(prev => [...prev, newReaction]);

            // Remove after animation
            setTimeout(() => {
                setReactions(prev => prev.filter(r => r.id !== newReaction.id));
            }, 2000);
        };

        window.addEventListener('remote-reaction', handleReaction);
        return () => window.removeEventListener('remote-reaction', handleReaction);
    }, []);

    // Handle Chat Toasts
    useEffect(() => {
        if (chatMessages.length > prevChatLength.current) {
            const lastMsg = chatMessages[chatMessages.length - 1];
            // Only show if sent by others and panel is closed
            if (lastMsg.sender !== 'You' && activeSidePanel !== 'chat') {
                setNotificationToast({
                    id: Date.now(),
                    type: 'chat',
                    sender: lastMsg.sender,
                    content: lastMsg.content
                });
                // Auto hide
                setTimeout(() => setNotificationToast(null), 5000);
            }
            prevChatLength.current = chatMessages.length;
        }
    }, [chatMessages, activeSidePanel]);

    // Handle Hand Raise Toast
    useEffect(() => {
        if (remoteHandRaised && !prevHandRaised.current) {
            setNotificationToast({
                id: Date.now(),
                type: 'hand',
                sender: displayName,
                content: 'Raised hand ✋'
            });
            setTimeout(() => setNotificationToast(null), 5000);
        }
        prevHandRaised.current = remoteHandRaised;
    }, [remoteHandRaised, displayName]);

    // Menu state
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [isHandRaised, setIsHandRaised] = useState(false);
    const [captionsEnabled, setCaptionsEnabled] = useState(false);

    if (isExpanded) {
        return (
            <div className="fixed inset-0 z-[100] bg-[#202124] flex flex-col text-white overflow-hidden font-sans">
                {/* Main Content Area - Full Screen Layout */}
                <div className="flex-1 relative flex min-h-0 bg-[#202124]">
                    <div className="flex-1 flex overflow-hidden">
                        {/* Remote Stream (Main Stage) */}
                        <div className="flex-1 relative bg-black overflow-hidden flex items-center justify-center">
                            {remoteStream ? (
                                <video
                                    ref={remoteVideoRef}
                                    autoPlay
                                    playsInline
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center">
                                    <div className="w-32 h-32 rounded-full bg-[#5f6368] flex items-center justify-center mb-4 text-white text-5xl font-medium">
                                        {displayName.charAt(0).toUpperCase()}
                                    </div>
                                </div>
                            )}

                            {/* Name Label */}
                            <div className="absolute bottom-4 left-4 text-white text-lg font-medium drop-shadow-md select-none">
                                {displayName}
                            </div>

                            {/* Hand Raised Badge */}
                            {remoteHandRaised && (
                                <div className="absolute top-4 left-4 bg-[#8ab4f8] text-[#202124] px-3 py-1.5 rounded-full flex items-center gap-2 font-medium shadow-lg animate-bounce">
                                    <Hand size={18} />
                                    {displayName.split(' ')[0]} raised hand
                                </div>
                            )}

                            {/* Captions Overlay */}
                            {captionsEnabled && (
                                <div className="absolute bottom-16 left-0 right-0 flex justify-center pointer-events-none">
                                    <div className="bg-black/60 backdrop-blur text-white px-6 py-3 rounded-xl max-w-2xl text-center">
                                        <p className="text-lg opacity-80 animate-pulse">Listening...</p>
                                    </div>
                                </div>
                            )}

                            {/* Mute Indicator */}
                            {/* We don't have remote mute state easily available unless passed via signaling. 
                             Assuming 'mic off' icon if we could detect it. For now, omitting or static. */}

                            {/* Reactions Overlay */}
                            {reactions.map(r => (
                                <div
                                    key={r.id}
                                    className="absolute text-4xl animate-float-up pointer-events-none drop-shadow-lg"
                                    style={{ left: `${r.x}%`, top: `${r.y}%` }}
                                >
                                    {r.emoji}
                                </div>
                            ))}

                            {/* Notification Toast (Chat & Hand) */}
                            {notificationToast && (
                                <div
                                    className="absolute bottom-20 left-6 bg-[#202124] text-white p-4 rounded-xl shadow-2xl border border-[#5f6368] max-w-sm animate-slide-up cursor-pointer flex items-start gap-3 z-30"
                                    onClick={() => {
                                        if (notificationToast.type === 'chat') {
                                            setActiveSidePanel('chat');
                                        }
                                        setNotificationToast(null);
                                    }}
                                >
                                    <div className={`${notificationToast.type === 'chat' ? 'bg-blue-600' : 'bg-orange-500'} w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0`}>
                                        {notificationToast.type === 'chat' ? notificationToast.sender.charAt(0).toUpperCase() : <Hand size={16} />}
                                    </div>
                                    <div>
                                        <div className="font-bold text-xs text-gray-300 mb-0.5">{notificationToast.sender}</div>
                                        <div className="text-sm">{notificationToast.content}</div>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setNotificationToast(null); }}
                                        className="text-gray-400 hover:text-white ml-2"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Local Stream (PiP) - Floating & Draggable */}
                        <div
                            className={`fixed z-50 bg-[#3c4043] rounded-xl overflow-hidden shadow-2xl border border-[#5f6368] transition-all cursor-move
                                ${pipMode === 'minimized' ? 'w-48 h-12' :
                                    pipMode === 'expanded' ? 'w-[600px] aspect-video' : 'w-64 aspect-video'}
                            `}
                            style={{
                                left: position ? position.x : undefined,
                                top: position ? position.y : '4rem', // Default top offset
                                right: position ? undefined : '1rem',
                            }}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerLeave={handlePointerUp}
                        >
                            {/* Controls Overlay */}
                            <div className={`absolute top-0 left-0 right-0 h-10 bg-black/40 flex items-center justify-between px-3 z-20 ${pipMode === 'minimized' ? 'opacity-100' : 'opacity-0 hover:opacity-100'} transition-opacity`}>
                                <span className="text-xs font-bold text-white select-none">You</span>
                                <div className="flex gap-1">
                                    <button
                                        className="p-1 hover:bg-white/20 rounded text-white"
                                        onClick={(e) => { e.stopPropagation(); setPipMode(pipMode === 'minimized' ? 'normal' : 'minimized'); }}
                                    >
                                        <Minimize2 size={14} />
                                    </button>
                                    {pipMode !== 'minimized' && (
                                        <button
                                            className="p-1 hover:bg-white/20 rounded text-white"
                                            onClick={(e) => { e.stopPropagation(); setPipMode(pipMode === 'expanded' ? 'normal' : 'expanded'); }}
                                        >
                                            <Maximize2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {pipMode !== 'minimized' && (
                                <video
                                    ref={localVideoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full h-full object-cover scale-x-[-1]"
                                />
                            )}
                            {pipMode === 'minimized' && (
                                <div className="h-full flex items-center justify-center text-xs text-gray-400">
                                    Video hidden
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Side Panel */}
                    {activeSidePanel !== 'none' && (
                        <div className="w-80 bg-[#202124] border-l border-[#3c4043] flex flex-col z-10">
                            <div className="p-4 border-b border-[#5f6368] flex justify-between items-center bg-[#202124]">
                                <h3 className="font-medium text-lg">
                                    {activeSidePanel === 'chat' && 'In-call messages'}
                                    {activeSidePanel === 'people' && 'People'}
                                    {activeSidePanel === 'info' && 'Meeting details'}
                                </h3>
                                <button onClick={() => setActiveSidePanel('none')} className="p-1 hover:bg-[#3c4043] rounded-full">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                                {activeSidePanel === 'chat' && (
                                    chatMessages && chatMessages.length > 0 ? (
                                        chatMessages.map((msg, idx) => (
                                            <div key={idx} className={`flex flex-col ${msg.sender === 'You' ? 'items-end' : 'items-start'}`}>
                                                <div className="flex items-baseline gap-2 mb-1">
                                                    <span className="font-bold text-xs text-gray-400">{msg.sender}</span>
                                                    <span className="text-[10px] text-gray-500">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                                <div className={`px-3 py-2 rounded-lg max-w-[85%] text-sm ${msg.sender === 'You' ? 'bg-[#8ab4f8] text-[#202124]' : 'bg-[#3c4043] text-white'}`}>
                                                    {msg.content}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex flex-col h-full items-center justify-center text-gray-400 mt-20">
                                            <MessageSquare size={48} className="mb-4 opacity-50" />
                                            <p>No messages yet</p>
                                        </div>
                                    )
                                )}
                                <div ref={messagesEndRef} />

                                {activeSidePanel === 'people' && (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center font-bold">Y</div>
                                            <span>You {isHandRaised && '✋'}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center font-bold">{displayName.charAt(0).toUpperCase()}</div>
                                            <span>{displayName} {remoteHandRaised && '✋'}</span>
                                        </div>
                                    </div>
                                )}
                                {activeSidePanel === 'info' && (
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="text-sm font-bold text-gray-400">Meeting code</h4>
                                            <p className="select-all font-mono">{remotePeer}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {activeSidePanel === 'chat' && (
                                <div className="p-4 border-t border-[#5f6368] bg-[#202124]">
                                    <div className="relative">
                                        <input
                                            type="text"
                                            placeholder="Send a message"
                                            className="w-full bg-[#3c4043] rounded-full py-2 px-4 pr-10 focus:outline-none focus:ring-1 focus:ring-blue-500 text-white"
                                            value={chatMessage}
                                            onChange={(e) => setChatMessage(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                                        />
                                        <button
                                            onClick={handleSendChat}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-blue-400 hover:text-blue-300"
                                        >
                                            <Send size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Settings Modal */}
                {/* Settings Modal */}
                {showSettings && availableDevices && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-[#202124] border border-[#5f6368] rounded-2xl p-6 w-96 shadow-2xl animate-scale-up">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-medium">Settings</h3>
                                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-[#3c4043] rounded-full">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <label className="text-xs text-[#9aa0a6] font-bold uppercase tracking-wider block mb-2">Microphone</label>
                                    <div className="relative">
                                        <select
                                            onChange={(e) => onSwitchMicrophone?.(e.target.value)}
                                            className="w-full bg-[#3c4043] border-none rounded-lg p-3 text-sm text-white focus:ring-2 focus:ring-blue-500 appearance-none"
                                        >
                                            {availableDevices.audio?.map(d => (
                                                <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 5)}...`}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs text-[#9aa0a6] font-bold uppercase tracking-wider block mb-2">Camera</label>
                                    <div className="relative">
                                        <select
                                            onChange={(e) => onSwitchCamera?.(e.target.value)}
                                            className="w-full bg-[#3c4043] border-none rounded-lg p-3 text-sm text-white focus:ring-2 focus:ring-blue-500 appearance-none"
                                        >
                                            {availableDevices.video?.map(d => (
                                                <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 5)}...`}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="pt-4 border-t border-[#5f6368]">
                                    <button className="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition" onClick={() => setShowSettings(false)}>Done</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Bottom Bar */}
                <div className="h-20 bg-[#202124] flex items-center justify-between px-6 shrink-0">
                    {/* Left: Time | Code */}
                    <div className="flex items-center gap-4 text-white font-medium select-none">
                        <span className="text-lg">{currentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                        <span className="w-px h-6 bg-[#5f6368]"></span>
                        <span className="text-lg opacity-90">{remotePeer.split('@')[0]}</span>
                    </div>

                    {/* Center: Controls */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onToggleMute}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-[#ea4335] hover:bg-[#d93025] text-white' : 'bg-[#3c4043] hover:bg-[#4d5155] text-white'}`}
                            title={isMuted ? "Turn on microphone" : "Turn off microphone"}
                        >
                            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                        </button>

                        <button
                            onClick={onToggleVideo}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${!isVideoEnabled ? 'bg-[#ea4335] hover:bg-[#d93025] text-white' : 'bg-[#3c4043] hover:bg-[#4d5155] text-white'}`}
                            title={isVideoEnabled ? "Turn off camera" : "Turn on camera"}
                        >
                            {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
                        </button>

                        <button
                            onClick={onToggleScreenShare}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isScreenSharing ? 'bg-[#8ab4f8] text-[#202124]' : 'bg-[#3c4043] hover:bg-[#4d5155] text-white'}`}
                            title="Present now"
                        >
                            <MonitorUp size={20} />
                        </button>

                        <div className="relative">
                            <button
                                onClick={() => setShowReactions(!showReactions)}
                                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${showReactions ? 'bg-[#8ab4f8] text-[#202124]' : 'bg-[#3c4043] hover:bg-[#4d5155] text-white'}`}
                                title="Reactions"
                            >
                                <Smile size={20} />
                            </button>
                            {showReactions && (
                                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-[#202124] border border-[#5f6368] rounded-full p-2 flex gap-2 shadow-xl animate-scale-up">
                                    {['💖', '👍', '🎉', '👏', '😂', '😮'].map(emoji => (
                                        <button
                                            key={emoji}
                                            onClick={() => {
                                                onSendReaction?.(emoji);
                                                // Show local reaction too
                                                window.dispatchEvent(new CustomEvent('remote-reaction', { detail: emoji }));
                                                setShowReactions(false);
                                            }}
                                            className="w-10 h-10 hover:bg-[#3c4043] rounded-full flex items-center justify-center text-xl transition-transform hover:scale-125"
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => setCaptionsEnabled(!captionsEnabled)}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${captionsEnabled ? 'bg-[#8ab4f8] text-[#202124]' : 'bg-[#3c4043] hover:bg-[#4d5155] text-white'}`}
                            title="Turn on captions"
                        >
                            <Captions size={20} />
                        </button>

                        <button
                            onClick={() => {
                                setIsHandRaised(!isHandRaised);
                                onToggleHand?.();
                            }}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isHandRaised ? 'bg-[#8ab4f8] text-[#202124]' : 'bg-[#3c4043] hover:bg-[#4d5155] text-white'}`}
                            title="Raise hand"
                        >
                            <Hand size={20} />
                        </button>


                        <div className="relative">
                            <button
                                onClick={() => setShowMoreMenu(!showMoreMenu)}
                                className="w-12 h-12 rounded-full flex items-center justify-center transition-all bg-[#3c4043] hover:bg-[#4d5155] text-white"
                                title="More options"
                            >
                                <MoreVertical size={20} />
                            </button>

                            {/* More Options Menu */}
                            {showMoreMenu && (
                                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-72 bg-[#202124] rounded-lg shadow-2xl border border-[#5f6368] py-2 z-50 animate-fade-in-up">
                                    <div className="py-1">
                                        {[
                                            { icon: <MonitorUp size={18} />, label: 'Adjust view' },
                                            { icon: <Maximize2 size={18} />, label: 'Full screen', onClick: () => document.documentElement.requestFullscreen() },
                                            { icon: <Minimize2 size={18} />, label: 'Open picture-in-picture', onClick: () => setIsExpanded(false) },
                                            {
                                                icon: <Settings size={18} />, label: virtualBgMode === 'none' ? 'Enable background effects' : 'Disable background effects', onClick: () => {
                                                    const newMode = virtualBgMode === 'none' ? 'blur' : 'none';
                                                    setVirtualBgMode(newMode);
                                                    onToggleVirtualBackground?.(newMode);
                                                }
                                            },
                                            { isDivider: true },
                                            { icon: <Info size={18} />, label: 'Report a problem' },
                                            { icon: <Info size={18} />, label: 'Report abuse' },
                                            { icon: <Info size={18} />, label: 'Troubleshooting & help' },
                                            { icon: <Settings size={18} />, label: 'Settings', onClick: () => setShowSettings(true) },
                                        ].map((item, i) => (
                                            item.isDivider ?
                                                <div key={i} className="h-px bg-[#5f6368] my-2" /> :
                                                <button
                                                    key={i}
                                                    onClick={() => {
                                                        item.onClick?.();
                                                        setShowMoreMenu(false);
                                                    }}
                                                    className="w-full text-left px-4 py-3 hover:bg-[#3c4043] flex items-center gap-3 text-[#e8eaed] text-sm"
                                                >
                                                    {item.icon}
                                                    {item.label}
                                                </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={onEndCall}
                            className="h-12 px-8 rounded-full bg-[#ea4335] hover:bg-[#d93025] text-white flex items-center justify-center transition-all ml-2"
                            title="Leave call"
                        >
                            <Phone size={24} className="rotate-135 fill-current" />
                        </button>
                    </div>

                    {/* Right: Info helpers */}
                    <div className="flex items-center gap-3 text-[#e8eaed]">
                        <button
                            onClick={() => setActiveSidePanel(activeSidePanel === 'info' ? 'none' : 'info')}
                            className={`p-3 rounded-full ${activeSidePanel === 'info' ? 'bg-[#8ab4f8] text-[#202124]' : 'hover:bg-[#3c4043]'}`}
                        >
                            <Info size={20} />
                        </button>
                        <button
                            onClick={() => setActiveSidePanel(activeSidePanel === 'people' ? 'none' : 'people')}
                            className={`p-3 rounded-full ${activeSidePanel === 'people' ? 'bg-[#8ab4f8] text-[#202124]' : 'hover:bg-[#3c4043]'}`}
                        >
                            <Users size={20} />
                        </button>
                        <button
                            onClick={() => setActiveSidePanel(activeSidePanel === 'chat' ? 'none' : 'chat')}
                            className={`p-3 rounded-full ${activeSidePanel === 'chat' ? 'bg-[#8ab4f8] text-[#202124]' : 'hover:bg-[#3c4043]'}`}
                        >
                            <MessageSquare size={20} />
                        </button>
                    </div>
                </div>

                {/* Hidden Audio for Fallback */}
                {(!remoteStream || (!isVideo && !isExpanded)) && <audio ref={remoteAudioRef} autoPlay />}
            </div>
        );
    }

    return (
        <div
            className="fixed z-50 w-96 touch-none cursor-move"
            style={position ? { left: position.x, top: position.y } : { bottom: '1rem', right: '1rem' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
            <div className="bg-[#202124] rounded-2xl shadow-2xl border border-[#3c4043] overflow-hidden transform hover:scale-[1.02] transition-transform">
                {/* Mini View content */}
                <div className="aspect-video bg-[#3c4043] relative group">
                    {remoteStream && (isVideo || isScreenSharing) ? (
                        <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600">
                            <span className="text-white text-2xl font-bold">{displayName.charAt(0).toUpperCase()}</span>
                        </div>
                    )}

                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                        <button
                            onClick={() => setIsExpanded(true)}
                            className="p-3 bg-black/60 text-white rounded-full hover:bg-black/80 transition"
                            title="Full Screen"
                        >
                            <Maximize2 size={24} />
                        </button>
                        <button onClick={onEndCall} className="p-3 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg" title="End Call">
                            <Phone size={24} className="rotate-135" />
                        </button>
                    </div>

                    <div className="absolute bottom-2 left-2 truncate text-white text-sm font-medium drop-shadow">
                        {displayName}
                    </div>
                </div>

                {/* Hidden Elements */}
                <audio ref={remoteAudioRef} autoPlay />
                <audio ref={localAudioRef} />
            </div>
        </div>
    );
}
