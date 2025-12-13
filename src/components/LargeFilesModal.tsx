import { X, FileArchive, Trash2, Download, AlertTriangle } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import storageService, { LargeFile } from '../lib/storageService';
import * as driveService from "../lib/driveService";
import { useEffect, useState } from 'react';

interface LargeFilesModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: number;
    onRefresh: () => void;
}

export default function LargeFilesModal({ isOpen, onClose, userId, onRefresh }: LargeFilesModalProps) {
    const { theme } = useTheme();
    const [largeFiles, setLargeFiles] = useState<LargeFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());

    useEffect(() => {
        if (isOpen) {
            loadLargeFiles();
        }
    }, [isOpen]);

    const loadLargeFiles = async () => {
        setLoading(true);
        try {
            const data = await storageService.findLargeFiles(userId, 5000000); // Files over 5MB
            setLargeFiles(data);
        } catch (error) {
            console.error('Error loading large files:', error);
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

    const handleCompressSelected = () => {
        if (selectedFiles.size === 0) {
            alert('Please select files to compress');
            return;
        }
        alert(`Compression feature will be implemented by backend team.\nSelected ${selectedFiles.size} file(s) for compression.`);
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
            loadLargeFiles();
            onRefresh?.();
        }
    };

    if (!isOpen) return null;

    const totalSize = largeFiles.reduce((sum, file) => sum + file.size_bytes, 0);
    const selectedSize = largeFiles
        .filter(file => selectedFiles.has(file.id))
        .reduce((sum, file) => sum + file.size_bytes, 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className={`w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'}`}>
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-600 rounded-xl">
                            <FileArchive className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Large Files</h2>
                            <p className="text-sm text-gray-600 dark:text-slate-400">
                                {largeFiles.length} large file(s) • Total size: {storageService.formatBytes(totalSize)}
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
                            <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-200 dark:border-orange-800 border-t-orange-600 dark:border-t-orange-400"></div>
                        </div>
                    ) : largeFiles.length > 0 ? (
                        <div className="space-y-2">
                            {largeFiles.map((file) => (
                                <div
                                    key={file.id}
                                    className={`p-4 rounded-lg border-2 transition cursor-pointer ${selectedFiles.has(file.id)
                                            ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                                            : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-500'
                                        }`}
                                    onClick={() => toggleFileSelection(file.id)}
                                >
                                    <div className="flex items-center gap-4">
                                        <input
                                            type="checkbox"
                                            checked={selectedFiles.has(file.id)}
                                            onChange={() => toggleFileSelection(file.id)}
                                            className="w-5 h-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                                            onClick={(e) => e.stopPropagation()}
                                        />

                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <p className="font-medium text-gray-900 dark:text-white">{file.name}</p>
                                                {file.size_bytes > 50000000 && (
                                                    <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs rounded-full flex items-center gap-1">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        Very Large
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-slate-400">
                                                <span className="font-semibold text-orange-600 dark:text-orange-400">
                                                    {storageService.formatBytes(file.size_bytes)}
                                                </span>
                                                <span>•</span>
                                                <span className="capitalize">{file.file_type}</span>
                                                <span>•</span>
                                                <span>Created {new Date(file.created_at).toLocaleDateString()}</span>
                                            </div>

                                            {/* Potential savings */}
                                            <div className="mt-2 text-sm text-green-600 dark:text-green-400">
                                                Potential savings: ~{storageService.formatBytes(file.size_bytes * 0.3)} (30% compression)
                                            </div>
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    alert('Download functionality will be implemented by backend team');
                                                }}
                                                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition"
                                                title="Download"
                                            >
                                                <Download className="w-5 h-5 text-gray-600 dark:text-slate-400" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <FileArchive className="w-16 h-16 text-gray-300 dark:text-slate-600 mx-auto mb-4" />
                            <p className="text-gray-600 dark:text-slate-400 text-lg">No large files found</p>
                            <p className="text-gray-500 dark:text-slate-500 text-sm mt-2">All your files are reasonably sized!</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {largeFiles.length > 0 && (
                    <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
                        <div className="text-sm text-gray-600 dark:text-slate-400">
                            {selectedFiles.size} file(s) selected • {storageService.formatBytes(selectedSize)}
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setSelectedFiles(new Set())}
                                className="px-4 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition font-medium"
                            >
                                Clear Selection
                            </button>
                            <button
                                onClick={handleCompressSelected}
                                disabled={selectedFiles.size === 0}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <FileArchive className="w-4 h-4" />
                                Compress Selected
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
