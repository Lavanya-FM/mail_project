import { useState, useEffect } from 'react';
import { Clock, File, Image, FileText, Music, Video, Archive, Star } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import driveService, { DriveFile } from '../lib/driveService';
import { authService } from '../lib/authService';

export default function RecentFilesView() {
    const { theme } = useTheme();
    const user = authService.getCurrentUser();
    const [recentFiles, setRecentFiles] = useState<DriveFile[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user?.id) {
            loadRecentFiles();
        }
    }, [user?.id]);

    const loadRecentFiles = async () => {
        setLoading(true);
        try {
            // Mock recent files
            const mockRecent: DriveFile[] = [
                {
                    id: 2001,
                    name: 'Q4 Financial Report.xlsx',
                    file_type: 'document',
                    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    size_bytes: 450000,
                    storage_path: '/documents/q4_report.xlsx',
                    created_at: '2024-12-01T10:00:00Z',
                    updated_at: '2024-12-04T09:30:00Z',
                    folder_id: 1,
                    user_id: user!.id,
                    is_starred: true,
                    is_deleted: false,
                    tags: ['finance', 'report']
                },
                {
                    id: 2002,
                    name: 'Project Demo.mp4',
                    file_type: 'video',
                    mime_type: 'video/mp4',
                    size_bytes: 25000000,
                    storage_path: '/videos/demo.mp4',
                    created_at: '2024-12-03T15:00:00Z',
                    updated_at: '2024-12-03T15:00:00Z',
                    folder_id: 2,
                    user_id: user!.id,
                    is_starred: false,
                    is_deleted: false,
                    tags: ['demo']
                },
                {
                    id: 2003,
                    name: 'Meeting Notes.txt',
                    file_type: 'document',
                    mime_type: 'text/plain',
                    size_bytes: 1200,
                    storage_path: '/documents/notes.txt',
                    created_at: '2024-12-04T11:00:00Z',
                    updated_at: '2024-12-04T11:00:00Z',
                    folder_id: 1,
                    user_id: user!.id,
                    is_starred: false,
                    is_deleted: false,
                    tags: ['meeting']
                }
            ];
            setRecentFiles(mockRecent);
        } catch (error) {
            console.error('Error loading recent files:', error);
        } finally {
            setLoading(false);
        }
    };

    const getIconComponent = (type: string) => {
        switch (type) {
            case 'image': return Image;
            case 'video': return Video;
            case 'audio': return Music;
            case 'archive': return Archive;
            case 'document': return FileText;
            case 'pdf': return FileText;
            default: return File;
        }
    };

    const getRelativeTime = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
        return date.toLocaleDateString();
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Loading recent files...</div>;
    }

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Clock className="w-5 h-5" />
                        Recent Files
                    </h2>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {recentFiles.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center">
                        <div className="w-32 h-32 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
                            <Clock className="w-16 h-16 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                            No recent files
                        </h3>
                        <p className="text-gray-600 dark:text-slate-400">
                            Files you view or edit will appear here
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {recentFiles.map((file) => {
                            const FileIcon = getIconComponent(file.file_type);
                            const fileColor = driveService.getFileColor(file.file_type);

                            return (
                                <div
                                    key={file.id}
                                    className="group relative bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-lg transition-all duration-300"
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="p-2 rounded-lg bg-gray-50 dark:bg-slate-700/50">
                                            <FileIcon className="w-8 h-8" style={{ color: fileColor }} />
                                        </div>
                                        {file.is_starred && (
                                            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                                        )}
                                    </div>
                                    <h3 className="font-medium text-gray-900 dark:text-white truncate mb-1" title={file.name}>
                                        {file.name}
                                    </h3>
                                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
                                        <span>{driveService.formatBytes(file.size_bytes)}</span>
                                        <span>{getRelativeTime(file.updated_at)}</span>
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
