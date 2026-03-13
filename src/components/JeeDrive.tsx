import { useState, useEffect, useRef } from 'react';
import {
    HardDrive, FolderPlus, Upload, Grid3x3, List, Star,
    Clock, Trash2, MoreVertical, File, Folder,
    Image, Video, FileText, Archive, Music,
    Sparkles, X, Users, Plus,
    ChevronRight, Info, Check,
    Download, UserPlus, Eye, Link, Copy, Pencil, Ban, History,
    ExternalLink, Lock, MoreHorizontal, Settings, Navigation, Mail,
    Files, CloudOff
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import * as driveService from "../lib/driveService";
import { DriveFile, DriveFolder } from "../lib/driveService";

import toast from 'react-hot-toast';
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
import RecentFilesView from './RecentFilesView';
import TrashView from './TrashView';
import FolderPickerModal from './FolderPickerModal';
import SharePermissionsModal from './SharePermissionsModal';

type ViewMode = 'grid' | 'list';
type SortBy = 'name' | 'date' | 'size' | 'type';

interface JeeDriveProps {
    onSwitchToMail?: () => void;
    searchQuery?: string;
}

export default function JeeDrive({ onSwitchToMail, searchQuery: externalSearchQuery }: JeeDriveProps) {
    const { theme } = useTheme();
    const user = authService.getCurrentUser();

    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [sortBy] = useState<SortBy>('name');

    // Use external search query if provided, otherwise empty
    const activeSearchQuery = externalSearchQuery || '';
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
    const [showFolderPicker, setShowFolderPicker] = useState(false);
    const [folderPickerConfig, setFolderPickerConfig] = useState<{ title: string; actionLabel: string; mode: 'move' | 'copy'; item: DriveFile | DriveFolder | null }>({
        title: '',
        actionLabel: '',
        mode: 'move',
        item: null
    });
    const [checkedOutFiles, setCheckedOutFiles] = useState<Set<number>>(new Set());
    const versionInputRef = useRef<HTMLInputElement>(null);
    const [targetFileVersion, setTargetFileVersion] = useState<DriveFile | null>(null);

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
    const handleVersionFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !targetFileVersion) return;

        const loadingToast = toast.loading(`Uploading new version for ${targetFileVersion.name}...`);
        try {
            const res = await driveService.uploadFile(file, user?.id || 1, targetFileVersion.folder_id, targetFileVersion.id);
            if (res.success) {
                toast.success('New version uploaded successfully!', { id: loadingToast });
                loadDriveData();
            } else {
                toast.error(res.error || 'Upload failed', { id: loadingToast });
            }
        } catch (err) {
            toast.error('Network error during upload', { id: loadingToast });
        } finally {
            setTargetFileVersion(null);
            if (versionInputRef.current) versionInputRef.current.value = '';
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
        e.stopPropagation();

        // 1. Ensure item is selected on right click
        setSelectedItems(new Set([item.id]));

        // 2. Boundary checking for menu position
        const menuWidth = 256; // w-64
        const menuHeight = 500; // estimated max height
        let x = e.pageX;
        let y = e.pageY;

        if (x + menuWidth > window.innerWidth) {
            x = window.innerWidth - menuWidth - 20;
        }

        if (y + menuHeight > window.innerHeight) {
            y = window.innerHeight - menuHeight - 20;
        }

        setContextMenu({ x, y, item });
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

    const handleMoveTo = (item: DriveFile | DriveFolder) => {
        setFolderPickerConfig({
            title: 'Move to',
            actionLabel: 'Move here',
            mode: 'move',
            item
        });
        setShowFolderPicker(true);
        setContextMenu(null);
    };

    const handleCopyTo = (item: DriveFile | DriveFolder) => {
        handleCopy(item);
    };

    const handleFolderPickerSelect = async (targetFolderId: number | null) => {
        const { mode, item } = folderPickerConfig;
        if (!item) return;

        const userId = user?.id || 1;
        try {
            if (mode === 'move') {
                if ('file_type' in item) {
                    await driveService.moveFile(item.id, targetFolderId, userId);
                } else {
                    // Folders move logic could be added here
                    alert("Folder moving is not fully supported in the API yet.");
                }
            } else {
                if ('file_type' in item) {
                    // API might need target folder ID for copy
                    await driveService.copyFile(item.id, userId);
                    // For now copyFile just copies to same folder, but we could improve it
                }
            }
            loadDriveData();
        } catch (error) {
            console.error(`${mode} operation failed:`, error);
        }
    };

    const handleCheckOut = (fileId: number) => {
        setCheckedOutFiles(prev => {
            const next = new Set(prev);
            if (next.has(fileId)) next.delete(fileId);
            else next.add(fileId);
            return next;
        });
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
        const nameMatch = file.name?.toLowerCase().includes(activeSearchQuery.toLowerCase());

        // SAFE TAG HANDLING (prevents "void 0 is not a function")
        const tagList = Array.isArray(file.tags) ? file.tags : [];
        const tagMatch = tagList.some(tag =>
            tag.toLowerCase().includes(activeSearchQuery.toLowerCase())
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
        <div className="flex flex-col h-full">
            <div className="p-6 relative">
                <button
                    onClick={() => setShowNewMenu(!showNewMenu)}
                    className="flex items-center gap-4 px-6 py-4 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-[20px] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] dark:shadow-none border border-gray-100 dark:border-slate-700 hover:shadow-[0_15px_45px_-10px_rgba(0,0,0,0.15)] dark:hover:border-slate-600 transition-all duration-300 group w-full relative active:scale-95"
                >
                    <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center transition-transform duration-500 group-hover:rotate-90">
                        <Plus className="w-5 h-5 text-blue-600 dark:text-blue-400 font-bold" />
                    </div>
                    <span className="font-bold text-[15px] tracking-tight translate-y-[0.5px]">New</span>
                </button>

                {showNewMenu && (
                    <div className="absolute left-6 right-6 top-[calc(100%-4px)] z-50 bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25)] border border-white/20 dark:border-slate-700/50 py-2 animate-in fade-in zoom-in-95 duration-200 overflow-hidden ring-1 ring-black/5">
                        <button
                            onClick={() => { setShowNewFolder(true); setShowNewMenu(false); }}
                            className="w-full flex items-center gap-3 px-5 py-3 text-[14px] font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-slate-300 transition-colors"
                        >
                            <FolderPlus className="w-5 h-5 text-blue-500" />
                            <span>New folder</span>
                        </button>
                        <div className="h-px bg-gray-100 dark:bg-slate-700/50 mx-4" />
                        <button
                            onClick={() => { setShowUpload(true); setShowNewMenu(false); }}
                            className="w-full flex items-center gap-3 px-5 py-3 text-[14px] font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-slate-300 transition-colors"
                        >
                            <Upload className="w-5 h-5 text-purple-500" />
                            <span>File upload</span>
                        </button>
                    </div>
                )}
            </div>

            <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto no-scrollbar">
                {onSwitchToMail && (
                    <button
                        onClick={onSwitchToMail}
                        className="w-full flex items-center gap-3.5 px-4 py-3 text-[14px] font-bold rounded-2xl transition-all duration-200 text-gray-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 shadow-sm border border-transparent hover:border-gray-100 dark:hover:border-slate-700 group mb-4"
                    >
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Mail className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <span className="translate-y-[0.5px]">Switch to Mail</span>
                    </button>
                )}

                {[
                    { id: 'drive', label: 'My Drive', icon: HardDrive, path: '/drive', active: activeTab === 'drive' && activeFilter === 'all' },
                    { id: 'recent', label: 'Recent', icon: Clock, path: '/drive/recent', active: activeTab === 'recent' },
                    { id: 'starred', label: 'Starred', icon: Star, path: '/drive/starred', active: activeFilter === 'starred' },
                    { id: 'shared', label: 'Shared with me', icon: Users, path: '/drive/shared', active: activeFilter === 'shared' },
                    { id: 'trash', label: 'Trash', icon: Trash2, path: '/drive/trash', active: activeTab === 'trash' },
                    { id: 'meetings', label: 'Meetings', icon: Video, path: '/drive/meetings', active: activeTab === 'recordings' },
                ].map((item) => (
                    <button
                        key={item.id}
                        onClick={() => handleNavigation(item.path)}
                        className={`w-full flex items-center gap-3.5 px-4 py-2.5 text-[14px] font-bold rounded-2xl transition-all duration-200 relative group ${item.active
                            ? 'bg-blue-50/80 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 shadow-sm shadow-blue-500/5'
                            : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100/80 dark:hover:bg-slate-800/40'
                            }`}
                    >
                        {item.active && (
                            <div className="absolute left-0 w-1 h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />
                        )}
                        <item.icon className={`w-5 h-5 transition-colors ${item.active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-slate-300'}`} />
                        <span className="translate-y-[0.5px]">{item.label}</span>
                    </button>
                ))}
            </nav>

            <div className="p-6 mt-auto">
                {quota && (
                    <div className="bg-white/50 dark:bg-slate-800/30 rounded-2xl p-5 border border-gray-100 dark:border-slate-800/50">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-blue-100/50 dark:bg-blue-900/20 flex items-center justify-center">
                                <HardDrive className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[13px] font-bold text-gray-900 dark:text-white">Storage</span>
                                <span className="text-[11px] text-gray-500 font-medium">
                                    {quota.percentage_used}% used
                                </span>
                            </div>
                        </div>
                        <div className="h-2 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden mb-4">
                            <div
                                className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(59,130,246,0.3)]"
                                style={{ width: `${quota.percentage_used}%` }}
                            />
                        </div>
                        <p className="text-[11px] text-gray-400 font-medium text-center mb-4">
                            {driveService.formatFileSize(quota.used_bytes)} used of {driveService.formatFileSize(quota.quota_bytes)}
                        </p>
                        <button className="w-full py-2 bg-blue-600/[0.08] hover:bg-blue-600 hover:text-white dark:bg-blue-400/[0.08] dark:hover:bg-blue-400 dark:hover:text-slate-900 text-blue-600 dark:text-blue-400 rounded-xl text-[12px] font-bold transition-all active:scale-95 duration-300">
                            Buy Storage
                        </button>
                    </div>
                )}
            </div>
        </div>
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
                {/* Sub Header / Breadcrumbs & Selection Toolbar */}
                <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border-b border-gray-100 dark:border-slate-800/50 px-6 py-2 flex items-center justify-between min-h-[64px] sticky top-0 z-30">
                    {selectedItems.size > 0 ? (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200 w-full">
                            <button
                                onClick={() => setSelectedItems(new Set())}
                                className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-colors group shadow-sm ring-1 ring-black/5"
                            >
                                <X className="w-5 h-5 text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white" />
                            </button>
                            <span className="font-bold text-[15px] text-gray-900 dark:text-white ml-2">{selectedItems.size} selected</span>
                            <div className="h-6 w-px bg-gray-200 dark:bg-slate-800 mx-4" />
                            <div className="flex items-center gap-2">
                                <button className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-xl text-[13px] font-bold transition-all hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95"
                                    onClick={() => {
                                        const firstFile = files.find(f => selectedItems.has(f.id));
                                        if (firstFile) handleSummarize(firstFile);
                                    }}
                                >
                                    <Sparkles className={`w-4 h-4 ${isSummarizing ? 'animate-spin' : ''}`} />
                                    {isSummarizing ? 'Summarizing...' : 'Summarize'}
                                </button>
                                <div className="flex items-center gap-1 bg-white/50 dark:bg-slate-800/50 p-1 rounded-xl ring-1 ring-black/5">
                                    <button className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-gray-500 dark:text-slate-400 transition-colors" title="Share">
                                        <UserPlus className="w-4 h-4" />
                                    </button>
                                    <button className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-gray-500 dark:text-slate-400 transition-colors" title="Download">
                                        <Download className="w-4 h-4" />
                                    </button>
                                    <button
                                        className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-red-500 transition-colors"
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
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center overflow-x-auto no-scrollbar py-1 gap-1">
                                {breadcrumbs.map((crumb, idx) => (
                                    <div key={idx} className="flex items-center flex-shrink-0">
                                        <button
                                            onClick={() => handleBreadcrumbClick(crumb.id, idx)}
                                            className={`px-3 py-1.5 rounded-xl text-[22px] font-bold tracking-tight transition-all hover:bg-white dark:hover:bg-slate-800 hover:shadow-sm ${idx === breadcrumbs.length - 1 ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-500 hover:text-gray-600'}`}
                                        >
                                            {crumb.name}
                                        </button>
                                        {idx < breadcrumbs.length - 1 && (
                                            <ChevronRight className="w-4 h-4 text-gray-300 mx-0.5" />
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1 bg-white/50 dark:bg-slate-800/50 p-1 rounded-xl ring-1 ring-black/5">
                                    <button
                                        onClick={() => setViewMode('list')}
                                        className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white dark:bg-slate-900 shadow-sm text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                                    >
                                        <List className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setViewMode('grid')}
                                        className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-slate-900 shadow-sm text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                                    >
                                        <Grid3x3 className="w-4 h-4" />
                                    </button>
                                </div>
                                <button
                                    onClick={() => setShowAnalytics(true)}
                                    className="p-2.5 rounded-xl bg-white dark:bg-slate-800 text-gray-400 ring-1 ring-black/5 hover:text-gray-600 hover:bg-gray-50 transition-all"
                                    title="Activity Log"
                                >
                                    <Clock className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => setShowDetails(!showDetails)}
                                    className={`p-2.5 rounded-xl transition-all ${showDetails ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-white dark:bg-slate-800 text-gray-400 ring-1 ring-black/5 hover:text-gray-600'}`}
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
                        <div className="mb-10 px-6 sm:px-0">
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="text-[20px] font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
                                    Suggested
                                    <Sparkles className="w-4 h-4 text-blue-500" />
                                </h3>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                                {suggestedFiles.map((file) => (
                                    <div
                                        key={file.id}
                                        className="bg-white/40 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-900 rounded-[28px] border border-gray-100 dark:border-slate-800/80 p-5 hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] transition-all cursor-pointer group relative overflow-hidden flex flex-col items-center justify-center text-center ring-1 ring-black/[0.02]"
                                        onClick={() => { setPreviewFile(file); setShowPreview(true); }}
                                    >
                                        <div className="w-16 h-16 rounded-[22px] bg-gradient-to-br from-blue-50 to-blue-100/30 dark:from-blue-900/20 dark:to-blue-800/5 flex items-center justify-center mb-4 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3">
                                            {getFileIcon(file)}
                                        </div>
                                        <div className="space-y-1 w-full truncate">
                                            <p className="font-bold text-[14px] text-gray-900 dark:text-white truncate px-2">{file.name}</p>
                                            <p className="text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase tracking-[0.1em]">
                                                {file.file_type || 'File'} • {driveService.formatFileSize(file.size_bytes || (file as any).size || 0)}
                                            </p>
                                        </div>
                                        <button
                                            className="absolute top-4 right-4 p-2 bg-white/80 dark:bg-slate-800/80 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-sm ring-1 ring-black/5"
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
                        <div className="mb-10">
                            <h3 className="text-[20px] font-bold text-gray-900 dark:text-white mb-5 tracking-tight flex items-center gap-2">
                                Smart Insights
                                <Sparkles className="w-4 h-4 text-purple-500" />
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {Array.isArray(suggestions) && suggestions.length > 0 &&
                                    suggestions.slice(0, 2).map((suggestion, index) => (
                                        <div key={index} className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm p-6 rounded-[28px] border border-gray-100 dark:border-slate-800/50 shadow-sm flex flex-col group hover:shadow-xl hover:bg-white dark:hover:bg-slate-900 transition-all duration-300 ring-1 ring-black/[0.02]">
                                            <div className="flex items-start gap-4 mb-4">
                                                <div className="p-3.5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-[20px] shadow-inner">
                                                    <Sparkles className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-gray-900 dark:text-white text-[17px] tracking-tight">{suggestion.title}</h4>
                                                    <p className="text-gray-500 dark:text-slate-400 text-[13px] mt-1 font-medium leading-relaxed">{suggestion.description}</p>
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">Potential savings:</span>
                                                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold">
                                                            {driveService.formatFileSize(suggestion.potential_savings)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    if (suggestion.type === 'duplicate') setShowDuplicates(true);
                                                    else if (suggestion.type === 'large_file') setShowLargeFiles(true);
                                                }}
                                                className="mt-4 self-start px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[13px] font-bold rounded-xl hover:bg-black dark:hover:bg-gray-100 transition shadow-lg shadow-black/10 dark:shadow-white/5 active:scale-95"
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
                                            onContextMenu={(e) => handleContextMenu(e, folder)}
                                            className="group p-5 bg-white dark:bg-slate-900 rounded-[24px] border border-gray-100 dark:border-slate-800/80 hover:shadow-[0_20px_50px_-15px_rgba(0,0,0,0.08)] hover:-translate-y-1 transition-all cursor-pointer relative ring-1 ring-black/[0.02]"
                                        >
                                            <div className="flex flex-col items-center text-center">
                                                <div className="mb-4 relative">
                                                    <Folder className="w-14 h-14 text-blue-500" fill="currentColor" style={{ color: folder.color || '#3B82F6' }} />
                                                    <div className="absolute inset-0 bg-white/20 dark:bg-black/20 mix-blend-overlay rounded-lg" />
                                                </div>
                                                <p className="font-bold text-[14px] text-gray-900 dark:text-white truncate w-full px-2">{folder.name}</p>
                                                <p className="text-[11px] text-gray-500 dark:text-slate-500 mt-1 font-bold uppercase tracking-wider">
                                                    {folder?.file_count ?? 0} items
                                                </p>
                                            </div>
                                            <button
                                                className="absolute top-4 right-4 p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg text-gray-400 opacity-0 group-hover:opacity-100 transition-all"
                                                onClick={(e) => { e.stopPropagation(); handleContextMenu(e, folder); }}
                                            >
                                                <MoreVertical className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                    {Array.isArray(sortedFiles) && sortedFiles.map((file) => (
                                        <div
                                            key={`file-${file.id}`}
                                            onClick={() => { setPreviewFile(file); setShowPreview(true); }}
                                            onContextMenu={(e) => handleContextMenu(e, file)}
                                            className="group relative p-5 bg-white dark:bg-slate-900 rounded-[24px] border border-gray-100 dark:border-slate-800/80 hover:shadow-[0_20px_50px_-15px_rgba(0,0,0,0.1)] hover:-translate-y-1 transition-all cursor-pointer ring-1 ring-black/[0.02]"
                                        >
                                            <div className="flex flex-col items-center text-center">
                                                <div className="w-14 h-14 mb-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl flex items-center justify-center transition-transform duration-500 group-hover:scale-110">
                                                    {getFileIcon(file)}
                                                </div>
                                                <p className="font-bold text-[14px] text-gray-900 dark:text-white truncate w-full px-2">{file.name}</p>
                                                <p className="text-[11px] text-gray-500 dark:text-slate-500 mt-1 font-bold uppercase tracking-wider">
                                                    {file.file_type || 'File'} • {driveService.formatFileSize(file.size_bytes || (file as any).size)}
                                                </p>
                                            </div>
                                            <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleStarFile(file.id, !file.is_starred); }}
                                                    className="p-1.5 bg-white/80 dark:bg-slate-800/80 rounded-lg shadow-sm hover:bg-white transition-colors"
                                                >
                                                    <Star className={`w-3.5 h-3.5 ${file.is_starred ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleContextMenu(e, file); }}
                                                    className="p-1.5 bg-white/80 dark:bg-slate-800/80 rounded-lg shadow-sm hover:bg-white transition-colors"
                                                >
                                                    <MoreVertical className="w-3.5 h-3.5 text-gray-500" />
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
                {/* Hidden version upload input */}
                <input
                    type="file"
                    ref={versionInputRef}
                    className="hidden"
                    onChange={handleVersionFileUpload}
                />

                <StorageBreakdownModal isOpen={showStorageBreakdown} onClose={() => setShowStorageBreakdown(false)} userId={user?.id || 1} />
                <DuplicateFilesModal isOpen={showDuplicates} onClose={() => setShowDuplicates(false)} userId={user?.id || 1} onRefresh={loadDriveData} />
                <LargeFilesModal isOpen={showLargeFiles} onClose={() => setShowLargeFiles(false)} userId={user?.id || 1} onRefresh={loadDriveData} />
                <FileUploadModal isOpen={showUpload} onClose={() => setShowUpload(false)} onRefresh={loadDriveData} folderId={currentFolder} />
                <NewFolderModal isOpen={showNewFolder} onClose={() => setShowNewFolder(false)} onRefresh={loadDriveData} currentFolder={currentFolder} />
                <VersionHistoryModal isOpen={showVersionHistory} onClose={() => setShowVersionHistory(false)} file={contextMenu?.item && 'file_type' in contextMenu.item ? contextMenu.item as DriveFile : null} userId={user?.id || 1} onRefresh={loadDriveData} />
                <StorageAnalytics isOpen={showAnalytics} onClose={() => setShowAnalytics(false)} />
                <FilePreviewModal isOpen={showPreview} onClose={() => setShowPreview(false)} file={previewFile} allFiles={files} />
                {/* Share Permissions Modal */}
                {shareFile && (
                    <SharePermissionsModal
                        isOpen={showShare}
                        onClose={() => setShowShare(false)}
                        resourceType={!('file_type' in shareFile) ? 'FOLDER' : 'FILE'}
                        resourceId={shareFile.id}
                        resourceName={shareFile.name}
                        isOwner={!('permission' in shareFile) || shareFile.permission === 'OWNER' || shareFile.user_id === user?.id}
                    />
                )}
                <FolderPickerModal
                    isOpen={showFolderPicker}
                    onClose={() => setShowFolderPicker(false)}
                    title={folderPickerConfig.title}
                    actionLabel={folderPickerConfig.actionLabel}
                    onSelect={handleFolderPickerSelect}
                />
            </div>

            {/* Context Menu Overlay */}
            {
                contextMenu && (
                    <div
                        className="fixed inset-0 z-[100]"
                        onClick={() => setContextMenu(null)}
                        onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
                    >
                        <div
                            className="absolute bg-white dark:bg-slate-800 rounded-2xl shadow-[0_12px_40px_-10px_rgba(0,0,0,0.25)] dark:shadow-[0_12px_40px_-10px_rgba(0,0,0,0.6)] border border-gray-100 dark:border-slate-700 py-3 w-64 animate-in fade-in zoom-in-95 duration-100"
                            style={{ top: contextMenu.y, left: contextMenu.x }}
                        >
                            <div className="px-4 py-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-slate-700/50 mb-1 flex items-center justify-between">
                                <span className="truncate max-w-[180px]">{(contextMenu.item as any).name}</span>
                            </div>

                            {/* Group 1: Opening & viewing */}
                            <div className="py-1">
                                <button
                                    className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-300 transition-colors"
                                    onClick={() => handleOpen(contextMenu.item!)}
                                >
                                    <div className="flex items-center gap-3">
                                        <Eye className="w-4 h-4 text-gray-400" />
                                        <span>Preview</span>
                                    </div>
                                    <span className="text-[10px] text-gray-400 font-medium">Enter</span>
                                </button>
                                <button
                                    className={`w-full flex items-center justify-between px-4 py-2 text-sm transition-colors ${contextMenu?.item && 'permission' in contextMenu.item && contextMenu.item.permission && !['OWNER', 'EDIT'].includes(contextMenu.item.permission) ? 'opacity-50 cursor-not-allowed text-gray-400' : 'hover:bg-gray-100 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-300'}`}
                                    onClick={() => {
                                        if (contextMenu?.item && 'permission' in contextMenu.item && contextMenu.item.permission && !['OWNER', 'EDIT'].includes(contextMenu.item.permission)) {
                                            toast.error('You do not have permission to edit this item');
                                            return;
                                        }
                                        if (contextMenu?.item) handleRename(contextMenu.item);
                                    }}
                                >
                                    <div className="flex items-center gap-3">
                                        <Pencil className="w-4 h-4 text-gray-400" />
                                        <span>Rename</span>
                                    </div>
                                    <span className="text-[10px] text-gray-400 font-medium">R</span>
                                </button>
                                <button
                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-300 transition-colors"
                                    onClick={() => {
                                        if ('file_type' in contextMenu.item!) {
                                            window.open(driveService.getDownloadUrl(contextMenu.item.id, user?.id || 1), '_blank');
                                        }
                                        setContextMenu(null);
                                    }}
                                >
                                    <ExternalLink className="w-4 h-4 text-gray-400" />
                                    <span>Open in new tab</span>
                                </button>
                                <button className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-300 transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <MoreHorizontal className="w-4 h-4 text-gray-400" />
                                        <span>Open With</span>
                                    </div>
                                    <ChevronRight className="w-3 h-3 text-gray-400 group-hover:translate-x-0.5 transition-transform" />
                                </button>
                            </div>

                            <div className="h-px bg-gray-100 dark:bg-slate-700/50 my-1" />

                            {/* Group 2: Properties & Location */}
                            <div className="py-1">
                                <button
                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-300 transition-colors"
                                    onClick={() => handleInfo(contextMenu.item!)}
                                >
                                    <FileText className="w-4 h-4 text-gray-400" />
                                    <span>File information</span>
                                </button>
                                <button
                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-300 transition-colors"
                                    onClick={() => {
                                        if (contextMenu.item && 'folder_id' in contextMenu.item && contextMenu.item.folder_id) {
                                            // Navigate to parent folder
                                            setCurrentFolder(contextMenu.item.folder_id);
                                            setContextMenu(null);
                                        } else {
                                            // Already in root, navigate to root
                                            setCurrentFolder(null);
                                            setContextMenu(null);
                                        }
                                    }}
                                >
                                    <Navigation className="w-4 h-4 text-gray-400" />
                                    <span>Go to folder location</span>
                                </button>
                            </div>

                            <div className="h-px bg-gray-100 dark:bg-slate-700/50 my-1" />

                            {/* Group 3: Sharing */}
                            <div className="py-1">
                                {(!contextMenu.item || !('permission' in contextMenu.item) || contextMenu.item.permission === 'OWNER') && (
                                    <button
                                        className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-300 transition-colors group"
                                        onClick={() => { setShareFile(contextMenu.item as DriveFile); setShowShare(true); setContextMenu(null); }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <UserPlus className="w-4 h-4 text-gray-400" />
                                            <span>Share...</span>
                                        </div>
                                        <ChevronRight className="w-3 h-3 text-gray-400 group-hover:translate-x-0.5 transition-transform" />
                                    </button>
                                )}
                                <button
                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-300 transition-colors"
                                    onClick={() => handleGetLink(contextMenu.item!)}
                                >
                                    <Link className="w-4 h-4 text-gray-400" />
                                    <span>Copy Permalink</span>
                                </button>
                            </div>

                            <div className="h-px bg-gray-100 dark:bg-slate-700/50 my-1" />

                            {/* Group 4: Moving & Organization */}
                            <div className="py-1">
                                <button
                                    className={`w-full flex items-center justify-between px-4 py-2 text-sm transition-colors ${contextMenu?.item && 'permission' in contextMenu.item && contextMenu.item.permission && !['OWNER', 'EDIT', 'DOWNLOAD'].includes(contextMenu.item.permission) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-300'}`}
                                    onClick={() => {
                                        if (contextMenu?.item && 'permission' in contextMenu.item && contextMenu.item.permission && !['OWNER', 'EDIT', 'DOWNLOAD'].includes(contextMenu.item.permission)) {
                                            toast.error('You do not have permission to download this file');
                                            return;
                                        }
                                        if (contextMenu?.item) handleDownload(contextMenu.item);
                                    }}
                                >
                                    <div className="flex items-center gap-3">
                                        <Download className="w-4 h-4 text-gray-400" />
                                        <span>Download</span>
                                    </div>
                                    <span className="text-[10px] text-gray-400 font-medium">D</span>
                                </button>
                                <button
                                    className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-300 transition-colors"
                                    onClick={() => handleMoveTo(contextMenu.item!)}
                                >
                                    <div className="flex items-center gap-3">
                                        <Folder className="w-4 h-4 text-gray-400" />
                                        <span>Move To...</span>
                                    </div>
                                    <span className="text-[10px] text-gray-400 font-medium">Z</span>
                                </button>
                                <button
                                    className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-300 transition-colors"
                                    onClick={() => handleCopyTo(contextMenu.item!)}
                                >
                                    <div className="flex items-center gap-3">
                                        <Copy className="w-4 h-4 text-gray-400" />
                                        <span>Copy To...</span>
                                    </div>
                                    <span className="text-[10px] text-gray-400 font-medium">C</span>
                                </button>
                                <button
                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-300 transition-colors"
                                    onClick={() => {
                                        if (contextMenu?.item && 'file_type' in contextMenu.item) {
                                            handleCopy(contextMenu.item);
                                            toast.success('File copied! Use "Paste" to place it in a folder.');
                                        }
                                        setContextMenu(null);
                                    }}
                                >
                                    <Files className="w-4 h-4 text-gray-400" />
                                    <span>Make a copy</span>
                                </button>
                                <button
                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-300 transition-colors"
                                    onClick={() => {
                                        toast.success('📥 Offline mode coming soon!');
                                        setContextMenu(null);
                                    }}
                                >
                                    <CloudOff className="w-4 h-4 text-gray-400" />
                                    <span>Make available offline</span>
                                </button>
                                <button className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-300 transition-colors group relative">
                                    <div className="flex items-center gap-3">
                                        <Settings className="w-4 h-4 text-gray-400" />
                                        <span>Organize</span>
                                    </div>
                                    <ChevronRight className="w-3 h-3 text-gray-400 group-hover:translate-x-0.5 transition-transform" />

                                    {/* Submenu: Organize */}
                                    <div className="absolute left-full top-0 ml-1 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-100 dark:border-slate-700 py-2 w-56 hidden group-hover:block animate-in fade-in slide-in-from-left-2 duration-200">
                                        <button
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-300"
                                            onClick={() => {
                                                const item = contextMenu.item!;
                                                if ('file_type' in item) handleStarFile(item.id, !item.is_starred);
                                                setContextMenu(null);
                                            }}
                                        >
                                            <Star className={`w-4 h-4 ${(contextMenu.item! as any).is_starred ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
                                            <span>{(contextMenu.item! as any).is_starred ? 'Remove from Starred' : 'Add to Starred'}</span>
                                        </button>
                                        <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-300">
                                            <FolderPlus className="w-4 h-4 text-gray-400" />
                                            <span>Add to Workspace</span>
                                        </button>
                                    </div>
                                </button>
                            </div>

                            <div className="h-px bg-gray-100 dark:bg-slate-700/50 my-1" />

                            {/* Group 5: Advanced File Operations */}
                            <div className="py-1">
                                <button
                                    className={`w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-300 transition-colors ${checkedOutFiles.has(contextMenu.item!.id) ? 'bg-orange-50 dark:bg-orange-900/10' : ''}`}
                                    onClick={() => handleCheckOut(contextMenu.item!.id)}
                                >
                                    <div className="flex items-center gap-3">
                                        <Lock className={`w-4 h-4 ${checkedOutFiles.has(contextMenu.item!.id) ? 'text-orange-500' : 'text-gray-400'}`} />
                                        <span>{checkedOutFiles.has(contextMenu.item!.id) ? 'Check In' : 'Check Out...'}</span>
                                    </div>
                                    {checkedOutFiles.has(contextMenu.item!.id) && <span className="text-[9px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-bold uppercase">Locked</span>}
                                </button>
                                <button className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-300 transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <MoreHorizontal className="w-4 h-4 text-gray-400" />
                                        <span>More options</span>
                                    </div>
                                    <ChevronRight className="w-3 h-3 text-gray-400 group-hover:translate-x-0.5 transition-transform" />

                                    {/* Submenu: More options */}
                                    <div className="absolute left-full top-0 ml-1 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-100 dark:border-slate-700 py-2 w-56 hidden group-hover:block animate-in fade-in slide-in-from-left-2 duration-200">
                                        {contextMenu.item && 'file_type' in contextMenu.item && (
                                            <>
                                                <button
                                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium"
                                                    onClick={() => handleSummarize(contextMenu.item as DriveFile)}
                                                >
                                                    <Sparkles className={`w-4 h-4 ${isSummarizing ? 'animate-spin' : ''}`} />
                                                    <span>{isSummarizing ? 'Summarizing...' : 'Summarize file'}</span>
                                                </button>
                                                <button
                                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-300"
                                                    onClick={() => { setShowVersionHistory(true); setContextMenu(null); }}
                                                >
                                                    <History className="w-4 h-4 text-gray-400" />
                                                    <span>Version History</span>
                                                </button>
                                                <button
                                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
                                                    onClick={() => {
                                                        setTargetFileVersion(contextMenu.item as DriveFile);
                                                        versionInputRef.current?.click();
                                                        setContextMenu(null);
                                                    }}
                                                >
                                                    <Upload className="w-4 h-4" />
                                                    <span>Upload new version</span>
                                                </button>
                                                <div className="h-px bg-gray-100 dark:bg-slate-700/50 my-1" />
                                            </>
                                        )}
                                        <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-slate-700/50 text-gray-700 dark:text-slate-300">
                                            <Ban className="w-4 h-4 text-gray-400" />
                                            <span>Report / Block</span>
                                        </button>
                                    </div>
                                </button>
                            </div>

                            <div className="h-px bg-gray-100 dark:bg-slate-700/50 my-1" />

                            {/* Group 6: Destructive Actions */}
                            <div className="py-1">
                                <button
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 transition-colors"
                                    onClick={() => {
                                        if (confirm(`Move ${(contextMenu.item as any).name} to trash?`)) {
                                            driveService.moveToTrash(contextMenu.item!.id, user?.id || 1).then(() => {
                                                loadDriveData();
                                                setContextMenu(null);
                                            });
                                        }
                                    }}
                                >
                                    <Trash2 className="w-4 h-4" />
                                    <span className="font-medium">Move to Trash</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
