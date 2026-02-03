import { useState, useEffect, useRef } from 'react';
import {
    Plus, Video, Users, Settings, Clock, Info, X,
    Phone, Search, Trash2, Shield,
    Bell, Monitor, Mic, Camera, Link, Calendar,
    CheckCircle, AlertCircle, MessageSquare, Send, Paperclip, Download, FileText,
} from 'lucide-react';
import { p2pService } from '../lib/p2pService';
import { callService } from '../lib/callService';
import MeetingPage from './MeetingPage';
import { authService } from '../lib/authService';
import { useTheme } from '../contexts/ThemeContext';
import toast from 'react-hot-toast';

interface MeetingHistory {
    id: string;
    name: string;
    date: string;
    duration?: string;
    participants: string[];
    wasHost: boolean;
}

interface Contact {
    id: number;
    name: string;
    email: string;
    status: 'online' | 'offline';
}

interface ChatMessage {
    sender: string;
    content: string;
    timestamp: number;
    isMe: boolean;
    type: 'text' | 'file';
    fileId?: string;
    fileName?: string;
    fileSize?: number;
    fileReady?: boolean;
}

interface Notification {
    id: string;
    type: 'message' | 'call' | 'file' | 'system';
    title: string;
    content: string;
    timestamp: number;
    read: boolean;
    senderEmail?: string;
}

