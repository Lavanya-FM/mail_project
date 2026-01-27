import { useEffect, useRef, useState, useCallback } from 'react';
import { Phone, Mic, MicOff, Video, VideoOff, MonitorUp, Smile, Captions, Hand, MoreVertical, Info, Users, MessageSquare, X, Send, Maximize2, Minimize2, Settings, Download, Save, Paperclip, FileText, UserPlus, Sparkles, Shield, Lock, Unlock, CheckSquare, Square, Search } from 'lucide-react';
import { getToken } from '../lib/authService';
import { authService } from '../lib/authService';
import { uploadFile } from '../lib/driveService';
import toast from 'react-hot-toast';
import SettingsModal from './SettingsModal';
import RecordingPromptModal from './RecordingPromptModal';

interface HostSettings {
    isLocked: boolean;
    allowChat: boolean;
    allowScreenShare: boolean;
    allowMic: boolean;
    allowVideo: boolean;
}

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
    chatMessages?: Array<{ sender: string; content: string; timestamp: number; type?: string; fileUrl?: string; fileName?: string }>;
    onSendChat?: (message: string, attachment?: { type: 'text' | 'file'; fileUrl?: string; fileName?: string; size?: number }) => void;
    onSendReaction?: (reaction: string) => void;
    onToggleHand?: () => void;
    remoteHandRaised?: boolean;
    isHost?: boolean;
    allContacts?: Array<{ id: number | string; name: string; email: string }>;
}

