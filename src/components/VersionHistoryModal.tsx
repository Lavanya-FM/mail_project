import { useState, useEffect } from 'react';
import { X, History, RotateCcw, FileText, Clock } from 'lucide-react';
import * as driveService from '../lib/driveService';

interface Version {
    id: number;
    file_id: number;
    version_number: number;
    storage_path: string;
    size: number;
    created_at: string;
}

interface VersionHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    file: driveService.DriveFile | null;
    userId: number;
    onRefresh: () => void;
}

export default function VersionHistoryModal({ isOpen, onClose, file, userId, onRefresh }: VersionHistoryModalProps) {
    const [versions, setVersions] = useState<Version[]>([]);
    const [loading, setLoading] = useState(false);
    const [restoring, setRestoring] = useState<number | null>(null);

    useEffect(() => {
        if (isOpen && file) {
            loadVersions();
        }
    }, [isOpen, file]);

    const loadVersions = async () => {
        if (!file) return;
        setLoading(true);
        try {
            const res = await driveService.getFileVersionHistory(file.id, userId);
            if (res.success) {
                setVersions(res.versions || []);
            }
        } catch (err) {
            console.error('Failed to load versions', err);
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async (versionId: number) => {
        if (!file || !confirm('Are you sure you want to restore this version? The current version will be saved as a new revision.')) return;

        setRestoring(versionId);
        try {
            const res = await driveService.restoreFileVersion(file.id, versionId, userId);
            if (res.success) {
                onRefresh();
                onClose();
            } else {
                alert('Restore failed: ' + (res.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Failed to restore version', err);
            alert('Restore failed due to network error');
        } finally {
            setRestoring(null);
        }
    };

    if (!isOpen || !file) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-gray-100 dark:border-slate-800 transition-all transform animate-in zoom-in-95 duration-200`}>
                <div className="px-6 py-5 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-gray-50/50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                            <History className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white font-[Outfit]">Version History</h3>
                            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{file.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                        <X className="w-6 h-6 text-gray-500" />
                    </button>
                </div>

                <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-4">
                            <div className="w-10 h-10 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
                            <p className="text-sm text-gray-500">Retrieving revision history...</p>
                        </div>
                    ) : versions.length === 0 ? (
                        <div className="text-center py-16 bg-gray-50/50 dark:bg-slate-800/30 rounded-2xl border-2 border-dashed border-gray-100 dark:border-slate-800">
                            <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-500 font-medium">No previous versions found</p>
                            <p className="text-xs text-gray-400 mt-1">Upload a corrected file to see history</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="p-4 bg-blue-50/30 dark:bg-blue-900/10 rounded-2xl border border-blue-100/50 dark:border-blue-900/30 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        <div className="p-3 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-blue-100 dark:border-blue-900/50">
                                            <FileText className="w-6 h-6 text-blue-600" />
                                        </div>
                                        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900">
                                            {file.version_current || 1}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-900 dark:text-white">Current Version</p>
                                        <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                                            <Clock className="w-3 h-3" />
                                            {new Date(file.updated_at).toLocaleString()} • {driveService.formatFileSize(file.size_bytes)}
                                        </p>
                                    </div>
                                </div>
                                <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-[10px] font-bold uppercase tracking-wider rounded-full">Active</span>
                            </div>

                            <div className="h-px bg-gray-100 dark:bg-slate-800 my-4" />

                            <div className="space-y-3">
                                {versions.map((v) => (
                                    <div key={v.id} className="group p-4 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-800 transition-all flex items-center justify-between shadow-sm hover:shadow-md">
                                        <div className="flex items-center gap-4">
                                            <div className="relative">
                                                <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl group-hover:bg-white dark:group-hover:bg-slate-900 transition-colors">
                                                    <FileText className="w-6 h-6 text-gray-400 group-hover:text-blue-500" />
                                                </div>
                                                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-400 text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900 group-hover:bg-blue-100 group-hover:text-blue-700 group-hover:border-blue-50 transition-all">
                                                    {v.version_number}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-700 dark:text-slate-200 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">Revision {v.version_number}</p>
                                                <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                                                    <Clock className="w-3 h-3" />
                                                    {new Date(v.created_at).toLocaleString()} • {driveService.formatFileSize(v.size)}
                                                </p>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => handleRestore(v.id)}
                                            disabled={restoring !== null}
                                            className="px-4 py-2 flex items-center gap-2 bg-gray-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-gray-700 dark:text-slate-300 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                                        >
                                            {restoring === v.id ? (
                                                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                            ) : (
                                                <RotateCcw className="w-4 h-4" />
                                            )}
                                            Restore
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-gray-50/50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 rounded-xl text-sm font-bold hover:bg-gray-50 dark:hover:bg-slate-800 transition-all shadow-sm"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