export default function CallsView() {
    // 1. All hooks at the VERY top
    const [activeTab, setActiveTab] = useState<'meetings' | 'history' | 'contacts' | 'settings' | 'notifications'>('meetings');
    const [history, setHistory] = useState<MeetingHistory[]>([]);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [showNewMeetingMenu, setShowNewMeetingMenu] = useState(false);
    const [showMeetingLinkModal, setShowMeetingLinkModal] = useState(false);
    const [generatedMeetingLink, setGeneratedMeetingLink] = useState('');
    const [meetingCode, setMeetingCode] = useState('');
    const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
    const [onlinePeers, setOnlinePeers] = useState<string[]>([]);
    const [loadingContacts, setLoadingContacts] = useState(false);
    const [callMode, setCallMode] = useState<'video' | 'voice'>('video');

    // Chat State
    const [selectedChatContact, setSelectedChatContact] = useState<Contact | null>(null);
    const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>({});

    // Settings States
    const [localName, setLocalName] = useState('');
    const { theme, toggleTheme } = useTheme();

    const user = authService.getCurrentUser();
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Initial Path check hook
    useEffect(() => {
        const path = window.location.pathname;
        if (path.startsWith('/meet/') && path.length > 6) {
            const mid = path.split('/meet/')[1];
            if (mid) setActiveMeetingId(mid);
        }

        // Load data from localStorage
        const storedHistory = localStorage.getItem('meeting_history');
        if (storedHistory) {
            try { setHistory(JSON.parse(storedHistory)); } catch (e) { }
        }
        const storedNotifs = localStorage.getItem('p2p_notifications');
        if (storedNotifs) {
            try { setNotifications(JSON.parse(storedNotifs)); } catch (e) { }
        }

        if (user) setLocalName(user.full_name || user.name || '');
    }, [user]);

    // Save Notifications Effect
    useEffect(() => {
        localStorage.setItem('p2p_notifications', JSON.stringify(notifications));
    }, [notifications]);



    // Peer updates hook
    useEffect(() => {
        setOnlinePeers(p2pService.getOnlinePeers());
        const handlePeersUpdate = (e: any) => {
            setOnlinePeers(e.detail.peers);
        };
        window.addEventListener('p2p-peers-updated', handlePeersUpdate);
        return () => window.removeEventListener('p2p-peers-updated', handlePeersUpdate);
    }, []);

    const addNotification = (type: Notification['type'], title: string, content: string, senderEmail?: string) => {
        const newNotif: Notification = {
            id: Math.random().toString(36).substring(7),
            type,
            title,
            content,
            timestamp: Date.now(),
            read: false,
            senderEmail
        };
        setNotifications(prev => [newNotif, ...prev.slice(0, 49)]);
    };

    // Incoming Chat Listener
    useEffect(() => {
        const handleIncomingChat = (e: any) => {
            const msg = e.detail;
            if (msg.type === 'secure-message') {
                const email = msg.from;
                const chatMsg: ChatMessage = {
                    sender: email,
                    content: msg.payload.content,
                    timestamp: msg.payload.timestamp,
                    isMe: false,
                    type: msg.payload.type || 'text',
                    fileId: msg.payload.fileId,
                    fileName: msg.payload.fileName,
                    fileSize: msg.payload.fileSize
                };
                setChatMessages(prev => ({
                    ...prev,
                    [email]: [...(prev[email] || []), chatMsg]
                }));

                if (selectedChatContact?.email !== email) {
                    toast.success(`New message from ${email}`, { position: 'bottom-right' });
                    addNotification('message', 'New Message', msg.payload.content, email);
                }
            }
        };
        window.addEventListener('p2p-message', handleIncomingChat);
        return () => window.removeEventListener('p2p-message', handleIncomingChat);
    }, [selectedChatContact]);

    // Incoming File Listener
    useEffect(() => {
        const handleIncomingFile = (e: any) => {
            const { messageId, from, fileName, size } = e.detail;
            const email = from;

            setChatMessages(prev => {
                const existing = (prev[email] || []).find(m => m.fileId === messageId);
                if (existing) return prev;

                const chatMsg: ChatMessage = {
                    sender: email,
                    content: `Sent a file: ${fileName}`,
                    timestamp: Date.now(),
                    isMe: false,
                    type: 'file',
                    fileId: messageId,
                    fileName: fileName,
                    fileSize: size,
                    fileReady: false
                };

                toast(`Incoming file from ${email}: ${fileName}`, { icon: '📂', position: 'bottom-right' });
                addNotification('file', 'Incoming File', `${fileName} (${(size / 1024).toFixed(1)} KB)`, email);

                return {
                    ...prev,
                    [email]: [...(prev[email] || []), chatMsg]
                };
            });
        };

        const handleFileReady = (e: any) => {
            const { messageId } = e.detail;
            setChatMessages(prev => {
                const newMessages = { ...prev };
                Object.keys(newMessages).forEach(email => {
                    newMessages[email] = newMessages[email].map(m =>
                        m.fileId === messageId ? { ...m, fileReady: true } : m
                    );
                });
                return newMessages;
            });
            toast.success("File download complete", { position: 'bottom-right' });
            addNotification('system', 'Download Complete', 'File is ready to view', undefined);
        };

        window.addEventListener('p2p-incoming-file', handleIncomingFile);
        window.addEventListener('p2p-file-ready', handleFileReady);
        return () => {
            window.removeEventListener('p2p-incoming-file', handleIncomingFile);
            window.removeEventListener('p2p-file-ready', handleFileReady);
        };
    }, []);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages, selectedChatContact]);

    // Fetch contacts when tab changes
    useEffect(() => {
        if (activeTab === 'contacts') {
            fetchContacts();
        }
    }, [activeTab]);

    const fetchContacts = async () => {
        setLoadingContacts(true);
        try {
            const res = await authService.fetchWithAuth('/api/users/search');
            if (res.ok) {
                const data = await res.json();
                setContacts(data.map((u: any) => ({
                    id: u.id,
                    name: u.name || u.full_name,
                    email: u.email,
                    status: onlinePeers.includes(u.email) ? 'online' : 'offline'
                })));
            }
        } catch (err) {
            console.error("Failed to fetch contacts", err);
        } finally {
            setLoadingContacts(false);
        }
    };

    const markAllAsRead = () => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    };

    const clearNotifications = () => {
        setNotifications([]);
        localStorage.removeItem('p2p_notifications');
    };

    const addToHistory = (id: string, name: string, wasHost: boolean) => {
        const newEntry: MeetingHistory = {
            id,
            name,
            date: new Date().toISOString(),
            participants: [],
            wasHost
        };
        const updated = [newEntry, ...history.slice(0, 19)];
        setHistory(updated);
        localStorage.setItem('meeting_history', JSON.stringify(updated));
    };

    // 2. Event Handlers


    const requestPermissions = async (video: boolean = true) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
            stream.getTracks().forEach(t => t.stop());
            return true;
        } catch (e) {
            toast.error(`${video ? 'Microphone and Camera' : 'Microphone'} access denied. Please enable them in your browser settings.`);
            return false;
        }
    };

    const startCall = async (mode: 'video' | 'voice', calleeEmail: string) => {
        const granted = await requestPermissions(mode === 'video');
        if (!granted) return;

        try {
            toast(`Calling ${calleeEmail.split('@')[0]}...`, { icon: '📞' });
            await callService.initiateCall(calleeEmail, mode === 'voice' ? 'audio' : 'video');
            // CallManager will handle the ActiveCall UI automatically
        } catch (error: any) {
            toast.error("Failed to start call: " + error.message);
        }
    };

    const startInstantMeeting = async () => {
        const granted = await requestPermissions(true);
        if (!granted) return;

        const id = Math.random().toString(36).substring(2, 7) + '-' + Math.random().toString(36).substring(2, 7);
        setActiveMeetingId(id);
        setCallMode('video');
        window.history.pushState({}, '', `/meet/${id}`);
        addToHistory(id, "Meeting (Initiator)", true);
        setShowNewMeetingMenu(false);
    };

    const createMeetingForLater = () => {
        const id = Math.random().toString(36).substring(2, 7) + '-' + Math.random().toString(36).substring(2, 7);
        const link = `https://jeemail.in/meet/${id}`;
        setGeneratedMeetingLink(link);
        setShowMeetingLinkModal(true);
        setShowNewMeetingMenu(false);
        addToHistory(id, "Created for Later", true);
    };

    const scheduleInCalendar = () => {
        toast("Calendar scheduling coming soon!", { icon: '🗓️' });
        setShowNewMeetingMenu(false);
    };

    const joinMeeting = (code?: string) => {
        const targetCode = code || meetingCode;
        if (!targetCode) {
            toast.error("Please enter a code");
            return;
        }
        const cleanCode = targetCode.toLowerCase().replace(/[^a-z0-9-]/g, '');
        setCallMode('video');
        setActiveMeetingId(cleanCode);
        window.history.pushState({}, '', `/meet/${cleanCode}`);
        setShowJoinModal(false);
        addToHistory(cleanCode, "Joined Meeting", false);
    };

    const handleLeaveMeeting = () => {
        setActiveMeetingId(null);
        window.history.pushState({}, '', '/meet');
    };

    const sendDirectMessage = (content: string) => {
        if (!selectedChatContact || !content.trim()) return;

        p2pService.sendChat(selectedChatContact.email, content);

        const chatMsg: ChatMessage = {
            sender: 'Me',
            content,
            timestamp: Date.now(),
            isMe: true,
            type: 'text'
        };

        setChatMessages(prev => ({
            ...prev,
            [selectedChatContact.email]: [...(prev[selectedChatContact.email] || []), chatMsg]
        }));
    };

    const handleSendFile = (file: File) => {
        if (!selectedChatContact) return;

        const messageId = Math.random().toString(36).substring(7);
        p2pService.startTransfer(selectedChatContact.email, [file], [messageId]);

        p2pService.sendChat(selectedChatContact.email, `Sent a file: ${file.name}`, {
            type: 'file',
            fileId: messageId,
            fileName: file.name,
            fileSize: file.size
        });

        const chatMsg: ChatMessage = {
            sender: 'Me',
            content: `Sent a file: ${file.name}`,
            timestamp: Date.now(),
            isMe: true,
            type: 'file',
            fileId: messageId,
            fileName: file.name,
            fileSize: file.size,
            fileReady: true
        };

        setChatMessages(prev => ({
            ...prev,
            [selectedChatContact.email]: [...(prev[selectedChatContact.email] || []), chatMsg]
        }));

        toast.success(`Sending ${file.name}...`);
    };

    // 3. Sub-views rendering
    const renderMeetings = () => (
        <div className="flex flex-col md:flex-row items-center gap-12 mb-12 animate-fade-in py-8 h-full">
            <div className="flex-1 max-w-lg space-y-6">
                <h1 className="text-4xl md:text-5xl font-light text-gray-900 dark:text-white leading-tight">
                    Premium video meetings. <br />
                    <span className="font-bold text-blue-600">Now free for everyone.</span>
                </h1>
                <p className="text-xl text-gray-500 dark:text-slate-400">
                    We re-engineered the service we built for secure business meetings, JeeMeet, to make it free and available for all.
                </p>
                <div className="flex flex-wrap gap-4 pt-4">
                    <button onClick={startInstantMeeting} className="px-6 py-3 bg-blue-600 text-white rounded-lg font-bold shadow-lg hover:shadow-xl transition flex items-center gap-2">
                        <Plus size={20} /> Start a meeting
                    </button>
                    <div className="flex bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 transition-shadow">
                        <div className="flex items-center px-4 text-gray-500">
                            <Video size={20} />
                        </div>
                        <input
                            type="text"
                            placeholder="Enter a code or link"
                            className="px-2 py-3 bg-transparent border-none focus:ring-0 text-gray-900 dark:text-white w-48"
                            value={meetingCode}
                            onChange={e => setMeetingCode(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && joinMeeting()}
                        />
                        <button onClick={() => joinMeeting()} className="px-5 py-3 text-blue-600 dark:text-blue-400 font-bold hover:bg-gray-50 dark:hover:bg-slate-800 border-l border-gray-200 dark:border-slate-700 transition">
                            Join
                        </button>
                    </div>
                </div>
                <div className="pt-6 border-t border-gray-100 dark:border-slate-800">
                    <button className="text-blue-600 dark:text-blue-400 font-bold flex items-center gap-2 hover:underline">
                        <Info size={18} /> Learn more about JeeMeet
                    </button>
                </div>
            </div>
            <div className="flex-1 flex justify-center">
                <div className="relative w-64 h-64 md:w-80 md:h-80 lg:w-96 lg:h-96">
                    <div className="absolute inset-0 bg-blue-100 dark:bg-blue-900/20 rounded-full animate-blob"></div>
                    <div className="absolute inset-4 bg-cyan-100 dark:bg-cyan-900/20 rounded-full animate-blob animation-delay-2000"></div>
                    <div className="absolute inset-8 bg-purple-100 dark:bg-purple-900/20 rounded-full animate-blob animation-delay-4000"></div>
                    <div className="relative h-full flex items-center justify-center bg-white/20 dark:bg-slate-800/20 backdrop-blur-xl rounded-full border border-white/30 dark:border-slate-600/30 shadow-2xl overflow-hidden">
                        <img
                            src="https://www.gstatic.com/meet/user_edu_get_a_link_light_90939507f35368a623789b5ca19e44bc.svg"
                            alt="Meet Hero"
                            className="w-3/4 opacity-90 drop-shadow-2xl"
                        />
                    </div>
                    <div className="absolute -bottom-4 right-0 p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-700 flex items-center gap-3 animate-slide-in-up">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{onlinePeers.length} active users online</span>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderHistory = () => (
        <div className="animate-fade-in pr-2">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Call History</h2>
                <button
                    onClick={() => { setHistory([]); localStorage.removeItem('meeting_history'); }}
                    className="text-red-500 hover:text-red-600 text-sm font-medium flex items-center gap-2"
                >
                    <Trash2 size={16} /> Clear all
                </button>
            </div>
            {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 grayscale opacity-50">
                    <Clock size={64} className="mb-4 text-gray-400" />
                    <p className="text-gray-500">No meeting history yet.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-10">
                    {history.map((item, idx) => (
                        <div key={idx} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-200 dark:border-slate-800 hover:shadow-lg transition group">
                            <div className="flex justify-between items-start mb-4">
                                <div className={`p-3 rounded-2xl ${item.wasHost ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : 'bg-purple-50 dark:bg-purple-900/30 text-purple-600'}`}>
                                    <Video size={24} />
                                </div>
                                <span className="text-xs text-gray-400 font-medium">{new Date(item.date).toLocaleDateString()}</span>
                            </div>
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-1">{item.name}</h3>
                            <p className="text-xs font-mono text-gray-500 dark:text-slate-400 mb-4">{item.id}</p>
                            <div className="flex items-center justify-between">
                                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${item.wasHost ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
                                    {item.wasHost ? 'Hosted' : 'Joined'}
                                </span>
                                <button onClick={() => joinMeeting(item.id)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition">Rejoin</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const renderContacts = () => (
        <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Contacts</h2>
                    <p className="text-sm text-gray-500">{contacts.length} people in your network</p>
                </div>
                <div className="flex bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl px-4 py-2 items-center gap-2 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                    <Search size={18} className="text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search contacts..."
                        className="bg-transparent border-none focus:ring-0 text-sm w-48"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <div>
                {loadingContacts ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-10">
                        {(Array.isArray(contacts) ? contacts : Object.values(contacts || {}) as Contact[])
                            .filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.email.toLowerCase().includes(searchQuery.toLowerCase()))
                            .map((contact) => (
                                <div key={contact.id} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-200 dark:border-slate-800 hover:border-blue-500 transition-all group relative overflow-hidden">
                                    <div className="flex items-center gap-4">
                                        <div className="relative">
                                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-inner">
                                                {contact.name[0].toUpperCase()}
                                            </div>
                                            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 ${onlinePeers.includes(contact.email) ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h4 className="font-bold text-gray-900 dark:text-white truncate">{contact.name}</h4>
                                            <p className="text-xs text-gray-500 truncate">{contact.email}</p>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex gap-2">
                                        <button onClick={() => startCall('video', contact.email)} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-[10px] font-bold hover:bg-blue-700 transition flex items-center justify-center gap-1"><Video size={12} /> Video</button>
                                        <button onClick={() => startCall('voice', contact.email)} className="flex-1 py-2 bg-green-600 text-white rounded-lg text-[10px] font-bold hover:bg-green-700 transition flex items-center justify-center gap-1"><Phone size={12} /> Voice</button>
                                        <button onClick={() => setSelectedChatContact(contact)} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 transition flex items-center justify-center gap-1"><MessageSquare size={12} /> Chat</button>
                                    </div>
                                    {onlinePeers.includes(contact.email) && <div className="absolute top-0 right-0 py-1 px-3 bg-green-500 text-white text-[8px] font-bold uppercase rounded-bl-lg">Online</div>}
                                </div>
                            ))
                        }
                    </div>
                )}
            </div>
        </div>
    );

    const renderNotifications = () => (
        <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Notifications</h2>
                    <p className="text-sm text-gray-500">{(Array.isArray(notifications) ? notifications : Object.values(notifications || {}) as Notification[]).filter((n) => !n.read).length} unread alerts</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={markAllAsRead} className="px-4 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl text-xs font-bold hover:bg-gray-50 transition">Mark all read</button>
                    <button onClick={clearNotifications} className="px-4 py-2 bg-red-50 dark:bg-red-900/10 text-red-500 border border-red-100 dark:border-red-900/30 rounded-xl text-xs font-bold hover:bg-red-100 transition">Clear all</button>
                </div>
            </div>

            <div className="space-y-3 pb-10">
                {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 grayscale opacity-50">
                        <Bell size={64} className="mb-4 text-gray-400" />
                        <p className="text-gray-500">No notifications to show.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {notifications.map(notif => (
                            <div key={notif.id} className={`p-4 rounded-2xl border transition-all flex gap-4 ${notif.read ? 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 opacity-70' : 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30 shadow-sm'}`}>
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${notif.type === 'message' ? 'bg-blue-100 text-blue-600' :
                                    notif.type === 'file' ? 'bg-indigo-100 text-indigo-600' :
                                        notif.type === 'call' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'
                                    }`}>
                                    {notif.type === 'message' && <MessageSquare size={20} />}
                                    {notif.type === 'file' && <Paperclip size={20} />}
                                    {notif.type === 'call' && <Phone size={20} />}
                                    {notif.type === 'system' && <Bell size={20} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start mb-1">
                                        <h4 className="font-bold text-gray-900 dark:text-white text-sm">{notif.title}</h4>
                                        <span className="text-[10px] text-gray-400">{new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-2">{notif.content}</p>
                                    {notif.senderEmail && (
                                        <div className="mt-2 flex gap-2">
                                            <button
                                                onClick={() => {
                                                    const contact = contacts.find(c => c.email === notif.senderEmail);
                                                    if (contact) setSelectedChatContact(contact);
                                                    setActiveTab('contacts');
                                                }}
                                                className="text-[10px] font-bold text-blue-600 hover:underline"
                                            >
                                                Reply to {notif.senderEmail.split('@')[0]}
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {!notif.read && <div className="w-2 h-2 rounded-full bg-blue-600 self-center"></div>}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );

    const renderSettings = () => (
        <div className="max-w-4xl mx-auto w-full animate-fade-in space-y-8 pb-10">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
                    <div className="flex items-center gap-3 text-blue-600 mb-2"><Shield size={20} /><h3 className="font-bold uppercase text-xs tracking-widest">Personal Info</h3></div>
                    <div className="space-y-4">
                        <div><label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase mb-2">Display Name</label><input type="text" value={localName} onChange={e => setLocalName(e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500" /></div>
                        <div><label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase mb-2">Account Email</label><div className="px-4 py-2.5 bg-gray-100 dark:bg-slate-900/50 text-gray-400 rounded-xl text-sm italic cursor-not-allowed">{user?.email}</div></div>
                        <button className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 transition">Save Changes</button>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
                    <div className="flex items-center gap-3 text-purple-600 mb-2"><Monitor size={20} /><h3 className="font-bold uppercase text-xs tracking-widest">Appearance</h3></div>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-2xl"><span className="text-sm font-medium">Dark Mode</span><button onClick={toggleTheme} className={`w-12 h-6 rounded-full transition-colors relative ${theme === 'dark' ? 'bg-blue-600' : 'bg-gray-300'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${theme === 'dark' ? 'translate-x-7' : 'translate-x-1'}`}></div></button></div>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-4 md:col-span-2">
                    <div className="flex items-center gap-3 text-green-600 mb-2"><Camera size={20} /><h3 className="font-bold uppercase text-xs tracking-widest">Media Devices</h3></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700/50"><div className="flex items-center justify-between mb-4"><div className="flex items-center gap-3 font-bold text-sm"><Mic size={18} /> Microphone</div><CheckCircle size={18} className="text-green-500" /></div><select className="w-full bg-white dark:bg-slate-900 border-none rounded-lg text-xs py-2 pr-8 focus:ring-2 focus:ring-blue-500"><option>Default - Integrated Mic</option></select></div>
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700/50"><div className="flex items-center justify-between mb-4"><div className="flex items-center gap-3 font-bold text-sm"><Camera size={18} /> Camera</div><AlertCircle size={18} className="text-yellow-500" /></div><select className="w-full bg-white dark:bg-slate-900 border-none rounded-lg text-xs py-2 pr-8 focus:ring-2 focus:ring-blue-500"><option>Default - FaceTime HD Camera</option></select></div>
                    </div>
                </div>
            </div>
        </div>
    );

    // 4. Final Return
    return (
        <div className="h-full w-full bg-[#f8f9fa] dark:bg-slate-950 flex flex-col overflow-hidden font-sans">
            {activeMeetingId ? (
                <MeetingPage meetingId={activeMeetingId} onLeave={handleLeaveMeeting} initialVideoOff={callMode === 'voice'} />
            ) : (
                <div className="flex-1 flex flex-col md:flex-row min-h-0 relative">
                    {/* Sidebar */}
                    <div className="w-full md:w-64 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 flex flex-col p-4 space-y-2 shrink-0 overflow-y-auto">
                        <div className="space-y-3 mb-6 relative">
                            <h3 className="px-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Group Meetings</h3>
                            <div className="relative">
                                <button
                                    onClick={() => setShowNewMeetingMenu(!showNewMeetingMenu)}
                                    className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl flex items-center justify-center gap-3 font-semibold transition shadow-md"
                                >
                                    <Plus size={20} /> New meeting
                                </button>

                                {showNewMeetingMenu && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setShowNewMeetingMenu(false)}></div>
                                        <div className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-700 py-2 z-50 animate-slide-in-up">
                                            <button onClick={createMeetingForLater} className="w-full px-4 py-3 flex items-center gap-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition text-left">
                                                <Link size={16} className="text-blue-600" />
                                                <span className="font-semibold">Create a meeting for later</span>
                                            </button>
                                            <button onClick={startInstantMeeting} className="w-full px-4 py-3 flex items-center gap-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition text-left">
                                                <Video size={16} className="text-blue-600" />
                                                <span className="font-semibold">Start an instant meeting</span>
                                            </button>
                                            <button onClick={scheduleInCalendar} className="w-full px-4 py-3 flex items-center gap-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition text-left">
                                                <Calendar size={16} className="text-blue-600" />
                                                <span className="font-semibold">Schedule in calendar</span>
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                            <button onClick={() => setShowJoinModal(true)} className="w-full py-3 px-4 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center gap-3 font-semibold transition hover:bg-gray-50 dark:hover:bg-slate-700"><Video size={18} /> Join code</button>
                        </div>

                        <div className="px-2 pb-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-white dark:bg-slate-900 z-10">Direct Navigation</div>
                        <nav className="space-y-1">
                            <NavItem icon={Users} label="Contacts & Direct Call" active={activeTab === 'contacts'} onClick={() => setActiveTab('contacts')} />
                            <NavItem icon={Clock} label="Call History" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
                            <NavItem icon={Bell} label="Notifications" active={activeTab === 'notifications'} badge={(Array.isArray(notifications) ? notifications : Object.values(notifications || {}) as Notification[]).filter((n) => !n.read).length} onClick={() => setActiveTab('notifications')} />
                            <NavItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
                        </nav>
                        <div className="mt-auto p-4 bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/30">
                            <div className="flex items-center gap-2 mb-3"><div className="w-2 h-2 rounded-full bg-green-500"></div><span className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-tighter">Fast Quick Call</span></div>
                            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                {onlinePeers.length === 0 ? <p className="text-[10px] text-gray-500 italic">No one online</p> : (Array.isArray(onlinePeers) ? onlinePeers : Array.from(onlinePeers || []) as string[]).filter((p) => p !== user?.email).map((peer) => (
                                    <div key={peer} className="flex items-center gap-2 group">
                                        <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] text-white uppercase font-bold">{peer[0]}</div>
                                        <span className="text-[10px] text-gray-700 dark:text-gray-300 truncate flex-1">{peer.split('@')[0]}</span>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => startCall('video', peer)} className="p-1 bg-white dark:bg-slate-800 rounded-full shadow-sm text-blue-600 hover:text-blue-800" title="Video Call"><Video size={10} /></button>
                                            <button onClick={() => startCall('voice', peer)} className="p-1 bg-white dark:bg-slate-800 rounded-full shadow-sm text-green-600 hover:text-green-800" title="Voice Call"><Phone size={10} /></button>
                                            <button onClick={() => {
                                                const contact = contacts.find(c => c.email === peer) || { id: peer, name: peer.split('@')[0], email: peer, status: 'online' };
                                                setSelectedChatContact(contact as any);
                                            }} className="p-1 bg-white dark:bg-slate-800 rounded-full shadow-sm text-indigo-600 hover:text-indigo-800" title="Chat"><MessageSquare size={10} /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Main Content Area */}
                    <div className="flex-1 p-6 overflow-y-auto scroll-smooth">
                        {activeTab === 'meetings' && renderMeetings()}
                        {activeTab === 'history' && renderHistory()}
                        {activeTab === 'contacts' && renderContacts()}
                        {activeTab === 'notifications' && renderNotifications()}
                        {activeTab === 'settings' && renderSettings()}
                    </div>

                    {/* Chat Window Overlay */}
                    {selectedChatContact && (
                        <div className="absolute bottom-2 right-6 w-96 h-[500px] max-h-[calc(100vh-120px)] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-slate-800 flex flex-col animate-slide-in-up z-50 overflow-hidden">
                            <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-bold">{selectedChatContact.name[0].toUpperCase()}</div>
                                    <div><h4 className="text-sm font-bold text-gray-900 dark:text-white truncate max-w-[120px]">{selectedChatContact.name}</h4><div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-green-500"></div><p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">Online</p></div></div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => startCall('voice', selectedChatContact.email)} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition"><Phone size={18} /></button>
                                    <button onClick={() => setSelectedChatContact(null)} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition"><X size={18} /></button>
                                </div>
                            </div>
                            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 bg-gray-50/50 dark:bg-slate-950/50 scroll-smooth">
                                {(chatMessages[selectedChatContact.email] || []).map((msg, i) => (
                                    <div key={i} className={`flex ${msg.isMe ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl shadow-sm text-sm ${msg.isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200 rounded-tl-none border border-gray-100 dark:border-slate-700'}`}>
                                            {msg.type === 'file' ? (
                                                <div className="flex flex-col gap-2"><div className="flex items-center gap-3 bg-black/10 dark:bg-white/10 p-2 rounded-xl border border-white/10"><div className="p-2 bg-white/20 rounded-lg"><FileText size={20} /></div><div className="min-w-0 flex-1"><p className="text-xs font-bold truncate">{msg.fileName}</p><p className="text-[9px] opacity-70">{(msg.fileSize! / 1024).toFixed(1)} KB</p></div>{msg.fileReady ? <button onClick={() => p2pService.downloadReceivedFile(msg.fileId!, msg.fileName!)} className="p-1.5 hover:bg-white/20 rounded-lg transition"><Download size={16} /></button> : <div className="animate-pulse text-[9px] font-bold uppercase">Downloading...</div>}</div></div>
                                            ) : (msg.content)}
                                            <p className={`text-[9px] mt-1 opacity-60 ${msg.isMe ? 'text-right' : 'text-left'}`}>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                        </div>
                                    </div>
                                ))}
                                <div ref={chatEndRef} />
                            </div>
                            <ChatInput
                                onSendMessage={(content, file) => {
                                    if (file) handleSendFile(file);
                                    if (content.trim()) sendDirectMessage(content);
                                }}
                            />
                        </div>
                    )}
                </div>
            )}
            {showJoinModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 w-full max-w-md shadow-2xl border border-white/10">
                        <div className="flex justify-between items-center mb-6"><h2 className="text-2xl font-bold text-gray-900 dark:text-white">Join meeting</h2><button onClick={() => setShowJoinModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full"><X size={20} /></button></div>
                        <p className="text-gray-500 dark:text-slate-400 mb-6">Enter the code or link provided by the meeting organizer</p>
                        <div className="space-y-4">
                            <input autoFocus type="text" placeholder="Example: abc-defg-hij" className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border-2 border-transparent focus:border-blue-500 rounded-xl outline-none text-lg transition-all" value={meetingCode} onChange={e => setMeetingCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && joinMeeting()} />
                            <div className="flex gap-3 justify-end pt-4"><button onClick={() => setShowJoinModal(false)} className="px-6 py-2.5 text-gray-600 dark:text-slate-400 font-bold hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition">Cancel</button><button onClick={() => joinMeeting()} disabled={!meetingCode} className="px-8 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg hover:bg-blue-700 transition disabled:opacity-50">Join</button></div>
                        </div>
                    </div>
                </div>
            )}

            {/* Meeting Link Modal (For Later) */}
            {showMeetingLinkModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-sm p-8 shadow-2xl border border-gray-100 dark:border-slate-800 animate-scale-in">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Here's the link to your meeting</h3>
                            <button onClick={() => setShowMeetingLinkModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition text-gray-500"><X size={20} /></button>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 font-medium">Copy this link and send it to people you want to meet with. Be sure to save it so you can use it later too.</p>
                        <div className="bg-gray-50 dark:bg-slate-800 p-4 rounded-2xl border border-gray-200 dark:border-slate-700 flex items-center justify-between gap-3 mb-4">
                            <span className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate flex-1 leading-none">{generatedMeetingLink}</span>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(generatedMeetingLink);
                                    toast.success("Link copied!");
                                }}
                                className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition shadow-sm"
                            >
                                <Paperclip size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ChatInput({ onSendMessage }: { onSendMessage: (c: string, f?: File) => void }) {
    const [text, setText] = useState('');
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSend = () => {
        if (text.trim() || pendingFile) {
            onSendMessage(text, pendingFile || undefined);
            setText('');
            setPendingFile(null);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setPendingFile(file);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="p-4 border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900">
            {pendingFile && (
                <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-between animate-fade-in border border-blue-100 dark:border-blue-900/30">
                    <div className="flex items-center gap-2 min-w-0">
                        <FileText size={14} className="text-blue-600 shrink-0" />
                        <span className="text-[10px] font-bold truncate text-blue-800 dark:text-blue-300">{pendingFile.name}</span>
                    </div>
                    <button onClick={() => setPendingFile(null)} className="p-1 hover:bg-blue-100 dark:hover:bg-blue-800 rounded-lg text-blue-600 transition-colors">
                        <X size={14} />
                    </button>
                </div>
            )}
            <div className="flex items-center gap-2 bg-gray-100 dark:bg-slate-800 px-4 py-2 rounded-2xl focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                <input
                    type="file"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className={`p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition-colors ${pendingFile ? 'text-blue-600' : 'text-gray-500'}`}
                    title="Attach File"
                >
                    <Paperclip size={20} />
                </button>
                <input
                    type="text"
                    placeholder="Type a message..."
                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm"
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                />
                <button
                    onClick={handleSend}
                    className="text-blue-600 hover:text-blue-700 transition-colors disabled:opacity-50"
                    disabled={!text.trim() && !pendingFile}
                >
                    <Send size={18} />
                </button>
            </div>
        </div>
    );
}

function NavItem({ icon: Icon, label, active, onClick, badge }: { icon: any, label: string, active?: boolean, onClick: () => void, badge?: number }) {
    return (
        <button onClick={onClick} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${active ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white'}`}>
            <div className="flex items-center gap-3"><Icon size={18} /><span>{label}</span></div>
            {badge ? <span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded-full">{badge}</span> : null}
        </button>
    );
}
