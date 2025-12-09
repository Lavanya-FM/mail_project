import { useState } from 'react';
import { X, HardDrive, Folder, File, Check } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import * as driveService from "../lib/driveService";
import type { DriveFile } from "../lib/driveService";
import { authService } from '../lib/authService';

interface AttachFromDriveModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAttach: (files: DriveFile[]) => void;
}

export default function AttachFromDriveModal({ isOpen, onClose, onAttach }: AttachFromDriveModalProps) {
    const { theme } = useTheme();
    const user = authService.getCurrentUser();
    const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
    const [currentFolder, setCurrentFolder] = useState<number | null>(null);
    const [files, setFiles] = useState<DriveFile[]>([]);
    const [folders, setFolders] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [shareAsLink, setShareAsLink] = useState(true);

    useState(() => {
        if (isOpen && user) {
            loadFiles();
        }
    });

    const loadFiles = async () => {
        setLoading(true);
        try {
            const contents = await driveService.getFolderContents(currentFolder);
            setFiles(contents.files);
            setFolders(contents.folders);
        } catch (error) {
            console.error('Error loading files:', error);
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

    const handleAttach = () => {
        const filesToAttach = files.filter(f => selectedFiles.has(f.id));
        onAttach(filesToAttach);
        setSelectedFiles(new Set());
        onClose();
    };

    if (!isOpen) return null;

    const selectedFilesArray = files.filter(f => selectedFiles.has(f.id));
    const totalSize = selectedFilesArray.reduce((sum, f) => sum + f.size_bytes, 0);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className={`w-full max-w-4xl max-h-[80vh] overflow-hidden rounded-2xl shadow-2xl ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Attach from JeeDrive</h2>
                        <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                            Select files to attach to your email
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition"
                    >
                        <X className="w-6 h-6 text-gray-600 dark:text-slate-400" />
                    </button>
                </div>

                {/* Share Option Toggle */}
                <div className="px-6 py-4 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-slate-700">
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                checked={shareAsLink}
                                onChange={() => setShareAsLink(true)}
                                className="w-4 h-4 text-blue-600"
                            />
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                                Share as link (recommended)
                            </span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                checked={!shareAsLink}
                                onChange={() => setShareAsLink(false)}
                                className="w-4 h-4 text-blue-600"
                            />
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                                Attach as file
                            </span>
                        </label>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-slate-400 mt-2">
                        {shareAsLink
                            ? '📎 Recipients will get a link to access the file (saves email storage)'
                            : '📁 File will be attached directly to the email'}
                    </p>
                </div>

                {/* File Browser */}
                <div className="p-6 overflow-y-auto max-h-[400px]">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 dark:border-t-blue-400"></div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {/* Folders */}
                            {folders.map((folder) => (
                                <div
                                    key={`folder-${folder.id}`}
                                    onClick={() => {
                                        setCurrentFolder(folder.id);
                                        loadFiles();
                                    }}
                                    className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer transition"
                                >
                                    <Folder className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                    <span className="flex-1 font-medium text-gray-900 dark:text-white">{folder.name}</span>
                                    <span className="text-xs text-gray-500 dark:text-slate-400">{folder.file_count} files</span>
                                </div>
                            ))}

                            {/* Files */}
                            {files.map((file) => {
                                const isSelected = selectedFiles.has(file.id);
                                return (
                                    <div
                                        key={`file-${file.id}`}
                                        onClick={() => toggleFileSelection(file.id)}
                                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition ${isSelected
                                                ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500'
                                                : 'bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 hover:border-blue-500'
                                            }`}
                                    >
                                        <div className="flex-shrink-0">
                                            {isSelected ? (
                                                <div className="w-5 h-5 bg-blue-600 rounded flex items-center justify-center">
                                                    <Check className="w-3 h-3 text-white" />
                                                </div>
                                            ) : (
                                                <div className="w-5 h-5 border-2 border-gray-300 dark:border-slate-600 rounded"></div>
                                            )}
                                        </div>
                                        <File className="w-5 h-5" style={{ color: driveService.getFileColor(file.file_type) }} />
                                        <div className="flex-1">
                                            <p className="font-medium text-gray-900 dark:text-white">{file.name}</p>
                                            <p className="text-xs text-gray-500 dark:text-slate-400">
                                                {driveService.formatFileSize(file.size_bytes)}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}

                            {files.length === 0 && folders.length === 0 && (
                                <div className="text-center py-12">
                                    <HardDrive className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                                    <p className="text-gray-600 dark:text-slate-400">No files in this folder</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
                    <div className="text-sm text-gray-600 dark:text-slate-400">
                        {selectedFiles.size > 0 ? (
                            <>
                                <span className="font-medium text-gray-900 dark:text-white">{selectedFiles.size}</span> file(s) selected
                                {' · '}
                                <span className="font-medium text-gray-900 dark:text-white">
                                    {driveService.formatFileSize(totalSize)}
                                </span>
                            </>
                        ) : (
                            'No files selected'
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleAttach}
                            disabled={selectedFiles.size === 0}
                            className="px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg hover:from-blue-600 hover:to-cyan-600 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                            Attach {selectedFiles.size > 0 && `(${selectedFiles.size})`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
