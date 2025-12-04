/**
 * JeeDrive Service - Mock Data Implementation
 * This service provides mock data for the JeeDrive cloud storage feature
 * Backend team will replace these with actual API calls to MariaDB
 */

export interface DriveFile {
    id: number;
    user_id: number;
    folder_id: number | null;
    name: string;
    file_type: string;
    mime_type: string;
    size_bytes: number;
    storage_path: string;
    thumbnail_path?: string;
    is_starred: boolean;
    is_deleted: boolean;
    deleted_at?: string;
    tags: string[];
    created_at: string;
    updated_at: string;
}

export interface DriveFolder {
    id: number;
    user_id: number;
    parent_folder_id: number | null;
    name: string;
    color?: string;
    is_shared: boolean;
    file_count: number;
    total_size: number;
    created_at: string;
    updated_at: string;
}

export interface FileShare {
    id: number;
    file_id?: number;
    folder_id?: number;
    owner_id: number;
    shared_with_user_id: number;
    permission: 'view' | 'edit' | 'download' | 'full';
    expires_at?: string;
    created_at: string;
}

export interface DriveActivity {
    id: number;
    user_id: number;
    file_id?: number;
    folder_id?: number;
    action: 'upload' | 'download' | 'delete' | 'rename' | 'move' | 'share' | 'unshare' | 'restore';
    details: string;
    created_at: string;
}

export interface StorageBreakdown {
    by_type: {
        documents: number;
        images: number;
        videos: number;
        audio: number;
        archives: number;
        others: number;
    };
    by_folder: {
        folder_id: number;
        folder_name: string;
        size_bytes: number;
    }[];
    timeline: {
        date: string;
        size_bytes: number;
    }[];
}

// Mock data - Replace with actual API calls
const MOCK_FOLDERS: DriveFolder[] = [
    {
        id: 1,
        user_id: 1,
        parent_folder_id: null,
        name: 'Documents',
        color: '#3b82f6',
        is_shared: false,
        file_count: 15,
        total_size: 45000000,
        created_at: '2025-11-01T10:00:00Z',
        updated_at: '2025-11-30T15:30:00Z'
    },
    {
        id: 2,
        user_id: 1,
        parent_folder_id: null,
        name: 'Photos',
        color: '#8b5cf6',
        is_shared: false,
        file_count: 42,
        total_size: 320000000,
        created_at: '2025-11-05T14:20:00Z',
        updated_at: '2025-11-29T18:45:00Z'
    },
    {
        id: 3,
        user_id: 1,
        parent_folder_id: null,
        name: 'Projects',
        color: '#10b981',
        is_shared: true,
        file_count: 28,
        total_size: 180000000,
        created_at: '2025-11-10T09:15:00Z',
        updated_at: '2025-12-01T12:00:00Z'
    },
    {
        id: 4,
        user_id: 1,
        parent_folder_id: 1,
        name: 'Work Reports',
        color: '#f59e0b',
        is_shared: false,
        file_count: 8,
        total_size: 12000000,
        created_at: '2025-11-15T11:30:00Z',
        updated_at: '2025-11-28T16:20:00Z'
    },
    {
        id: 5,
        user_id: 1,
        parent_folder_id: 2,
        name: 'Vacation 2025',
        color: '#ef4444',
        is_shared: true,
        file_count: 35,
        total_size: 280000000,
        created_at: '2025-11-20T13:45:00Z',
        updated_at: '2025-11-30T20:10:00Z'
    }
];

