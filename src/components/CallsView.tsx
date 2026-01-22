import { useState, useEffect } from 'react';
import { Video, Phone, User, Users, Clock, Search, MessageSquare, X, Link, Copy, ArrowUpRight, ArrowDownLeft, XCircle } from 'lucide-react';
import { authService } from '../lib/authService';
import { callService } from '../lib/callService';
import { p2pService } from '../lib/p2pService';
import toast from 'react-hot-toast';
import ChatInterface from './ChatInterface';

export default function CallsView() {
    const [onlinePeers, setOnlinePeers] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [recentCalls, setRecentCalls] = useState<any[]>([]);
    const [activeChatPeer, setActiveChatPeer] = useState<string | null>(null);
    const [showNewMeeting, setShowNewMeeting] = useState(false);
    const [showJoin, setShowJoin] = useState(false);
    const [joinCode, setJoinCode] = useState('');
    const user = authService.getCurrentUser();

    useEffect(() => {
        // Initial fetch
        setOnlinePeers(p2pService.getOnlinePeers());

        const handlePeersUpdate = (e: any) => {
            if (e.detail && Array.isArray(e.detail.peers)) {
                setOnlinePeers(e.detail.peers);
            }
        };

        window.addEventListener('p2p-peers-updated', handlePeersUpdate);

        const history = localStorage.getItem('call_history');
        if (history) {
            setRecentCalls(JSON.parse(history));
        }

        return () => {
            window.removeEventListener('p2p-peers-updated', handlePeersUpdate);
        };
    }, []);

    const handleCall = async (email: string, type: 'audio' | 'video') => {
        try {
            await callService.initiateCall(email, type);
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    const filteredPeers = onlinePeers
        .filter(peer => peer !== user?.email)
        .filter(peer => peer.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="flex bg-gray-50 dark:bg-slate-950 h-full">
            {/* Sidebar List */}
            <div className="w-80 border-r border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
                <div className="p-4 border-b border-gray-100 dark:border-slate-800">
                    <h2 className="text-xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent mb-4 flex items-center gap-2">
                        <Video className="text-green-600" />
                        JeeMeet
                    </h2>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Find people..."
                            className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-slate-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-green-500/20 outline-none transition"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <div className="p-3">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Online Now</div>
                        {filteredPeers.length > 0 ? (
                            <div className="space-y-1">
                                {filteredPeers.map(peer => (
                                    <div key={peer} className="group flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition cursor-pointer border border-transparent hover:border-gray-200 dark:hover:border-slate-700">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-semibold">
                                                {peer[0].toUpperCase()}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-gray-900 dark:text-white">{peer}</span>
                                                <span className="text-xs text-green-500 flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                                    Online
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleCall(peer, 'audio')}
                                                className="p-2 hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg transition"
                                                title="Voice Call"
                                            >
                                                <Phone className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleCall(peer, 'video')}
                                                className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg transition"
                                                title="Video Call"
                                            >
                                                <Video className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setActiveChatPeer(peer)}
                                                className="p-2 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg transition"
                                                title="Chat"
                                            >
                                                <MessageSquare className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-500">
                                <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">No one is online right now</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Stage (Empty State or Recent) */}
            <div className="flex-1 p-8 overflow-y-auto">
                {activeChatPeer ? (
                    <div className="h-full">
                        <ChatInterface
                            peer={activeChatPeer}
                            onClose={() => setActiveChatPeer(null)}
                        />
                    </div>
                ) : (
                    <div className="max-w-4xl mx-auto">
                        <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl p-8 text-white mb-10 shadow-xl overflow-hidden relative">
                            <div className="relative z-10">
                                <h1 className="text-3xl font-bold mb-4">Start a conversation</h1>
                                <p className="opacity-90 max-w-lg text-lg mb-8">
                                    Connect with your team instantly. High-quality audio and video calls, secured directly within your mail.
                                </p>
                                <div className="flex flex-wrap gap-4">
                                    <button
                                        onClick={() => setShowNewMeeting(true)}
                                        className="bg-white text-green-600 px-6 py-3 rounded-xl font-bold hover:bg-green-50 transition shadow-lg flex items-center gap-2"
                                    >
                                        <Video className="w-5 h-5" />
                                        New Meeting
                                    </button>
                                    <div className="flex items-center gap-4 bg-white/20 p-1.5 pl-4 rounded-xl backdrop-blur-sm border border-white/30">
                                        <span className="text-sm font-medium">Enter a code or link</span>
                                        <button
                                            onClick={() => setShowJoin(true)}
                                            className="bg-white/20 hover:bg-white/30 px-4 py-1.5 rounded-lg text-sm font-semibold transition"
                                        >
                                            Join
                                        </button>
                                    </div>
                                </div>
                            </div>
                            {/* Decorative circles */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                            <div className="absolute bottom-0 left-0 w-40 h-40 bg-black/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2"></div>
                        </div>

                        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                            <Clock className="w-5 h-5 text-gray-500" />
                            Recent Calls
                        </h3>

                        {recentCalls.length > 0 ? (
                            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 divide-y divide-gray-100 dark:divide-slate-800">
                                {recentCalls.map((call, i) => {
                                    const isOutgoing = call.caller === user?.email;
                                    const isMissed = call.status === 'missed';
                                    const isRejected = call.status === 'rejected';

                                    let StatusIcon = isOutgoing ? ArrowUpRight : ArrowDownLeft;
                                    let statusColor = isOutgoing ? 'text-green-500' : 'text-blue-500';

                                    if (isMissed || isRejected) {
                                        StatusIcon = XCircle;
                                        statusColor = 'text-red-500';
                                    }

                                    return (
                                        <div key={i} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-800/50 transition">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center relative">
                                                    {call.type === 'video' ? <Video className="w-5 h-5 text-gray-600 dark:text-gray-400" /> : <Phone className="w-5 h-5 text-gray-600 dark:text-gray-400" />}
                                                    <div className={`absolute -bottom-1 -right-1 bg-white dark:bg-slate-900 rounded-full p-0.5`}>
                                                        <StatusIcon className={`w-3.5 h-3.5 ${statusColor}`} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <h4 className="font-semibold text-gray-900 dark:text-white">
                                                        {(isOutgoing ? call.callee : call.caller) || call.peer || 'Unknown Peer'}
                                                    </h4>
                                                    <p className="text-xs text-gray-500 flex items-center gap-1">
                                                        {new Date(call.timestamp).toLocaleString()}
                                                        {isMissed && <span className="text-red-500 font-medium">(Missed)</span>}
                                                        {isRejected && <span className="text-red-500 font-medium">(Rejected)</span>}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="text-sm text-gray-500">{call.duration}s</span>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-gray-300 dark:border-slate-700">
                                <Clock className="w-8 h-8 mx-auto mb-3 text-gray-300 dark:text-slate-600" />
                                <p className="text-gray-500">No recent calls</p>
                            </div>
                        )}
                    </div>
                )}
            </div>


            {/* New Meeting Modal */}
            {
                showNewMeeting && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-2xl border border-gray-200 dark:border-slate-800">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Your Meeting Ready</h3>
                                <button onClick={() => setShowNewMeeting(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <p className="text-gray-600 dark:text-gray-400 mb-4">Share this code with others you want to meet with.</p>
                            <div className="bg-gray-100 dark:bg-slate-800 p-4 rounded-xl flex items-center justify-between mb-6">
                                <code className="text-indigo-600 dark:text-indigo-400 font-mono font-bold">{user?.email}</code>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(user?.email || '');
                                        toast.success('Code copied!');
                                    }}
                                    className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition"
                                >
                                    <Copy className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>
                            <p className="text-xs text-center text-gray-500">People can enter this code in the "Join" box to call you.</p>
                        </div>
                    </div>
                )
            }

            {/* Join Meeting Modal */}
            {
                showJoin && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-2xl border border-gray-200 dark:border-slate-800">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Join Meeting</h3>
                                <button onClick={() => setShowJoin(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <input
                                type="text"
                                placeholder="Enter meeting code or email"
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value)}
                                className="w-full bg-gray-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-base focus:ring-2 focus:ring-green-500/20 outline-none transition mb-6"
                            />
                            <button
                                onClick={() => {
                                    if (!joinCode.trim()) return;
                                    setShowJoin(false);
                                    handleCall(joinCode.trim(), 'video');
                                }}
                                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-green-600/20"
                            >
                                Join Now
                            </button>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
