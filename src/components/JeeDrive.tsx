import { useState, useEffect } from 'react';
import {
    HardDrive, FolderPlus, Upload, Grid3x3, List, Search, Star,
    Clock, Trash2, Share2, Download, MoreVertical, File, Folder,
    Image, Video, FileText, Archive, Music,
    TrendingUp, Leaf, Sparkles, Filter, SortAsc, Eye,
    X, Check, Tag as TagIcon, Users, Mail, Menu
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import * as driveService from "../lib/driveService";
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
    const [shareFile] = useState<DriveFile | null>(null);
    const [activeTab, setActiveTab] = useState<'drive' | 'recent' | 'trash'>('drive');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        loadDriveData();
    }, [currentFolder, activeFilter]);

const loadDriveData = async () => {
    try {
        const userId = user?.id || 1;

const safeFolder = currentFolder && currentFolder !== 0 ? currentFolder : null;

const contents = await driveService.getFolderContents(safeFolder, userId);

        // Always keep folders defined (never undefined)
        setFolders(activeFilter === "all" ? (contents.folders || []) : []);

        let filesData = contents.files || [];

        if (activeFilter === "starred") {
            filesData = await driveService.getStarredFiles(userId);
        } else if (activeFilter === "recent") {
            filesData = await driveService.getRecentFiles(userId, 20);
        }

        setFiles(filesData);

        const [quotaData, suggestionsData] = await Promise.all([
            storageService.getUserQuota(userId),
            storageService.getOptimizationSuggestions(userId)
        ]);

        setQuota(quotaData);
        setSuggestions(suggestionsData);

    } catch (err) {
        console.error("LOAD DRIVE ERROR:", err);
    } finally {
        setLoading(false);
    }
};

    const handleFolderClick = (folder: DriveFolder) => {
        setCurrentFolder(folder.id);
        setBreadcrumbs([...breadcrumbs, { id: folder.id, name: folder.name }]);
        setActiveFilter('all');
    };



const handleStarFile = async (fileId: number, starred: boolean) => {
    const userId = user?.id || 1;
    await driveService.toggleStarFile(fileId, starred, userId);
    loadDriveData();
};