const MOCK_FILES: DriveFile[] = [
    {
        id: 1,
        user_id: 1,
        folder_id: 1,
        name: 'Project_Proposal_2025.pdf',
        file_type: 'document',
        mime_type: 'application/pdf',
        size_bytes: 2500000,
        storage_path: '/storage/user1/documents/proposal.pdf',
        is_starred: true,
        is_deleted: false,
        tags: ['work', 'important', '2025'],
        created_at: '2025-11-25T10:30:00Z',
        updated_at: '2025-11-25T10:30:00Z'
    },
    {
        id: 2,
        user_id: 1,
        folder_id: 2,
        name: 'Beach_Sunset.jpg',
        file_type: 'image',
        mime_type: 'image/jpeg',
        size_bytes: 4200000,
        storage_path: '/storage/user1/photos/beach.jpg',
        thumbnail_path: '/storage/user1/photos/thumbs/beach_thumb.jpg',
        is_starred: false,
        is_deleted: false,
        tags: ['vacation', 'nature'],
        created_at: '2025-11-28T14:20:00Z',
        updated_at: '2025-11-28T14:20:00Z'
    },
    {
        id: 3,
        user_id: 1,
        folder_id: 3,
        name: 'Presentation_Draft.pptx',
        file_type: 'document',
        mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        size_bytes: 8500000,
        storage_path: '/storage/user1/projects/presentation.pptx',
        is_starred: true,
        is_deleted: false,
        tags: ['presentation', 'draft'],
        created_at: '2025-11-29T09:15:00Z',
        updated_at: '2025-11-30T16:45:00Z'
    },
    {
        id: 4,
        user_id: 1,
        folder_id: 2,
        name: 'Family_Video.mp4',
        file_type: 'video',
        mime_type: 'video/mp4',
        size_bytes: 125000000,
        storage_path: '/storage/user1/photos/family_video.mp4',
        thumbnail_path: '/storage/user1/photos/thumbs/family_video_thumb.jpg',
        is_starred: false,
        is_deleted: false,
        tags: ['family', 'memories'],
        created_at: '2025-11-27T18:30:00Z',
        updated_at: '2025-11-27T18:30:00Z'
    },
    {
        id: 5,
        user_id: 1,
        folder_id: 1,
        name: 'Budget_2025.xlsx',
        file_type: 'document',
        mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size_bytes: 1800000,
        storage_path: '/storage/user1/documents/budget.xlsx',
        is_starred: true,
        is_deleted: false,
        tags: ['finance', 'budget', '2025'],
        created_at: '2025-11-26T11:00:00Z',
        updated_at: '2025-11-30T14:20:00Z'
    },
    {
        id: 6,
        user_id: 1,
        folder_id: 3,
        name: 'Code_Archive.zip',
        file_type: 'archive',
        mime_type: 'application/zip',
        size_bytes: 45000000,
        storage_path: '/storage/user1/projects/code_archive.zip',
        is_starred: false,
        is_deleted: false,
        tags: ['code', 'backup'],
        created_at: '2025-11-24T15:45:00Z',
        updated_at: '2025-11-24T15:45:00Z'
    },
    {
        id: 7,
        user_id: 1,
        folder_id: 2,
        name: 'Mountain_Hike.jpg',
        file_type: 'image',
        mime_type: 'image/jpeg',
        size_bytes: 3800000,
        storage_path: '/storage/user1/photos/mountain.jpg',
        thumbnail_path: '/storage/user1/photos/thumbs/mountain_thumb.jpg',
        is_starred: true,
        is_deleted: false,
        tags: ['nature', 'hiking'],
        created_at: '2025-11-23T12:30:00Z',
        updated_at: '2025-11-23T12:30:00Z'
    },
    {
        id: 8,
        user_id: 1,
        folder_id: null,
        name: 'Meeting_Notes.docx',
        file_type: 'document',
        mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size_bytes: 850000,
        storage_path: '/storage/user1/root/meeting_notes.docx',
        is_starred: false,
        is_deleted: false,
        tags: ['notes', 'meeting'],
        created_at: '2025-12-01T09:00:00Z',
        updated_at: '2025-12-01T09:00:00Z'
    },
    {
        id: 9,
        user_id: 1,
        folder_id: 4,
        name: 'Q4_Report.pdf',
        file_type: 'document',
        mime_type: 'application/pdf',
        size_bytes: 3200000,
        storage_path: '/storage/user1/documents/work/q4_report.pdf',
        is_starred: false,
        is_deleted: false,
        tags: ['report', 'Q4', 'work'],
        created_at: '2025-11-22T16:15:00Z',
        updated_at: '2025-11-22T16:15:00Z'
    },
    {
        id: 10,
        user_id: 1,
        folder_id: 5,
        name: 'Beach_Panorama.jpg',
        file_type: 'image',
        mime_type: 'image/jpeg',
        size_bytes: 6500000,
        storage_path: '/storage/user1/photos/vacation/panorama.jpg',
        thumbnail_path: '/storage/user1/photos/vacation/thumbs/panorama_thumb.jpg',
        is_starred: true,
        is_deleted: false,
        tags: ['vacation', 'beach', 'panorama'],
        created_at: '2025-11-21T14:45:00Z',
        updated_at: '2025-11-21T14:45:00Z'
    }
];

const MOCK_ACTIVITY: DriveActivity[] = [
    {
        id: 1,
        user_id: 1,
        file_id: 8,
        action: 'upload',
        details: 'Uploaded Meeting_Notes.docx',
        created_at: '2025-12-01T09:00:00Z'
    },
    {
        id: 2,
        user_id: 1,
        file_id: 3,
        action: 'rename',
        details: 'Renamed file to Presentation_Draft.pptx',
        created_at: '2025-11-30T16:45:00Z'
    },
    {
        id: 3,
        user_id: 1,
        folder_id: 5,
        action: 'share',
        details: 'Shared Vacation 2025 folder',
        created_at: '2025-11-30T20:10:00Z'
    }
];

