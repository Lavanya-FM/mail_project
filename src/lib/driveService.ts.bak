const API = "/api/drive";

/* ===============================
   UPLOAD FILE
================================ */
export async function uploadFile(file: File, userId: number, folderId: number | null) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder_id", folderId ? folderId.toString() : "");

    const res = await fetch(`${API}/upload?user_id=${userId}`, {
        method: "POST",
        body: fd
    });

    return res.json();
}

/* ===============================
   GET FOLDER CONTENTS
================================ */
export async function getFolderContents(folderId: number | null, userId: number) {
    const res = await fetch(
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
    const res = await fetch(
        `${API}/folders?user_id=${userId}&parent_folder_id=${parentFolderId ?? ""}`
    );

    const data = await res.json();
    return data.folders || [];
}

/* ===============================
   CREATE FOLDER
================================ */
export async function createFolder(userId: number, parentId: number | null, name: string) {
    const res = await fetch(`${API}/folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    const res = await fetch(`${API}/toggle-star`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    const res = await fetch(`${API}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    const res = await fetch(`${API}/trash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    const res = await fetch(`${API}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    const res = await fetch(`${API}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    const res = await fetch(`${API}/delete-permanent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    const res = await fetch(`${API}/empty-trash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId })
    });

    return res.json();
}

/* ===============================
   GET STARRED FILES
================================ */
export async function getStarredFiles(userId: number) {
    const res = await fetch(`${API}/starred?user_id=${userId}`);
    const data = await res.json();
    return data.files || [];
}

/* ===============================
   GET RECENT FILES
================================ */
export async function getRecentFiles(userId: number, limit = 20) {
    const res = await fetch(`${API}/recent?user_id=${userId}&limit=${limit}`);
    const data = await res.json();
    return data.files || [];
}

/* ===============================
   UI helpers
================================ */
export function getFileColor(type?: string) {
  if (!type) return "#9CA3AF";
  const t = String(type).toLowerCase().trim();
  if (["jpg","jpeg","png","gif","webp","svg","bmp","ico","tiff","image"].includes(t)) return "#3B82F6";
  if (["mp4","mov","avi","mkv","webm","video"].includes(t)) return "#8B5CF6";
  if (["pdf","txt","doc","docx","document"].includes(t)) return "#10B981";
  if (["zip","rar","7z","tar","gz","archive"].includes(t)) return "#F59E0B";
  if (["mp3","wav","flac","ogg","audio"].includes(t)) return "#EF4444";
  return "#9CA3AF";
}

export function formatFileSize(bytes: number) {
  if (!bytes && bytes !== 0) return "0 B";
  const units = ["B","KB","MB","GB","TB"];
  let i = 0;
  let val = Number(bytes);
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${Math.round(val * 10) / 10} ${units[i]}`;
}
