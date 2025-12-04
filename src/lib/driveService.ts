/**
 * JeeDrive Service
 * Backend implementation required for data fetching.
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
const MOCK_FOLDERS: DriveFolder[] = [];

const MOCK_FILES: DriveFile[] = [];

const MOCK_ACTIVITY: DriveActivity[] = [];

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
