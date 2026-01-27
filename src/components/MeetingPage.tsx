import { useEffect, useState, useRef, useCallback } from 'react';
import { p2pService } from '../lib/p2pService';
import {
    Video, Mic, PhoneOff, Copy,
    Users, Lock, X, Send, MoreVertical,
    Shield, Captions, Info, Smile,
    Sparkles, MicOff, VideoOff, MonitorUp, MessageSquare, Hand, LayoutGrid
} from 'lucide-react';
import { backgroundProcessor } from '../lib/backgroundProcessor';
import { authService } from '../lib/authService';
import toast from 'react-hot-toast';
import RecordingPromptModal from './RecordingPromptModal';
import { uploadFile } from '../lib/driveService';

// Helper to generate guest ID
const generateGuestId = () => `guest-${Math.random().toString(36).substr(2, 9)}`;

interface MeetingPageProps {
    meetingId: string;
    onLeave: () => void;
    initialVideoOff?: boolean;
}

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
    ]
};

// --- Remote Video Component (Outside) ---
function RemoteVideo({ stream }: { stream: MediaStream }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);
    return <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />;
}

export default function MeetingPage({ meetingId, onLeave, initialVideoOff = false }: MeetingPageProps) {
    // Stage 1: Basic States
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
    const [participants, setParticipants] = useState<any[]>([]);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(initialVideoOff);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [layout, setLayout] = useState<'grid' | 'speaker'>('grid');
    const [showChat, setShowChat] = useState(false);
    const [chatMessages, setChatMessages] = useState<any[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [reactions, setReactions] = useState<{ id: number, emoji: string, x: number, y: number }[]>([]);
    const [showReactions, setShowReactions] = useState(false);
    const [showInvite, setShowInvite] = useState(false);
    const [showMeetingInfo, setShowMeetingInfo] = useState(true);
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    const [callDuration, setCallDuration] = useState(0);
    const [hasLeft, setHasLeft] = useState(false);
    const [joinStatus, _setJoinStatus] = useState<'initiating' | 'waiting' | 'joined'>('initiating');
    const [isHost, setIsHost] = useState(false);

    // Guest State
    const [guestName, setGuestName] = useState('');
    const [guestId] = useState(generateGuestId());
    const [isGuest] = useState(!authService.getCurrentUser());
    const [guestJoined, setGuestJoined] = useState(false);

    // Stage 2: Feature States
    const [isHandRaised, setIsHandRaised] = useState(false);
    const [captionsEnabled, setCaptionsEnabled] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [virtualBgMode, setVirtualBgMode] = useState<'none' | 'blur' | 'image'>('none');
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isSavingToDrive, setIsSavingToDrive] = useState(false);
    const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
    const [showRecordingPrompt, setShowRecordingPrompt] = useState(false);
    const [showHostControls, setShowHostControls] = useState(false);
    const [pendingAdler, setPendingAdler] = useState<{ email: string, name?: string } | null>(null);

    // Refs
    const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const joinStatusRef = useRef(joinStatus);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const currentUser = authService.getCurrentUser();

    const effectiveUser = isGuest ? {
        id: guestId,
        email: `${guestId}@guest.jeemail.in`,
        name: guestName || 'Guest'
    } : currentUser;

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const recordingStreamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const setJoinStatus = useCallback((status: 'initiating' | 'waiting' | 'joined') => {
        _setJoinStatus(status);
        joinStatusRef.current = status;
    }, []);

    // Timer Effect
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
            if (!hasLeft && joinStatus === 'joined') {
                setCallDuration(prev => prev + 1);
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [hasLeft, joinStatus]);

    // Media Setup
    useEffect(() => {
        let stream: MediaStream | null = null;
        async function startMedia() {
            try {
                if (hasLeft) return;
                stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                if (initialVideoOff) {
                    stream.getVideoTracks().forEach(track => track.enabled = false);
                }
                setLocalStream(stream);
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = stream;
                    localVideoRef.current.muted = true;
                }
            } catch (err) {
                console.error("Failed to get media", err);
                toast.error("Could not access camera/mic");
            }
        }
        if (!hasLeft) startMedia();
        return () => {
            if (stream) stream.getTracks().forEach(t => t.stop());
        };
    }, [hasLeft]);

    // Peer Connection Factory
    const createPeerConnection = useCallback((peerEmail: string, stream: MediaStream) => {
        // Cleanup existing connection if it exists to prevent limits/loops
        if (peersRef.current.has(peerEmail)) {
            try {
                const existing = peersRef.current.get(peerEmail);
                existing?.close();
            } catch (e) { console.error('Error closing existing peer:', e); }
            peersRef.current.delete(peerEmail);
        }

        const pc = new RTCPeerConnection(ICE_SERVERS);

        // Safety: Track connection state
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                peersRef.current.delete(peerEmail);
            }
        };

        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                p2pService.sendSignal(peerEmail, { candidate: event.candidate });
            }
        };

        pc.ontrack = (event) => {
            setRemoteStreams(prev => {
                const next = new Map(prev);
                next.set(peerEmail, event.streams[0]);
                return next;
            });
        };

        peersRef.current.set(peerEmail, pc);
        return pc;
    }, []);

    // Signaling Logic
    useEffect(() => {
        if (!localStream) return;
        if (isGuest && !guestJoined) return; // Wait for guest to enter name

        // Connect p2p service if needed (especially for guests)
        if (!p2pService.isConnected() && effectiveUser) {
            p2pService.connect(effectiveUser.id || 0, effectiveUser.email);
        }

        const join = async () => {
            try {
                await p2pService.waitForConnection();
                p2pService.joinRoom(meetingId);
            } catch (e) {
                console.error("Failed connect", e);
                toast.error("Connection failed. Retrying...");
                // Retry connection logic could go here
            }
        };
        join();

        const initiateConnection = async (targetEmail: string) => {
            if (!localStream) return;

            // Critical Fix: Don't initiate if we already have a stable connection
            const existingPc = peersRef.current.get(targetEmail);
            if (existingPc && ['connected', 'connecting'].includes(existingPc.connectionState)) {
                return;
            }

            const pc = createPeerConnection(targetEmail, localStream);
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                p2pService.sendSignal(targetEmail, { sdp: offer });
            } catch (err) { console.error(err); }
        };

        const handleRoomJoined = (evt: Event) => {
            const e = evt as CustomEvent;
            if (e.detail.meetingId === meetingId) {
                const parts = e.detail.participants || [];
                setParticipants(parts);
                if (parts.length === 0) {
                    setJoinStatus('joined');
                    setIsHost(true);
                } else {
                    setJoinStatus('waiting');
                    p2pService.broadcastToRoom(meetingId, {
                        type: 'REQUEST_ADMIT',
                        user: { email: effectiveUser?.email, name: effectiveUser?.name }
                    });
                }
            }
        };

        const handlePeerJoined = (evt: Event) => {
            const e = evt as CustomEvent;
            const peer = e.detail.peer;
            if (e.detail.meetingId === meetingId && peer.email !== effectiveUser?.email) {
                setParticipants(prev => {
                    if (prev.find(p => p.email === peer.email)) return prev;
                    return [...prev, peer];
                });
                if (joinStatusRef.current === 'joined') {
                    initiateConnection(peer.email);
                }
            }
        };

        const handleRoomMessage = (evt: Event) => {
            const e = evt as CustomEvent;
            const { from, payload } = e.detail;
            if (e.detail.meetingId !== meetingId) return;

            if (payload.type === 'chat') {
                setChatMessages(prev => [...prev, { ...payload.message, isMe: false }]);
            } else if (payload.type === 'REQUEST_ADMIT') {
                if (joinStatusRef.current === 'joined') {
                    setPendingAdler({ email: from, ...payload.user });
                }
            } else if (payload.type === 'ADMIT_USER') {
                if (payload.targetEmail === effectiveUser?.email && joinStatusRef.current === 'waiting') {
                    setJoinStatus('joined');
                    toast.success('Admitted to meeting');
                    setParticipants(prev => {
                        prev.forEach(p => initiateConnection(p.email));
                        return prev;
                    });
                }
            } else if (payload.type === 'reaction') {
                const newReaction = { id: Date.now(), emoji: payload.emoji, x: Math.random() * 80 + 10, y: Math.random() * 30 + 50 };
                setReactions(prev => [...prev, newReaction]);
                setTimeout(() => setReactions(prev => prev.filter(r => r.id !== newReaction.id)), 2000);
            }
        };

        const handleSignal = async (evt: Event) => {
            const e = evt as CustomEvent;
            const { from, payload } = e.detail;

            // Ignore own signals
            if (from === effectiveUser?.email) return;

            // Ignore signals if we aren't even waiting or joined
            if (!payload || joinStatusRef.current === 'initiating') return;

            let pc = peersRef.current.get(from);

            // Only create PC on offer if it doesn't exist
            if (!pc && payload.sdp?.type === 'offer') {
                // Safeguard: Limit max peers
                if (peersRef.current.size > 20) {
                    console.warn('Max peers reached, ignoring offer from', from);
                    return;
                }
                pc = createPeerConnection(from, localStream);
            }

            if (!pc) return;

            try {
                if (payload.sdp) {
                    // Prevent glare/rollbacks
                    if (pc.signalingState !== 'stable' && payload.sdp.type === 'offer') {
                        // Rollback not supported easily, but logging might help
                        console.warn('Received offer in non-stable state, potential glare', pc.signalingState);
                        // If we are polite peer, we might accept. For now, strict check.
                        if (from < (effectiveUser?.email || '')) {
                            // Ignore offer if we are 'impolite' or lexicographically higher?
                            // Simplest fix: Just allow it for now but catch errors.
                        }
                    }

                    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                    if (payload.sdp.type === 'offer') {
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        p2pService.sendSignal(from, { sdp: answer });
                    }
                } else if (payload.candidate) {
                    await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
                }
            } catch (err) { console.error('Signaling error:', err); }
        };

        const handlePeerLeft = (evt: Event) => {
            const e = evt as CustomEvent;
            if (e.detail.meetingId === meetingId) {
                const pEmail = e.detail.email;
                const pc = pEmail ? peersRef.current.get(pEmail) : null;
                if (pc) {
                    pc.close();
                    peersRef.current.delete(pEmail);
                    setRemoteStreams(prev => { const n = new Map(prev); n.delete(pEmail); return n; });
                }
                setParticipants(prev => prev.filter(p => p.connectionId !== e.detail.connectionId));
            }
        };

        window.addEventListener('p2p-room-joined', handleRoomJoined);
        window.addEventListener('p2p-peer-joined-room', handlePeerJoined);
        window.addEventListener('p2p-peer-left-room', handlePeerLeft);
        window.addEventListener('p2p-signal', handleSignal);
        window.addEventListener('p2p-room-message', handleRoomMessage);

        return () => {
            p2pService.leaveRoom(meetingId);
            window.removeEventListener('p2p-room-joined', handleRoomJoined);
            window.removeEventListener('p2p-peer-joined-room', handlePeerJoined);
            window.removeEventListener('p2p-peer-left-room', handlePeerLeft);
            window.removeEventListener('p2p-signal', handleSignal);
            window.removeEventListener('p2p-room-message', handleRoomMessage);
            peersRef.current.forEach(pc => pc.close());
            peersRef.current.clear();
        };
    }, [meetingId, localStream, effectiveUser, createPeerConnection, setJoinStatus, isGuest, guestJoined]);

    useEffect(() => {
        if (showInvite) {
            authService.fetchWithAuth('/api/users/search').then(res => res.json()).then(setAllUsers).catch(() => { });
        }
    }, [showInvite]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatMessages, showChat]);

    // Helpers
    const handleLeave = () => setHasLeft(true);
    const handleRejoin = () => { setHasLeft(false); setJoinStatus('initiating'); };
    const admitUser = () => { if (pendingAdler) { p2pService.broadcastToRoom(meetingId, { type: 'ADMIT_USER', targetEmail: pendingAdler.email }); setPendingAdler(null); toast.success(`Admitted ${pendingAdler.name || pendingAdler.email}`); } };
    const denyUser = () => setPendingAdler(null);
    const sendChat = () => { if (chatInput.trim()) { const msg = { sender: 'You', content: chatInput, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), isMe: true }; setChatMessages(prev => [...prev, msg]); p2pService.broadcastToRoom(meetingId, { type: 'chat', message: msg }); setChatInput(''); } };

    const toggleMute = () => {
        if (localStream) {
            const track = localStream.getAudioTracks()[0];
            if (track) {
                track.enabled = !track.enabled;
                setIsMuted(!track.enabled);
            }
        }
    };

    const toggleVideo = () => {
        if (localStream) {
            const track = localStream.getVideoTracks()[0];
            if (track) {
                track.enabled = !track.enabled;
                setIsVideoOff(!track.enabled);
            }
        }
    };

    const toggleScreenShare = () => setIsScreenSharing(!isScreenSharing);

    const toggleVirtualBackground = async (mode: 'blur' | 'image' | 'none') => {
        if (!localStream) return;
        setVirtualBgMode(mode);
        backgroundProcessor.setMode(mode);
        if (mode !== 'none') {
            const processedStream = await backgroundProcessor.startProcessing(localStream);
            if (localVideoRef.current) localVideoRef.current.srcObject = processedStream;
            peersRef.current.forEach(pc => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) sender.replaceTrack(processedStream.getVideoTracks()[0]);
            });
        } else {
            backgroundProcessor.stopProcessing();
            if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
            peersRef.current.forEach(pc => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) sender.replaceTrack(localStream.getVideoTracks()[0]);
            });
        }
    };

    const startRecording = async () => {
        try {
            toast("To record correctly, select this tab/window when prompted.", { icon: '📼' });
            const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            const audioCtx = new AudioContext();
            audioContextRef.current = audioCtx;
            const dest = audioCtx.createMediaStreamDestination();
            if (displayStream.getAudioTracks().length > 0) audioCtx.createMediaStreamSource(displayStream).connect(dest);
            if (localStream && localStream.getAudioTracks().length > 0) audioCtx.createMediaStreamSource(localStream).connect(dest);
            const finalStream = new MediaStream([displayStream.getVideoTracks()[0], ...dest.stream.getAudioTracks()]);
            recordingStreamRef.current = finalStream;
            recordedChunksRef.current = [];
            const recorder = new MediaRecorder(finalStream, { mimeType: 'video/webm' });
            recorder.ondataavailable = (e) => e.data.size > 0 && recordedChunksRef.current.push(e.data);
            recorder.onstop = () => {
                const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
                setRecordedBlob(blob);
                setShowRecordingPrompt(true);
            };
            recorder.start(1000);
            mediaRecorderRef.current = recorder;
            setIsRecording(true);
            setRecordingDuration(0);
            recordingIntervalRef.current = setInterval(() => setRecordingDuration(p => p + 1), 1000);
            toast.success("Recording started");
        } catch (e) {
            console.error(e);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
        if (recordingStreamRef.current) recordingStreamRef.current.getTracks().forEach(t => t.stop());
        if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
        setIsRecording(false);
    };

    const handleSaveToDrive = async () => {
        if (!recordedBlob) return;
        setIsSavingToDrive(true);
        try {
            const filename = `Meeting_Recording_${meetingId}_${new Date().getTime()}.webm`;
            const file = new File([recordedBlob], filename, { type: 'video/webm' });
            await uploadFile(file, effectiveUser?.id || 1, null);
            toast.success('Saved to Drive');
            setShowRecordingPrompt(false);
        } catch (e) {
            toast.error('Failed to save to Drive');
        } finally {
            setIsSavingToDrive(false);
        }
    };

    const handleDownloadLocally = () => {
        if (!recordedBlob) return;
        const url = URL.createObjectURL(recordedBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Meeting_Recording_${meetingId}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        setShowRecordingPrompt(false);
    };

    const copyLink = () => { const link = `${window.location.origin}/meet/${meetingId}`; navigator.clipboard.writeText(link); toast.success('Link Copied'); };
    const formatTime = (s: number) => { const m = Math.floor(s / 60); const sec = s % 60; return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`; };

    return (
        <div className="h-full w-full bg-[#202124] text-white flex flex-col relative overflow-hidden font-sans">
            {hasLeft ? (
                <div className="flex-1 flex flex-col items-center justify-center animate-fade-in text-center p-8">
                    <h1 className="text-4xl font-light mb-8">You left the meeting</h1>
                    <div className="flex gap-4">
                        <button onClick={handleRejoin} className="px-8 py-2.5 rounded-full border border-gray-600 font-medium hover:bg-gray-800 transition">Rejoin</button>
                        <button onClick={onLeave} className="px-8 py-2.5 rounded-full bg-blue-300 text-gray-900 font-medium hover:bg-blue-200 transition">Return to home</button>
                    </div>
                </div>
            ) : joinStatus !== 'joined' ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
                    <div className="w-full max-w-md bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-2xl space-y-6">
                        <div className="flex flex-col items-center gap-4">
                            {isGuest && !guestJoined ? (
                                <>
                                    <h2 className="text-2xl font-bold">What's your name?</h2>
                                    <p className="text-slate-400 text-sm">Enter your name to join the meeting</p>
                                    <div className="w-full max-w-xs space-y-4">
                                        <input
                                            type="text"
                                            value={guestName}
                                            onChange={(e) => setGuestName(e.target.value)}
                                            placeholder="Your Name"
                                            className="w-full bg-[#3c4043] border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition"
                                            onKeyDown={(e) => e.key === 'Enter' && guestName.trim() && setGuestJoined(true)}
                                        />
                                        <button
                                            onClick={() => setGuestJoined(true)}
                                            disabled={!guestName.trim()}
                                            className="w-full bg-blue-600 text-white font-bold py-3 rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                        >
                                            Ask to Join
                                        </button>
                                    </div>
                                </>
                            ) : joinStatus === 'initiating' ? (
                                <>
                                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                    <h2 className="text-2xl font-light">Getting ready...</h2>
                                </>
                            ) : (
                                <>
                                    <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-4xl font-bold">
                                        {effectiveUser?.email?.[0].toUpperCase() || effectiveUser?.name?.[0].toUpperCase() || '?'}
                                    </div>
                                    <h2 className="text-2xl font-bold">Asking to join...</h2>
                                    <p className="text-slate-400">Someone in the meeting will let you in soon.</p>
                                </>
                            )}
                        </div>
                        <div className="aspect-video bg-black rounded-xl overflow-hidden relative border border-white/10">
                            <video
                                ref={(v) => { if (v && localStream) v.srcObject = localStream }}
                                autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]"
                            />
                        </div>
                        <div className="flex justify-center gap-4">
                            <button onClick={toggleMute} className={`p-4 rounded-full border ${isMuted ? 'bg-red-500 border-red-500' : 'bg-transparent border-gray-600 hover:bg-white/10'}`}>
                                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                            </button>
                            <button onClick={toggleVideo} className={`p-4 rounded-full border ${isVideoOff ? 'bg-red-500 border-red-500' : 'bg-transparent border-gray-600 hover:bg-white/10'}`}>
                                {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div className="h-16 flex items-center justify-between px-6 z-40 bg-gradient-to-b from-black/40 to-transparent absolute top-0 left-0 right-0 pointer-events-none">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-lg text-sm pointer-events-auto">
                            <Lock size={14} className="text-white/70" /> {meetingId}
                        </div>
                        <div className="bg-black/60 backdrop-blur-md px-4 py-1 rounded-full font-mono text-sm pointer-events-auto">
                            {formatTime(callDuration)}
                        </div>
                        <button onClick={() => setLayout(l => l === 'grid' ? 'speaker' : 'grid')} className="p-2 bg-black/40 hover:bg-black/60 rounded-lg pointer-events-auto">
                            <LayoutGrid size={20} />
                        </button>
                    </div>

                    {pendingAdler && (
                        <div className="absolute top-20 right-6 z-[100] bg-white text-gray-900 rounded-xl shadow-2xl p-4 w-80 animate-slide-in-right border-l-4 border-blue-600">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold shrink-0">{pendingAdler.email[0].toUpperCase()}</div>
                                <div className="flex-1">
                                    <h4 className="font-bold text-sm">{pendingAdler.name || pendingAdler.email}</h4>
                                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-tight">Wants to join</p>
                                </div>
                            </div>
                            <div className="flex gap-2 mt-4">
                                <button onClick={denyUser} className="flex-1 py-2 bg-gray-100 font-bold text-xs rounded-lg hover:bg-gray-200">Deny</button>
                                <button onClick={admitUser} className="flex-1 py-2 bg-blue-600 text-white font-bold text-xs rounded-lg hover:bg-blue-700">Admit</button>
                            </div>
                        </div>
                    )}

                    <div className="flex-1 flex overflow-hidden">
                        <div className="flex-1 p-4 flex flex-col">
                            <div className={`flex-1 ${layout === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr' : 'flex flex-col'}`}>
                                <div className={`bg-[#3c4043] rounded-2xl overflow-hidden relative shadow-lg ${layout === 'speaker' && 'h-48 w-64 absolute bottom-4 right-4 z-20 border-2 border-white/20'}`}>
                                    <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
                                    <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/40 px-2 py-1 rounded-lg text-xs font-medium backdrop-blur">
                                        {effectiveUser?.name || 'You'} {isHost && <span className="text-[10px] bg-blue-600 px-1.5 rounded uppercase font-bold">Host</span>}
                                        {isMuted && <MicOff size={10} className="text-red-400" />}
                                    </div>
                                </div>
                                {Array.from(remoteStreams.entries()).map(([email, stream]) => (
                                    <div key={email} className="bg-[#3c4043] rounded-2xl overflow-hidden relative shadow-lg">
                                        <RemoteVideo stream={stream} />
                                        <div className="absolute bottom-3 left-3 bg-black/40 px-2 py-1 rounded-lg text-xs font-medium backdrop-blur uppercase tracking-tight">
                                            {email.split('@')[0]}
                                        </div>
                                    </div>
                                ))}
                                {participants.filter(p => p.email !== effectiveUser?.email && !remoteStreams.has(p.email)).map(p => (
                                    <div key={p.email} className="bg-[#3c4043] rounded-2xl flex flex-col items-center justify-center animate-pulse gap-4">
                                        <div className="w-20 h-20 rounded-full bg-purple-600 flex items-center justify-center text-3xl font-bold">{(p.email || p.name || '?')[0].toUpperCase()}</div>
                                        <div className="text-sm font-bold text-blue-300">Joining...</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {reactions.map(r => (
                            <div key={r.id} className="fixed pointer-events-none text-6xl animate-float-up z-[60] drop-shadow-2xl" style={{ left: r.x + '%', top: r.y + '%' }}>{r.emoji}</div>
                        ))}
                        {showChat && (
                            <div className="w-80 bg-white text-gray-900 flex flex-col animate-slide-in-right shadow-2xl rounded-l-2xl m-2 overflow-hidden border border-gray-200">
                                <div className="p-4 border-b flex justify-between items-center font-bold">
                                    Chat <button onClick={() => setShowChat(false)}><X size={20} /></button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 scroll-smooth">
                                    {chatMessages.map((m, i) => (
                                        <div key={i} className={`flex flex-col ${m.isMe ? 'items-end' : 'items-start'}`}>
                                            <div className="text-[10px] font-bold text-gray-500 mb-1">{m.sender} <span className="font-normal">{m.time}</span></div>
                                            <div className={`px-4 py-2 rounded-2xl text-sm shadow-sm ${m.isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none border border-gray-100'}`}>
                                                {m.content}
                                            </div>
                                        </div>
                                    ))}
                                    <div ref={chatEndRef} />
                                </div>
                                <div className="p-4 border-t bg-white">
                                    <div className="flex bg-gray-100 rounded-full px-4 py-2 items-center">
                                        <input className="flex-1 bg-transparent border-none focus:ring-0 text-sm" placeholder="Send message" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()} />
                                        <button onClick={sendChat} className="text-blue-600 ml-2" disabled={!chatInput.trim()}><Send size={18} /></button>
                                    </div>
                                </div>
                            </div>
                        )}
                        {showInvite && (
                            <div className="w-80 bg-white text-gray-900 flex flex-col animate-slide-in-right shadow-2xl rounded-l-2xl m-2 overflow-hidden border border-gray-200">
                                <div className="p-4 border-b flex justify-between items-center font-bold">
                                    Invite People <button onClick={() => setShowInvite(false)}><X size={20} /></button>
                                </div>
                                <div className="flex-1 overflow-y-auto bg-gray-50">
                                    {allUsers.map(u => (
                                        <div key={u.id} className="p-3 flex items-center justify-between hover:bg-gray-100 group border-b border-gray-200">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600 uppercase text-xs">{u.email[0]}</div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold">{u.name || u.email}</span>
                                                    <span className="text-[10px] text-gray-500">{u.email}</span>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => {
                                                    copyLink();
                                                    toast.success("Link copied");
                                                }} className="text-gray-500 text-xs font-bold hover:text-gray-700">Link</button>
                                                <button onClick={() => {
                                                    p2pService.sendChat(u.email, `Inviting you to a meeting: ${meetingId}`, {
                                                        type: 'meeting-invite',
                                                        meetingId: meetingId,
                                                        inviteFrom: effectiveUser?.name || effectiveUser?.email
                                                    });
                                                    toast.success(`Invited ${u.name || u.email}`);
                                                }} className="text-blue-600 text-xs font-bold hover:underline">Invite</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="h-24 bg-[#202124] flex items-center justify-between px-6 z-50 border-t border-white/5">
                        <div className="hidden md:flex items-center gap-4 text-sm min-w-[200px]">
                            <div className="flex flex-col">
                                <span className="font-bold text-lg leading-none">{currentTime}</span>
                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">{meetingId}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button onClick={toggleMute} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-red-500 text-white' : 'bg-[#3c4043] hover:bg-[#4d5155]'}`} title="Mic">
                                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                            </button>
                            <button onClick={toggleVideo} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isVideoOff ? 'bg-red-500 text-white' : 'bg-[#3c4043] hover:bg-[#4d5155]'}`} title="Camera">
                                {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
                            </button>
                            <button onClick={toggleScreenShare} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isScreenSharing ? 'bg-blue-300 text-gray-900 border-blue-300' : 'bg-[#3c4043] hover:bg-[#4d5155]'}`} title="Present">
                                <MonitorUp size={20} />
                            </button>

                            <div className="relative">
                                <button onClick={() => setShowReactions(!showReactions)} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${showReactions ? 'bg-blue-300 text-gray-900' : 'bg-[#3c4043] hover:bg-[#4d5155]'}`} title="Reactions">
                                    <Smile size={20} />
                                </button>
                                {showReactions && (
                                    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-[#202124] border border-[#5f6368] rounded-full p-2 flex gap-2 shadow-2xl animate-scale-up">
                                        {['👍', '💖', '😂', '😮', '👏'].map(e => (
                                            <button key={e} onClick={() => { p2pService.broadcastToRoom(meetingId, { type: 'reaction', emoji: e, from: effectiveUser?.email }); setShowReactions(false); }} className="text-2xl hover:scale-125 transition-transform">{e}</button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <button onClick={() => setCaptionsEnabled(!captionsEnabled)} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${captionsEnabled ? 'bg-blue-300 text-gray-900' : 'bg-[#3c4043] hover:bg-[#4d5155]'}`} title="Captions">
                                <Captions size={20} />
                            </button>

                            <button onClick={() => setIsHandRaised(!isHandRaised)} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isHandRaised ? 'bg-blue-300 text-gray-900' : 'bg-[#3c4043] hover:bg-[#4d5155]'}`} title="Raise hand">
                                <Hand size={20} />
                            </button>

                            <div className="relative flex flex-col items-center gap-1">
                                <button
                                    onClick={isRecording ? stopRecording : startRecording}
                                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-white text-red-600 shadow-[0_0_15px_rgba(234,67,53,0.5)]' : 'bg-[#3c4043] hover:bg-[#4d5155]'}`}
                                    title={isRecording ? "Stop Recording" : "Record Meeting"}
                                >
                                    {isRecording ? <div className="w-4 h-4 bg-red-600 rounded-sm animate-pulse" /> : <div className="w-4 h-4 border-2 border-white rounded-full bg-white" />}
                                </button>
                                {isRecording && (
                                    <span className="absolute -top-6 text-[10px] font-bold text-red-500 bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-sm animate-pulse">
                                        {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                                    </span>
                                )}
                            </div>

                            <button
                                onClick={() => { const newMode = virtualBgMode === 'none' ? 'blur' : 'none'; toggleVirtualBackground(newMode); }}
                                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${virtualBgMode !== 'none' ? 'bg-blue-300 text-gray-900' : 'bg-[#3c4043] hover:bg-[#4d5155]'}`}
                                title="Visual effects"
                            >
                                <Sparkles size={20} />
                            </button>

                            {isHost && (
                                <button onClick={() => setShowHostControls(!showHostControls)} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${showHostControls ? 'bg-blue-300 text-gray-900' : 'bg-[#3c4043] hover:bg-[#4d5155]'}`} title="Host Controls">
                                    <Shield size={20} />
                                </button>
                            )}

                            <div className="relative">
                                <button onClick={() => setShowMoreMenu(!showMoreMenu)} className="w-12 h-12 rounded-full flex items-center justify-center transition-all bg-[#3c4043] hover:bg-[#4d5155]" title="More options">
                                    <MoreVertical size={20} />
                                </button>
                                {showMoreMenu && (
                                    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-56 bg-[#202124] border border-[#5f6368] rounded-xl py-2 shadow-2xl z-[100] animate-slide-in-up">
                                        <button className="w-full text-left px-4 py-2.5 hover:bg-[#3c4043] text-sm flex items-center gap-3">
                                            <LayoutGrid size={18} /> Change layout
                                        </button>
                                        <button onClick={() => setShowMeetingInfo(true)} className="w-full text-left px-4 py-2.5 hover:bg-[#3c4043] text-sm flex items-center gap-3">
                                            <Info size={18} /> Meeting details
                                        </button>
                                    </div>
                                )}
                            </div>

                            <button onClick={handleLeave} className="h-12 px-8 bg-red-600 hover:bg-red-700 rounded-full flex items-center gap-3 font-bold shadow-lg transition-transform hover:scale-105 active:scale-95 ml-2">
                                <PhoneOff size={22} className="fill-white" />
                                <span className="hidden sm:inline">Leave</span>
                            </button>
                        </div>

                        <div className="flex items-center gap-2 min-w-[200px] justify-end">
                            <button onClick={() => setShowInvite(!showInvite)} className={`p-3 rounded-xl transition ${showInvite ? 'text-blue-300 bg-blue-300/10' : 'hover:bg-white/10'}`} title="People">
                                <Users size={22} />
                                {participants.length > 0 && <span className="ml-2 text-xs font-bold">{participants.length + 1}</span>}
                            </button>
                            <button onClick={() => setShowChat(!showChat)} className={`p-3 rounded-xl transition ${showChat ? 'text-blue-300 bg-blue-300/10' : 'hover:bg-white/10'}`} title="Chat">
                                <MessageSquare size={22} />
                            </button>
                        </div>
                    </div>

                    {showMeetingInfo && (
                        <div className="fixed top-20 left-6 z-[200] bg-white text-gray-900 p-6 rounded-2xl shadow-2xl w-80 animate-fade-in border border-gray-200">
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-xl">Your meeting is ready</h3>
                                <button onClick={() => setShowMeetingInfo(false)}><X size={18} /></button>
                            </div>
                            <button onClick={() => { setShowMeetingInfo(false); setShowInvite(true); }} className="w-full py-2 bg-blue-600 text-white rounded-full font-bold text-sm mb-4">Add people</button>
                            <p className="text-xs text-gray-500 mb-2">Or share this link:</p>
                            <div className="flex bg-gray-100 p-2 rounded-lg items-center justify-between">
                                <span className="text-[10px] font-mono truncate">{window.location.origin}/meet/{meetingId}</span>
                                <button onClick={copyLink} className="text-blue-600"><Copy size={14} /></button>
                            </div>
                        </div>
                    )}

                    <RecordingPromptModal
                        isOpen={showRecordingPrompt}
                        onClose={() => setShowRecordingPrompt(false)}
                        onSaveToDrive={handleSaveToDrive}
                        onDownloadLocally={handleDownloadLocally}
                        isUploading={isSavingToDrive}
                    />
                </>
            )}
        </div>
    );
}
