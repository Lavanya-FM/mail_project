import { useState, useMemo, useEffect } from 'react';
import { ArrowUpRight, ArrowDownLeft, CheckCircle2, AlertCircle, Loader2, ShieldCheck, Mail, ExternalLink, Search, Zap } from 'lucide-react';
import { useP2PTransfers } from '../hooks/useP2PTransfers';
import { Email } from '../types/email';

import { emailService } from '../lib/emailService';

interface TransfersViewProps {
    onOpenEmail: (emailId: string) => void;
    emails: Email[];
}

export default function TransfersView({ onOpenEmail, emails }: TransfersViewProps) {
    const { tasks } = useP2PTransfers();
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'complete'>('all');
    const [deletedTaskIds, setDeletedTaskIds] = useState<Set<string>>(new Set());
    const [verifiedTaskIds, setVerifiedTaskIds] = useState<Set<string>>(new Set());

    const totalActive = Array.from(tasks.values()).filter(t => t.status === 'active' || t.status === 'handshaking' || t.status === 'queued').length;

    // Verify orphaned tasks
    useEffect(() => {
        const verifyOrphans = async () => {
            const orphans = Array.from(tasks.values()).filter(task => {
                // If known deleted or verified, skip
                if (deletedTaskIds.has(task.id) || verifiedTaskIds.has(task.id)) return false;

                // If active/handshaking, always show (don't hide active transfers even if email not ready)
                if (task.status === 'active' || task.status === 'handshaking' || task.status === 'queued') return false;

                // Check if we have it locally
                const hasLocal = emails.some(e =>
                    String(e.id) === task.id ||
                    (e.attachments || []).some((a: any) => a.p2p_message_id === task.id)
                );
                return !hasLocal;
            });

            // Process orphans
            for (const task of orphans) {
                try {
                    const res = await emailService.getEmailById(task.id);
                    if (res.error || !res.data) {
                        setDeletedTaskIds(prev => new Set(prev).add(task.id));
                    } else {
                        setVerifiedTaskIds(prev => new Set(prev).add(task.id));
                    }
                } catch (e) {
                    setDeletedTaskIds(prev => new Set(prev).add(task.id));
                }
            }
        };

        const timeout = setTimeout(verifyOrphans, 1000);
        return () => clearTimeout(timeout);
    }, [tasks, emails, deletedTaskIds, verifiedTaskIds]);

    const filteredTasks = useMemo(() => {
        return Array.from(tasks.values())
            .filter(task => !deletedTaskIds.has(task.id)) // Hide deleted
            .filter(task => {
                const matchesSearch = task.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    task.peer.toLowerCase().includes(searchQuery.toLowerCase());

                if (filterStatus === 'all') return matchesSearch;
                if (filterStatus === 'active') return matchesSearch && (task.status === 'active' || task.status === 'handshaking' || task.status === 'queued');
                if (filterStatus === 'complete') return matchesSearch && task.status === 'complete';
                return matchesSearch;
            })
            .reverse();
    }, [tasks, searchQuery, filterStatus, deletedTaskIds]);

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const formatSpeed = (bps: number) => {
        return formatSize(bps) + '/s';
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-[#f8fafc] dark:bg-slate-950 overflow-hidden h-full">
            {/* Header Area */}
            <div className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-6 py-4 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2 tracking-tight">
                            <div className="bg-blue-600 p-1.5 rounded-lg shadow-lg shadow-blue-500/20">
                                <ShieldCheck className="w-5 h-5 text-white" />
                            </div>
                            File Transfers
                        </h2>
                        <div className="flex items-center gap-2 mt-1">
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">End-to-End Encrypted</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 px-4 py-2 rounded-2xl flex items-center gap-3 shadow-sm group hover:border-blue-300 transition-colors">
                            <div className="relative">
                                <Zap className={`w-4 h-4 ${totalActive > 0 ? 'text-blue-500 fill-blue-500' : 'text-gray-400'}`} />
                                {totalActive > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-400 rounded-full animate-ping" />}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-gray-400 uppercase leading-none mb-1">Active Now</span>
                                <span className="text-sm font-black text-blue-600 dark:text-blue-400 leading-none">{totalActive} Transfers</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Search & Filter Bar */}
                <div className="flex flex-col md:flex-row gap-3 items-center">
                    <div className="flex items-center bg-gray-100/80 dark:bg-slate-800/80 p-1 rounded-xl border border-gray-200/50 dark:border-slate-700/50">
                        {(['all', 'active', 'complete'] as const).map((status) => (
                            <button
                                key={status}
                                onClick={() => setFilterStatus(status)}
                                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-200 ${filterStatus === status
                                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-sm ring-1 ring-black/5'
                                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-slate-300'
                                    }`}
                            >
                                {status === 'all' ? 'Everywhere' : status}
                            </button>
                        ))}
                    </div>

                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Find transfers by filename or peer..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-gray-100/80 dark:bg-slate-800/80 border-none rounded-xl py-2.5 pl-10 pr-4 text-xs focus:ring-2 focus:ring-blue-500/50 dark:text-white transition-all outline-none font-medium placeholder:text-gray-400"
                        />
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6">
                {filteredTasks.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center py-20 animate-in fade-in duration-700">
                        <div className="w-20 h-20 bg-gray-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center mb-6 rotate-12 opacity-50">
                            <ArrowUpRight className="w-10 h-10 text-gray-400" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                            {searchQuery ? 'No matching transfers' : 'No transfers recorded'}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-slate-400 mt-2 max-w-xs font-medium">
                            {searchQuery ? 'Try adjusting your search filters or phrase.' : 'When you send or receive files, they will appear here in real-time.'}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                        {filteredTasks.map(task => {
                            const associatedEmail = emails.find(e =>
                                String(e.id) === task.id ||
                                (e.attachments || []).some((a: any) => a.p2p_message_id === task.id)
                            );
                            const progress = isNaN(task.progress) ? 0 : task.progress;
                            const isTransferring = task.status === 'active' || task.status === 'handshaking' || task.status === 'queued';

                            return (
                                <button
                                    key={task.id}
                                    onClick={() => onOpenEmail(associatedEmail ? String(associatedEmail.id) : task.id)}
                                    className={`flex flex-col text-left bg-white dark:bg-slate-900 rounded-2xl border transition-all duration-300 group relative overflow-hidden h-fit ${isTransferring
                                        ? 'border-blue-500 shadow-lg shadow-blue-500/5 ring-1 ring-blue-500/20'
                                        : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700 shadow-sm hover:shadow-md'
                                        }`}
                                >
                                    {/* Progress Background Overlay (Subtle) */}
                                    <div
                                        className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-200 ease-out z-20"
                                        style={{ width: `${progress}%` }}
                                    />

                                    {isTransferring && (
                                        <div className="absolute top-0 right-0 p-3">
                                            <div className="flex h-2 w-2 relative">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="p-5">
                                        <div className="flex items-start gap-3 mb-4">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${task.type === 'upload' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' :
                                                task.type === 'download' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600' :
                                                    'bg-purple-50 dark:bg-purple-900/30 text-purple-600'
                                                }`}>
                                                {task.type === 'upload' ? <ArrowUpRight className="w-5 h-5" /> :
                                                    task.type === 'download' ? <ArrowDownLeft className="w-5 h-5" /> :
                                                        <ShieldCheck className="w-5 h-5" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${task.type === 'upload' ? 'bg-blue-100/50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' :
                                                        task.type === 'download' ? 'bg-emerald-100/50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' :
                                                            'bg-purple-100/50 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 text-purple-600'
                                                        }`}>
                                                        {task.type}
                                                    </span>
                                                </div>
                                                <h4 className="font-bold text-gray-900 dark:text-white truncate text-sm leading-tight mb-0.5" title={task.name}>
                                                    {task.name}
                                                </h4>
                                                <p className="text-[10px] font-bold text-gray-400 truncate uppercase tracking-tight">
                                                    {task.type === 'upload' ? 'To: ' : 'From: '}
                                                    <span className="text-blue-500">{task.peer}</span>
                                                </p>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            {/* Progress Info */}
                                            <div className="flex items-end justify-between">
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1.5">Progress</span>
                                                    <div className="flex items-baseline gap-1">
                                                        <span className="text-xl font-black text-gray-900 dark:text-white tabular-nums tracking-tighter">
                                                            {Math.round(progress)}
                                                        </span>
                                                        <span className="text-[10px] font-black text-gray-400">%</span>
                                                    </div>
                                                </div>
                                                <div className="text-right flex flex-col items-end">
                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1.5 block">State</span>
                                                    <div className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg inline-flex items-center gap-1.5 shadow-sm ${task.status === 'complete' || task.status === 'seeding' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30' :
                                                        task.status === 'failed' ? 'bg-red-50 text-red-600 dark:bg-red-900/30' :
                                                            'bg-blue-50 text-blue-600 dark:bg-blue-900/30'
                                                        }`}>
                                                        {task.status === 'active' && <Loader2 className="w-3 h-3 animate-spin" />}
                                                        {(task.status === 'complete' || task.status === 'seeding') && <CheckCircle2 className="w-3 h-3" />}
                                                        {task.status === 'failed' && <AlertCircle className="w-3 h-3" />}
                                                        {task.status === 'seeding' ? 'SEEDING' : task.status}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Detailed Stats (Speed, Size, ETA) */}
                                            {(isTransferring || task.status === 'complete' || task.status === 'seeding') && (
                                                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50 dark:border-slate-800/50">
                                                    {isTransferring && (
                                                        <>
                                                            <div className="flex flex-col">
                                                                <span className="text-[8px] font-bold text-gray-400 uppercase">Speed</span>
                                                                <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">
                                                                    {task.speedBps ? formatSpeed(task.speedBps) : '-'}
                                                                </span>
                                                            </div>
                                                            <div className="flex flex-col text-right">
                                                                <span className="text-[8px] font-bold text-gray-400 uppercase">ETA</span>
                                                                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                                                                    {task.etaSeconds ? `${Math.ceil(task.etaSeconds)}s` : 'Calculating...'}
                                                                </span>
                                                            </div>
                                                        </>
                                                    )}
                                                    <div className="col-span-2 flex flex-col mt-1">
                                                        <div className="flex justify-between text-[8px] font-bold text-gray-400 uppercase mb-0.5">
                                                            <span>Transferred</span>
                                                            <span>{task.total ? formatSize(task.total) : 'Unknown'}</span>
                                                        </div>
                                                        <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                                            <div className="bg-blue-500 h-full rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                                                        </div>
                                                        <div className="text-right text-[9px] font-bold text-gray-600 dark:text-gray-400 mt-0.5">
                                                            {task.received ? formatSize(task.received) : '0 B'} / {task.total ? formatSize(task.total) : '?'}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Thread Context */}
                                            <div className="pt-4 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <Mail className="w-3 h-3 text-gray-400 group-hover:text-blue-500 transition-colors" />
                                                    <span className="text-[10px] font-bold text-gray-500 group-hover:text-gray-900 dark:group-hover:text-white truncate">
                                                        {associatedEmail?.subject || 'View Message'}
                                                    </span>
                                                </div>
                                                <ExternalLink className="w-3 h-3 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Sticky Summary Footer */}
            <div className="p-4 bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                            {filteredTasks.filter(t => t.status === 'complete').length} Successful
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.5)]" />
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                            {filteredTasks.filter(t => t.status === 'active' || t.status === 'handshaking').length} In Transit
                        </span>
                    </div>
                </div>
                <div className="text-[9px] font-black text-gray-300 uppercase tracking-[0.2em]">
                    SECURE P2P NODE v2.1
                </div>
            </div>
        </div>
    );
}
