import { authService, getToken } from './authService';

const API = "/api/drive";

export interface DriveFolder {
    id: number;
    name: string;
    user_id: number;
    owner_id?: number;
    parent_id: number | null;
    parent_folder_id?: number | null;
    is_deleted: boolean;
    created_at: string;
    updated_at: string;
    file_count?: number;
    color?: string;
    permission?: 'OWNER' | 'VIEW' | 'EDIT' | 'DOWNLOAD';
}

export interface DriveFile {
    id: number;
    name: string;
    size_bytes: number;
    file_type: string;
    user_id: number;
    owner_id?: number;
    folder_id: number | null;
    is_starred: boolean;
    is_deleted: boolean;
    created_at: string;
    updated_at: string;
    storage_path?: string;
    is_missing?: boolean;
    version_current?: number;
    permission?: 'OWNER' | 'VIEW' | 'EDIT' | 'DOWNLOAD';
    tags?: string[];
    previewUrl?: string;
}

// Helper to add auth headers without messing up FormData content-type
function getAuthHeaders(isJson = true) {
    const token = getToken();
    const headers: HeadersInit = {};
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    if (isJson) {
        headers['Content-Type'] = 'application/json';
    }
    return headers;
}

/* ===============================
   UPLOAD FILE
================================ */
export async function uploadFile(file: File, userId: number, folderId: number | null, fileId?: number) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder_id", folderId ? folderId.toString() : "");
    if (fileId) fd.append("file_id", fileId.toString());

    // Do NOT set Content-Type for FormData, browser sets boundary
    const headers = getAuthHeaders(false);

    const res = await fetch(`${API}/upload?user_id=${userId}`, {
        method: "POST",
        headers,
        body: fd
    });

    return res.json();
}

/* ===============================
   GET FOLDER CONTENTS
================================ */
export async function getFolderContents(folderId: number | null, userId: number) {
    const res = await authService.fetchWithAuth(
        `${API}/contents?user_id=${userId}&folder_id=${folderId ?? ""}`
    );

    const data = await res.json();

    if (!data.success) return { files: [], folders: [] };

    const files = (data.files || []).map((file: any) => {
        const filename = file.filename || file.name || '';
        const ext = filename.split(".").pop()?.toLowerCase() || '';

        return {
            ...file,
            filename,
            name: filename,
            user_id: userId,
            file_type: ext,
            previewUrl: `/uploads/${userId}/${filename}`,
            size_bytes: file.size_bytes ?? file.size ?? 0,
            tags: file.tags || []
        };
    });

    return {
        files,
        folders: data.folders ?? []
    };
}

/* ===============================
   GET FOLDERS LIST
================================ */
export async function getFolders(userId: number, parentFolderId: number | null = null) {
    const res = await authService.fetchWithAuth(
        `${API}/folders?user_id=${userId}&parent_folder_id=${parentFolderId ?? ""}`
    );

    const data = await res.json();
    return data.folders || [];
}

/* ===============================
   CREATE FOLDER
================================ */
export async function createFolder(userId: number, parentId: number | null, name: string) {
    const res = await authService.fetchWithAuth(`${API}/folder`, {
        method: "POST",
        body: JSON.stringify({
            user_id: userId,
            parent_folder_id: parentId,
            name
        })
    });

    return res.json();
}

/* ===============================
   STAR / UNSTAR FILE
   Accepts (fileId, starred, userId) - userId optional for backward compat
================================ */
export async function toggleStarFile(fileId: number, starred: boolean, userId: number = 1) {
    const res = await authService.fetchWithAuth(`${API}/toggle-star`, {
        method: "POST",
        body: JSON.stringify({
            file_id: fileId,
            is_starred: starred,
            user_id: userId
        })
    });

    return res.json();
}

/* ===============================
   MOVE FILE TO FOLDER
================================ */
export async function moveFile(fileId: number, folderId: number | null, userId: number) {
    const res = await authService.fetchWithAuth(`${API}/move`, {
        method: "POST",
        body: JSON.stringify({
            file_id: fileId,
            folder_id: folderId,
            user_id: userId
        })
    });

    return res.json();
}

