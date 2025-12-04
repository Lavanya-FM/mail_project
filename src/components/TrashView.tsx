import { useState, useEffect } from 'react';
import { Trash2, RotateCcw, X, AlertTriangle, Clock, File, Image, FileText, Music, Video, Archive } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import driveService, { DriveFile } from '../lib/driveService';
import { authService } from '../lib/authService';

interface TrashItem extends DriveFile {
    deleted_at: string;
    days_until_delete: number;
}

export default function TrashView() {
    const { theme } = useTheme();
    const user = authService.getCurrentUser();
    const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());

    useEffect(() => {
        loadTrashItems();
    }, []);

    const loadTrashItems = async () => {
        setLoading(true);
        try {
            setTrashItems([]);
        } catch (error) {
            console.error('Error loading trash items:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async () => {
        if (selectedItems.size === 0) return;

        if (confirm(`Restore ${selectedItems.size} item(s)?`)) {
            // Mock restore
            setTrashItems(prev => prev.filter(item => !selectedItems.has(item.id)));
            setSelectedItems(new Set());
        }
    };

    const handlePermanentDelete = async () => {
        if (selectedItems.size === 0) return;

        if (confirm(`Permanently delete ${selectedItems.size} item(s)? This cannot be undone.`)) {
            // Mock delete
            setTrashItems(prev => prev.filter(item => !selectedItems.has(item.id)));
            setSelectedItems(new Set());
        }
    };

    const handleEmptyTrash = async () => {
        if (confirm('Are you sure you want to empty the trash? All items will be permanently deleted.')) {
            setTrashItems([]);
            setSelectedItems(new Set());
        }
    };

    const toggleSelectItem = (id: number) => {
        const newSelected = new Set(selectedItems);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedItems(newSelected);
    };

    const selectAll = () => {
        if (selectedItems.size === trashItems.length) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(trashItems.map(item => item.id)));
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Loading trash...</div>;
    }

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Trash2 className="w-5 h-5" />
                        Trash
                    </h2>
                    <span className="text-sm text-gray-500 dark:text-slate-400 hidden sm:inline">
                        Items in trash are deleted forever after 30 days
                    </span>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                    {selectedItems.size > 0 ? (
                        <>
                            <button
                                onClick={handleRestore}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition"
                            >
                                <RotateCcw className="w-4 h-4" />
                                Restore
                            </button>
                            <button
                                onClick={handlePermanentDelete}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                            >
                                <X className="w-4 h-4" />
                                Delete Forever
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={handleEmptyTrash}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition"
                            disabled={trashItems.length === 0}
                        >
                            <Trash2 className="w-4 h-4" />
                            Empty Trash
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {trashItems.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center">
                        <div className="w-32 h-32 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
                            <Trash2 className="w-16 h-16 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                            Trash is empty
                        </h3>
                        <p className="text-gray-600 dark:text-slate-400">
                            Deleted files will appear here
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <div className="flex items-center gap-4 px-4 py-2 text-sm font-medium text-gray-500 dark:text-slate-400 border-b border-gray-200 dark:border-slate-700">
                            <input
                                type="checkbox"
                                checked={selectedItems.size === trashItems.length && trashItems.length > 0}
                                onChange={selectAll}
                                className="w-4 h-4 text-blue-600 rounded"
                            />
                            <span className="flex-1">Name</span>
                            <span className="hidden sm:block w-32">Date Deleted</span>
                            <span className="hidden sm:block w-32">Size</span>
                        </div>
                        {trashItems.map((item) => {
                            const getIconComponent = (type: string) => {
                                switch (type) {
                                    case 'image': return Image;
                                    case 'video': return Video;
                                    case 'audio': return Music;
                                    case 'archive': return Archive;
                                    case 'pdf': return FileText;
                                    default: return File;
                                }
                            };
                            const FileIcon = getIconComponent(item.file_type);
                            const fileColor = driveService.getFileColor(item.file_type);
                            const isSelected = selectedItems.has(item.id);

                            return (
                                <div
                                    key={item.id}
                                    className={`flex items-center gap-4 p-4 rounded-lg border-2 transition ${isSelected
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                        : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                                        }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleSelectItem(item.id)}
                                        className="w-4 h-4 text-blue-600 rounded"
                                    />
                                    <FileIcon className="w-8 h-8 flex-shrink-0" style={{ color: fileColor }} />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-gray-900 dark:text-white truncate">
                                            {item.name}
                                        </p>
                                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
                                            <AlertTriangle className="w-3 h-3 text-orange-500" />
                                            <span>Deletes in {item.days_until_delete} days</span>
                                        </div>
                                    </div>
                                    <div className="hidden sm:block w-32 text-sm text-gray-500 dark:text-slate-400">
                                        {new Date(item.deleted_at).toLocaleDateString()}
                                    </div>
                                    <div className="hidden sm:block w-32 text-sm text-gray-500 dark:text-slate-400">
                                        {driveService.formatFileSize(item.size_bytes)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
