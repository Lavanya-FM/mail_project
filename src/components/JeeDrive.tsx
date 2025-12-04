import { useState, useEffect } from 'react';
import {
    HardDrive, FolderPlus, Upload, Grid3x3, List, Search, Star,
    Clock, Trash2, Share2, Download, MoreVertical, File, Folder,
    Image, Video, FileText, Archive, Music, ChevronRight, Home,
    TrendingUp, Leaf, Sparkles, BarChart3, Filter, SortAsc, Eye,
    X, Check, Tag as TagIcon, Users, Mail
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import driveService, { DriveFile, DriveFolder } from '../lib/driveService';
import storageService, { StorageQuota, OptimizationSuggestion } from '../lib/storageService';
import { authService } from '../lib/authService';
import StorageBreakdownModal from './StorageBreakdownModal';
import DuplicateFilesModal from './DuplicateFilesModal';
import LargeFilesModal from './LargeFilesModal';
import FileUploadModal from './FileUploadModal';
import NewFolderModal from './NewFolderModal';
import StorageAnalytics from './StorageAnalytics';
import FilePreviewModal from './FilePreviewModal';
import ShareFileModal from './ShareFileModal';
import RecentFilesView from './RecentFilesView';
import TrashView from './TrashView';

type ViewMode = 'grid' | 'list';
type SortBy = 'name' | 'date' | 'size' | 'type';

interface JeeDriveProps {
    onSwitchToMail?: () => void;
}

export default function JeeDrive({ onSwitchToMail }: JeeDriveProps) {
    const { theme } = useTheme();
    const user = authService.getCurrentUser();

    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [sortBy, setSortBy] = useState<SortBy>('name');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentFolder, setCurrentFolder] = useState<number | null>(null);
    const [breadcrumbs, setBreadcrumbs] = useState<{ id: number | null; name: string }[]>([{ id: null, name: 'My Drive' }]);

    const [files, setFiles] = useState<DriveFile[]>([]);
    const [folders, setFolders] = useState<DriveFolder[]>([]);
    const [quota, setQuota] = useState<StorageQuota | null>(null);
    const [suggestions, setSuggestions] = useState<OptimizationSuggestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
    const [showStorageBreakdown, setShowStorageBreakdown] = useState(false);
    const [showDuplicates, setShowDuplicates] = useState(false);
    const [showLargeFiles, setShowLargeFiles] = useState(false);
    const [showUpload, setShowUpload] = useState(false);
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [showAnalytics, setShowAnalytics] = useState(false);
    const [activeFilter, setActiveFilter] = useState<'all' | 'starred' | 'recent' | 'shared'>('all');
    const [showPreview, setShowPreview] = useState(false);
    const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
    const [showShare, setShowShare] = useState(false);
    const [shareFile, setShareFile] = useState<DriveFile | null>(null);
    const [activeTab, setActiveTab] = useState<'drive' | 'recent' | 'trash'>('drive');

    useEffect(() => {
        loadDriveData();
    }, [currentFolder, activeFilter]);

    const loadDriveData = async () => {
        // setLoading(true); // Removed to prevent blocking UI on every click
        try {
            const userId = user?.id || 1;

            // Load based on active filter
            let filesData: DriveFile[];
            if (activeFilter === 'starred') {
                filesData = await driveService.getStarredFiles(userId);
            } else if (activeFilter === 'recent') {
                filesData = await driveService.getRecentFiles(userId, 20);
            } else {
                const contents = await driveService.getFolderContents(currentFolder);
                filesData = contents.files;
                setFolders(contents.folders);
            }

            setFiles(filesData);

            // Load quota and suggestions
            const [quotaData, suggestionsData] = await Promise.all([
                storageService.getUserQuota(userId),
                storageService.getOptimizationSuggestions(userId)
            ]);

            setQuota(quotaData);
            setSuggestions(suggestionsData);
        } catch (error) {
            console.error('Error loading drive data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleFolderClick = (folder: DriveFolder) => {
        setCurrentFolder(folder.id);
        setBreadcrumbs([...breadcrumbs, { id: folder.id, name: folder.name }]);
        setActiveFilter('all');
    };

    const handleBreadcrumbClick = (index: number) => {
        const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
        setBreadcrumbs(newBreadcrumbs);
        setCurrentFolder(newBreadcrumbs[newBreadcrumbs.length - 1].id);
        setActiveFilter('all');
    };

    const handleStarFile = async (fileId: number, starred: boolean) => {
        await driveService.toggleStarFile(fileId, starred);
        loadDriveData();
    };

    const handleDeleteFile = async (fileId: number) => {
        if (confirm('Move this file to trash?')) {
            await driveService.deleteFile(fileId);
            loadDriveData();
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

    const getFileIcon = (file: DriveFile) => {
        const iconMap: Record<string, any> = {
            'image': Image,
            'video': Video,
            'document': FileText,
            'archive': Archive,
            'audio': Music
        };
        const Icon = iconMap[file.file_type] || File;
        return <Icon className="w-8 h-8" style={{ color: driveService.getFileColor(file.file_type) }} />;
    };

    const filteredFiles = files.filter(file =>
        file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        file.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const sortedFiles = [...filteredFiles].sort((a, b) => {
        switch (sortBy) {
            case 'name':
                return a.name.localeCompare(b.name);
            case 'date':
                return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
            case 'size':
                return b.size_bytes - a.size_bytes;
            case 'type':
                return a.file_type.localeCompare(b.file_type);
            default:
                return 0;
        }
    });

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950">
                <div className="text-center">
                    <div className="relative">
                        <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 dark:border-t-blue-400 mx-auto"></div>
                        <HardDrive className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-blue-600 dark:text-blue-400 animate-pulse" />
                    </div>
                    <p className="mt-6 text-lg font-medium bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
                        Loading JeeDrive...
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className={`flex-1 flex flex-col overflow-hidden ${theme === 'dark' ? 'bg-slate-950' : 'bg-gray-50'}`}>
            {/* Premium Header */}
            <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border-b border-gray-200/50 dark:border-slate-700/50 shadow-lg">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl blur-lg opacity-50 animate-pulse"></div>
                                <div className="relative bg-gradient-to-r from-blue-600 to-cyan-600 p-3 rounded-2xl shadow-xl">
                                    <HardDrive className="w-6 h-6 text-white" />
                                </div>
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-cyan-600 to-purple-600 bg-clip-text text-transparent">
                                    JeeDrive
                                </h1>
                                <p className="text-sm text-gray-600 dark:text-slate-400">Cloud Storage & File Management</p>
                            </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="flex items-center gap-3">
                            {onSwitchToMail && (
                                <button
                                    onClick={onSwitchToMail}
                                    className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-2 border-gray-200 dark:border-slate-700 rounded-xl hover:border-blue-500 dark:hover:border-blue-500 transition-all duration-300 font-medium"
                                >
                                    <Mail className="w-4 h-4" />
                                    Mail
                                </button>
                            )}
                            <button
                                onClick={() => setShowUpload(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 font-medium"
                            >
                                <Upload className="w-4 h-4" />
                                Upload
                            </button>
                            <button
                                onClick={() => setShowNewFolder(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-2 border-gray-200 dark:border-slate-700 rounded-xl hover:border-blue-500 dark:hover:border-blue-500 transition-all duration-300 font-medium"
                            >
                                <FolderPlus className="w-4 h-4" />
                                New Folder
                            </button>
                        </div>
                    </div>

                    {/* Tab Navigation */}
                    <div className="flex gap-2 mt-6 border-b border-gray-200 dark:border-slate-700">
                        <button
                            onClick={() => setActiveTab('drive')}
                            className={`px-4 py-2 font-medium transition-all ${activeTab === 'drive'
                                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <HardDrive className="w-4 h-4" />
                                My Drive
                            </div>
                        </button>
                        <button
                            onClick={() => setActiveTab('recent')}
                            className={`px-4 py-2 font-medium transition-all ${activeTab === 'recent'
                                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                Recent
                            </div>
                        </button>
                        <button
                            onClick={() => setActiveTab('trash')}
                            className={`px-4 py-2 font-medium transition-all ${activeTab === 'trash'
                                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <Trash2 className="w-4 h-4" />
                                Trash
                            </div>
                        </button>
                    </div>

                    {/* Storage Overview Bar */}
                    {quota && (
                        <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-xl border border-blue-200/50 dark:border-blue-800/50">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <HardDrive className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                    <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                                        Storage: {storageService.formatBytes(quota.used_bytes)} of {storageService.formatBytes(quota.quota_bytes)}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setShowStorageBreakdown(true)}
                                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium flex items-center gap-1"
                                >
                                    <BarChart3 className="w-4 h-4" />
                                    View Details
                                </button>
                            </div>
                            <div className="relative w-full h-3 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-blue-500 to-cyan-500"
                                    style={{ width: `${quota.percentage_used}%` }}
                                ></div>
                            </div>
                            <div className="flex items-center justify-between mt-2">
                                <span className="text-xs text-gray-600 dark:text-slate-400">
                                    {quota.percentage_used.toFixed(1)}% used
                                </span>
                                <span className="text-xs text-gray-600 dark:text-slate-400">
                                    {storageService.formatBytes(quota.available_bytes)} available
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </header>

            <div className="flex-1 overflow-y-auto">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    {/* Optimization Suggestions */}
                    {suggestions.length > 0 && (
                        <div className="mb-6 space-y-3">
                            {suggestions.slice(0, 2).map((suggestion, index) => (
                                <div
                                    key={index}
                                    className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl border border-green-200/50 dark:border-green-800/50 flex items-start gap-3"
                                >
                                    <Sparkles className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                        <h3 className="font-semibold text-gray-900 dark:text-white">{suggestion.title}</h3>
                                        <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">{suggestion.description}</p>
                                        <p className="text-sm text-green-600 dark:text-green-400 font-medium mt-2">
                                            Potential savings: {storageService.formatBytes(suggestion.potential_savings)}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (suggestion.type === 'duplicate') {
                                                setShowDuplicates(true);
                                            } else if (suggestion.type === 'large_file') {
                                                setShowLargeFiles(true);
                                            } else {
                                                alert(`${suggestion.action} - This feature will be implemented by the backend team.`);
                                            }
                                        }}
                                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium"
                                    >
                                        {suggestion.action}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Toolbar */}
                    <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        {/* Breadcrumbs */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {breadcrumbs.map((crumb, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    {index > 0 && <ChevronRight className="w-4 h-4 text-gray-400" />}
                                    <button
                                        onClick={() => handleBreadcrumbClick(index)}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition ${index === breadcrumbs.length - 1
                                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                                            : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800'
                                            }`}
                                    >
                                        {index === 0 && <Home className="w-4 h-4" />}
                                        {crumb.name}
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* View Controls */}
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search files..."
                                    className="pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-1">
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={`p-2 rounded transition ${viewMode === 'grid'
                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                        : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700'
                                        }`}
                                >
                                    <Grid3x3 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`p-2 rounded transition ${viewMode === 'list'
                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                        : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700'
                                        }`}
                                >
                                    <List className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Quick Filters */}
                    <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-2">
                        {[
                            { id: 'all', label: 'All Files', icon: File },
                            { id: 'starred', label: 'Starred', icon: Star },
                            { id: 'recent', label: 'Recent', icon: Clock },
                            { id: 'shared', label: 'Shared', icon: Users }
                        ].map((filter) => {
                            const Icon = filter.icon;
                            return (
                                <button
                                    key={filter.id}
                                    onClick={() => setActiveFilter(filter.id as any)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition whitespace-nowrap ${activeFilter === filter.id
                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-2 border-blue-500'
                                        : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-slate-700 hover:border-blue-500'
                                        }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {filter.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Tab Content */}
                    {activeTab === 'drive' && (
                        <>
                            {/* Files and Folders Grid/List */}
                            {viewMode === 'grid' ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                    {/* Folders */}
                                    {activeFilter === 'all' && folders.map((folder) => (
                                        <div
                                            key={`folder-${folder.id}`}
                                            onClick={() => handleFolderClick(folder)}
                                            className="group p-4 bg-white dark:bg-slate-800 rounded-xl border-2 border-gray-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 transition-all duration-300 cursor-pointer hover:shadow-lg hover:scale-105"
                                        >
                                            <div className="flex flex-col items-center text-center">
                                                <Folder
                                                    className="w-12 h-12 mb-3 group-hover:scale-110 transition-transform"
                                                    style={{ color: folder.color || '#6b7280' }}
                                                />
                                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate w-full">
                                                    {folder.name}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                                                    {folder.file_count} files
                                                </p>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Files */}
                                    {sortedFiles.map((file) => (
                                        <div
                                            key={`file-${file.id}`}
                                            onClick={() => {
                                                setPreviewFile(file);
                                                setShowPreview(true);
                                            }}
                                            className="group relative p-4 bg-white dark:bg-slate-800 rounded-xl border-2 border-gray-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 transition-all duration-300 hover:shadow-lg hover:scale-105 cursor-pointer"
                                        >
                                            <div className="flex flex-col items-center text-center">
                                                {getFileIcon(file)}
                                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate w-full mt-3">
                                                    {file.name}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                                                    {driveService.formatFileSize(file.size_bytes)}
                                                </p>
                                                {file.tags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                        {file.tags.slice(0, 2).map((tag, idx) => (
                                                            <span
                                                                key={idx}
                                                                className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full"
                                                            >
                                                                {tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Quick Actions */}
                                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleStarFile(file.id, !file.is_starred);
                                                    }}
                                                    className="p-1.5 bg-white dark:bg-slate-700 rounded-lg shadow-lg hover:scale-110 transition"
                                                >
                                                    <Star
                                                        className={`w-4 h-4 ${file.is_starred
                                                            ? 'fill-yellow-400 text-yellow-400'
                                                            : 'text-gray-400'
                                                            }`}
                                                    />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setShareFile(file);
                                                        setShowShare(true);
                                                    }}
                                                    className="p-1.5 bg-white dark:bg-slate-700 rounded-lg shadow-lg hover:scale-110 transition"
                                                    title="Share"
                                                >
                                                    <Share2 className="w-4 h-4 text-blue-500" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                                    <table className="w-full">
                                        <thead className="bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
                                            <tr>
                                                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-slate-300">Name</th>
                                                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-slate-300">Size</th>
                                                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-slate-300">Modified</th>
                                                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-slate-300">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {activeFilter === 'all' && folders.map((folder) => (
                                                <tr
                                                    key={`folder-${folder.id}`}
                                                    onClick={() => handleFolderClick(folder)}
                                                    className="border-b border-gray-100 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition"
                                                >
                                                    <td className="py-3 px-4">
                                                        <div className="flex items-center gap-3">
                                                            <Folder className="w-5 h-5" style={{ color: folder.color || '#6b7280' }} />
                                                            <span className="font-medium text-gray-900 dark:text-white">{folder.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-slate-400">
                                                        {folder.file_count} files
                                                    </td>
                                                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-slate-400">
                                                        {new Date(folder.updated_at).toLocaleDateString()}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <button className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition">
                                                            <MoreVertical className="w-4 h-4 text-gray-600 dark:text-slate-400" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {sortedFiles.map((file) => (
                                                <tr
                                                    key={`file-${file.id}`}
                                                    className="border-b border-gray-100 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
                                                >
                                                    <td className="py-3 px-4">
                                                        <div className="flex items-center gap-3">
                                                            {getFileIcon(file)}
                                                            <div>
                                                                <p className="font-medium text-gray-900 dark:text-white">{file.name}</p>
                                                                {file.tags.length > 0 && (
                                                                    <div className="flex gap-1 mt-1">
                                                                        {file.tags.slice(0, 3).map((tag, idx) => (
                                                                            <span
                                                                                key={idx}
                                                                                className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full"
                                                                            >
                                                                                {tag}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-slate-400">
                                                        {driveService.formatFileSize(file.size_bytes)}
                                                    </td>
                                                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-slate-400">
                                                        {new Date(file.updated_at).toLocaleDateString()}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => handleStarFile(file.id, !file.is_starred)}
                                                                className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition"
                                                            >
                                                                <Star
                                                                    className={`w-4 h-4 ${file.is_starred
                                                                        ? 'fill-yellow-400 text-yellow-400'
                                                                        : 'text-gray-400'
                                                                        }`}
                                                                />
                                                            </button>
                                                            <button className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition">
                                                                <MoreVertical className="w-4 h-4 text-gray-600 dark:text-slate-400" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Empty State */}
                            {sortedFiles.length === 0 && folders.length === 0 && (
                                <div className="text-center py-16">
                                    <div className="w-24 h-24 bg-gray-200 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <HardDrive className="w-12 h-12 text-gray-400 dark:text-slate-600" />
                                    </div>
                                    <p className="text-gray-500 dark:text-slate-400 text-lg">No files or folders here</p>
                                    <p className="text-gray-400 dark:text-slate-500 text-sm mt-2">Upload files or create folders to get started</p>
                                </div>
                            )}
                        </>
                    )}

                    {/* Recent Files Tab */}
                    {activeTab === 'recent' && (
                        <RecentFilesView
                            onFileClick={(file) => {
                                setPreviewFile(file);
                                setShowPreview(true);
                            }}
                        />
                    )}

                    {/* Trash Tab */}
                    {activeTab === 'trash' && (
                        <TrashView
                            isOpen={true}
                            onClose={() => setActiveTab('drive')}
                            onFileRestored={() => loadDriveData()}
                        />
                    )}
                </div>

                {/* Modals */}
                <StorageBreakdownModal
                    isOpen={showStorageBreakdown}
                    onClose={() => setShowStorageBreakdown(false)}
                    userId={user?.id || 1}
                />

                <DuplicateFilesModal
                    isOpen={showDuplicates}
                    onClose={() => setShowDuplicates(false)}
                    userId={user?.id || 1}
                    onRefresh={loadDriveData}
                />

                <LargeFilesModal
                    isOpen={showLargeFiles}
                    onClose={() => setShowLargeFiles(false)}
                    userId={user?.id || 1}
                    onRefresh={loadDriveData}
                />

                <FileUploadModal
                    isOpen={showUpload}
                    onClose={() => setShowUpload(false)}
                    onRefresh={loadDriveData}
                />

                <NewFolderModal
                    isOpen={showNewFolder}
                    onClose={() => setShowNewFolder(false)}
                    onRefresh={loadDriveData}
                    currentFolder={currentFolder}
                />

                <StorageAnalytics
                    isOpen={showAnalytics}
                    onClose={() => setShowAnalytics(false)}
                />

                <FilePreviewModal
                    isOpen={showPreview}
                    onClose={() => setShowPreview(false)}
                    file={previewFile}
                    allFiles={files}
                />

                <ShareFileModal
                    isOpen={showShare}
                    onClose={() => setShowShare(false)}
                    file={shareFile}
                />
            </div>
        </div>
    );
}
