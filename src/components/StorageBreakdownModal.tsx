import { X, HardDrive, FileText, Image as ImageIcon, Video, Music, Archive, TrendingUp, Calendar } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import storageService, { StorageBreakdown } from '../lib/storageService';
import { useEffect, useState } from 'react';

interface StorageBreakdownModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: number;
}

export default function StorageBreakdownModal({ isOpen, onClose, userId }: StorageBreakdownModalProps) {
    const { theme } = useTheme();
    const [breakdown, setBreakdown] = useState<StorageBreakdown | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen) {
            loadBreakdown();
        }
    }, [isOpen]);

    const loadBreakdown = async () => {
        setLoading(true);
        try {
            const data = await storageService.getStorageBreakdown(userId);
            setBreakdown(data);
        } catch (error) {
            console.error('Error loading storage breakdown:', error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const typeIcons: Record<string, any> = {
        'Images': ImageIcon,
        'Videos': Video,
        'Documents': FileText,
        'Audio': Music,
        'Archives': Archive,
        'Others': HardDrive
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className={`w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'}`}>
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl">
                            <HardDrive className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Storage Breakdown</h2>
                            <p className="text-sm text-gray-600 dark:text-slate-400">Detailed analysis of your storage usage</p>
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
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 dark:border-t-blue-400"></div>
                        </div>
                    ) : breakdown ? (
                        <div className="space-y-6">
                            {/* By File Type */}
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                    Storage by File Type
                                </h3>
                                <div className="space-y-3">
                                    {breakdown.by_type.map((type, index) => {
                                        const Icon = typeIcons[type.type] || HardDrive;
                                        return (
                                            <div key={index} className="p-4 bg-gray-50 dark:bg-slate-800 rounded-xl">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 rounded-lg" style={{ backgroundColor: type.color + '20' }}>
                                                            <Icon className="w-5 h-5" style={{ color: type.color }} />
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-gray-900 dark:text-white">{type.type}</p>
                                                            <p className="text-sm text-gray-600 dark:text-slate-400">{type.file_count} files</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-semibold text-gray-900 dark:text-white">
                                                            {storageService.formatBytes(type.size_bytes)}
                                                        </p>
                                                        <p className="text-sm text-gray-600 dark:text-slate-400">{type.percentage.toFixed(1)}%</p>
                                                    </div>
                                                </div>
                                                <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                                                    <div
                                                        className="h-2 rounded-full transition-all duration-500"
                                                        style={{ width: `${type.percentage}%`, backgroundColor: type.color }}
                                                    ></div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* By Folder */}
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                    <Archive className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                    Storage by Folder
                                </h3>
                                <div className="space-y-2">
                                    {breakdown.by_folder.map((folder, index) => (
                                        <div key={index} className="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg flex items-center justify-between">
                                            <div className="flex-1">
                                                <p className="font-medium text-gray-900 dark:text-white">{folder.folder_name}</p>
                                                <p className="text-sm text-gray-600 dark:text-slate-400">{folder.file_count} files</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold text-gray-900 dark:text-white">
                                                    {storageService.formatBytes(folder.size_bytes)}
                                                </p>
                                                <p className="text-sm text-gray-600 dark:text-slate-400">{folder.percentage.toFixed(1)}%</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Storage Timeline */}
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                                    Storage Growth Timeline
                                </h3>
                                <div className="space-y-2">
                                    {breakdown.timeline.map((point, index) => (
                                        <div key={index} className="flex items-center gap-3">
                                            <Calendar className="w-4 h-4 text-gray-400" />
                                            <span className="text-sm text-gray-600 dark:text-slate-400 w-24">
                                                {new Date(point.date).toLocaleDateString()}
                                            </span>
                                            <div className="flex-1 bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                                                <div
                                                    className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-500"
                                                    style={{ width: `${(point.size_bytes / 5368709120) * 100}%` }}
                                                ></div>
                                            </div>
                                            <span className="text-sm font-medium text-gray-900 dark:text-white w-20 text-right">
                                                {storageService.formatBytes(point.size_bytes)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <p className="text-gray-600 dark:text-slate-400">Failed to load storage breakdown</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