/* ===============================
   MOVE TO TRASH
================================ */
export async function moveToTrash(fileId: number, userId: number) {
    const res = await authService.fetchWithAuth(`${API}/trash`, {
        method: "POST",
        body: JSON.stringify({
            file_id: fileId,
            user_id: userId
        })
    });

    return res.json();
}

/* ===============================
   DELETE FILE (Frontend calls /delete)
================================ */
export async function deleteFile(fileId: number, userId: number) {
    const res = await authService.fetchWithAuth(`${API}/delete`, {
        method: "POST",
        body: JSON.stringify({
            file_id: fileId,
            user_id: userId
        })
    });

    return res.json();
}

/* ===============================
   RESTORE FROM TRASH
================================ */
export async function restoreFromTrash(fileId: number, userId: number) {
    const res = await authService.fetchWithAuth(`${API}/restore`, {
        method: "POST",
        body: JSON.stringify({
            file_id: fileId,
            user_id: userId
        })
    });

    return res.json();
}

/* ===============================
   DELETE PERMANENTLY
================================ */
export async function deletePermanently(fileId: number, userId: number) {
    const res = await authService.fetchWithAuth(`${API}/delete-permanent`, {
        method: "POST",
        body: JSON.stringify({
            file_id: fileId,
            user_id: userId
        })
    });

    return res.json();
}

/* ===============================
   EMPTY TRASH
================================ */
export async function emptyTrash(userId: number) {
    const res = await authService.fetchWithAuth(`${API}/empty-trash`, {
        method: "POST",
        body: JSON.stringify({ user_id: userId })
    });

    return res.json();
}

// Fetch trashed files
export async function getTrashFiles(userId: number) {
    const res = await authService.fetchWithAuth(`/api/drive/trash?user_id=${userId}`);

    if (!res.ok) {
        throw new Error('Failed to fetch trash files');
    }

    const data = await res.json();
    return data.files || [];
}

/* ===============================
   GET STARRED FILES
================================ */
export async function getStarredFiles(userId: number) {
    const res = await authService.fetchWithAuth(`${API}/starred?user_id=${userId}`);
    const data = await res.json();
    return data.files || [];
}

/* ===============================
   GET RECENT FILES
================================ */
export async function getRecentFiles(userId: number, limit = 20) {
    const res = await authService.fetchWithAuth(`${API}/recent?user_id=${userId}&limit=${limit}`);
    const data = await res.json();
    return data.files || [];
}

/* ===============================
   RENAME & COPY
================================ */
export async function rename(type: 'file' | 'folder', id: number, newName: string, userId: number) {
    const res = await authService.fetchWithAuth(`${API}/rename`, {
        method: "POST",
        body: JSON.stringify({ type, id, newName, user_id: userId })
    });
    return res.json();
}

export async function copyFile(fileId: number, userId: number) {
    const res = await authService.fetchWithAuth(`${API}/copy`, {
        method: "POST",
        body: JSON.stringify({ file_id: fileId, user_id: userId })
    });
    return res.json();
}

/* ===============================
   VERSION HISTORY
================================ */
export async function getFileVersionHistory(fileId: number, userId: number) {
    const res = await authService.fetchWithAuth(`${API}/files/${fileId}/versions?user_id=${userId}`);
    return res.json();
}

export async function restoreFileVersion(fileId: number, versionId: number, userId: number) {
    const res = await authService.fetchWithAuth(`${API}/files/${fileId}/versions/${versionId}/restore`, {
        method: "POST",
        body: JSON.stringify({ user_id: userId })
    });
    return res.json();
}

/* ===============================
   PREVIEW & DOWNLOAD URLS
================================ */
export function getPreviewUrl(fileId: number, userId: number) {
    return `${API}/files/${fileId}/preview?user_id=${userId}`;
}

