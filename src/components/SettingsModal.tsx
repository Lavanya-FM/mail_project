
import { useState, useRef, useEffect } from 'react';
import { Settings, Video, Headphones, Image as ImageIcon, BarChart2, Info, X, ChevronDown } from 'lucide-react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    localStream: MediaStream | null;
    availableDevices?: { audio: MediaDeviceInfo[], video: MediaDeviceInfo[] };
    onSwitchCamera?: (deviceId: string) => void;
    onSwitchMicrophone?: (deviceId: string) => void;
    // New Feature Props
    isMirrored: boolean;
    onToggleMirror: (val: boolean) => void;
    hideSelfView: boolean;
    onToggleHideSelfView: (val: boolean) => void;
}

type Tab = 'general' | 'video' | 'audio' | 'background' | 'statistics' | 'about';

export default function SettingsModal({
    isOpen,
    onClose,
    localStream,
    availableDevices,
    onSwitchCamera,
    onSwitchMicrophone,
    isMirrored,
    onToggleMirror,
    hideSelfView,
    onToggleHideSelfView
}: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState<Tab>('video');
    const videoRef = useRef<HTMLVideoElement>(null);

    // Attach stream to preview video
    useEffect(() => {
        if (isOpen && activeTab === 'video' && videoRef.current && localStream) {
            videoRef.current.srcObject = localStream;
        }
    }, [isOpen, activeTab, localStream]);

    if (!isOpen) return null;

    const tabs = [
        { id: 'general', label: 'General', icon: Settings },
        { id: 'video', label: 'Video', icon: Video },
        { id: 'audio', label: 'Audio', icon: Headphones },
        { id: 'background', label: 'Background', icon: ImageIcon },
        { id: 'statistics', label: 'Statistics', icon: BarChart2 },
        { id: 'about', label: 'About', icon: Info },
    ];

    return (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-[#202124] w-full max-w-4xl h-[600px] rounded-xl shadow-2xl flex overflow-hidden border border-[#5f6368]">

                {/* Sidebar */}
                <div className="w-64 bg-[#202124] border-r border-[#3c4043] flex flex-col pt-6">
                    <h2 className="text-xl font-medium text-white px-6 mb-6">Settings</h2>
                    <nav className="flex-1 space-y-1 px-3">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as Tab)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id
                                    ? 'bg-[#1a73e8] text-white'
                                    : 'text-[#e8eaed] hover:bg-[#3c4043]'
                                    }`}
                            >
                                <tab.icon size={18} />
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Content Area */}
                <div className="flex-1 flex flex-col bg-[#202124]">
                    {/* Header with Close */}
                    <div className="h-14 border-b border-[#3c4043] flex items-center justify-between px-6 shrink-0">
                        <h3 className="text-lg font-medium text-white capitalize">{activeTab}</h3>
                        <button onClick={onClose} className="p-2 hover:bg-[#3c4043] rounded-full text-gray-400 hover:text-white transition">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                        {activeTab === 'video' && (
                            <div className="space-y-8 max-w-2xl">
                                {/* Video Preview */}
                                <div>
                                    <div className="aspect-video bg-black rounded-lg overflow-hidden border border-[#5f6368] relative mb-4">
                                        {localStream ? (
                                            <video
                                                ref={videoRef}
                                                autoPlay
                                                muted
                                                className={`w-full h-full object-cover transform ${isMirrored ? 'scale-x-[-1]' : ''}`}
                                            />
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-gray-500">
                                                Camera off
                                            </div>
                                        )}
                                        <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 rounded text-xs text-white">
                                            HD
                                        </div>
                                    </div>

                                    {/* Camera Select */}
                                    <div className="mb-6">
                                        <label className="text-xs text-[#9aa0a6] font-bold uppercase tracking-wider block mb-2">Camera</label>
                                        <div className="relative">
                                            <select
                                                onChange={(e) => onSwitchCamera?.(e.target.value)}
                                                className="w-full bg-[#3c4043] border border-[#5f6368] rounded-md py-2 px-3 text-sm text-white focus:ring-2 focus:ring-[#1a73e8] appearance-none"
                                            >
                                                {availableDevices?.video?.map(d => (
                                                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 5)}...`}</option>
                                                ))}
                                            </select>
                                            <div className="absolute right-3 top-2.5 pointer-events-none text-gray-400">
                                                <ChevronDown size={14} />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Checkboxes */}
                                <div className="space-y-4">
                                    <div className="flex items-start gap-3">
                                        <div className="relative flex items-center">
                                            <input
                                                type="checkbox"
                                                id="mirror-video"
                                                checked={isMirrored}
                                                onChange={(e) => onToggleMirror(e.target.checked)}
                                                className="peer h-4 w-4 rounded border-gray-600 bg-[#3c4043] text-[#1a73e8] focus:ring-[#1a73e8] focus:ring-offset-[#202124]"
                                            />
                                        </div>
                                        <div className="text-sm">
                                            <label htmlFor="mirror-video" className="font-medium text-[#e8eaed]">Mirror my video</label>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <div className="relative flex items-center">
                                            <input
                                                type="checkbox"
                                                id="hide-participants"
                                                className="peer h-4 w-4 rounded border-gray-600 bg-[#3c4043] text-[#1a73e8] focus:ring-[#1a73e8] focus:ring-offset-[#202124]"
                                            />
                                        </div>
                                        <div className="text-sm">
                                            <label htmlFor="hide-participants" className="font-medium text-[#e8eaed]">Hide Non-video Participants</label>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <div className="relative flex items-center">
                                            <input
                                                type="checkbox"
                                                id="hide-self"
                                                checked={hideSelfView}
                                                onChange={(e) => onToggleHideSelfView(e.target.checked)}
                                                className="peer h-4 w-4 rounded border-gray-600 bg-[#3c4043] text-[#1a73e8] focus:ring-[#1a73e8] focus:ring-offset-[#202124]"
                                            />
                                        </div>
                                        <div className="text-sm">
                                            <label htmlFor="hide-self" className="font-medium text-[#e8eaed]">Hide Self View</label>
                                        </div>
                                    </div>
                                </div>

                                {/* Hardware Acceleration */}
                                <div className="pt-6 border-t border-[#3c4043]">
                                    <h4 className="text-sm font-medium text-[#e8eaed] mb-4">Use hardware acceleration for:</h4>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3">
                                            <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-gray-600 bg-[#3c4043] text-[#1a73e8]" />
                                            <span className="text-sm text-[#e8eaed]">Receiving video</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-gray-600 bg-[#3c4043] text-[#1a73e8]" />
                                            <span className="text-sm text-[#e8eaed]">Sending video</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'audio' && (
                            <div className="space-y-6 max-w-2xl">
                                <div>
                                    <label className="text-xs text-[#9aa0a6] font-bold uppercase tracking-wider block mb-2">Microphone</label>
                                    <div className="relative">
                                        <select
                                            onChange={(e) => onSwitchMicrophone?.(e.target.value)}
                                            className="w-full bg-[#3c4043] border border-[#5f6368] rounded-md py-2 px-3 text-sm text-white focus:ring-2 focus:ring-[#1a73e8] appearance-none"
                                        >
                                            {availableDevices?.audio?.map(d => (
                                                <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 5)}...`}</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-3 top-2.5 pointer-events-none text-gray-400">
                                            <ChevronDown size={14} />
                                        </div>
                                    </div>
                                    <div className="mt-4">
                                        <button className="px-4 py-2 border border-[#5f6368] rounded text-sm text-[#e8eaed] hover:bg-[#3c4043] transition">
                                            Test Speaker & Microphone
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Placeholders for other tabs */}
                        {['general', 'background', 'statistics', 'about'].includes(activeTab) && (
                            <div className="flex flex-col items-center justify-center h-full text-[#9aa0a6]">
                                <div className="p-4 bg-[#3c4043] rounded-full mb-4 opacity-50">
                                    {(() => {
                                        const TabIcon = tabs.find(t => t.id === activeTab)?.icon;
                                        return TabIcon ? <TabIcon size={48} /> : null;
                                    })()}
                                </div>
                                <p>Settings for {activeTab} coming soon.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
