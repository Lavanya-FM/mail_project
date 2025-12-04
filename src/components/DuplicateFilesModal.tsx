import { X, Copy, Trash2, Check, AlertCircle } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import storageService, { DuplicateFile } from '../lib/storageService';
import driveService from '../lib/driveService';
import { useEffect, useState } from 'react';

interface DuplicateFilesModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: number;
    onRefresh: () => void;
}

export default function DuplicateFilesModal({ isOpen, onClose, userId, onRefresh }: DuplicateFilesModalProps) {
    const { theme } = useTheme();
    const [duplicates, setDuplicates] = useState<DuplicateFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());

    useEffect(() => {
        if (isOpen) {
            loadDuplicates();
        }
    }, [isOpen]);

    const loadDuplicates = async () => {
        setLoading(true);
        try {
            const data = await storageService.findDuplicates(userId);
            setDuplicates(data);
        } catch (error) {
            console.error('Error loading duplicates:', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleFileSelection = (fileId: number) => {
        const newSelected = new Set(selectedFiles);
        if (newSelected.has(fileId)) {
            newSelected.delete(fileId);
        } else {
            newSelected.add(fileId);
        }
        setSelectedFiles(newSelected);
    };

    const handleDeleteSelected = async () => {
        if (selectedFiles.size === 0) {
            alert('Please select files to delete');
            return;
        }

        if (confirm(`Delete ${selectedFiles.size} selected file(s)?`)) {
            for (const fileId of selectedFiles) {
                await driveService.deleteFile(fileId);
            }
            setSelectedFiles(new Set());
            loadDuplicates();
            onRefresh();
        }
    };

    if (!isOpen) return null;

    const totalSavings = duplicates.reduce((sum, dup) => sum + dup.potential_savings, 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className={`w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'}`}>
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-600 rounded-xl">
                            <Copy className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Duplicate Files</h2>
                            <p className="text-sm text-gray-600 dark:text-slate-400">
                                Found {duplicates.length} set(s) of duplicates • Potential savings: {storageService.formatBytes(totalSavings)}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/50 dark:hover:bg-slate-800 rounded-lg transition"
                    >
                        <X className="w-6 h-6 text-gray-600 dark:text-slate-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-4 border-green-200 dark:border-green-800 border-t-green-600 dark:border-t-green-400"></div>
                        </div>
                    ) : duplicates.length > 0 ? (
                        <div className="space-y-6">
                            {duplicates.map((duplicate, groupIndex) => (
                                <div key={groupIndex} className="p-4 bg-gray-50 dark:bg-slate-800 rounded-xl border-2 border-gray-200 dark:border-slate-700">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                                            <h3 className="font-semibold text-gray-900 dark:text-white">
                                                Duplicate Group {groupIndex + 1}
                                            </h3>
                                        </div>
                                        <div className="text-sm text-green-600 dark:text-green-400 font-medium">
                                            Save {storageService.formatBytes(duplicate.potential_savings)} by keeping one
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        {duplicate.files.map((file) => (
                                            <div
                                                key={file.id}
                                                className={`p-3 rounded-lg border-2 transition cursor-pointer ${selectedFiles.has(file.id)
                                                        ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                                                        : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 hover:border-blue-500'
                                                    }`}
                                                onClick={() => toggleFileSelection(file.id)}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3 flex-1">
                                                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${selectedFiles.has(file.id)
                                                                ? 'border-red-500 bg-red-500'
                                                                : 'border-gray-300 dark:border-slate-500'
                                                            }`}>
                                                            {selectedFiles.has(file.id) && <Check className="w-3 h-3 text-white" />}
                                                        </div>
                                                        <div className="flex-1">
                                                            <p className="font-medium text-gray-900 dark:text-white">{file.name}</p>
                                                            <p className="text-sm text-gray-600 dark:text-slate-400">
                                                                {storageService.formatBytes(file.size_bytes)} • Created {new Date(file.created_at).toLocaleDateString()}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    {selectedFiles.has(file.id) && (
                                                        <span className="text-sm text-red-600 dark:text-red-400 font-medium">
                                                            Will be deleted
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <Copy className="w-16 h-16 text-gray-300 dark:text-slate-600 mx-auto mb-4" />
                            <p className="text-gray-600 dark:text-slate-400 text-lg">No duplicate files found</p>
                            <p className="text-gray-500 dark:text-slate-500 text-sm mt-2">Your storage is well organized!</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {duplicates.length > 0 && (
                    <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
                        <div className="text-sm text-gray-600 dark:text-slate-400">
                            {selectedFiles.size} file(s) selected
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setSelectedFiles(new Set())}
                                className="px-4 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition font-medium"
                            >
                                Clear Selection
                            </button>
                            <button
                                onClick={handleDeleteSelected}
                                disabled={selectedFiles.size === 0}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                Delete Selected
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