export default function ActiveCall({
    remotePeer,
    remotePeerName,
    // isConnected, // Unused
    isMuted,
    // duration,
    localStream,
    remoteStream,
    onToggleMute,
    onEndCall,
    // isOutbound = false, // Unused
    isVideo = false,
    isVideoEnabled = false,
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
    remoteHandRaised = false,
    isHost = true,
    allContacts = []
}: ActiveCallProps) {
    // State Declarations
    const remoteAudioRef = useRef<HTMLAudioElement>(null);
    // const localAudioRef = useRef<HTMLAudioElement>(null); // Unused
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);

    // Recording Refs
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const recordingStreamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

    // UI States
    const [isExpanded, setIsExpanded] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [showReactions, setShowReactions] = useState(false);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [pipMode, setPipMode] = useState<'normal' | 'minimized' | 'expanded'>('normal');
    const [virtualBgMode, setVirtualBgMode] = useState<'none' | 'blur' | 'image'>('none');
    const [activeSidePanel, setActiveSidePanel] = useState<'none' | 'chat' | 'people' | 'info' | 'host_controls'>('none');
    const [chatMessage, setChatMessage] = useState('');
    const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
    const [peopleSearchQuery, setPeopleSearchQuery] = useState('');

    // Host Settings State
    const [hostSettings, setHostSettings] = useState<HostSettings>({
        isLocked: false,
        allowChat: true,
        allowScreenShare: true,
        allowMic: true,
        allowVideo: true
    });

    const toggleHostSetting = (key: keyof HostSettings) => {
        setHostSettings(prev => {
            const newSettings = { ...prev, [key]: !prev[key] };
            toast.success(`Updated permission.`);
            return newSettings;
        });
    };

    // Settings States
    const [isMirrored, setIsMirrored] = useState(true);
    const [hideSelfView, setHideSelfView] = useState(false);

    // Feature States
    const [isHandRaised, setIsHandRaised] = useState(false);
    const [captionsEnabled, setCaptionsEnabled] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [notificationToast, setNotificationToast] = useState<{ id: number, type: 'chat' | 'hand', sender: string, content: string } | null>(null);

    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [showRecordingPrompt, setShowRecordingPrompt] = useState(false);
    const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
    const [isSavingToDrive, setIsSavingToDrive] = useState(false);
    const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Floating UI Elements (Chats & Reactions)
    // We merged reactions into this general floating elements state
    const [floatingElements, setFloatingElements] = useState<{ id: number, type: 'emoji' | 'text', content: string, x: number, y: number, color?: string }[]>([]);

    // Refs for tracking changes
    const prevChatLength = useRef(chatMessages.length);
    const prevHandRaised = useRef(remoteHandRaised);

    // Helper: Display Name
    const displayName = remotePeerName || (remotePeer.includes('@')
        ? remotePeer.split('@')[0].split(/[._]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : remotePeer);

    // Helper: Dragging Logic
    const handlePointerDown = (e: React.PointerEvent) => {
        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input') || (e.target as HTMLElement).closest('select')) return;
        const element = e.currentTarget as HTMLElement;
        const rect = element.getBoundingClientRect();
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

    // Auto-scroll chat
    useEffect(() => {
        if (activeSidePanel === 'chat') {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatMessages, activeSidePanel]);

    // Handle Reactions
    useEffect(() => {
        const handleReaction = (e: any) => {
            const emoji = e.detail;
            const newElement = {
                id: Date.now(),
                type: 'emoji' as const,
                content: emoji,
                x: Math.random() * 80 + 10,
                y: Math.random() * 30 + 50
            };
            setFloatingElements(prev => [...prev, newElement]);

            setTimeout(() => {
                setFloatingElements(prev => prev.filter(el => el.id !== newElement.id));
            }, 3000);
        };

        window.addEventListener('remote-reaction', handleReaction);
        console.log("ActiveCall V3 Loaded");
        return () => window.removeEventListener('remote-reaction', handleReaction);
    }, []);

    const [isRemoteVideoEnabled, setIsRemoteVideoEnabled] = useState(true);

    // Callback Refs for Video Elements to ensure stream attachment on mount
    const setRemoteVideoRef = useCallback((node: HTMLVideoElement | null) => {
        if (remoteVideoRef) {
            (remoteVideoRef as any).current = node;
        }
        if (node && remoteStream) {
            node.srcObject = remoteStream;
        }
    }, [remoteStream]);

    const setLocalVideoRef = useCallback((node: HTMLVideoElement | null) => {
        if (localVideoRef) {
            (localVideoRef as any).current = node;
        }
        if (node && localStream) {
            node.srcObject = localStream;
        }
    }, [localStream]);

    // Monitor Remote Video Track State
    useEffect(() => {
        if (remoteStream) {
            const videoTrack = remoteStream.getVideoTracks()[0];
            if (videoTrack) {
                // Initial check
                setIsRemoteVideoEnabled(videoTrack.enabled && videoTrack.readyState === 'live');

                const handleMute = () => setIsRemoteVideoEnabled(false);
                const handleUnmute = () => setIsRemoteVideoEnabled(true);
                const handleEnded = () => setIsRemoteVideoEnabled(false);

                videoTrack.addEventListener('mute', handleMute);
                videoTrack.addEventListener('unmute', handleUnmute);
                videoTrack.addEventListener('ended', handleEnded);

                return () => {
                    videoTrack.removeEventListener('mute', handleMute);
                    videoTrack.removeEventListener('unmute', handleUnmute);
                    videoTrack.removeEventListener('ended', handleEnded);
                };
            } else {
                setIsRemoteVideoEnabled(false);
            }
        } else {
            setIsRemoteVideoEnabled(false);
        }
    }, [remoteStream]);

    // Ensure audio attachment
    useEffect(() => {
        if (remoteAudioRef.current && remoteStream) {
            remoteAudioRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    // Handle Chat Floating
    useEffect(() => {
        if (chatMessages && chatMessages.length > prevChatLength.current) {
            const lastMsg = chatMessages[chatMessages.length - 1];
            if (lastMsg.sender !== 'You' && activeSidePanel !== 'chat') {
                const newElement = {
                    id: Date.now(),
                    type: 'text' as const,
                    content: lastMsg.type === 'file' ? `📎 ${lastMsg.fileName || 'Sent a file'}` : lastMsg.content,
                    x: Math.random() * 40 + 30, // 30-70%
                    y: 70,
                    color: ['#8ab4f8', '#f28b82', '#fdd663', '#81c995'][Math.floor(Math.random() * 4)]
                };

                setFloatingElements(prev => [...prev, newElement]);

                setTimeout(() => {
                    setFloatingElements(prev => prev.filter(el => el.id !== newElement.id));
                }, 5000);
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
                sender: remotePeerName || remotePeer,
                content: 'Raised hand ✋'
            });
            setTimeout(() => setNotificationToast(null), 5000);
        }
        prevHandRaised.current = remoteHandRaised;
    }, [remoteHandRaised, remotePeerName, remotePeer]);

    // RECORDING LOGIC
    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }

        // Stop screen share tracks if they exist in recording stream
        if (recordingStreamRef.current) {
            recordingStreamRef.current.getTracks().forEach(track => track.stop());
        }

        // Cleanup Audio Context
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        if (recordingIntervalRef.current) {
            clearInterval(recordingIntervalRef.current);
            recordingIntervalRef.current = null;
        }
        setRecordingDuration(0);
        setIsRecording(false);
    }, []);

    const startRecording = async () => {
        try {
            // Inform user about screen share requirement
            toast("To record the meeting, please select this tab when the window appears.", {
                icon: '📼',
                duration: 6000
            });

            // 1. Get Screen Stream (System Audio + Video)
            const displayStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });

            // If user cancels selection
            displayStream.getVideoTracks()[0].onended = () => {
                stopRecording();
            };

            // 2. Setup Audio Mixing
            const audioCtx = new AudioContext();
            audioContextRef.current = audioCtx;
            const dest = audioCtx.createMediaStreamDestination();
            audioDestinationRef.current = dest;

            // Add Display Audo
            if (displayStream.getAudioTracks().length > 0) {
                const sysSource = audioCtx.createMediaStreamSource(displayStream);
                sysSource.connect(dest);
            }

            // Add Local Mic Audio (if exists)
            if (localStream && localStream.getAudioTracks().length > 0) {
                const micSource = audioCtx.createMediaStreamSource(localStream);
                micSource.connect(dest);
            }

            // 3. Create Final Mixed Stream
            const mixedAudioTrack = dest.stream.getAudioTracks()[0];
            const finalStream = new MediaStream([
                displayStream.getVideoTracks()[0],
                ...(mixedAudioTrack ? [mixedAudioTrack] : [])
            ]);

            recordingStreamRef.current = finalStream;
            recordedChunksRef.current = [];

            // 4. Start MediaRecorder
            const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9')
                ? 'video/webm; codecs=vp9'
                : 'video/webm';

            const recorder = new MediaRecorder(finalStream, { mimeType });

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    recordedChunksRef.current.push(e.data);
                }
            };

            recorder.onstop = () => {
                const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
                setRecordedBlob(blob);
                setShowRecordingPrompt(true);
            };

            recorder.start(1000); // Collect chunks every second
            mediaRecorderRef.current = recorder;
            setIsRecording(true);

            // Start duration timer
            setRecordingDuration(0);
            recordingIntervalRef.current = setInterval(() => {
                setRecordingDuration(prev => prev + 1);
            }, 1000);

            toast.success('Recording started');

        } catch (err) {
            console.error('Failed to start recording:', err);
            // toast.error('Failed to start recording'); 
            // Often cancelled by user, so standard error is noisy.
        }
    };

    const handleSaveToDrive = async () => {
        if (!recordedBlob) return;
        setIsSavingToDrive(true);
        const user = authService.getCurrentUser();

        try {
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0];
            const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
            const filename = `Recording_${dateStr}_${timeStr}.webm`;

            const file = new File([recordedBlob], filename, { type: 'video/webm' });

            // Upload via service
            // Note: Assuming root folder (null)
            await uploadFile(file, user?.id || 1, null);

            toast.success('Recording saved to JeeDrive');
            setShowRecordingPrompt(false);
            setRecordedBlob(null); // Clear memory
        } catch (error) {
            console.error('Upload failed', error);
            toast.error('Failed to save to Drive');
        } finally {
            setIsSavingToDrive(false);
        }
    };

    const handleDownloadLocally = () => {
        if (!recordedBlob) return;

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
        const filename = `Recording_${dateStr}_${timeStr}.webm`;

        const url = URL.createObjectURL(recordedBlob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        // Cleanup
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            setRecordedBlob(null);
            setShowRecordingPrompt(false);
        }, 100);
    };

    // Helper: Handle File Download
    const handleDownload = async (url: string | undefined, filename: string | undefined) => {
        if (!url) return;
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename || 'downloaded-file';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
            toast.success('Download started');
        } catch (error) {
            console.error('Download failed', error);
            toast.error('Download failed');
        }
    };

    // Invite handler
    const handleAddPerson = () => {
        navigator.clipboard.writeText(`${window.location.origin}/call/join/${remotePeer}`);
        toast.success('Call link copied! Share it to invite others.', {
            icon: '🔗',
            duration: 4000
        });
    };

    // Chat handlers
    const handleSendChat = () => {
        if (chatMessage.trim() && onSendChat) {
            onSendChat(chatMessage.trim());
            setChatMessage('');
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0 || !onSendChat) return;

        const file = e.target.files[0];
        const token = getToken();
        if (!token) {
            toast.error('Not authenticated');
            return;
        }

        try {
            setIsUploading(true);
            const formData = new FormData();
            formData.append('receiver_email', remotePeer);
            formData.append('content', '');
            formData.append('type', 'file');
            formData.append('file', file);

            const res = await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (res.ok) {
                const data = await res.json();
                const attachment = {
                    type: 'file' as const,
                    fileUrl: data.message.file_url,
                    fileName: data.message.file_name || file.name,
                    size: file.size
                };
                onSendChat('Sent a file', attachment);
                toast.success('File sent');
            } else {
                toast.error('Failed to upload file');
            }
        } catch (error) {
            console.error('File upload failed', error);
            toast.error('File upload failed');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSaveChat = () => {
        if (!chatMessages || chatMessages.length === 0) {
            toast('No messages to save');
            return;
        }

        const chatContent = chatMessages.map(m =>
            `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.sender}: ${m.type === 'file' ? `[File: ${m.fileName} - ${m.fileUrl}]` : m.content}`
        ).join('\n');

        const blob = new Blob([chatContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-history-${new Date().toISOString()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('Chat history saved');
    };

    // Render Expanded View (Full Screen)
    if (isExpanded) {
        return (
            <div className="fixed inset-0 z-[100] bg-[#202124] flex flex-col text-white overflow-hidden font-sans">
                {/* Main Content Area */}
                <div className="flex-1 relative flex min-h-0 bg-[#202124]">
                    <div className="flex-1 flex overflow-hidden">
                        {/* Remote Stream (Main Stage) */}
                        <div className="flex-1 relative bg-black overflow-hidden flex items-center justify-center">
                            {remoteStream && isRemoteVideoEnabled ? (
                                <video
                                    key={remoteStream.id}
                                    ref={setRemoteVideoRef}
                                    autoPlay
                                    playsInline
                                    className="w-full h-full object-cover"
                                    onLoadedMetadata={(e) => {
                                        const video = e.target as HTMLVideoElement;
                                        video.play().catch(err => console.error("Video auto-play failed:", err));
                                    }}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center">
                                    <div className="w-32 h-32 rounded-full bg-[#5f6368] flex items-center justify-center mb-4 text-white text-5xl font-medium">
                                        {displayName.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="text-gray-400">
                                        {!remoteStream ? `Waiting for ${displayName}...` : `${displayName} (Camera off)`}
                                    </div>
                                </div>
                            )}

                            {/* Name Label */}
                            <div className="absolute bottom-4 left-4 text-white text-lg font-medium drop-shadow-md select-none z-10">
                                {displayName}
                            </div>

                            {/* Hand Raised Badge */}
                            {remoteHandRaised && (
                                <div className="absolute top-4 left-4 bg-[#8ab4f8] text-[#202124] px-3 py-1.5 rounded-full flex items-center gap-2 font-medium shadow-lg animate-bounce z-20">
                                    <Hand size={18} />
                                    {displayName.split(' ')[0]} raised hand
                                </div>
                            )}

                            {/* Captions Overlay */}
                            {captionsEnabled && (
                                <div className="absolute bottom-16 left-0 right-0 flex justify-center pointer-events-none z-20">
                                    <div className="bg-black/60 backdrop-blur text-white px-6 py-3 rounded-xl max-w-2xl text-center">
                                        <p className="text-lg opacity-80 animate-pulse">Listening...</p>
                                    </div>
                                </div>
                            )}

                            {/* Floating Elements (Reactions & Chats) */}
                            {floatingElements.map(el => (
                                <div
                                    key={el.id}
                                    className={`absolute pointer-events-none drop-shadow-lg z-40 animate-float-up ${el.type === 'text' ? 'bg-[#202124]/90 backdrop-blur px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 border border-white/10' : 'text-4xl'}`}
                                    style={{
                                        left: `${el.x}%`,
                                        top: `${el.y}%`,
                                        color: el.color || 'white'
                                    }}
                                >
                                    {el.type === 'text' && (
                                        <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                                            <MessageSquare size={12} />
                                        </div>
                                    )}
                                    {el.type === 'text' && el.content.length > 50 ? el.content.substring(0, 50) + '...' : el.content}
                                </div>
                            ))}

                            {/* Notification Toast (Hand/System) */}
                            {notificationToast && (
                                <div
                                    className="absolute bottom-20 left-6 bg-[#202124] text-white p-4 rounded-xl shadow-2xl border border-[#5f6368] max-w-sm animate-slide-up cursor-pointer flex items-start gap-3 z-30"
                                    onClick={() => {
                                        if (notificationToast.type === 'chat') setActiveSidePanel('chat');
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
                                    <button onClick={(e) => { e.stopPropagation(); setNotificationToast(null); }} className="text-gray-400 hover:text-white ml-2">
                                        <X size={14} />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Local Stream (PiP) */}
                        {!hideSelfView && (
                            <div
                                className={`fixed z-50 bg-[#3c4043] rounded-xl overflow-hidden shadow-2xl border border-[#5f6368] transition-all cursor-move
                                    ${pipMode === 'minimized' ? 'w-48 h-12' : pipMode === 'expanded' ? 'w-[600px] aspect-video' : 'w-64 aspect-video'}
                                `}
                                style={{
                                    left: position ? position.x : undefined,
                                    top: position ? position.y : '4rem',
                                    right: position ? undefined : '1rem',
                                }}
                                onPointerDown={handlePointerDown}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                onPointerLeave={handlePointerUp}
                            >
                                <div className={`absolute top-0 left-0 right-0 h-10 bg-black/40 flex items-center justify-between px-3 z-20 ${pipMode === 'minimized' ? 'opacity-100' : 'opacity-0 hover:opacity-100'} transition-opacity`}>
                                    <span className="text-xs font-bold text-white select-none">You</span>
                                    <div className="flex gap-1">
                                        <button className="p-1 hover:bg-white/20 rounded text-white" onClick={(e) => { e.stopPropagation(); setPipMode(pipMode === 'minimized' ? 'normal' : 'minimized'); }}>
                                            <Minimize2 size={14} />
                                        </button>
                                        {pipMode !== 'minimized' && (
                                            <button className="p-1 hover:bg-white/20 rounded text-white" onClick={(e) => { e.stopPropagation(); setPipMode(pipMode === 'expanded' ? 'normal' : 'expanded'); }}>
                                                <Maximize2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {pipMode !== 'minimized' && (
                                    isVideoEnabled ? (
                                        <video
                                            ref={setLocalVideoRef}
                                            autoPlay
                                            playsInline
                                            muted
                                            className={`w-full h-full object-cover ${isMirrored ? 'scale-x-[-1]' : ''}`}
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-[#3c4043] flex items-center justify-center">
                                            <div className="w-16 h-16 rounded-full bg-[#5f6368] flex items-center justify-center text-white text-2xl font-bold">
                                                Y
                                            </div>
                                        </div>
                                    )
                                )}
                                {pipMode === 'minimized' && <div className="h-full flex items-center justify-center text-xs text-gray-400">Video hidden</div>}
                            </div>
                        )}
                    </div>

                    {/* Side Panel */}
                    {activeSidePanel !== 'none' && (
                        <div className="w-80 bg-[#202124] border-l border-[#3c4043] flex flex-col z-10 transition-all duration-300">
                            <div className="p-4 border-b border-[#5f6368] flex justify-between items-center bg-[#202124]">
                                <h3 className="font-medium text-lg flex items-center gap-2">
                                    {activeSidePanel === 'chat' && 'In-call messages'}
                                    {activeSidePanel === 'people' && 'People'}
                                    {activeSidePanel === 'info' && 'Meeting details'}
                                </h3>
                                <div className="flex items-center gap-1">
                                    {activeSidePanel === 'chat' && (
                                        <button onClick={handleSaveChat} className="p-1 hover:bg-[#3c4043] rounded-full text-gray-400 hover:text-white transition" title="Save chat history">
                                            <Save size={18} />
                                        </button>
                                    )}
                                    <button onClick={() => setActiveSidePanel('none')} className="p-1 hover:bg-[#3c4043] rounded-full">
                                        <X size={20} />
                                    </button>
                                </div>
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
                                                    {msg.type === 'file' ? (
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-2 bg-black/20 rounded-lg">
                                                                <FileText size={20} />
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className="truncate max-w-[150px] font-medium">{msg.fileName || 'Attachment'}</span>
                                                                <button
                                                                    onClick={(e) => { e.preventDefault(); handleDownload(msg.fileUrl, msg.fileName); }}
                                                                    className="text-xs underline flex items-center gap-1 mt-1 hover:text-white/80"
                                                                >
                                                                    <Download size={12} /> Download
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : msg.content}
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
                                    <div className="flex flex-col h-full overflow-hidden">
                                        <div className="space-y-4 mb-8">
                                            <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1">In this meeting</h4>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center font-bold text-xs">Y</div>
                                                <span className="text-sm font-medium">You {isHandRaised && '✋'}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center font-bold text-xs">{displayName.charAt(0).toUpperCase()}</div>
                                                <span className="text-sm font-medium">{displayName} {remoteHandRaised && '✋'}</span>
                                            </div>
                                        </div>

                                        <div className="flex-1 flex flex-col min-h-0">
                                            <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1 mb-3">Invite more people</h4>
                                            <div className="relative mb-4">
                                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                <input
                                                    type="text"
                                                    placeholder="Search users..."
                                                    className="w-full bg-[#3c4043] rounded-xl py-2 pl-9 pr-4 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                    value={peopleSearchQuery}
                                                    onChange={(e) => setPeopleSearchQuery(e.target.value)}
                                                />
                                            </div>
                                            <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                                                {(allContacts || [])
                                                    .filter(c =>
                                                        c.email !== authService.getCurrentUser()?.email &&
                                                        c.email !== remotePeer &&
                                                        (c.name.toLowerCase().includes(peopleSearchQuery.toLowerCase()) || c.email.toLowerCase().includes(peopleSearchQuery.toLowerCase()))
                                                    )
                                                    .map(contact => (
                                                        <div key={contact.id} className="flex items-center justify-between p-2 hover:bg-[#3c4043] rounded-xl transition-colors group">
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <div className="w-7 h-7 rounded-lg bg-gray-700 flex items-center justify-center text-[10px] font-bold shrink-0">{contact.name[0].toUpperCase()}</div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-semibold truncate text-gray-200">{contact.name}</p>
                                                                    <p className="text-[10px] text-gray-500 truncate">{contact.email}</p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={handleAddPerson}
                                                                className="opacity-0 group-hover:opacity-100 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold transition-all shrink-0"
                                                            >
                                                                Invite
                                                            </button>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {activeSidePanel === 'host_controls' && (
                                    <div className="space-y-6">
                                        <div>
                                            <h4 className="text-sm font-bold text-gray-400 mb-4 px-1">Meeting Security</h4>
                                            <div className="space-y-3">
                                                <button
                                                    onClick={() => toggleHostSetting('isLocked')}
                                                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-colors ${hostSettings.isLocked ? 'bg-red-500/10 text-red-500 border border-red-500/50' : 'bg-[#3c4043] text-gray-200'}`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        {hostSettings.isLocked ? <Lock size={20} /> : <Unlock size={20} className="text-gray-400" />}
                                                        <span className="font-medium">Lock Meeting</span>
                                                    </div>
                                                </button>
                                                <p className="text-xs text-gray-400 px-1 mt-1">
                                                    {hostSettings.isLocked ? "No new participants can join." : "Anyone with the link can join."}
                                                </p>
                                            </div>
                                        </div>

                                        <div>
                                            <h4 className="text-sm font-bold text-gray-400 mb-4 px-1">Participant Permissions</h4>
                                            <div className="space-y-2">
                                                {[
                                                    { key: 'allowChat', label: 'Send Chat Messages', icon: MessageSquare },
                                                    { key: 'allowScreenShare', label: 'Share Screen', icon: MonitorUp },
                                                    { key: 'allowMic', label: 'Use Microphone', icon: Mic },
                                                    { key: 'allowVideo', label: 'Turn On Camera', icon: Video },
                                                ].map(perm => (
                                                    <div key={perm.key} className="flex items-center justify-between p-3 bg-[#3c4043] rounded-xl">
                                                        <div className="flex items-center gap-3 text-gray-200">
                                                            <perm.icon size={18} />
                                                            <span className="text-sm font-medium">{perm.label}</span>
                                                        </div>
                                                        <button onClick={() => toggleHostSetting(perm.key as keyof HostSettings)}>
                                                            {hostSettings[perm.key as keyof HostSettings]
                                                                ? <CheckSquare size={20} className="text-[#8ab4f8]" />
                                                                : <Square size={20} className="text-gray-500" />}
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="bg-[#ea4335]/10 p-4 rounded-xl border border-[#ea4335]/30">
                                            <h4 className="text-sm font-bold text-[#ea4335] mb-4">Danger Zone</h4>
                                            <button className="w-full flex items-center justify-center gap-2 py-3 bg-[#ea4335] text-white rounded-lg hover:bg-[#d93025] font-medium transition">
                                                <MicOff size={18} /> Mute All
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {activeSidePanel === 'chat' && (
                                <div className="p-4 border-t border-[#5f6368] bg-[#202124]">
                                    {isUploading && <div className="text-xs text-blue-400 mb-2">Uploading file...</div>}
                                    <div className="relative flex items-center gap-2">
                                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                                        <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="p-2 text-gray-400 hover:text-white bg-[#3c4043] rounded-full transition" title="Attach file">
                                            <Paperclip size={20} />
                                        </button>
                                        <div className="relative flex-1">
                                            <input
                                                type="text"
                                                placeholder="Send a message"
                                                className="w-full bg-[#3c4043] rounded-full py-2 px-4 pr-10 focus:outline-none focus:ring-1 focus:ring-blue-500 text-white"
                                                value={chatMessage}
                                                onChange={(e) => setChatMessage(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                                            />
                                            <button onClick={handleSendChat} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-blue-400 hover:text-blue-300">
                                                <Send size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Settings Modal */}
                <SettingsModal
                    isOpen={showSettings}
                    onClose={() => setShowSettings(false)}
                    localStream={localStream}
                    availableDevices={availableDevices}
                    onSwitchCamera={onSwitchCamera}
                    onSwitchMicrophone={onSwitchMicrophone}
                    isMirrored={isMirrored}
                    onToggleMirror={setIsMirrored}
                    hideSelfView={hideSelfView}
                    onToggleHideSelfView={setHideSelfView}
                />

                {/* Recording Prompt Modal */}
                <RecordingPromptModal
                    isOpen={showRecordingPrompt}
                    onClose={() => setShowRecordingPrompt(false)}
                    onSaveToDrive={handleSaveToDrive}
                    onDownloadLocally={handleDownloadLocally}
                    isUploading={isSavingToDrive}
                />

                {/* Bottom Bar */}
                <div className="h-20 bg-[#202124] flex items-center justify-between px-6 shrink-0 relative">
                    {/* Left: Time | Code */}
                    <div className="hidden md:flex items-center gap-4 text-white font-medium select-none">
                        <span className="text-lg">{new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                        <span className="w-px h-6 bg-[#5f6368]"></span>
                        <span className="text-lg opacity-90">{remotePeer.split('@')[0]}</span>
                    </div>

                    {/* Center: Controls */}
                    <div className="flex items-center gap-3">
                        <button onClick={onToggleMute} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-[#ea4335] hover:bg-[#d93025] text-white' : 'bg-[#3c4043] hover:bg-[#4d5155] text-white'}`} title="Mic">
                            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                        </button>
                        <button onClick={onToggleVideo} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${!isVideoEnabled ? 'bg-[#ea4335] hover:bg-[#d93025] text-white' : 'bg-[#3c4043] hover:bg-[#4d5155] text-white'}`} title="Camera">
                            {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
                        </button>
                        <button onClick={onToggleScreenShare} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isScreenSharing ? 'bg-[#8ab4f8] text-[#202124]' : 'bg-[#3c4043] hover:bg-[#4d5155] text-white'}`} title="Present">
                            <MonitorUp size={20} />
                        </button>
                        <div className="relative">
                            <button onClick={() => setShowReactions(!showReactions)} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${showReactions ? 'bg-[#8ab4f8] text-[#202124]' : 'bg-[#3c4043] hover:bg-[#4d5155] text-white'}`} title="Reactions">
                                <Smile size={20} />
                            </button>
                            {showReactions && (
                                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-[#202124] border border-[#5f6368] rounded-full p-2 flex gap-2 shadow-xl animate-scale-up z-50">
                                    {['💖', '👍', '🎉', '👏', '😂', '😮'].map(emoji => (
                                        <button key={emoji} onClick={() => { onSendReaction?.(emoji); window.dispatchEvent(new CustomEvent('remote-reaction', { detail: emoji })); setShowReactions(false); }} className="w-10 h-10 hover:bg-[#3c4043] rounded-full flex items-center justify-center text-xl transition-transform hover:scale-125">
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button onClick={() => setCaptionsEnabled(!captionsEnabled)} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${captionsEnabled ? 'bg-[#8ab4f8] text-[#202124]' : 'bg-[#3c4043] hover:bg-[#4d5155] text-white'}`} title="Captions">
                            <Captions size={20} />
                        </button>
                        <button onClick={() => { setIsHandRaised(!isHandRaised); onToggleHand?.(); }} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isHandRaised ? 'bg-[#8ab4f8] text-[#202124]' : 'bg-[#3c4043] hover:bg-[#4d5155] text-white'}`} title="Raise hand">
                            <Hand size={20} />
                        </button>

                        {/* Record Button */}
                        <div className="flex flex-col items-center gap-1">
                            <button
                                onClick={isRecording ? stopRecording : startRecording}
                                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-white text-red-600 shadow-[0_0_15px_rgba(234,67,53,0.5)]' : 'bg-[#3c4043] hover:bg-[#4d5155] text-white'}`}
                                title={isRecording ? "Stop Recording" : "Record Meeting"}
                            >
                                {isRecording ? <div className="w-4 h-4 bg-red-600 rounded-sm animate-pulse" /> : <div className="w-4 h-4 border-2 border-white rounded-full bg-white" />}
                            </button>
                            {isRecording && (
                                <span className="absolute -top-6 text-[10px] font-bold text-red-500 bg-white/10 px-2 py-0.5 rounded-full backdrop-blur-sm animate-pulse">
                                    {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                                </span>
                            )}
                        </div>

                        <button onClick={handleAddPerson} className="w-12 h-12 rounded-full flex items-center justify-center transition-all bg-[#3c4043] hover:bg-[#4d5155] text-white" title="Add people">
                            <UserPlus size={20} />
                        </button>

                        <button
                            onClick={() => { const newMode = virtualBgMode === 'none' ? 'blur' : 'none'; setVirtualBgMode(newMode); onToggleVirtualBackground?.(newMode); toast('Virtual Background ' + newMode); }}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${virtualBgMode !== 'none' ? 'bg-[#8ab4f8] text-[#202124]' : 'bg-[#3c4043] hover:bg-[#4d5155] text-white'}`}
                            title="Visual effects"
                        >
                            <Sparkles size={20} />
                        </button>

                        {isHost && (
                            <button
                                onClick={() => setActiveSidePanel(activeSidePanel === 'host_controls' ? 'none' : 'host_controls')}
                                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${activeSidePanel === 'host_controls' ? 'bg-[#8ab4f8] text-[#202124]' : 'bg-[#3c4043] hover:bg-[#4d5155] text-white'}`}
                                title="Host Controls"
                            >
                                <Shield size={20} />
                            </button>
                        )}

                        <div className="relative">
                            <button
                                onClick={() => setShowMoreMenu(!showMoreMenu)}
                                className="w-12 h-12 rounded-full flex items-center justify-center transition-all bg-[#3c4043] hover:bg-[#4d5155] text-white"
                                title="More options"
                            >
                                <MoreVertical size={20} />
                            </button>
                            {showMoreMenu && (
                                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-72 bg-[#202124] rounded-lg shadow-2xl border border-[#5f6368] py-2 z-50 animate-fade-in-up">
                                    <div className="py-1">
                                        {[
                                            { icon: <MonitorUp size={18} />, label: 'Change layout' },
                                            { icon: <Maximize2 size={18} />, label: 'Full screen', onClick: () => document.documentElement.requestFullscreen() },
                                            { icon: <Minimize2 size={18} />, label: 'Minimize window', onClick: () => setIsExpanded(false) },
                                            {
                                                icon: <Settings size={18} />, label: virtualBgMode === 'none' ? 'Enable background effects' : 'Disable background effects', onClick: () => {
                                                    const newMode = virtualBgMode === 'none' ? 'blur' : 'none';
                                                    setVirtualBgMode(newMode);
                                                    onToggleVirtualBackground?.(newMode);
                                                }
                                            },
                                            { isDivider: true },
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

                        <button onClick={onEndCall} className="h-12 px-8 rounded-full bg-[#ea4335] hover:bg-[#d93025] text-white flex items-center justify-center transition-all ml-2" title="Leave">
                            <Phone size={24} className="rotate-135 fill-current" />
                        </button>
                    </div>

                    {/* Right: Info helpers */}
                    <div className="hidden md:flex items-center gap-3 text-[#e8eaed]">
                        <button onClick={() => setActiveSidePanel(activeSidePanel === 'info' ? 'none' : 'info')} className={`p-3 rounded-full ${activeSidePanel === 'info' ? 'bg-[#8ab4f8] text-[#202124]' : 'hover:bg-[#3c4043]'}`}>
                            <Info size={20} />
                        </button>
                        <button onClick={() => setActiveSidePanel(activeSidePanel === 'people' ? 'none' : 'people')} className={`p-3 rounded-full ${activeSidePanel === 'people' ? 'bg-[#8ab4f8] text-[#202124]' : 'hover:bg-[#3c4043]'}`}>
                            <Users size={20} />
                        </button>
                        <button onClick={() => setActiveSidePanel(activeSidePanel === 'chat' ? 'none' : 'chat')} className={`p-3 rounded-full ${activeSidePanel === 'chat' ? 'bg-[#8ab4f8] text-[#202124]' : 'hover:bg-[#3c4043]'}`}>
                            <MessageSquare size={20} />
                        </button>
                    </div>
                </div>

                {(!remoteStream || (!isVideo && !isExpanded)) && <audio ref={remoteAudioRef} autoPlay />}
            </div>
        );
    }

    // Mini View (Return fallback)
    return (
        <div
            className="fixed z-50 w-96 touch-none cursor-move"
            style={position ? { left: position.x, top: position.y } : { bottom: '1rem', right: '1rem' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
            <div className="bg-[#202124] rounded-2xl shadow-2xl border border-[#3c4043] overflow-hidden transform hover:scale-[1.02] transition-transform">
                <div className="aspect-video bg-[#3c4043] relative group">
                    {remoteStream && (isVideo || isScreenSharing) ? (
                        <video
                            key={remoteStream.id}
                            ref={setRemoteVideoRef}
                            autoPlay
                            playsInline
                            className="w-full h-full object-cover"
                            onLoadedMetadata={(e) => {
                                (e.target as HTMLVideoElement).play().catch(console.error);
                            }}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600">
                            <span className="text-white text-2xl font-bold">{displayName.charAt(0).toUpperCase()}</span>
                        </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                        <button onClick={() => setIsExpanded(true)} className="p-3 bg-black/60 text-white rounded-full hover:bg-black/80 transition" title="Full Screen">
                            <Maximize2 size={24} />
                        </button>
                        <button onClick={onEndCall} className="p-3 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg" title="End Call">
                            <Phone size={24} className="rotate-135" />
                        </button>
                    </div>
                    <div className="absolute bottom-2 left-2 truncate text-white text-sm font-medium drop-shadow z-10">
                        {displayName}
                    </div>
                </div>
            </div>
            <audio ref={remoteAudioRef} autoPlay />
        </div>
    );
}
