import { X, FolderPlus } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useState } from 'react';

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

    const handleCreate = async () => {
        if (!folderName.trim()) {
            alert('Please enter a folder name');
            return;
        }

        setCreating(true);

        // Simulate folder creation
        setTimeout(() => {
            alert(`Folder creation will be implemented by backend team.\nCreating folder: "${folderName}"`);
            setCreating(false);
            setFolderName('');
            onRefresh();
            onClose();
        }, 500);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleCreate();
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className={`w-full max-w-md overflow-hidden rounded-2xl shadow-2xl ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'}`}>
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl">
                            <FolderPlus className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">New Folder</h2>
                            <p className="text-sm text-gray-600 dark:text-slate-400">Create a new folder</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition"
                    >
                        <X className="w-6 h-6 text-gray-600 dark:text-slate-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        Folder Name
                    </label>
                    <input
                        type="text"
                        value={folderName}
                        onChange={(e) => setFolderName(e.target.value)}
                        onKeyDown={handleKeyPress}
                        placeholder="Enter folder name..."
                        autoFocus
                        className="w-full px-4 py-3 bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                    <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
                        Press Enter to create or Esc to cancel
                    </p>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
                    <button
                        onClick={onClose}
                        disabled={creating}
                        className="px-4 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={!folderName.trim() || creating}
                        className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {creating ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                Creating...
                            </>
                        ) : (
                            <>
                                <FolderPlus className="w-4 h-4" />
                                Create Folder
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
