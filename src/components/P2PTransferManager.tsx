import { useState, useEffect } from 'react';
import { X, ArrowUpRight, ArrowDownLeft, CheckCircle2, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';

interface TransferTask {
    id: string;
    type: 'upload' | 'download' | 'handshake';
    name: string;
    progress: number;
    status: 'pending' | 'active' | 'complete' | 'failed' | 'handshaking' | 'queued';
    peer: string;
}

export default function P2PTransferManager() {
    const [tasks, setTasks] = useState<Map<string, TransferTask>>(new Map());
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const handleHandshakeStart = (e: any) => {
            const { peer } = e.detail;
            const id = `hs-${peer}`;
            setTasks(prev => {
                const next = new Map(prev);
                next.set(id, {
                    id,
                    type: 'handshake',
                    name: 'Identity Verification',
                    progress: 50,
                    status: 'handshaking',
                    peer
                });
                return next;
            });
            setIsVisible(true);
        };

        const handleSecureReady = (e: any) => {
            const { peer } = e.detail;
            const id = `hs-${peer}`;
            setTasks(prev => {
                const next = new Map(prev);
                if (next.has(id)) {
                    const task = next.get(id)!;
                    task.status = 'complete';
                    task.progress = 100;
                    setTimeout(() => {
                        setTasks(p => {
                            const n = new Map(p);
                            n.delete(id);
                            return n;
                        });
                    }, 3000);
                }
                return next;
            });
        };

        const handleIncoming = (e: any) => {
            const { messageId, from, fileName } = e.detail;
            setTasks(prev => {
                const next = new Map(prev);

                // Deduplicate: Check if we already have an active download for this file/peer
                // even if messageId changed (unlikely but possible in resume flows if logic is loose)
                const existing = Array.from(next.values()).find(t =>
                    t.type === 'download' &&
                    t.name === fileName &&
                    t.peer === from &&
                    (t.status === 'active' || t.status === 'pending')
                );

                // If identical active task exists, ignore this new request to prevent UI noise
                if (existing && existing.id !== messageId) {
                    return next;
                }

                next.set(messageId, {
                    id: messageId,
                    type: 'download',
                    name: fileName || 'Incoming File',
                    progress: 0,
                    status: 'active',
                    peer: from
                });
                return next;
            });
            setIsVisible(true);
        };

        const handleReceiverProgress = (e: any) => {
            const { messageId, percentage, status, from, fileName } = e.detail;
            setTasks(prev => {
                const next = new Map(prev);
                const task = next.get(messageId);
                if (task) {
                    task.progress = percentage;
                    if (status === 'complete' || status === 'COMPLETED') task.status = 'complete';
                } else if (percentage > 0 && percentage < 100) {
                    // Discovery: create task if we didn't know about it
                    next.set(messageId, {
                        id: messageId,
                        type: 'download',
                        name: fileName || 'Incoming File',
                        progress: percentage,
                        status: 'active',
                        peer: from || 'Sender'
                    });
                }
                return next;
            });
            if (percentage > 0 && percentage < 100) setIsVisible(true);
        };

        const handleSenderProgress = (e: any) => {
            const { messageId, percentage, fileName, status } = e.detail;
            setTasks(prev => {
                const next = new Map(prev);
                const task = next.get(messageId);
                if (task) {
                    task.progress = percentage;
                    if (status) task.status = status;
                } else {
                    next.set(messageId, {
                        id: messageId,
                        type: 'upload',
                        name: fileName || 'Sending File...',
                        progress: percentage,
                        status: status || 'active',
                        peer: 'Recipient'
                    });
                }
                return next;
            });
            // setIsVisible(true); // Silent for sender as per user request
        };

        const handleDelivered = (e: any) => {
            const { messageId } = e.detail;
            setTasks(prev => {
                const next = new Map(prev);
                const task = next.get(messageId);
                if (task) {
                    task.status = 'complete';
                    task.progress = 100;
                    setTimeout(() => {
                        setTasks(p => {
                            const n = new Map(p);
                            n.delete(messageId);
                            return n;
                        });
                    }, 3000);
                }
                return next;
            });
        };

        const handleError = (e: any) => {
            const { messageId, message, peer } = e.detail;
            const id = messageId || `err-${peer}-${Date.now()}`;
            setTasks(prev => {
                const next = new Map(prev);
                const existing = next.get(id);
                if (existing) {
                    existing.status = 'failed';
                    existing.name = message || 'Transfer Failed';
                } else {
                    next.set(id, {
                        id,
                        type: 'upload',
                        name: message || 'Transfer Failed',
                        progress: 0,
                        status: 'failed',
                        peer: peer || ''
                    });
                }
                return next;
            });
            setIsVisible(true);
        };

        window.addEventListener('p2p-handshake-start', handleHandshakeStart);
        window.addEventListener('p2p-secure-ready', handleSecureReady);
        window.addEventListener('p2p-incoming-file', handleIncoming);
        window.addEventListener('p2p-receiver-progress', handleReceiverProgress);
        window.addEventListener('p2p-progress', handleSenderProgress);
        window.addEventListener('p2p-delivered', handleDelivered);
        window.addEventListener('p2p-error', handleError);

        return () => {
            window.removeEventListener('p2p-handshake-start', handleHandshakeStart);
            window.removeEventListener('p2p-secure-ready', handleSecureReady);
            window.removeEventListener('p2p-incoming-file', handleIncoming);
            window.removeEventListener('p2p-receiver-progress', handleReceiverProgress);
            window.removeEventListener('p2p-progress', handleSenderProgress);
            window.removeEventListener('p2p-delivered', handleDelivered);
            window.removeEventListener('p2p-error', handleError);
        };
    }, []);

    if (!isVisible || tasks.size === 0) return null;

    return (
        <div className="fixed bottom-6 right-6 z-[9999] w-80 animate-in slide-in-from-right-10 duration-300">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-800 overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Loader2 className={`w-4 h-4 animate-spin text-blue-500 ${tasks.size === 0 ? 'hidden' : ''}`} />
                        P2P Transfers ({tasks.size})
                    </h3>
                    <button
                        onClick={() => setIsVisible(false)}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        <X className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                    </button>
                </div>

                {/* Task List */}
                <div className="max-h-96 overflow-y-auto">
                    {Array.from(tasks.values()).reverse().map(task => (
                        <div key={task.id} className="p-4 border-b border-gray-50 dark:border-slate-800/50 last:border-0">
                            <div className="flex items-start gap-3 mb-2">
                                <div className={`mt-1 p-2 rounded-lg ${task.type === 'upload' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' :
                                    task.type === 'download' ? 'bg-green-100 dark:bg-green-900/30 text-green-600' :
                                        'bg-purple-100 dark:bg-purple-900/30 text-purple-600'
                                    }`}>
                                    {task.type === 'upload' ? <ArrowUpRight className="w-4 h-4" /> :
                                        task.type === 'download' ? <ArrowDownLeft className="w-4 h-4" /> :
                                            <ShieldCheck className="w-4 h-4" />}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                            {task.name}
                                        </p>
                                        {task.status === 'complete' ? (
                                            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                                        ) : task.status === 'failed' ? (
                                            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                        ) : null}
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                                        {task.type === 'handshake' ? `Verifying ${task.peer}` :
                                            task.type === 'upload' ? `Uploading to ${task.peer}` :
                                                `Receiving from ${task.peer}`}
                                    </p>
                                </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="space-y-1">
                                <div className="h-1.5 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-500 rounded-full ${task.status === 'complete' ? 'bg-green-500' :
                                            task.status === 'failed' ? 'bg-red-500' :
                                                task.status === 'queued' ? 'bg-amber-500' :
                                                    task.type === 'handshake' ? 'bg-purple-500 animate-pulse' :
                                                        'bg-blue-500'
                                            }`}
                                        style={{ width: `${task.progress}%` }}
                                    />
                                </div>
                                <div className="flex justify-between items-center text-[10px] font-medium uppercase tracking-wider text-gray-400">
                                    <span>{task.status === 'queued' ? 'Recipient Offline (Queued)' : task.status}</span>
                                    <span>{Math.round(task.progress)}%</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