export function getDownloadUrl(fileId: number, userId: number) {
    const token = getToken();
    const url = `${API}/files/${fileId}/download?user_id=${userId}`;
    return token ? `${url}&token=${token}` : url;
}

export interface PreviewInfo {
    success: boolean;
    fileType: string;
    mimeType: string;
    previewUrl: string;
}

export async function getPreviewInfo(fileId: number, userId: number): Promise<PreviewInfo> {
    const res = await authService.fetchWithAuth(`${API}/files/${fileId}/preview-info?user_id=${userId}`);
    return res.json();
}

/* ===============================
   UI helpers
================================ */
export function getFileColor(type?: string) {
    if (!type) return "#9CA3AF";
    const t = String(type).toLowerCase().trim();
    if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "tiff", "image"].includes(t)) return "#3B82F6";
    if (["mp4", "mov", "avi", "mkv", "webm", "video"].includes(t)) return "#8B5CF6";
    if (["pdf", "txt", "doc", "docx", "document"].includes(t)) return "#10B981";
    if (["zip", "rar", "7z", "tar", "gz", "archive"].includes(t)) return "#F59E0B";
    if (["mp3", "wav", "flac", "ogg", "audio"].includes(t)) return "#EF4444";
    return "#9CA3AF";
}

export function formatFileSize(bytes: number) {
    if (!bytes && bytes !== 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let val = Number(bytes);
    while (val >= 1024 && i < units.length - 1) {
        val /= 1024;
        i++;
    }
    return `${Math.round(val * 10) / 10} ${units[i]}`;
}

// --- Safety helpers injected by dev-assistant ---
export async function getTrash(userId: number) {
    try {
        const res = await authService.fetchWithAuth(`/api/drive/trash?user_id=${userId}`);
        const data = await res.json();
        return { files: Array.isArray(data?.files) ? data.files : [] };
    } catch (e) {
        console.error('driveService.getTrash ERROR', e);
        return { files: [] };
    }
}

/* ===============================
   STORAGE ANALYTICS
================================ */
export async function getUserQuota(userId: number) {
    const res = await authService.fetchWithAuth(`/api/storage/quota?user_id=${userId}`);
    return res.json();
}

export async function getOptimizationSuggestions(userId: number) {
    const res = await authService.fetchWithAuth(`/api/storage/suggestions?user_id=${userId}`);
    return res.json();
}

export async function getStorageBreakdown(userId: number) {
    const res = await authService.fetchWithAuth(`/api/storage/breakdown?user_id=${userId}`);
    return res.json();
}

export async function getLargeFiles(userId: number) {
    const res = await authService.fetchWithAuth(`/api/storage/large-files?user_id=${userId}`);
    return res.json();
}

export async function getDuplicateFiles(userId: number) {
    const res = await authService.fetchWithAuth(`/api/storage/duplicates?user_id=${userId}`);
    return res.json();
}
/* ===============================
   PERMISSION MANAGEMENT
================================ */
export async function getResourcePermissions(type: 'FILE' | 'FOLDER' | string, id: number) {
    const user = authService.getCurrentUser();
    const res = await authService.fetchWithAuth(`/api/permissions/resource?type=${type}&id=${id}&user_id=${user?.id}`);
    return res.json();
}

export async function grantPermission(type: 'FILE' | 'FOLDER' | string, id: number, email: string, permission: 'VIEW' | 'EDIT' | 'DOWNLOAD') {
    const user = authService.getCurrentUser();
    const res = await authService.fetchWithAuth('/api/permissions/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            resource_type: type,
            resource_id: id,
            user_email: email,
            permission: permission,
            granted_by: user?.id
        })
    });
    return res.json();
}

export async function revokePermission(type: 'FILE' | 'FOLDER' | string, id: number, userId: number, permission: 'VIEW' | 'EDIT' | 'DOWNLOAD') {
    const user = authService.getCurrentUser();
    const res = await authService.fetchWithAuth('/api/permissions/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            resource_type: type,
            resource_id: id,
            user_id: userId,
            permission: permission,
            revoked_by: user?.id
        })
    });
    return res.json();
}
