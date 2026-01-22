import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Phone, Mic, MicOff, User, Volume2, MonitorUp, Maximize2, Minimize2, ArrowUp, ArrowDown, Database, Settings } from 'lucide-react';

interface ActiveCallProps {
    remotePeer: string;
    isConnected: boolean;
    isMuted: boolean;
    duration: number;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    onToggleMute: () => void;
    onEndCall: () => void;
    isOutbound?: boolean;
    isVideo?: boolean;
    isScreenSharing?: boolean;
    onToggleScreenShare?: () => void;
    connectionStats?: { upload: string; download: string; total: string };
    availableDevices?: { audio: MediaDeviceInfo[], video: MediaDeviceInfo[] };
    onSwitchCamera?: (deviceId: string) => void;
    onSwitchMicrophone?: (deviceId: string) => void;
    onToggleVirtualBackground?: (mode: 'blur' | 'image' | 'none') => void;
}

export default function ActiveCall({
    remotePeer,
    isConnected,
    isMuted,
    duration,
    localStream,
    remoteStream,
    onToggleMute,
    onEndCall,
    isOutbound = false,
    isVideo = false,
    isScreenSharing = false,
    onToggleScreenShare,
    connectionStats,
    availableDevices,
    onSwitchCamera,
    onSwitchMicrophone,
    onToggleVirtualBackground
}: ActiveCallProps) {
    const remoteAudioRef = useRef<HTMLAudioElement>(null);
    const localAudioRef = useRef<HTMLAudioElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    const displayName = remotePeer.includes('@')
        ? remotePeer.split('@')[0].split(/[._]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : remotePeer;

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

    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleSwitchSpeaker = async () => {
        // Determine active media element (Video or Audio)
        const mediaElement = ((isVideo || isExpanded) && remoteVideoRef.current)
            ? remoteVideoRef.current
            : remoteAudioRef.current;

        const audio = mediaElement as any;

        if (!audio || typeof audio.setSinkId !== 'function') {
            toast.error('Speaker switching not supported in this browser');
            return;
        }

        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

            if (audioOutputs.length <= 1) {
                toast('No other speakers found');
                return;
            }

            const currentId = audio.sinkId;
            const currentIndex = audioOutputs.findIndex((d: any) => d.deviceId === currentId);
            const nextIndex = (currentIndex + 1) % audioOutputs.length;
            const nextDevice = audioOutputs[nextIndex];

            await audio.setSinkId(nextDevice.deviceId);
            toast.success(`Switched to ${nextDevice.label || 'Speaker ' + (nextIndex + 1)}`);
            console.log(`Switched to ${nextDevice.label}`);
        } catch (err: any) {
            console.error('Speaker switch error', err);
            toast.error('Failed to switch speaker');
        }
    };

    const Controls = () => (
        <div className="flex gap-4 items-center justify-center p-4 bg-white/10 backdrop-blur-md rounded-full border border-white/20 shadow-xl">
            <button
                onClick={onToggleMute}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-white/20 text-white hover:bg-white/30'}`}
                title={isMuted ? 'Unmute' : 'Mute'}
            >
                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            <button
                onClick={handleSwitchSpeaker}
                className="w-12 h-12 rounded-full flex items-center justify-center transition-all bg-white/20 text-white hover:bg-white/30"
                title="Switch Speaker"
            >
                <Volume2 size={20} />
            </button>

            {availableDevices && (
                <button
                    onClick={() => setShowSettings(!showSettings)}
                    className="w-12 h-12 rounded-full flex items-center justify-center transition-all bg-white/20 text-white hover:bg-white/30"
                    title="Settings"
                >
                    <Settings size={20} />
                </button>
            )}

            {onToggleScreenShare && (
                <button
                    onClick={onToggleScreenShare}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isScreenSharing ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-white/20 text-white hover:bg-white/30'}`}
                    title="Share Screen"
                >
                    <MonitorUp size={20} />
                </button>
            )}

            <button
                onClick={onEndCall}
                className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all shadow-lg hover:scale-105"
                title="End Call"
            >
                <Phone size={28} className="rotate-135" />
            </button>

            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-12 h-12 rounded-full flex items-center justify-center transition-all bg-white/20 text-white hover:bg-white/30"
                title={isExpanded ? "Minimize" : "Maximize"}
            >
                {isExpanded ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
        </div>
    );

    if (isExpanded) {
        return (
            <div className="fixed inset-0 z-[100] bg-gray-950 flex flex-col overflow-hidden">
                {/* Main Content Area */}
                <div className="flex-1 relative flex items-center justify-center p-4">
                    {/* Remote Stream (Main) */}
                    <div className="w-full h-full relative rounded-2xl overflow-hidden bg-gray-900 shadow-2xl border border-gray-800">
                        {remoteStream ? (
                            <video
                                ref={remoteVideoRef}
                                autoPlay
                                playsInline
                                className="w-full h-full object-contain"
                            />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                                <div className="w-24 h-24 rounded-full bg-gray-800 flex items-center justify-center mb-4 animate-pulse">
                                    <User size={48} className="opacity-50" />
                                </div>
                                <p className="text-xl font-medium">{isConnected ? 'Voice Call Active' : 'Connecting...'}</p>
                            </div>
                        )}

                        {/* Local Stream (PiP) */}
                        <div className="absolute top-4 right-4 w-64 aspect-video bg-gray-800 rounded-xl overflow-hidden shadow-2xl border border-gray-700 hover:scale-105 transition-transform origin-top-right z-10">
                            <video
                                ref={localVideoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-cover"
                            />
                        </div>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
                    {/* Settings Modal */}
                    {showSettings && availableDevices && (
                        <div className="mb-4 bg-gray-900/90 backdrop-blur border border-white/20 p-4 rounded-xl w-72 shadow-2xl animate-fade-in-up">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="text-white font-bold">Settings</h3>
                                <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white"><Minimize2 size={16} /></button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs text-gray-400 uppercase font-bold block mb-2">Microphone</label>
                                    <select
                                        onChange={(e) => onSwitchMicrophone?.(e.target.value)}
                                        className="w-full bg-black/50 border border-white/10 rounded p-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                    >
                                        {availableDevices.audio.map(d => (
                                            <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 5)}...`}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 uppercase font-bold block mb-2">Camera</label>
                                    <select
                                        onChange={(e) => onSwitchCamera?.(e.target.value)}
                                        className="w-full bg-black/50 border border-white/10 rounded p-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                    >
                                        {availableDevices.video.map(d => (
                                            <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 5)}...`}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 uppercase font-bold block mb-2">Background</label>
                                    <div className="flex gap-2">
                                        <button onClick={() => onToggleVirtualBackground?.('none')} className="flex-1 bg-white/10 hover:bg-white/20 p-2 rounded text-xs text-white transition">None</button>
                                        <button onClick={() => onToggleVirtualBackground?.('blur')} className="flex-1 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 p-2 rounded text-xs text-blue-300 transition">Blur</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    <Controls />
                </div>

                {/* Header Info */}
                <div className="absolute top-8 left-8 z-20 bg-black/40 backdrop-blur px-4 py-2 rounded-xl border border-white/10 text-white">
                    <h3 className="font-bold text-lg">{displayName}</h3>
                    <p className="text-sm opacity-70">{isConnected ? formatDuration(duration) : 'Connecting...'}</p>
                    {connectionStats && (
                        <div className="mt-1 pt-1 border-t border-white/10 flex items-center gap-3 text-xs font-mono opacity-80">
                            <div className="flex items-center gap-1 text-green-300">
                                <ArrowUp size={10} /> {connectionStats.upload}
                            </div>
                            <div className="flex items-center gap-1 text-blue-300">
                                <ArrowDown size={10} /> {connectionStats.download}
                            </div>
                        </div>
                    )}
                </div>

                {/* Hidden Audio for Fallback */}
                {(!remoteStream || (!isVideo && !isExpanded)) && <audio ref={remoteAudioRef} autoPlay />}
            </div>
        );
    }

    return (
        <div className="fixed bottom-4 right-4 z-50 w-96 transition-all duration-300">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden transform hover:scale-[1.02] transition-transform">
                {/* Mini View content */}
                <div className="aspect-video bg-gray-900 relative">
                    {remoteStream && (isVideo || isScreenSharing) ? (
                        <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600">
                            <User className="text-white/50 w-16 h-16" />
                        </div>
                    )}

                    <button
                        onClick={() => setIsExpanded(true)}
                        className="absolute top-2 right-2 p-2 bg-black/40 text-white rounded-lg hover:bg-black/60 transition"
                    >
                        <Maximize2 size={16} />
                    </button>
                </div>

                <div className="p-4">
                    <div className="flex justify-between items-center mb-3">
                        <div>
                            <h4 className="font-bold text-gray-900 dark:text-white truncate max-w-[180px]">{displayName}</h4>
                            <span className="text-xs text-green-500 font-medium whitespace-nowrap overflow-hidden">{isConnected ? formatDuration(duration) : 'Connecting...'}</span>
                        </div>
                        {/* Mini Controls */}
                        <div className="flex gap-2">
                            {onToggleScreenShare && (
                                <button onClick={onToggleScreenShare} className={`p-2 rounded-full ${isScreenSharing ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`} title="Screen Share">
                                    <MonitorUp size={16} />
                                </button>
                            )}
                            <button onClick={onToggleMute} className={`p-2 rounded-full ${isMuted ? 'bg-red-100 text-red-600' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`} title="Mute">
                                {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
                            </button>
                            <button onClick={onEndCall} className="p-2 rounded-full bg-red-500 text-white hover:bg-red-600" title="End Call">
                                <Phone size={16} className="rotate-135" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Hidden Elements */}
                <audio ref={remoteAudioRef} autoPlay />
                <audio ref={localAudioRef} />
            </div>
        </div>
    );
}
