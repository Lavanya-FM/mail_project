import { useState, useEffect } from 'react';
import {
    HardDrive, FolderPlus, Upload, Grid3x3, List, Search, Star,
    Clock, Trash2, MoreVertical, File, Folder,
    Image, Video, FileText, Archive, Music,
    Sparkles, X, Users, Mail, Menu, Plus,
    ChevronRight, HelpCircle, SlidersHorizontal, Info, Check,
    Download, UserPlus, Eye, Link, Copy, Pencil, Ban, History
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import * as driveService from "../lib/driveService";
import { DriveFile, DriveFolder } from "../lib/driveService";

import { authService } from '../lib/authService';

export interface StorageQuota {
    used_bytes: number;
    quota_bytes: number;
    percentage_used: number;
}

export interface OptimizationSuggestion {
    title: string;
    description: string;
    potential_savings: number;
    type: 'duplicate' | 'large_file' | 'unused';
    action: string;
}

// Mock storageService since file was missing

import StorageBreakdownModal from './StorageBreakdownModal';
import DuplicateFilesModal from './DuplicateFilesModal';
import LargeFilesModal from './LargeFilesModal';
import FileUploadModal from './FileUploadModal';
import NewFolderModal from './NewFolderModal';
import VersionHistoryModal from './VersionHistoryModal';
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
    const [sortBy] = useState<SortBy>('name');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentFolder, setCurrentFolder] = useState<number | null>(null);
    const [breadcrumbs, setBreadcrumbs] = useState<{ id: number | null; name: string }[]>([{ id: null, name: 'My Drive' }]);

    const [files, setFiles] = useState<DriveFile[]>([]);
    const [folders, setFolders] = useState<DriveFolder[]>([]);
    const [quota, setQuota] = useState<StorageQuota | null>(null);
    const [suggestions, setSuggestions] = useState<OptimizationSuggestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [showStorageBreakdown, setShowStorageBreakdown] = useState(false);
    const [showDuplicates, setShowDuplicates] = useState(false);
    const [showLargeFiles, setShowLargeFiles] = useState(false);
    const [showUpload, setShowUpload] = useState(false);
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [showVersionHistory, setShowVersionHistory] = useState(false);
    const [showAnalytics, setShowAnalytics] = useState(false);
    const [activeFilter, setActiveFilter] = useState<'all' | 'starred' | 'recent' | 'shared' | 'computers' | 'spam'>('all');
    const [showPreview, setShowPreview] = useState(false);
    const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
    const [showShare, setShowShare] = useState(false);
    const [shareFile, setShareFile] = useState<DriveFile | null>(null);
    const [activeTab, setActiveTab] = useState<'drive' | 'recent' | 'trash' | 'recordings' | 'computers' | 'spam'>('drive');
    const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: DriveFile | DriveFolder | null } | null>(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [suggestedFiles, setSuggestedFiles] = useState<DriveFile[]>([]);
    const [showDetails, setShowDetails] = useState(false);
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const [showNewMenu, setShowNewMenu] = useState(false);

    // Unified Path Handling
    useEffect(() => {
        const handlePathChange = () => {
            const path = window.location.pathname;
            if (path.startsWith('/drive')) {
                // Parse sub-routes
                if (path.includes('/recent')) {
                    setActiveTab('recent'); setActiveFilter('recent');
                } else if (path.includes('/starred')) {
                    setActiveTab('drive'); setActiveFilter('starred');
                } else if (path.includes('/trash')) {
                    setActiveTab('trash');
                } else if (path.includes('/shared')) {
                    setActiveTab('drive'); setActiveFilter('shared');
                } else if (path.includes('/meetings')) {
                    setActiveTab('recordings');
                } else if (path.includes('/computers')) {
                    setActiveTab('drive'); setActiveFilter('computers');
                } else if (path.includes('/spam')) {
                    setActiveTab('drive'); setActiveFilter('spam');
                } else {
                    // Default /drive
                    setActiveTab('drive'); setActiveFilter('all');
                }
            }
        };

        handlePathChange(); // Initial check
        window.addEventListener('popstate', handlePathChange);
        window.addEventListener('app-navigate', handlePathChange as EventListener);

        return () => {
            window.removeEventListener('popstate', handlePathChange);
            window.removeEventListener('app-navigate', handlePathChange as EventListener);
        };
    }, []);

    // Load data when dependencies change
    useEffect(() => {
        loadDriveData();
    }, [currentFolder, activeFilter, activeTab]);

    const handleNavigation = (path: string) => {
        window.history.pushState({}, '', path);
        // Dispatch event so other components (or this one via listener) update
        window.dispatchEvent(new CustomEvent('app-navigate', { detail: { path } }));
        setIsMobileMenuOpen(false);
    };

    const loadDriveData = async () => {
        try {
            const userId = user?.id || 1;

            if (activeTab === 'recordings') {
                const contents = await driveService.getFolderContents(null, userId);
                setFolders([]);
                setFiles((contents.files || []).filter((f: DriveFile) =>
                    f.name.startsWith('Recording_') &&
                    (f.file_type.includes('webm') || f.file_type.includes('mp4') || f.file_type.includes('video'))
                ));
            } else {
                const safeFolder = currentFolder && currentFolder !== 0 ? currentFolder : null;
                const contents = await driveService.getFolderContents(safeFolder, userId);

                setFolders(activeFilter === "all" ? (contents.folders || []) : []);

                let filesData = contents.files || [];

                if (activeFilter === "starred") {
                    filesData = await driveService.getStarredFiles(userId);
                } else if (activeFilter === "recent") {
                    filesData = await driveService.getRecentFiles(userId, 20);
                }

                setFiles(filesData);

                // Set suggested files (mix of recent and starred for demo)
                if (activeTab === 'drive' && !currentFolder) {
                    setSuggestedFiles(filesData.slice(0, 4));
                }
            }

            const [quotaData, suggestionsData] = await Promise.all([
                driveService.getUserQuota(userId),
                driveService.getOptimizationSuggestions(userId)
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



    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            const allIds = [...folders.map(f => f.id), ...files.map(f => f.id)];
            setSelectedItems(new Set(allIds));
        } else {
            setSelectedItems(new Set());
        }
    };

    const toggleSelection = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        const newSelected = new Set(selectedItems);
        if (newSelected.has(id)) newSelected.delete(id);
        else newSelected.add(id);
        setSelectedItems(newSelected);
    };

    const handleContextMenu = (e: React.MouseEvent, item: DriveFile | DriveFolder) => {
        e.preventDefault();
        setContextMenu({ x: e.pageX, y: e.pageY, item });
    };

    const handleBreadcrumbClick = (id: number | null, index: number) => {
        setCurrentFolder(id);
        setSelectedItems(new Set());
        setBreadcrumbs(breadcrumbs.slice(0, index + 1));
    };

    const handleStarFile = async (fileId: number, starred: boolean) => {
        const userId = user?.id || 1;
        await driveService.toggleStarFile(fileId, starred, userId);
        loadDriveData();
    };

    const handleSummarize = async (item: DriveFile) => {
        setIsSummarizing(true);
        // Simulate API call
        setTimeout(() => {
            setIsSummarizing(false);
            alert(`Summary for ${item.name}:\n\nThis is a mock AI-generated summary of the file content. In a production environment, this would call the backend AI service.`);
        }, 1500);
    };

    const handleMainDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setIsDragging(true);
        } else if (e.type === "dragleave") {
            setIsDragging(false);
        }
    };

    const handleMainDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            // In a real app, we'd trigger the upload logic here directly
            // For now, we'll open the upload modal with the files if possible
            setShowUpload(true);
        }
    };

    const handleOpen = (item: DriveFile | DriveFolder) => {
        if ('file_type' in item) {
            setPreviewFile(item as DriveFile);
            setShowPreview(true);
        } else {
            handleFolderClick(item as DriveFolder);
        }
        setContextMenu(null);
    };

    const handleDownload = (item: DriveFile | DriveFolder) => {
        if ('file_type' in item) {
            const url = driveService.getDownloadUrl(item.id, user?.id || 1);
            window.open(url, '_blank');
        } else {
            alert("Folder download is not supported yet.");
        }
        setContextMenu(null);
    };

    const handleRename = async (item: DriveFile | DriveFolder) => {
        const newName = prompt(`Rename ${item.name} to:`, item.name);
        if (newName && newName !== item.name) {
            const type = 'file_type' in item ? 'file' : 'folder';
            await driveService.rename(type, item.id, newName.trim(), user?.id || 1);
            loadDriveData();
        }
        setContextMenu(null);
    };

    const handleCopy = async (item: DriveFile | DriveFolder) => {
        if ('file_type' in item) {
            await driveService.copyFile(item.id, user?.id || 1);
            loadDriveData();
        } else {
            alert("Folder duplication is not supported yet.");
        }
        setContextMenu(null);
    };

    const handleGetLink = (item: DriveFile | DriveFolder) => {
        const url = `${window.location.origin}/drive/files/${item.id}`;
        navigator.clipboard.writeText(url);
        alert("Link copied to clipboard!");
        setContextMenu(null);
    };

    const handleInfo = (item: DriveFile | DriveFolder) => {
        setSelectedItems(new Set([item.id]));
        setShowDetails(true);
        setContextMenu(null);
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
        const color = driveService.getFileColor(file.file_type);

        return (
            <div className="p-3 rounded-xl" style={{ backgroundColor: `${color}15` }}>
                <Icon className="w-8 h-8" style={{ color: color }} />
            </div>
        );
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
            <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-slate-950">
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
            <div className="p-6 relative">
                <button
                    onClick={() => setShowNewMenu(!showNewMenu)}
                    className="flex items-center gap-3 px-6 py-4 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-2xl shadow-lg border border-gray-100 dark:border-slate-700 hover:shadow-xl transition-all duration-300 group w-full"
                >
                    <Plus className={`w-6 h-6 text-blue-600 transition-transform duration-300 ${showNewMenu ? 'rotate-45' : 'group-hover:rotate-90'}`} />
                    <span className="font-semibold text-base">New</span>
                </button>

                {showNewMenu && (
                    <div className="absolute left-6 right-6 top-[calc(100%-8px)] z-50 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-100 dark:border-slate-700 py-2 animate-in fade-in zoom-in-95 duration-200">
                        <button
                            onClick={() => { setShowNewFolder(true); setShowNewMenu(false); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-300 transition-colors"
                        >
                            <FolderPlus className="w-5 h-5 text-gray-400" />
                            <span>New folder</span>
                        </button>
                        <div className="h-px bg-gray-100 dark:bg-slate-700 my-1" />
                        <button
                            onClick={() => { setShowUpload(true); setShowNewMenu(false); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-300 transition-colors"
                        >
                            <Upload className="w-5 h-5 text-gray-400" />
                            <span>File upload</span>
                        </button>
                    </div>
                )}
            </div>

            <nav className="flex-1 px-3 space-y-1">
                {[
                    { id: 'drive', label: 'My Drive', icon: HardDrive, path: '/drive', active: activeTab === 'drive' && activeFilter === 'all' },
                    { id: 'recent', label: 'Recent', icon: Clock, path: '/drive/recent', active: activeTab === 'recent' },
                    { id: 'starred', label: 'Starred', icon: Star, path: '/drive/starred', active: activeFilter === 'starred' },
                    { id: 'trash', label: 'Trash', icon: Trash2, path: '/drive/trash', active: activeTab === 'trash' },
                    { id: 'shared', label: 'Shared with me', icon: Users, path: '/drive/shared', active: activeFilter === 'shared' },
                    { id: 'meetings', label: 'Meetings', icon: Video, path: '/drive/meetings', active: activeTab === 'recordings' },
                ].map((item) => (
                    <button
                        key={item.id}
                        onClick={() => handleNavigation(item.path)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-full transition-all duration-200 ${item.active
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                            : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800/50'
                            }`}
                    >
                        <item.icon className={`w-5 h-5 ${item.active ? 'text-blue-600' : 'text-gray-500'}`} />
                        {item.label}
                    </button>
                ))}
            </nav>

            <div className="p-4 mx-2">
                {quota && (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="h-1 w-full bg-gray-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-blue-600 rounded-full transition-all duration-500"
                                    style={{ width: `${quota.percentage_used}%` }}
                                />
                            </div>
                            <p className="text-xs text-gray-500 dark:text-slate-400">
                                {driveService.formatFileSize(quota.used_bytes)} of {driveService.formatFileSize(quota.quota_bytes)} used
                            </p>
                        </div>
                        <button className="w-full flex items-center justify-center gap-2 py-2 px-4 border border-blue-600 text-blue-600 dark:text-blue-400 rounded-full text-sm font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                            Get more storage
                        </button>
                    </div>
                )}
            </div>
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
            <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-gray-50 dark:bg-slate-950">
                {/* Top Header */}
                <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-4 py-2 flex items-center justify-between sticky top-0 z-30 shadow-sm">
                    <div className="flex items-center gap-4 flex-1">
                        <button
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="md:hidden p-2 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full"
                        >
                            <Menu className="w-6 h-6" />
                        </button>

                        {/* Search Bar */}
                        <div className="flex-1 max-w-2xl relative group hidden sm:block">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                            </div>
                            <input
                                type="text"
                                className="block w-full pl-10 pr-12 py-2.5 bg-gray-100 dark:bg-slate-800 border-transparent rounded-full text-sm placeholder-gray-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                placeholder="Search in Drive"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                                <button className="p-1 px-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-md transition-colors">
                                    <SlidersHorizontal className="w-4 h-4 text-gray-500" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {onSwitchToMail && (
                            <button
                                onClick={onSwitchToMail}
                                className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                                title="Back to Mail"
                            >
                                <Mail className="w-6 h-6" />
                            </button>
                        )}
                        <button className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                            <HelpCircle className="w-6 h-6" />
                        </button>
                        <button className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors" onClick={() => setShowUpload(true)}>
                            <Upload className="w-6 h-6" />
                        </button>
                        <button className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                            <Grid3x3 className="w-6 h-6" />
                        </button>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-sm ml-2 ring-2 ring-blue-500/20">
                            {user?.full_name?.charAt(0) || 'U'}
                        </div>
                    </div>
                </header>

                {/* Sub Header / Breadcrumbs & Selection Toolbar */}
                <div className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-6 py-2 flex items-center justify-between min-h-[56px] sticky top-[60px] z-30">
                    {selectedItems.size > 0 ? (
                        <div className="flex items-center gap-1 animate-in fade-in slide-in-from-top-1 duration-200 w-full">
                            <button
                                onClick={() => setSelectedItems(new Set())}
                                className="p-2.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors group"
                            >
                                <X className="w-5 h-5 text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white" />
                            </button>
                            <span className="font-semibold text-[15px] text-gray-900 dark:text-white ml-2">{selectedItems.size} selected</span>
                            <div className="h-6 w-px bg-gray-200 dark:bg-slate-800 mx-5" />
                            <div className="flex items-center gap-1.5">
                                <button className="flex items-center gap-2.5 px-6 py-2 bg-white dark:bg-slate-900 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 text-blue-600 dark:text-blue-400 rounded-full text-[13.5px] font-bold transition-all border border-gray-200 dark:border-blue-900/50 shadow-sm"
                                    onClick={() => {
                                        const firstFile = files.find(f => selectedItems.has(f.id));
                                        if (firstFile) handleSummarize(firstFile);
                                    }}
                                >
                                    <Sparkles className={`w-4 h-4 text-blue-600 ${isSummarizing ? 'animate-spin' : ''}`} />
                                    {isSummarizing ? 'Summarizing...' : 'Summarize'}
                                </button>
                                <button className="p-2.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full text-gray-600 dark:text-slate-400 transition-colors" title="Share">
                                    <UserPlus className="w-5 h-5" />
                                </button>
                                <button className="p-2.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full text-gray-600 dark:text-slate-400 transition-colors" title="Download">
                                    <Download className="w-5 h-5" />
                                </button>
                                <button
                                    className="p-2.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full text-red-500 transition-colors"
                                    title="Move to Trash"
                                    onClick={async () => {
                                        if (confirm(`Move ${selectedItems.size} items to trash?`)) {
                                            for (const id of Array.from(selectedItems)) {
                                                await driveService.moveToTrash(id, user?.id || 1);
                                            }
                                            setSelectedItems(new Set());
                                            loadDriveData();
                                        }
                                    }}
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center overflow-x-auto no-scrollbar py-1">
                                {breadcrumbs.map((crumb, idx) => (
                                    <div key={idx} className="flex items-center flex-shrink-0">
                                        <button
                                            onClick={() => handleBreadcrumbClick(crumb.id, idx)}
                                            className={`px-3 py-1.5 rounded-lg text-[18px] font-medium transition-colors hover:bg-gray-100 dark:hover:bg-slate-800 ${idx === breadcrumbs.length - 1 ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-slate-400'}`}
                                        >
                                            {crumb.name}
                                        </button>
                                        {idx < breadcrumbs.length - 1 && (
                                            <ChevronRight className="w-4 h-4 text-gray-400 mx-0.5" />
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-800 rounded-lg p-1">
                                    <button
                                        onClick={() => setViewMode('list')}
                                        className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white dark:bg-slate-900 shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        <List className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setViewMode('grid')}
                                        className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-slate-900 shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        <Grid3x3 className="w-4 h-4" />
                                    </button>
                                </div>
                                <button
                                    onClick={() => setShowDetails(!showDetails)}
                                    className={`p-2 rounded-full transition-colors ${showDetails ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40' : 'hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500'}`}
                                >
                                    <Info className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div
                    className="flex-1 overflow-y-auto p-0 sm:p-6 relative"
                    onClick={() => setContextMenu(null)}
                    onDragEnter={handleMainDrag}
                    onDragOver={handleMainDrag}
                    onDragLeave={handleMainDrag}
                    onDrop={handleMainDrop}
                >
                    {isDragging && (
                        <div className="absolute inset-0 z-50 bg-blue-500/10 backdrop-blur-[2px] border-4 border-dashed border-blue-500/50 m-4 rounded-3xl flex items-center justify-center animate-in fade-in duration-200 pointer-events-none">
                            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4">
                                <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                                    <Upload className="w-10 h-10 text-blue-600 dark:text-blue-400 animate-bounce" />
                                </div>
                                <p className="text-xl font-bold text-gray-900 dark:text-white font-[Outfit]">Drop files to upload</p>
                            </div>
                        </div>
                    )}
                    {activeTab === 'drive' && !currentFolder && suggestedFiles.length > 0 && activeFilter === 'all' && (
                        <div className="mb-8 px-6 sm:px-0">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Suggested</h3>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {suggestedFiles.map((file) => (
                                    <div
                                        key={file.id}
                                        className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-5 hover:shadow-xl hover:border-blue-200 dark:hover:border-blue-900/50 transition-all cursor-pointer group flex flex-col items-center justify-center gap-4 h-52 relative overflow-hidden shadow-sm"
                                        onClick={() => { setPreviewFile(file); setShowPreview(true); }}
                                    >
                                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <div className="transform group-hover:scale-110 transition-transform duration-300">
                                            {getFileIcon(file)}
                                        </div>
                                        <div className="w-full text-center">
                                            <p className="font-bold text-sm text-gray-900 dark:text-white truncate px-2">{file.name}</p>
                                            <p className="text-[11px] text-gray-400 mt-1 uppercase tracking-wider font-bold">
                                                {file.file_type || 'File'}
                                            </p>
                                        </div>
                                        <button
                                            className="absolute top-3 right-3 p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                                            onClick={(e) => { e.stopPropagation(); handleContextMenu(e, file); }}
                                        >
                                            <MoreVertical className="w-4 h-4 text-gray-500" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
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
                                                        Potential savings: <span className="font-medium text-gray-900 dark:text-white">{driveService.formatFileSize(suggestion.potential_savings)}</span>
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


                    {/* Content Area */}
                    {activeTab === 'drive' && (
                        <>
                            {viewMode === 'list' ? (
                                <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                    <table className="w-full">
                                        <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-800">
                                            <tr>
                                                <th className="py-3 px-6 w-12">
                                                    <input
                                                        type="checkbox"
                                                        className="rounded border-gray-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                                                        onChange={handleSelectAll}
                                                        checked={selectedItems.size === (folders.length + files.length) && (folders.length + files.length) > 0}
                                                    />
                                                </th>
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
                                                    onClick={(e) => e.ctrlKey ? toggleSelection(e, folder.id) : handleFolderClick(folder)}
                                                    onContextMenu={(e) => handleContextMenu(e, folder)}
                                                    className={`hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors group ${selectedItems.has(folder.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                                                >
                                                    <td className="py-2 px-6">
                                                        <div className="flex items-center gap-3">
                                                            <div
                                                                className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${selectedItems.has(folder.id) ? 'bg-blue-600 text-white' : 'opacity-0 group-hover:opacity-100 text-gray-300'}`}
                                                                onClick={(e) => toggleSelection(e, folder.id)}
                                                            >
                                                                <Check className="w-3 h-3" />
                                                            </div>
                                                            <Folder className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" fill="currentColor" style={{ color: folder?.color ?? '#9CA3AF' }}
                                                            />
                                                            <span className="font-medium text-gray-900 dark:text-white truncate max-w-[150px] sm:max-w-xs">{folder.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="hidden md:table-cell py-4 px-6 text-sm text-gray-500 dark:text-slate-400">me</td>
                                                    <td className="hidden lg:table-cell py-4 px-6 text-sm text-gray-500 dark:text-slate-400">{new Date(folder.updated_at || folder.created_at).toLocaleDateString()
                                                    }</td>
                                                    <td className="hidden sm:table-cell py-4 px-6 text-sm text-gray-500 dark:text-slate-400">—</td>
                                                    <td className="py-4 px-6 text-right">
                                                        <button
                                                            className="p-1 px-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full text-gray-400 group-hover:text-gray-600 transition-colors"
                                                            onClick={(e) => { e.stopPropagation(); handleContextMenu(e, folder); }}
                                                        >
                                                            <MoreVertical className="w-5 h-5" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {Array.isArray(sortedFiles) && sortedFiles.map((file) => (
                                                <tr
                                                    key={`file-${file.id}`}
                                                    onClick={(e) => e.ctrlKey ? toggleSelection(e, file.id) : (setPreviewFile(file), setShowPreview(true))}
                                                    onContextMenu={(e) => handleContextMenu(e, file)}
                                                    className={`hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors group ${selectedItems.has(file.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                                                >
                                                    <td className="py-2 px-6">
                                                        <div className="flex items-center gap-3">
                                                            <div
                                                                className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${selectedItems.has(file.id) ? 'bg-blue-600 text-white' : 'opacity-0 group-hover:opacity-100 text-gray-300'}`}
                                                                onClick={(e) => toggleSelection(e, file.id)}
                                                            >
                                                                <Check className="w-3 h-3" />
                                                            </div>
                                                            <div className="w-5 h-5 flex items-center justify-center">
                                                                {getFileIcon(file)}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="font-medium text-gray-900 dark:text-white truncate max-w-[150px] sm:max-w-xs">{file.name}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="hidden md:table-cell py-4 px-6 text-sm text-gray-500 dark:text-slate-400">me</td>
                                                    <td className="hidden lg:table-cell py-4 px-6 text-sm text-gray-500 dark:text-slate-400">{new Date(file.updated_at).toLocaleDateString()}</td>
                                                    <td className="hidden sm:table-cell py-4 px-6 text-sm text-gray-500 dark:text-slate-400">{driveService.formatFileSize(file.size_bytes)}</td>
                                                    <td className="py-4 px-6 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleStarFile(file.id, !file.is_starred); }}
                                                                className={`p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition-colors ${file.is_starred ? 'text-yellow-400' : 'text-gray-400'}`}
                                                            >
                                                                <Star className={`w-5 h-5 ${file.is_starred ? 'fill-yellow-400' : ''}`} />
                                                            </button>
                                                            <button
                                                                className="p-1 px-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full text-gray-400 group-hover:text-gray-600 transition-colors"
                                                                onClick={(e) => { e.stopPropagation(); handleContextMenu(e, file); }}
                                                            >
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

                    {activeTab === 'recordings' && (
                        <>
                            {sortedFiles.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                                    <div className="w-20 h-20 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                                        <Video className="w-10 h-10" />
                                    </div>
                                    <p className="text-lg font-medium">No meeting recordings found</p>
                                    <p className="text-sm">Recordings from your meetings will appear here.</p>
                                </div>
                            ) : (
                                <>
                                    {viewMode === 'list' ? (
                                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                            <table className="w-full">
                                                <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-800">
                                                    <tr>
                                                        <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">File Name</th>
                                                        <th className="hidden md:table-cell text-left py-3 px-6 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Date Recorded</th>
                                                        <th className="hidden sm:table-cell text-left py-3 px-6 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Size</th>
                                                        <th className="text-right py-3 px-6 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                                                    {sortedFiles.map((file) => (
                                                        <tr
                                                            key={`recording-${file.id}`}
                                                            onClick={() => { setPreviewFile(file); setShowPreview(true); }}
                                                            className="hover:bg-gray-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                                                        >
                                                            <td className="py-4 px-6">
                                                                <div className="flex items-center gap-3">
                                                                    <Video className="w-5 h-5 text-red-500" />
                                                                    <span className="font-medium text-gray-900 dark:text-white truncate max-w-xs">{file.name}</span>
                                                                </div>
                                                            </td>
                                                            <td className="hidden md:table-cell py-4 px-6 text-sm text-gray-500 dark:text-slate-400">
                                                                {new Date(file.created_at).toLocaleDateString()}
                                                            </td>
                                                            <td className="hidden sm:table-cell py-4 px-6 text-sm text-gray-500 dark:text-slate-400">
                                                                {driveService.formatFileSize(file.size_bytes)}
                                                            </td>
                                                            <td className="py-4 px-6 text-right">
                                                                <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                                                    <MoreVertical className="w-5 h-5" />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                                            {sortedFiles.map((file) => (
                                                <div
                                                    key={`recording-grid-${file.id}`}
                                                    onClick={() => { setPreviewFile(file); setShowPreview(true); }}
                                                    className="group p-4 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 hover:shadow-md transition-all cursor-pointer"
                                                >
                                                    <div className="flex flex-col items-center text-center">
                                                        <div className="w-12 h-12 mb-3 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-center justify-center">
                                                            <Video className="w-8 h-8 text-red-500" />
                                                        </div>
                                                        <p className="font-medium text-gray-900 dark:text-white truncate w-full">{file.name}</p>
                                                        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{driveService.formatFileSize(file.size_bytes)}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}

                    {activeTab === 'recent' && <RecentFilesView />}
                    {activeTab === 'trash' && <TrashView />}
                </div>

                {/* Details Panel Sidebar (Right side) */}
                {showDetails && (
                    <div className="hidden lg:flex w-80 flex-shrink-0 bg-white dark:bg-slate-900 border-l border-gray-100 dark:border-slate-800 flex-col animate-in slide-in-from-right duration-300">
                        <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Info className="w-[18px] h-[18px] text-blue-600" />
                                <h3 className="font-bold text-[15px] text-gray-900 dark:text-white">Details</h3>
                            </div>
                            <button onClick={() => setShowDetails(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                                <X className="w-[18px] h-[18px] text-gray-500" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6">
                            {(selectedItems.size === 1) ? (
                                <div className="space-y-6">
                                    {(() => {
                                        const itemId = Array.from(selectedItems)[0];
                                        const item = [...files, ...folders].find(i => i.id === itemId);
                                        if (!item) return <p className="text-gray-500 italic">Item not found</p>;

                                        return (
                                            <>
                                                <div className="flex flex-col items-center gap-5 py-6">
                                                    <div className="p-8 bg-[#F8FAFF] dark:bg-blue-900/10 rounded-[24px] transform hover:scale-105 transition-transform duration-300">
                                                        {'file_type' in item ? getFileIcon(item as DriveFile) : <Folder className="w-20 h-20 text-blue-400" />}
                                                    </div>
                                                    <h4 className="font-bold text-[18px] leading-snug text-center text-gray-900 dark:text-white break-all px-4">{item.name}</h4>
                                                </div>

                                                <div className="space-y-4">
                                                    <div className="flex items-center justify-between text-sm py-2 border-b border-gray-50 dark:border-slate-800">
                                                        <span className="text-gray-500">Type</span>
                                                        <span className="text-gray-900 dark:text-white capitalize">{'file_type' in item ? (item as DriveFile).file_type : 'Folder'}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between text-sm py-2 border-b border-gray-50 dark:border-slate-800">
                                                        <span className="text-gray-500">Size</span>
                                                        <span className="text-gray-900 dark:text-white">{'size_bytes' in item ? driveService.formatFileSize((item as DriveFile).size_bytes) : '--'}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between text-sm py-2 border-b border-gray-50 dark:border-slate-800">
                                                        <span className="text-gray-500">Owner</span>
                                                        <div className="flex items-center gap-2 text-gray-900 dark:text-white">
                                                            <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[10px] font-bold">M</div>
                                                            me
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center justify-between text-sm py-2 border-b border-gray-50 dark:border-slate-800">
                                                        <span className="text-gray-500">Modified</span>
                                                        <span className="text-gray-900 dark:text-white">{new Date(item.updated_at).toLocaleDateString()}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between text-sm py-2 border-b border-gray-50 dark:border-slate-800">
                                                        <span className="text-gray-500">Opened</span>
                                                        <span className="text-gray-900 dark:text-white">Just now</span>
                                                    </div>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            ) : selectedItems.size > 1 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-full">
                                        <Grid3x3 className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-900 dark:text-white">{selectedItems.size} items selected</p>
                                        <p className="text-sm text-gray-500">Select only one item to see its details and activity.</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                                    <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-full">
                                        <HardDrive className="w-8 h-8 text-gray-400" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-900 dark:text-white">Select a file or folder</p>
                                        <p className="text-sm text-gray-500">View its details and activity here.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Modals */}
                <StorageBreakdownModal isOpen={showStorageBreakdown} onClose={() => setShowStorageBreakdown(false)} userId={user?.id || 1} />
                <DuplicateFilesModal isOpen={showDuplicates} onClose={() => setShowDuplicates(false)} userId={user?.id || 1} onRefresh={loadDriveData} />
                <LargeFilesModal isOpen={showLargeFiles} onClose={() => setShowLargeFiles(false)} userId={user?.id || 1} onRefresh={loadDriveData} />
                <FileUploadModal isOpen={showUpload} onClose={() => setShowUpload(false)} onRefresh={loadDriveData} folderId={currentFolder} />
                <NewFolderModal isOpen={showNewFolder} onClose={() => setShowNewFolder(false)} onRefresh={loadDriveData} currentFolder={currentFolder} />
                <VersionHistoryModal isOpen={showVersionHistory} onClose={() => setShowVersionHistory(false)} file={contextMenu?.item && 'file_type' in contextMenu.item ? contextMenu.item as DriveFile : null} userId={user?.id || 1} onRefresh={loadDriveData} />
                <StorageAnalytics isOpen={showAnalytics} onClose={() => setShowAnalytics(false)} />
                <FilePreviewModal isOpen={showPreview} onClose={() => setShowPreview(false)} file={previewFile} allFiles={files} />
                <ShareFileModal isOpen={showShare} onClose={() => setShowShare(false)} file={shareFile} />
            </div>

            {/* Context Menu Overlay */}
            {contextMenu && (
                <div
                    className="fixed inset-0 z-[100]"
                    onClick={() => setContextMenu(null)}
                    onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
                >
                    <div
                        className="absolute bg-white dark:bg-slate-800 rounded-2xl shadow-[0_12px_40px_-10px_rgba(0,0,0,0.25)] dark:shadow-[0_12px_40px_-10px_rgba(0,0,0,0.6)] border border-gray-100 dark:border-slate-700 py-3 w-64 animate-in fade-in zoom-in-95 duration-100"
                        style={{ top: contextMenu.y, left: contextMenu.x }}
                    >
                        <div className="px-5 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-[0.1em] border-b border-gray-100 dark:border-slate-700 mb-2 truncate">
                            {(contextMenu.item as any).name}
                        </div>
                        <button
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-slate-300"
                            onClick={() => handleOpen(contextMenu.item!)}
                        >
                            <Eye className="w-4 h-4" /> Open
                        </button>
                        <button
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-slate-300"
                            onClick={() => handleDownload(contextMenu.item!)}
                        >
                            <Download className="w-4 h-4" /> Download
                        </button>
                        <button
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-slate-300"
                            onClick={() => handleRename(contextMenu.item!)}
                        >
                            <Pencil className="w-4 h-4" /> Rename
                        </button>
                        <button
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-slate-300"
                            onClick={() => handleCopy(contextMenu.item!)}
                        >
                            <Copy className="w-4 h-4" /> Make a copy
                        </button>
                        {contextMenu.item && 'file_type' in contextMenu.item && (
                            <button
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-slate-300"
                                onClick={() => { setShowVersionHistory(true); setContextMenu(null); }}
                            >
                                <History className="w-4 h-4" /> Version History
                            </button>
                        )}
                        <div className="h-px bg-gray-100 dark:bg-slate-700 my-1" />
                        <button
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium"
                            onClick={() => contextMenu.item && 'file_type' in contextMenu.item && handleSummarize(contextMenu.item as DriveFile)}
                        >
                            <Sparkles className={`w-4 h-4 ${isSummarizing ? 'animate-spin' : ''}`} />
                            {isSummarizing ? 'Summarizing...' : 'Summarize this file'}
                        </button>
                        <div className="h-px bg-gray-100 dark:bg-slate-700 my-1" />
                        <button
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-slate-300"
                            onClick={() => { setShareFile(contextMenu.item as DriveFile); setShowShare(true); setContextMenu(null); }}
                        >
                            <UserPlus className="w-4 h-4" /> Share
                        </button>
                        <button
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-slate-300"
                            onClick={() => handleGetLink(contextMenu.item!)}
                        >
                            <Link className="w-4 h-4" /> Get link
                        </button>
                        <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-slate-300">
                            <FolderPlus className="w-4 h-4" /> Organize
                        </button>
                        <button
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-slate-300"
                            onClick={() => handleInfo(contextMenu.item!)}
                        >
                            <Info className="w-4 h-4" /> File information
                        </button>
                        <div className="h-px bg-gray-100 dark:bg-slate-700 my-1" />
                        <button
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600"
                            onClick={() => driveService.moveToTrash(contextMenu.item!.id, user?.id || 1).then(() => { loadDriveData(); setContextMenu(null); })}
                        >
                            <Trash2 className="w-4 h-4" /> Move to Trash
                        </button>
                        <button
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600"
                            onClick={() => { alert("Report feature coming soon!"); setContextMenu(null); }}
                        >
                            <Ban className="w-4 h-4" /> Report or block
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
