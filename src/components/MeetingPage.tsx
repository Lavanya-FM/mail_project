import { useEffect, useState, useRef } from 'react';
import { p2pService } from '../lib/p2pService';
import { Video, Mic, MicOff, PhoneOff, User, Copy, VideoOff, Volume2, Loader2 } from 'lucide-react';
import { authService } from '../lib/authService';
import toast from 'react-hot-toast';

interface MeetingPageProps {
    meetingId: string;
    onLeave: () => void;
}

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
    ]
};

export default function MeetingPage({ meetingId, onLeave }: MeetingPageProps) {
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
    const [participants, setParticipants] = useState<any[]>([]); // Metadata only
    const [joining, setJoining] = useState(true);

    const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const user = authService.getCurrentUser();
    const localVideoRef = useRef<HTMLVideoElement>(null);

    // Initialize Local Media
    useEffect(() => {
        let stream: MediaStream | null = null;

        async function startMedia() {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                setLocalStream(stream);
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = stream;
                }
                setJoining(false);
            } catch (err) {
                console.error("Failed to get media", err);
                toast.error("Could not access camera/mic");
                setJoining(false);
            }
        }
        startMedia();

        return () => {
            if (stream) stream.getTracks().forEach(t => t.stop());
        };
    }, []);

    // Helper to create PC
    const createPeerConnection = (peerEmail: string, stream: MediaStream) => {
        if (peersRef.current.has(peerEmail)) return peersRef.current.get(peerEmail)!;

        console.log(`[Mesh] Creating PC for ${peerEmail}`);
        const pc = new RTCPeerConnection(ICE_SERVERS);

        // Add local tracks
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        // Handle ICE
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                p2pService.sendSignal(peerEmail, { candidate: event.candidate });
            }
        };

        // Handle Remote Stream
        pc.ontrack = (event) => {
            console.log(`[Mesh] Received remote track from ${peerEmail}`);
            setRemoteStreams(prev => {
                const newMap = new Map(prev);
                newMap.set(peerEmail, event.streams[0]);
                return newMap;
            });
        };

        peersRef.current.set(peerEmail, pc);
        return pc;
    };

    useEffect(() => {
        if (!localStream) return;

        // Join room
        p2pService.joinRoom(meetingId);

        const handleRoomJoined = (e: CustomEvent) => {
            if (e.detail.meetingId === meetingId) {
                const parts = e.detail.participants || [];
                setParticipants(parts);
                // We don't initiate calls here; we wait for them or existing peers?
                // Actually existing peers should receive 'peer-joined' and call US.
                // Or WE call THEM. Mesh strategy: Newcomer calls existing peers usually? 
                // Let's have Newcomer initiate to keep it simple.

                parts.forEach((p: any) => {
                    initiateConnection(p.email);
                });
            }
        };

        const initiateConnection = async (targetEmail: string) => {
            if (!localStream) return;
            const pc = createPeerConnection(targetEmail, localStream);

            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                p2pService.sendSignal(targetEmail, { sdp: offer });
            } catch (err) {
                console.error("Error creating offer", err);
            }
        };

        const handlePeerJoined = (e: CustomEvent) => {
            const peer = e.detail.peer;
            if (e.detail.meetingId === meetingId && peer.email !== user?.email) {
                setParticipants(prev => {
                    if (prev.find(p => p.email === peer.email)) return prev;
                    return [...prev, peer];
                });
                toast(`${peer.email} joined`);
                // Existing peers wait for offer? Or initiate?
                // If newcomer initiates, we do nothing here but wait for signal.
            }
        };

        const handleSignal = async (e: CustomEvent) => {
            const { from, payload } = e.detail;
            if (!payload) return;

            let pc = peersRef.current.get(from);

            // If receiving offer, we might not have PC yet
            if (!pc) {
                if (payload.sdp && payload.sdp.type === 'offer') {
                    pc = createPeerConnection(from, localStream!);
                } else {
                    console.warn("Received signal for non-existent PC", from);
                    return;
                }
            }

            try {
                if (payload.sdp) {
                    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));

                    if (payload.sdp.type === 'offer') {
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        p2pService.sendSignal(from, { sdp: answer });
                    }
                } else if (payload.candidate) {
                    await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
                }
            } catch (err) {
                console.error("Signaling error", err);
            }
        };

        const handlePeerLeft = (e: CustomEvent) => {
            if (e.detail.meetingId === meetingId) {
                const email = e.detail.email; // We need email to identify PC.
                // Backend broadcasting might include email in peer-left-room? 
                // My backend implementation sends connectionId.
                // I should match connectionId to find email? 
                // Or just close PC if I can map it.
                // For now, I'll rely on Participants list updates.

                // If I have the email map:
                const p = participants.find(p => p.connectionId === e.detail.connectionId);
                if (p) {
                    const pc = peersRef.current.get(p.email);
                    if (pc) {
                        pc.close();
                        peersRef.current.delete(p.email);
                    }
                    setRemoteStreams(prev => {
                        const n = new Map(prev);
                        n.delete(p.email);
                        return n;
                    });
                }

                setParticipants(prev => prev.filter(p => p.connectionId !== e.detail.connectionId));
                toast(`User left`);
            }
        };

        window.addEventListener('p2p-room-joined', handleRoomJoined as EventListener);
        window.addEventListener('p2p-peer-joined-room', handlePeerJoined as EventListener);
        window.addEventListener('p2p-peer-left-room', handlePeerLeft as EventListener);
        window.addEventListener('p2p-signal', handleSignal as EventListener);

        return () => {
            p2pService.leaveRoom(meetingId);
            window.removeEventListener('p2p-room-joined', handleRoomJoined as EventListener);
            window.removeEventListener('p2p-peer-joined-room', handlePeerJoined as EventListener);
            window.removeEventListener('p2p-peer-left-room', handlePeerLeft as EventListener);
            window.removeEventListener('p2p-signal', handleSignal as EventListener);

            // Cleanup PCs
            peersRef.current.forEach(pc => pc.close());
            peersRef.current.clear();
        };
    }, [meetingId, localStream]);

    const copyLink = () => {
        navigator.clipboard.writeText(meetingId);
        toast.success('Meeting ID copied');
    };

    return (
        <div className="h-full flex flex-col bg-slate-900 text-white relative z-50">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-slate-950">
                <div className="flex items-center gap-4">
                    <h1 className="font-bold text-lg">Meeting</h1>
                    <div className="flex items-center gap-2 bg-slate-800 px-3 py-1 rounded-full text-sm font-mono text-blue-400">
                        {meetingId}
                        <button onClick={copyLink} className="hover:text-white"><Copy size={14} /></button>
                    </div>
                </div>
                <button onClick={onLeave} className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg font-bold flex items-center gap-2">
                    <PhoneOff size={20} /> Leave
                </button>
            </div>

            {/* Grid */}
            <div className="flex-1 p-6 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {/* Self */}
                    <div className="aspect-video bg-slate-800 rounded-2xl flex flex-col items-center justify-center relative border-2 border-green-500/30 overflow-hidden shadow-lg">
                        <video
                            ref={localVideoRef}
                            autoPlay
                            muted
                            playsInline
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-4 left-4 font-semibold text-shadow shadow-black bg-black/50 px-2 rounded">You ({user?.email})</div>
                    </div>

                    {/* Participants (Remote Streams) */}
                    {Array.from(remoteStreams.entries()).map(([email, stream]) => (
                        <div key={email} className="aspect-video bg-slate-800 rounded-2xl flex flex-col items-center justify-center relative border border-slate-700 overflow-hidden shadow-lg">
                            <RemoteVideo stream={stream} />
                            <div className="absolute bottom-4 left-4 font-semibold text-shadow shadow-black bg-black/50 px-2 rounded">{email}</div>
                            <div className="absolute top-4 right-4 text-green-500 flex items-center gap-1 text-xs bg-black/50 px-2 rounded-full">
                                <Volume2 size={12} /> Live
                            </div>
                        </div>
                    ))}

                    {/* Participants (Connecting/No Video) */}
                    {participants.filter(p => p.email !== user?.email && !remoteStreams.has(p.email)).map(p => (
                        <div key={p.email} className="aspect-video bg-slate-800 rounded-2xl flex flex-col items-center justify-center relative border border-slate-700 overflow-hidden animate-pulse">
                            <User size={64} className="text-slate-600 mb-4" />
                            <div className="absolute bottom-4 left-4 font-semibold">{p.email}</div>
                            <div className="absolute flex items-center gap-2">
                                <Loader2 className="animate-spin text-blue-400" /> Connecting...
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer Controls */}
            <div className="p-6 flex justify-center gap-4 border-t border-gray-800 bg-slate-950">
                <button className="w-12 h-12 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center"><Mic size={20} /></button>
                <button className="w-12 h-12 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center"><Video size={20} /></button>
            </div>
        </div>
    );
}

// Helper Component for Remote Video to handle ref
function RemoteVideo({ stream }: { stream: MediaStream }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);
    return <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />;
}
