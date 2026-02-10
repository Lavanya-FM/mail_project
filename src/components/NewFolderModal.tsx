import { X, FolderPlus } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useState } from 'react';
import * as driveService from '../lib/driveService';
import { authService } from '../lib/authService';

interface NewFolderModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRefresh: () => void;
    currentFolder: number | null;
}

export default function NewFolderModal({ isOpen, onClose, onRefresh, currentFolder }: NewFolderModalProps) {
    const { theme } = useTheme();
    const [folderName, setFolderName] = useState('');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');

    const user = authService.getCurrentUser();

    const handleCreate = async () => {
        if (!folderName.trim()) {
            setError('Please enter a folder name');
            return;
        }

        if (!user) {
            setError('You must be logged in to create folders');
            return;
        }

        setCreating(true);
        setError('');

        try {
            const result = await driveService.createFolder(user.id, currentFolder, folderName.trim());

            if (result.success) {
                setFolderName('');
                onRefresh?.();
                onClose?.();
            } else {
                setError(result.error || 'Failed to create folder');
            }
        } catch (err) {
            console.error('Create folder error:', err);
            setError('Failed to create folder. Please try again.');
        } finally {
            setCreating(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleCreate();
        } else if (e.key === 'Escape') {
            onClose?.();
        }
    };

    const handleClose = () => {
        setFolderName('');
        setError('');
        onClose?.();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
            <div className={`w-full max-w-md overflow-hidden rounded-[24px] shadow-2xl ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'} border border-gray-100 dark:border-slate-800`}>
                {/* Header */}
                <div className="flex items-center justify-between p-8 border-b border-gray-100 dark:border-slate-800">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-gradient-to-tr from-[#9c3ce7] to-[#f472b6] rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20">
                            <FolderPlus className="w-7 h-7 text-white" />
                        </div>
                        <div>
                            <h2 className="text-[22px] font-bold text-gray-900 dark:text-white leading-tight">New Folder</h2>
                            <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Create a new folder</p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors text-gray-400"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-8">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2.5">
                        Folder Name
                    </label>
                    <div className="relative">
                        <input
                            type="text"
                            value={folderName}
                            onChange={(e) => setFolderName(e.target.value)}
                            onKeyDown={handleKeyPress}
                            placeholder="Enter folder name..."
                            autoFocus
                            className="w-full px-5 py-4 bg-white dark:bg-slate-800 border-2 border-gray-100 dark:border-slate-700 rounded-2xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-base"
                        />
                    </div>
                    {error && (
                        <p className="mt-2.5 text-sm text-red-500 font-medium ml-1">
                            {error}
                        </p>
                    )}
                    <p className="mt-3 text-[13px] text-gray-400 dark:text-slate-500 font-medium ml-1">
                        Press Enter to create or Esc to cancel
                    </p>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-8 border-t border-gray-50 dark:border-slate-800/50">
                    <button
                        onClick={handleClose}
                        disabled={creating}
                        className="px-6 py-3 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors font-bold text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={!folderName.trim() || creating}
                        className="px-7 py-3.5 bg-gradient-to-r from-[#d8b4fe] to-[#f472b6] text-white rounded-2xl hover:opacity-90 transition-all font-bold shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2.5 text-sm"
                    >
                        {creating ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        ) : (
                            <FolderPlus className="w-5 h-5" />
                        )}
                        <span>{creating ? 'Creating...' : 'Create Folder'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