/**
 * Get all folders for a user
 */
export async function getFolders(userId: number): Promise<DriveFolder[]> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return MOCK_FOLDERS.filter(f => f.user_id === userId);
}

/**
 * Get folder contents (files and subfolders)
 */
export async function getFolderContents(folderId: number | null): Promise<{ files: DriveFile[], folders: DriveFolder[] }> {
    await new Promise(resolve => setTimeout(resolve, 300));

    const files = MOCK_FILES.filter(f => f.folder_id === folderId && !f.is_deleted);
    const folders = MOCK_FOLDERS.filter(f => f.parent_folder_id === folderId);

    return { files, folders };
}

/**
 * Get all files for a user
 */
export async function getAllFiles(userId: number): Promise<DriveFile[]> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return MOCK_FILES.filter(f => f.user_id === userId && !f.is_deleted);
}

/**
 * Get starred files
 */
export async function getStarredFiles(userId: number): Promise<DriveFile[]> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return MOCK_FILES.filter(f => f.user_id === userId && f.is_starred && !f.is_deleted);
}

/**
 * Get recent files
 */
export async function getRecentFiles(userId: number, limit: number = 10): Promise<DriveFile[]> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return MOCK_FILES
        .filter(f => f.user_id === userId && !f.is_deleted)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, limit);
}

/**
 * Get deleted files (trash)
 */
export async function getDeletedFiles(userId: number): Promise<DriveFile[]> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return MOCK_FILES.filter(f => f.user_id === userId && f.is_deleted);
}

/**
 * Search files
 */
export async function searchFiles(userId: number, query: string): Promise<DriveFile[]> {
    await new Promise(resolve => setTimeout(resolve, 300));
    const lowerQuery = query.toLowerCase();
    return MOCK_FILES.filter(f =>
        f.user_id === userId &&
        !f.is_deleted &&
        (f.name.toLowerCase().includes(lowerQuery) ||
            f.tags.some(tag => tag.toLowerCase().includes(lowerQuery)))
    );
}

/**
 * Get file by ID
 */
export async function getFileById(fileId: number): Promise<DriveFile | null> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return MOCK_FILES.find(f => f.id === fileId) || null;
}

/**
 * Star/unstar a file
 */
export async function toggleStarFile(fileId: number, starred: boolean): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 300));
    const file = MOCK_FILES.find(f => f.id === fileId);
    if (file) {
        file.is_starred = starred;
        return true;
    }
    return false;
}

/**
 * Delete file (move to trash)
 */
export async function deleteFile(fileId: number): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 300));
    const file = MOCK_FILES.find(f => f.id === fileId);
    if (file) {
        file.is_deleted = true;
        file.deleted_at = new Date().toISOString();
        return true;
    }
    return false;
}

/**
 * Restore file from trash
 */
export async function restoreFile(fileId: number): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 300));
    const file = MOCK_FILES.find(f => f.id === fileId);
    if (file) {
        file.is_deleted = false;
        file.deleted_at = undefined;
        return true;
    }
    return false;
}

/**
 * Get recent activity
 */
export async function getRecentActivity(userId: number, limit: number = 20): Promise<DriveActivity[]> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return MOCK_ACTIVITY
        .filter(a => a.user_id === userId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, limit);
}

/**
 * Format file size to human readable
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Get file icon based on type
 */
export function getFileIcon(fileType: string): string {
    const icons: Record<string, string> = {
        'document': '📄',
        'image': '🖼️',
        'video': '🎥',
        'audio': '🎵',
        'archive': '📦',
        'code': '💻'
    };
    return icons[fileType] || '📁';
}

/**
 * Get file color based on type
 */
export function getFileColor(fileType: string): string {
    const colors: Record<string, string> = {
        'document': '#3b82f6',
        'image': '#8b5cf6',
        'video': '#ef4444',
        'audio': '#10b981',
        'archive': '#f59e0b',
        'code': '#6366f1'
    };
    return colors[fileType] || '#6b7280';
}

export default {
    getFolders,
    getFolderContents,
    getAllFiles,
    getStarredFiles,
    getRecentFiles,
    getDeletedFiles,
    searchFiles,
    getFileById,
    toggleStarFile,
    deleteFile,
    restoreFile,
    getRecentActivity,
    formatFileSize,
    getFileIcon,
    getFileColor
};
