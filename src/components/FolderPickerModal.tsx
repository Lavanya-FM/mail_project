import { useState, useEffect } from 'react';
import { X, Folder, ChevronRight, Check, Search, Loader2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import * as driveService from '../lib/driveService';
import { DriveFolder } from '../lib/driveService';
import { authService } from '../lib/authService';

interface FolderPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    onSelect: (folderId: number | null) => void;
    actionLabel: string;
}

export default function FolderPickerModal({ isOpen, onClose, title, onSelect, actionLabel }: FolderPickerModalProps) {
    const { theme } = useTheme();
    const [folders, setFolders] = useState<DriveFolder[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
    const [path, setPath] = useState<{ id: number | null; name: string }[]>([{ id: null, name: 'My Drive' }]);

    const user = authService.getCurrentUser();

    useEffect(() => {
        if (isOpen) {
            loadFolders(path[path.length - 1].id);
        }
    }, [isOpen, path]);

    const loadFolders = async (parentId: number | null) => {
        setLoading(true);
        try {
            const data = await driveService.getFolders(user?.id || 1, parentId);
            setFolders(data);
        } catch (error) {
            console.error('Failed to load folders:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleFolderClick = (folder: DriveFolder) => {
        setPath([...path, { id: folder.id, name: folder.name }]);
        setSelectedFolderId(folder.id);
    };

    const handleBreadcrumbClick = (idx: number) => {
        const newPath = path.slice(0, idx + 1);
        setPath(newPath);
        setSelectedFolderId(newPath[newPath.length - 1].id);
    };

    const handleSelect = () => {
        onSelect(selectedFolderId);
        onClose();
    };

    if (!isOpen) return null;

    const filteredFolders = folders.filter(f =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className={`w-full max-w-lg overflow-hidden rounded-[28px] shadow-2xl ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'} border border-gray-100 dark:border-slate-800 flex flex-col max-h-[80vh]`}>
                {/* Header */}
                <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
                        <p className="text-sm text-gray-500 mt-0.5">Choose a destination folder</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors text-gray-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Path bar */}
                <div className="px-6 py-3 border-b border-gray-50 dark:border-slate-800/50 flex items-center gap-1 overflow-x-auto no-scrollbar bg-gray-50/50 dark:bg-slate-800/30">
                    {path.map((p, idx) => (
                        <div key={idx} className="flex items-center flex-shrink-0">
                            <button
                                onClick={() => handleBreadcrumbClick(idx)}
                                className={`text-xs font-medium px-2 py-1 rounded-md transition-colors ${idx === path.length - 1 ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
                            >
                                {p.name}
                            </button>
                            {idx < path.length - 1 && <ChevronRight className="w-3 h-3 text-gray-300 mx-0.5" />}
                        </div>
                    ))}
                </div>

                {/* Search */}
                <div className="p-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search folders..."
                            className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-slate-800 border-transparent rounded-xl text-sm focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                {/* Folders List */}
                <div className="flex-1 overflow-y-auto px-2 pb-4 min-h-[300px]">
                    {loading ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                            <p className="text-sm font-medium">Loading folders...</p>
                        </div>
                    ) : filteredFolders.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8">
                            <Folder className="w-12 h-12 opacity-20 mb-3" />
                            <p className="text-sm font-medium">No folders found in this location</p>
                        </div>
                    ) : (
                        <div className="space-y-0.5">
                            {filteredFolders.map((folder) => (
                                <div
                                    key={folder.id}
                                    className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all group ${selectedFolderId === folder.id ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-slate-800/50'}`}
                                    onClick={() => setSelectedFolderId(folder.id)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                                            <Folder className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm text-gray-900 dark:text-white">{folder.name}</p>
                                            <p className="text-[11px] text-gray-400 font-medium">Updated {new Date(folder.updated_at).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-gray-400 transition-colors opacity-0 group-hover:opacity-100"
                                            onClick={(e) => { e.stopPropagation(); handleFolderClick(folder); }}
                                        >
                                            <ChevronRight className="w-5 h-5" />
                                        </button>
                                        {selectedFolderId === folder.id && (
                                            <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                                                <Check className="w-3 h-3 text-white" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between bg-gray-50/50 dark:bg-slate-800/30">
                    <p className="text-xs text-gray-500 font-medium whitespace-nowrap overflow-hidden text-ellipsis mr-4">
                        Destination: <span className="text-gray-900 dark:text-white">{path[path.length - 1].name}</span>
                    </p>
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                            Cancel
                        </button>
                        <button
                            onClick={handleSelect}
                            className="px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-2"
                        >
                            <Check className="w-4 h-4" />
                            {actionLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
