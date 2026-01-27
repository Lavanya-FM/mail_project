import { useState, useEffect, useRef } from 'react';
import { Send, X, Paperclip, File } from 'lucide-react';
import { p2pService } from '../lib/p2pService';
import { authService, getToken } from '../lib/authService';

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
    type: 'text' | 'file';
    fileUrl?: string;
    fileName?: string;
}

export default function ChatInterface({ peer, onClose }: ChatInterfaceProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isUploading, setIsUploading] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const user = authService.getCurrentUser();

    // Load messages from DB
    useEffect(() => {
        if (!user?.email) return;

        const loadMessages = async () => {
            try {
                const token = getToken();
                const res = await fetch(`/api/chat/${peer}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (res.ok) {
                    const data = await res.json();
                    // Map DB rows to Message interface
                    setMessages(data.map((row: any) => ({
                        id: row.id.toString(),
                        text: row.content || '',
                        sender: row.sender_email,
                        timestamp: new Date(row.created_at).getTime(),
                        isSelf: row.sender_email === user.email,
                        type: row.type || 'text',
                        fileUrl: row.file_url,
                        fileName: row.file_name // Load from DB
                    })));
                }
            } catch (err) {
                console.error('Failed to load messages', err);
            }
        };

        loadMessages();
    }, [peer, user]);

    // Handle P2P Incoming (Instant Updates)
    useEffect(() => {
        const handleP2PMessage = (e: any) => {
            const msg = e.detail;
            if (msg.type === 'secure-message' && msg.from === peer && msg.payload?.content) {
                // To avoid duplication, we could rely solely on DB, but P2P is faster.
                // We'll append it. If we reload, DB will be source of truth.
                const newMessage: Message = {
                    id: 'temp-' + Math.random(),
                    text: msg.payload.content,
                    sender: msg.from,
                    timestamp: msg.payload.timestamp || Date.now(),
                    isSelf: false,
                    type: msg.payload.type || 'text',
                    fileUrl: msg.payload.fileUrl,
                    fileName: msg.payload.fileName
                };

                setMessages(prev => [...prev, newMessage]);
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
        if ((!input.trim()) || !user) return;

        await sendMessage(input.trim(), 'text');
        setInput('');
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            await sendMessage('', 'file', file);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const sendMessage = async (content: string, type: 'text' | 'file', file?: File) => {
        if (!user) return;

        try {
            setIsUploading(true);
            const token = getToken();

            // 1. Send to Backend (Persistence)
            const formData = new FormData();
            formData.append('receiver_email', peer);
            formData.append('content', content);
            formData.append('type', type);
            if (file) {
                formData.append('file', file);
            }

            const res = await fetch('/api/chat/send', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                    // No Content-Type for FormData, browser sets boundary
                },
                body: formData
            });

            if (res.ok) {
                const result = await res.json();
                const savedMsg = result.message;

                // 2. Update UI
                const newMessage: Message = {
                    id: savedMsg.id ? savedMsg.id.toString() : Math.random().toString(),
                    text: savedMsg.content,
                    sender: user.email,
                    timestamp: new Date().getTime(),
                    isSelf: true,
                    type: savedMsg.type,
                    fileUrl: savedMsg.file_url, // Use the URL returned by server
                    fileName: savedMsg.file_name // Use server stored name
                };

                setMessages(prev => [...prev, newMessage]);

                // 3. Send P2P Signal (Instant Notification)
                // We send the file URL if it was an upload
                p2pService.sendChat(peer, content || 'Sent a file', {
                    type: savedMsg.type,
                    fileUrl: savedMsg.file_url,
                    fileName: savedMsg.file_name
                });

            } else {
                console.error('Failed to save message');
            }

        } catch (err) {
            console.error('Error sending message:', err);
        } finally {
            setIsUploading(false);
        }
    };



    return (
        <div className="flex flex-col h-full bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-200 relative animate-scale-up">

            {/* Header */}
            <div className="p-4 bg-white border-b border-gray-100 flex items-center justify-between shadow-sm z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                        {peer[0].toUpperCase()}
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800">{peer}</h3>
                        <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                            Online
                        </p>
                    </div>
                </div>
                {onClose && (
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition">
                        <X size={20} />
                    </button>
                )}
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-2">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                            <Send size={24} className="opacity-20" />
                        </div>
                        <p className="text-sm">No messages yet. Say hello!</p>
                    </div>
                )}

                {messages.map((msg, index) => (
                    <div key={msg.id || index} className={`flex ${msg.isSelf ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] rounded-2xl p-3 px-4 shadow-sm ${msg.isSelf
                            ? 'bg-blue-600 text-white rounded-br-none'
                            : 'bg-white border border-gray-100 text-gray-800 rounded-bl-none'
                            }`}>
                            {msg.type === 'file' && (
                                <div className="mb-2 bg-black/10 rounded-lg p-2 flex items-center gap-2">
                                    <File size={16} />
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold truncate max-w-[150px]">{msg.fileName || 'Attachment'}</span>
                                        <a
                                            href={msg.fileUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            download={msg.fileName}
                                            className="text-xs underline truncate max-w-[150px]"
                                        >
                                            Download
                                        </a>
                                    </div>
                                </div>
                            )}

                            {msg.text && <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>}

                            <p className={`text-[10px] mt-1.5 text-right ${msg.isSelf ? 'text-blue-100' : 'text-gray-400'}`}>
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Input Area */}
            <div className="p-3 bg-white border-t border-gray-100">
                <div className="flex items-end gap-2 bg-gray-50 p-2 rounded-2xl border border-gray-200 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleFileSelect}
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition h-10 w-10 flex items-center justify-center"
                        title="Attach file"
                    >
                        <Paperclip size={20} />
                    </button>

                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder="Type a message..."
                        className="flex-1 bg-transparent border-none outline-none text-sm text-gray-800 placeholder-gray-400 resize-none py-2.5 max-h-32 min-h-[40px]"
                        rows={1}
                    />

                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isUploading}
                        className={`p-2 rounded-xl transition h-10 w-10 flex items-center justify-center shadow-sm ${input.trim()
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                    >
                        <Send size={18} className={input.trim() ? 'ml-0.5' : ''} />
                    </button>
                </div>
                {isUploading && (
                    <div className="text-xs text-blue-500 text-center mt-2">Uploading file...</div>
                )}
            </div>
        </div>
    );
}
