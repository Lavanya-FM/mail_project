import { useState, useEffect } from 'react';

export interface TransferTask {
    id: string;
    type: 'upload' | 'download' | 'handshake';
    name: string;
    progress: number;
    status: 'pending' | 'active' | 'complete' | 'failed' | 'handshaking' | 'queued' | 'seeding' | 'delivered';
    peer: string;
    fileName?: string;
    speedBps?: number;
    etaSeconds?: number | null;
    received?: number;
    total?: number;
}

export function useP2PTransfers() {
    const [tasks, setTasks] = useState<Map<string, TransferTask>>(new Map());

    useEffect(() => {
        // ... (handshake handlers unchanged)

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
            const { messageId, from, fileName, total } = e.detail;
            setTasks(prev => {
                const next = new Map(prev);
                const existing = Array.from(next.values()).find(t =>
                    t.type === 'download' &&
                    t.name === fileName &&
                    t.peer === from &&
                    (t.status === 'active' || t.status === 'pending')
                );

                if (existing && existing.id !== messageId) {
                    return next;
                }

                next.set(messageId, {
                    id: messageId,
                    type: 'download',
                    name: fileName || 'Incoming File',
                    progress: 0,
                    status: 'active',
                    peer: from,
                    received: 0,
                    total: total || 0
                });
                return next;
            });
        };

        const handleReceiverProgress = (e: any) => {
            const { messageId, percentage, status, from, fileName, speedBps, etaSeconds, received, total } = e.detail;
            setTasks(prev => {
                const next = new Map(prev);
                const task = next.get(messageId);
                if (task) {
                    task.progress = percentage;
                    task.speedBps = speedBps;
                    task.etaSeconds = etaSeconds;
                    task.received = received;
                    task.total = total;
                    if (status === 'complete' || status === 'COMPLETED') task.status = 'complete';
                } else if (percentage > 0 && percentage < 100) {
                    next.set(messageId, {
                        id: messageId,
                        type: 'download',
                        name: fileName || 'Incoming File',
                        progress: percentage,
                        status: 'active',
                        peer: from || 'Sender',
                        speedBps,
                        etaSeconds,
                        received,
                        total
                    });
                }
                return next;
            });
        };

        const handleSenderProgress = (e: any) => {
            const { messageId, percentage, fileName, status, speedBps, etaSeconds, received, total } = e.detail;
            setTasks(prev => {
                const next = new Map(prev);
                const task = next.get(messageId);
                if (task) {
                    task.progress = percentage;
                    task.speedBps = speedBps;
                    task.etaSeconds = etaSeconds;
                    task.received = received;
                    task.total = total;
                    if (status === 'delivered') task.status = 'seeding';
                    else if (status) task.status = status;
                } else {
                    next.set(messageId, {
                        id: messageId,
                        type: 'upload',
                        name: fileName || 'Sending File...',
                        progress: percentage,
                        status: status || 'active',
                        peer: 'Recipient',
                        speedBps,
                        etaSeconds,
                        received,
                        total
                    });
                }
                return next;
            });
        };

        const handleDelivered = (e: any) => {
            const { messageId } = e.detail;
            setTasks(prev => {
                const next = new Map(prev);
                const task = next.get(messageId);
                if (task) {
                    task.status = 'complete';
                    task.progress = 100;
                    task.etaSeconds = 0;
                    task.speedBps = 0;
                    // Persist - do not auto-delete
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
        };

        const handleCleanup = (e: any) => {
            const { messageId } = e.detail;
            setTasks(prev => {
                const next = new Map(prev);
                next.delete(messageId);
                return next;
            });
        };

        window.addEventListener('p2p-handshake-start', handleHandshakeStart);
        window.addEventListener('p2p-secure-ready', handleSecureReady);
        window.addEventListener('p2p-incoming-file', handleIncoming);
        window.addEventListener('p2p-receiver-progress', handleReceiverProgress);
        window.addEventListener('p2p-progress', handleSenderProgress);
        window.addEventListener('p2p-delivered', handleDelivered);
        window.addEventListener('p2p-error', handleError);
        window.addEventListener('p2p-cleanup', handleCleanup);

        return () => {
            window.removeEventListener('p2p-handshake-start', handleHandshakeStart);
            window.removeEventListener('p2p-secure-ready', handleSecureReady);
            window.removeEventListener('p2p-incoming-file', handleIncoming);
            window.removeEventListener('p2p-receiver-progress', handleReceiverProgress);
            window.removeEventListener('p2p-progress', handleSenderProgress);
            window.removeEventListener('p2p-delivered', handleDelivered);
            window.removeEventListener('p2p-error', handleError);
            window.removeEventListener('p2p-cleanup', handleCleanup);
        };
    }, []);

    return { tasks, setTasks };
}