const handleDeleteFile = async (fileId: number) => {
    if (confirm('Move this file to trash?')) {
        const userId = user?.id || 1;
        await driveService.deleteFile(fileId, userId);
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

const filteredFiles = files.filter(file => {
    const nameMatch = file.name?.toLowerCase().includes(searchQuery.toLowerCase());

    // SAFE TAG HANDLING (prevents "void 0 is not a function")
    const tagList = Array.isArray(file.tags) ? file.tags : [];
    const tagMatch = tagList.some(tag =>
        tag.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return nameMatch || tagMatch;
});

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

    const SidebarContent = () => (
        <>
            <div className="p-6 flex items-center gap-3">
                <div className="bg-blue-600 p-2 rounded-lg">
                    <HardDrive className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                    JeeDrive
                </h1>
            </div>

            <nav className="flex-1 px-4 space-y-1">
                <button
                    onClick={() => { setActiveTab('drive'); setActiveFilter('all'); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${activeTab === 'drive' && activeFilter === 'all'
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                        : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'
                        }`}
                >
                    <HardDrive className="w-5 h-5" />
                    My Drive
                </button>
                <button
                    onClick={() => { setActiveTab('recent'); setActiveFilter('recent'); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${activeTab === 'recent'
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                        : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'
                        }`}
                >
                    <Clock className="w-5 h-5" />
                    Recent
                </button>
                <button
                    onClick={() => { setActiveTab('drive'); setActiveFilter('starred'); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${activeFilter === 'starred'
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                        : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'
                        }`}
                >
                    <Star className="w-5 h-5" />
                    Starred
                </button>
                <button
                    onClick={() => { setActiveTab('trash'); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${activeTab === 'trash'
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                        : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'
                        }`}
                >
                    <Trash2 className="w-5 h-5" />
                    Trash
                </button>
                <button
                    onClick={() => { setActiveTab('drive'); setActiveFilter('shared'); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${activeFilter === 'shared'
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                        : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'
                        }`}
                >
                    <Users className="w-5 h-5" />
                    Shared with me
                </button>
            </nav>

            {/* Storage Widget */}
            {quota && (
                <div className="p-4 mt-auto border-t border-gray-200 dark:border-slate-800">
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                Storage
                            </span>
                            <span className="text-xs text-gray-500 dark:text-slate-400">
                                {storageService.formatBytes(quota.used_bytes)} of {storageService.formatBytes(quota.quota_bytes)}
                            </span>
                        </div>
                        <div className="relative w-full h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden mb-4">
                            <div
                                className="h-full rounded-full bg-blue-600"
                                style={{ width: `${quota.percentage_used}%` }}
                            ></div>
                        </div>

                        {/* Donut Chart Visualization (Mock) */}
                        <div className="flex justify-center mb-4">
                            <div className="relative w-24 h-24">
                                <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                                    <path
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                        fill="none"
                                        stroke="#E5E7EB"
                                        strokeWidth="4"
                                        className="dark:stroke-slate-700"
                                    />
                                    <path
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                        fill="none"
                                        stroke="#2563EB"
                                        strokeWidth="4"
                                        strokeDasharray={`${quota.percentage_used}, 100`}
                                    />
                                </svg>
                            </div>
                        </div>

                        <button className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition shadow-sm">
                            Upgrade
                        </button>
                    </div>
                </div>
            )}
        </>
    );

    return (
        <div className={`flex h-full ${theme === 'dark' ? 'bg-slate-950' : 'bg-gray-50'}`}>
            {/* Desktop Sidebar */}
            <div className="hidden md:flex w-64 flex-shrink-0 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 flex-col">
                <SidebarContent />
            </div>

            {/* Mobile Sidebar Overlay */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 z-50 flex md:hidden">
                    <div
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
                        onClick={() => setIsMobileMenuOpen(false)}
                    ></div>
                    <div className="relative w-72 bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
                        <button
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="absolute top-4 right-4 p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <SidebarContent />
                    </div>
                </div>
            )}

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-slate-950">
                {/* Top Header */}
                <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-4 sm:px-8 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="md:hidden p-2 -ml-2 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                            {activeTab === 'drive' ? 'My Drive' :
                                activeTab === 'recent' ? 'Recent Files' :
                                    activeTab === 'trash' ? 'Trash' : 'JeeDrive'}
                        </h2>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <button
                            onClick={() => setShowNewFolder(true)}
                            className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition font-medium text-sm"
                        >
                            <FolderPlus className="w-4 h-4" />
                            <span className="hidden lg:inline">New Folder</span>
                        </button>
                        <button
                            onClick={() => setShowUpload(true)}
                            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm font-medium text-sm"
                        >
                            <Upload className="w-4 h-4" />
                            <span className="hidden sm:inline">Upload</span>
                        </button>
                        {onSwitchToMail && (
                            <button
                                onClick={onSwitchToMail}
                                className="ml-1 sm:ml-2 p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
                                title="Back to Mail"
                            >
                                <Mail className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-8">
                    {/* Smart Insights */}
                    {activeTab === 'drive' && activeFilter === 'all' && suggestions.length > 0 && (
                        <div className="mb-8">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Smart Insights</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {Array.isArray(suggestions) && suggestions.length > 0 &&
    suggestions.slice(0, 2).map((suggestion, index) => (
                                    <div key={index} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm flex flex-col">
                                        <div className="flex items-start gap-4 mb-4">
                                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                                <Sparkles className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-gray-900 dark:text-white text-lg">{suggestion.title}</h4>
                                                <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">{suggestion.description}</p>
                                                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                                                    Potential savings: <span className="font-medium text-gray-900 dark:text-white">{storageService.formatBytes(suggestion.potential_savings)}</span>
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                if (suggestion.type === 'duplicate') setShowDuplicates(true);
                                                else if (suggestion.type === 'large_file') setShowLargeFiles(true);
                                            }}
                                            className="mt-auto self-start px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
                                        >
                                            {suggestion.action}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Toolbar */}
                    <div className="mb-6 flex items-center gap-4">
                        <div className="relative flex-1 max-w-2xl">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search in Drive..."
                                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                            />
                        </div>
                        <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg p-1 shadow-sm">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-2 rounded transition ${viewMode === 'grid'
                                    ? 'bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-white'
                                    : 'text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                                    }`}
                            >
                                <Grid3x3 className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-2 rounded transition ${viewMode === 'list'
                                    ? 'bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-white'
                                    : 'text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                                    }`}
                            >
                                <List className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Content Area */}
                    {activeTab === 'drive' && (
                        <>
                            {viewMode === 'list' ? (
                                <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                    <table className="w-full">
                                        <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-800">
                                            <tr>
                                                <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Name</th>
                                                <th className="hidden md:table-cell text-left py-3 px-6 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Owner</th>
                                                <th className="hidden lg:table-cell text-left py-3 px-6 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Last Modified</th>
                                                <th className="hidden sm:table-cell text-left py-3 px-6 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">File Size</th>
                                                <th className="text-right py-3 px-6 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                                            {activeFilter === 'all' && Array.isArray(folders) && folders.map((folder) => (

                                                <tr
                                                    key={`folder-${folder.id}`}
                                                    onClick={() => handleFolderClick(folder)}
                                                    className="hover:bg-gray-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                                                >
                                                    <td className="py-4 px-6">
                                                        <div className="flex items-center gap-3">
                                                            <Folder className="w-5 h-5 text-gray-400" fill="currentColor" style={{ color: folder?.color ?? '#9CA3AF' }}
 />
                                                            <span className="font-medium text-gray-900 dark:text-white truncate max-w-[150px] sm:max-w-xs">{folder.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="hidden md:table-cell py-4 px-6 text-sm text-gray-500 dark:text-slate-400">Me</td>
                                                    <td className="hidden lg:table-cell py-4 px-6 text-sm text-gray-500 dark:text-slate-400">{new Date(folder.updated_at || folder.created_at).toLocaleDateString()
}</td>
                                                    <td className="hidden sm:table-cell py-4 px-6 text-sm text-gray-500 dark:text-slate-400">{folder.file_count} files</td>
                                                    <td className="py-4 px-6 text-right">
                                                        <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                                            <MoreVertical className="w-5 h-5" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
{Array.isArray(sortedFiles) && sortedFiles.map((file) => (
                                                <tr
                                                    key={`file-${file.id}`}
                                                    onClick={() => { setPreviewFile(file); setShowPreview(true); }}
                                                    className="hover:bg-gray-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                                                >
                                                    <td className="py-4 px-6">
                                                        <div className="flex items-center gap-3">
                                                            {getFileIcon(file)}
                                                            <div className="min-w-0">
                                                                <p className="font-medium text-gray-900 dark:text-white truncate max-w-[150px] sm:max-w-xs">{file.name}</p>
{Array.isArray(file.tags) && file.tags.length > 0 && (
    <div className="flex gap-1 mt-0.5">
        {file.tags.slice(0, 2).map((tag, idx) => (
            <span
                key={idx}
                className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-500 rounded-full"
            >
                {tag}
            </span>
        ))}
    </div>
)}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="hidden md:table-cell py-4 px-6 text-sm text-gray-500 dark:text-slate-400">Me</td>
                                                    <td className="hidden lg:table-cell py-4 px-6 text-sm text-gray-500 dark:text-slate-400">{new Date(file.updated_at).toLocaleDateString()}</td>
                                                    <td className="hidden sm:table-cell py-4 px-6 text-sm text-gray-500 dark:text-slate-400">{driveService.formatFileSize(file.size_bytes)}</td>
                                                    <td className="py-4 px-6 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleStarFile(file.id, !file.is_starred); }}
                                                                className="text-gray-400 hover:text-yellow-400"
                                                            >
                                                                <Star className={`w-5 h-5 ${file.is_starred ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                                                            </button>
                                                            <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                                                <MoreVertical className="w-5 h-5" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                                    {activeFilter === 'all' && Array.isArray(folders) && folders.map((folder) => (

                                        <div
                                            key={`folder-${folder.id}`}
                                            onClick={() => handleFolderClick(folder)}
                                            className="group p-4 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 hover:shadow-md transition-all cursor-pointer"
                                        >
                                            <div className="flex flex-col items-center text-center">
                                                <Folder className="w-12 h-12 mb-3 text-blue-500" fill="currentColor" style={{ color: folder.color || '#3B82F6' }} />
                                                <p className="font-medium text-gray-900 dark:text-white truncate w-full">{folder.name}</p>
                                                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
    {folder?.file_count ?? 0} files
</p>

                                            </div>
                                        </div>
                                    ))}
{Array.isArray(sortedFiles) && sortedFiles.map((file) => (
                                        <div
                                            key={`file-${file.id}`}
                                            onClick={() => { setPreviewFile(file); setShowPreview(true); }}
                                            className="group relative p-4 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 hover:shadow-md transition-all cursor-pointer"
                                        >
                                            <div className="flex flex-col items-center text-center">
                                                {getFileIcon(file)}
                                                <p className="font-medium text-gray-900 dark:text-white truncate w-full mt-3">{file.name}</p>
                                                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{driveService.formatFileSize(file.size_bytes)}</p>
                                            </div>
                                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleStarFile(file.id, !file.is_starred); }}
                                                    className="p-1.5 bg-white dark:bg-slate-800 rounded-full shadow-sm hover:bg-gray-50"
                                                >
                                                    <Star className={`w-4 h-4 ${file.is_starred ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {activeTab === 'recent' && <RecentFilesView />}
                    {activeTab === 'trash' && <TrashView />}
                </div>

                {/* Modals */}
                <StorageBreakdownModal isOpen={showStorageBreakdown} onClose={() => setShowStorageBreakdown(false)} userId={user?.id || 1} />
                <DuplicateFilesModal isOpen={showDuplicates} onClose={() => setShowDuplicates(false)} userId={user?.id || 1} onRefresh={loadDriveData} />
                <LargeFilesModal isOpen={showLargeFiles} onClose={() => setShowLargeFiles(false)} userId={user?.id || 1} onRefresh={loadDriveData} />
                <FileUploadModal isOpen={showUpload} onClose={() => setShowUpload(false)} onRefresh={loadDriveData} />
                <NewFolderModal isOpen={showNewFolder} onClose={() => setShowNewFolder(false)} onRefresh={loadDriveData} currentFolder={currentFolder} />
                <StorageAnalytics isOpen={showAnalytics} onClose={() => setShowAnalytics(false)} />
                <FilePreviewModal isOpen={showPreview} onClose={() => setShowPreview(false)} file={previewFile} allFiles={files} />
                <ShareFileModal isOpen={showShare} onClose={() => setShowShare(false)} file={shareFile} />
            </div>
        </div>
    );
}
