import { useState, useEffect, useRef } from 'react';
import { Send, User, X, Paperclip } from 'lucide-react';
import { p2pService } from '../lib/p2pService';
import { authService } from '../lib/authService';
import { chatStorage } from '../lib/chatStorage';
import LocalStoragePrompt from './LocalStoragePrompt';

interface ChatInterfaceProps {
    peer: string;
    onClose?: () => void;
}

interface Message {
    id: string;
    text: string;
    sender: string;
    timestamp: number;
    isSelf: boolean;
}

export default function ChatInterface({ peer, onClose }: ChatInterfaceProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [showStoragePrompt, setShowStoragePrompt] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const user = authService.getCurrentUser();

    // Check storage preference on mount
    useEffect(() => {
        const pref = chatStorage.getPreference();
        if (pref === null) {
            setShowStoragePrompt(true);
        }
    }, []);

    // Load messages from storage
    useEffect(() => {
        if (!user?.email) return;

        const loadMessages = async () => {
            try {
                // Try IndexedDB first
                const dbMessages = await chatStorage.getMessages(peer);

                if (dbMessages && dbMessages.length > 0) {
                    setMessages(dbMessages.map(m => ({
                        id: m.id ? m.id.toString() : Math.random().toString(),
                        text: m.content,
                        sender: m.sender,
                        timestamp: m.timestamp,
                        isSelf: m.sender === user.email
                    })));
                } else {
                    // Fallback to localStorage (legacy support or if DB empty)
                    // Only if DB preference is NOT disabled explicitly? 
                    // Or maybe we migrate? For now, we load legacy if DB empty.
                    const key = `chat_${user.email}_${peer}`;
                    const stored = localStorage.getItem(key);
                    if (stored) {
                        setMessages(JSON.parse(stored));
                    }
                }
            } catch (err) {
                console.error('Failed to load messages', err);
            }
        };

        loadMessages();
    }, [peer, user]);

    // Handle P2P Incoming
    useEffect(() => {
        const handleP2PMessage = async (e: any) => {
            const msg = e.detail;
            if (msg.type === 'secure-message' && msg.from === peer && msg.payload?.content) {
                const newMessage = {
                    id: Math.random().toString(),
                    text: msg.payload.content,
                    sender: msg.from,
                    timestamp: msg.payload.timestamp || Date.now(),
                    isSelf: false
                };

                setMessages(prev => [...prev, newMessage]);

                // Save to storage
                await chatStorage.saveMessage({
                    threadId: peer,
                    sender: msg.from,
                    content: msg.payload.content,
                    timestamp: newMessage.timestamp
                });
            }
        };

        window.addEventListener('p2p-message', handleP2PMessage);
        return () => window.removeEventListener('p2p-message', handleP2PMessage);
    }, [peer]);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || !user) return;
        const text = input.trim();

        try {
            p2pService.sendChat(peer, text);

            const newMessage = {
                id: Math.random().toString(),
                text,
                sender: user.email,
                timestamp: Date.now(),
                isSelf: true
            };

            setMessages(prev => [...prev, newMessage]);
            setInput('');

            // Save locally
            await chatStorage.saveMessage({
                threadId: peer,
                sender: user.email,
                content: text,
                timestamp: newMessage.timestamp
            });

        } catch (err) {
            console.error('Failed to send chat', err);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            p2pService.sendFiles(peer, Array.from(e.target.files));
            e.target.value = '';
        }
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-3xl shadow-xl overflow-hidden border border-gray-200 dark:border-slate-800 relative">
            {/* Storage Prompt Modal */}
            {showStoragePrompt && (
                <LocalStoragePrompt
                    onComplete={() => setShowStoragePrompt(false)}
                    onClose={() => setShowStoragePrompt(false)}
                />
            )}

            {/* Header */}
            <div className="p-4 bg-gray-50 dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                        <User className="text-blue-600 dark:text-blue-400" size={20} />
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">{peer}</h3>
                        <p className="text-xs text-green-500 font-medium">Secured P2P Chat</p>
                    </div>
                </div>
                {onClose && (
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                )}
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 dark:bg-slate-950/50">
                {messages.length === 0 && (
                    <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">
                        No messages yet. Start something!
                    </div>
                )}
                {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.isSelf ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[70%] rounded-2xl p-3 px-4 ${msg.isSelf
                            ? 'bg-blue-600 text-white rounded-br-none'
                            : 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-gray-200 rounded-bl-none'
                            }`}>
                            <p className="text-sm">{msg.text}</p>
                            <p className={`text-[10px] mt-1 ${msg.isSelf ? 'text-blue-100' : 'text-gray-400'}`}>
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Input */}
            <div className="p-4 bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleFileSelect}
                        multiple
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-3 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition"
                    >
                        <Paperclip size={20} />
                    </button>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a secured message..."
                        className="flex-1 bg-gray-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition dark:text-white"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim()}
                        className="p-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition shadow-lg shadow-blue-600/20"
                    >
                        <Send size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
}
