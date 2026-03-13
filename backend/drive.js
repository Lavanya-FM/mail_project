const express = require('express');
const router = express.Router();
const db = require('./db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const storageService = require('./storageService');

// Multer setup for both local and chunked uploads
const uploadDir = path.join(__dirname, 'uploads', 'drive');
const chunkDir = path.join(uploadDir, 'chunks');

[uploadDir, chunkDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `${unique}-${file.originalname}`);
    }
});

const upload = multer({ storage, limits: { fileSize: 1024 * 1024 * 500 } });

/* ===============================
   SECURITY CORE: PERMISSION ENFORCEMENT
================================ */
const permissionService = require('./permissionService');
const checkPermission = permissionService.checkPermission;

/* ===============================
   CHUNKED UPLOAD LOGIC
================================ */

// 1. Initialize Upload Session
router.post('/upload/init', async (req, res) => {
    const { name, size, type, folder_id, user_id, totalChunks } = req.body;
    if (!name || !size || !user_id) return res.status(400).json({ error: 'Missing metadata' });

    const sessionId = crypto.randomUUID();
    const storagePath = path.join(uploadDir, `${Date.now()}-${name}`);

    try {
        // Enforce permission for non-root uploads
        if (folder_id && !(await checkPermission('FOLDER', folder_id, user_id, 'EDIT'))) {
            return res.status(403).json({ error: 'Permission denied: Cannot upload to this folder.' });
        }

        // Rule 11: Enforce logic
        const canUpload = await storageService.hasSpace(user_id, size);
        if (!canUpload) {
            return res.status(403).json({ error: 'Storage quota exceeded. Please upgrade or free some space.' });
        }

        await db.query(
            `INSERT INTO upload_sessions (id, user_id, file_name, file_size, mime_type, folder_id, total_chunks, storage_path)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [sessionId, user_id, name, size, type, folder_id || null, totalChunks, storagePath]
        );
        res.json({ success: true, sessionId });
    } catch (err) {
        res.status(500).json({ error: 'Init failed' });
    }
});

// 2. Upload Chunk
router.post('/upload/chunk', upload.single('chunk'), async (req, res) => {
    const { sessionId, chunkIndex } = req.body;
    if (!req.file || !sessionId) return res.status(400).json({ error: 'Missing chunk data' });

    try {
        const [[session]] = await db.query('SELECT * FROM upload_sessions WHERE id = ?', [sessionId]);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        const chunkPath = path.join(chunkDir, `${sessionId}-${chunkIndex}`);
        fs.renameSync(req.file.path, chunkPath);

        await db.query('UPDATE upload_sessions SET uploaded_chunks = uploaded_chunks + 1 WHERE id = ?', [sessionId]);

        // Auto-finalize if last chunk
        if (parseInt(chunkIndex) === session.total_chunks - 1) {
            // Reassemble
            const writeStream = fs.createWriteStream(session.storage_path);
            for (let i = 0; i < session.total_chunks; i++) {
                const cPath = path.join(chunkDir, `${sessionId}-${i}`);
                const data = fs.readFileSync(cPath);
                writeStream.write(data);
                fs.unlinkSync(cPath); // Cleanup
            }
            writeStream.end();

            // Insert into files table
            const [result] = await db.query(
                `INSERT INTO drive_files (name, folder_id, owner_id, size, mime_type, storage_path, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [session.file_name, session.folder_id, session.user_id, session.file_size, session.mime_type, session.storage_path, session.user_id]
            );

            await db.query('UPDATE upload_sessions SET is_completed = 1 WHERE id = ?', [sessionId]);

            // Rule 3.1: Add usage on finalized writes
            await storageService.updateUsage(session.user_id, session.file_size);

            return res.json({ success: true, file_id: result.insertId, completed: true });
        }

        res.json({ success: true, chunkIndex });
    } catch (err) {
        console.error('Chunk upload error:', err);
        res.status(500).json({ error: 'Chunk failed' });
    }
});

/* ===============================
   CORE DRIVE OPERATIONS
================================ */

router.get('/contents', async (req, res) => {
    const userId = req.query.user_id || req.query.owner_id;
    const { folder_id, shared } = req.query;
    console.log(`[Drive] GET /contents - userId: ${userId}, folder_id: ${folder_id}, shared: ${shared}`);
    if (!userId) {
        console.warn(`[Drive] GET /contents - userId missing!`);
        return res.status(400).json({ error: 'user_id required' });
    }

    try {
        if (shared === 'true') {
            const [sharedFiles] = await db.query(
                `SELECT f.*, f.size as size_bytes, f.owner_id as user_id, f.mime_type as file_type, p.permission
                 FROM drive_files f
                 JOIN drive_permissions p ON f.id = p.resource_id
                 WHERE p.user_id = ? AND p.resource_type = 'FILE' AND f.is_deleted = 0`, [userId]
            );
            const [sharedFolders] = await db.query(
                `SELECT f.*, f.owner_id as user_id, p.permission
                 FROM drive_folders f
                 JOIN drive_permissions p ON f.id = p.resource_id
                 WHERE p.user_id = ? AND p.resource_type = 'FOLDER' AND f.is_deleted = 0`, [userId]
            );
            return res.json({ success: true, folders: sharedFolders, files: sharedFiles });
        }

        const fid = (folder_id === 'null' || !folder_id || folder_id === '0' || folder_id === '') ? null : folder_id;
        let folders, files;

        if (fid) {
            // Browsing a specific folder: check permission first
            if (!(await checkPermission('FOLDER', fid, userId, 'VIEW'))) {
                return res.status(403).json({ error: 'Access denied' });
            }
            [folders] = await db.query('SELECT *, owner_id as user_id FROM drive_folders WHERE parent_folder_id = ? AND is_deleted = 0 ORDER BY name ASC', [fid]);
            [files] = await db.query('SELECT *, size as size_bytes, owner_id as user_id, mime_type as file_type FROM drive_files WHERE folder_id = ? AND is_deleted = 0 ORDER BY name ASC', [fid]);
        } else {
            // Root level: only show items owned by the user
            [folders] = await db.query('SELECT *, owner_id as user_id FROM drive_folders WHERE owner_id = ? AND parent_folder_id IS NULL AND is_deleted = 0 ORDER BY name ASC', [userId]);
            [files] = await db.query('SELECT *, size as size_bytes, owner_id as user_id, mime_type as file_type FROM drive_files WHERE owner_id = ? AND folder_id IS NULL AND is_deleted = 0 ORDER BY name ASC', [userId]);
        }
        res.json({ success: true, folders, files });
    } catch (err) {
        console.error('[Drive] Error in /contents:', err);
        res.status(500).json({ error: 'Failed' });
    }
});

// Get folders list
router.get('/folders', async (req, res) => {
    const { user_id, parent_folder_id } = req.query;
    try {
        const pid = (parent_folder_id === 'null' || !parent_folder_id || parent_folder_id === '0' || parent_folder_id === '') ? null : parent_folder_id;
        const [folders] = await db.query('SELECT * FROM drive_folders WHERE owner_id = ? AND parent_folder_id <=> ? AND is_deleted = 0', [user_id, pid]);
        res.json({ success: true, folders });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

// Create folder
router.post('/folder', async (req, res) => {
    const { user_id, parent_folder_id, name } = req.body;
    try {
        if (parent_folder_id && !(await checkPermission('FOLDER', parent_folder_id, user_id, 'EDIT'))) {
            return res.status(403).json({ error: 'Permission denied: Cannot create folder here.' });
        }
        const [result] = await db.query('INSERT INTO drive_folders (owner_id, parent_folder_id, name) VALUES (?, ?, ?)', [user_id, parent_folder_id || null, name]);
        res.json({ success: true, folder_id: result.insertId });
    } catch (err) {
        console.error('Create folder error:', err);
        res.status(500).json({ error: 'Failed' });
    }
});

router.post('/upload', upload.single('file'), async (req, res) => {
    const { folder_id, file_id } = req.body;
    const user_id = req.query.user_id || req.body.user_id;
    if (!req.file || !user_id) return res.status(400).json({ error: 'Missing data' });

    try {
        // Enforce permission
        if (folder_id && !file_id && !(await checkPermission('FOLDER', folder_id, user_id, 'EDIT'))) {
            return res.status(403).json({ error: 'Permission denied: Cannot upload to this folder.' });
        }

        // Rule 11: Enforce logic
        const canUpload = await storageService.hasSpace(user_id, req.file.size);
        if (!canUpload) {
            return res.status(403).json({ error: 'Storage quota exceeded' });
        }

        if (file_id) {
            if (!(await checkPermission('FILE', file_id, user_id, 'EDIT'))) return res.status(403).json({ error: 'Forbidden' });
            const [[current]] = await db.query('SELECT * FROM drive_files WHERE id = ?', [file_id]);
            await db.query('INSERT INTO file_versions (file_id, version_number, storage_path, size) VALUES (?, ?, ?, ?)', [file_id, current.version_current, current.storage_path, current.size]);
            await db.query('UPDATE drive_files SET storage_path = ?, size = ?, version_current = version_current + 1, updated_at = NOW() WHERE id = ?', [req.file.path, req.file.size, file_id]);

            // Rule 3.2: New versions count toward usage
            await storageService.updateUsage(user_id, req.file.size);

            return res.json({ success: true, file_id });
        } else {
            const [result] = await db.query(`INSERT INTO drive_files (name, folder_id, owner_id, size, mime_type, storage_path, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, [req.file.originalname, folder_id || null, user_id, req.file.size, req.file.mimetype, req.file.path, user_id]);

            // Rule 3.1: Add usage
            await storageService.updateUsage(user_id, req.file.size);

            res.json({ success: true, file_id: result.insertId });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

/* ===============================
   PREVIEW METADATA & SIGNED URL
================================ */
router.get('/files/:id/preview-info', async (req, res) => {
    const { id } = req.params;
    const userId = req.query.user_id;

    if (!userId) return res.status(401).json({ error: 'Auth required' });

    try {
        if (!(await checkPermission('FILE', id, userId, 'VIEW'))) {
            return res.status(403).json({ error: 'View permission required' });
        }

        const [[file]] = await db.query('SELECT * FROM drive_files WHERE id = ? AND is_deleted = 0', [id]);
        if (!file) return res.status(404).json({ error: 'File not found' });

        // Generate short-lived signed token (10 minutes)
        const token = jwt.sign(
            { fileId: id, userId, type: 'preview' },
            process.env.JWT_SECRET || 'your_jwt_secret',
            { expiresIn: '10m' }
        );

        res.json({
            success: true,
            fileType: file.name.split('.').pop()?.toLowerCase(),
            mimeType: file.mime_type,
            previewUrl: `/api/drive/files/${id}/preview?token=${token}`
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate preview info' });
    }
});

/* ===============================
   PREVIEW STREAMING (SECURED)
================================ */
router.get('/files/:id/preview', async (req, res) => {
    const { id } = req.params;
    const { user_id, token } = req.query;

    let userId = user_id;

    // Verify Token if provided
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
            if (String(decoded.fileId) !== String(id)) return res.status(403).json({ error: 'Invalid token' });
            userId = decoded.userId;
        } catch (e) {
            return res.status(403).json({ error: 'Token expired or invalid' });
        }
    }

    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    try {
        if (!(await checkPermission('FILE', id, userId, 'VIEW'))) {
            return res.status(403).json({ error: 'View permission required' });
        }

        const [[file]] = await db.query('SELECT * FROM drive_files WHERE id = ? AND is_deleted = 0', [id]);
        if (!file || !fs.existsSync(file.storage_path)) return res.status(404).json({ error: 'File missing' });

        const stat = fs.statSync(file.storage_path);
        const range = req.headers.range;

        res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${file.name}"`);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); // Rule 4.2: Scalability & Stability

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
            const chunksize = (end - start) + 1;

            res.status(206).set({
                'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
            });
            fs.createReadStream(file.storage_path, { start, end }).pipe(res);
        } else {
            res.setHeader('Content-Length', stat.size);
            fs.createReadStream(file.storage_path).pipe(res);
        }
    } catch (err) {
        console.error('Preview stream error:', err);
        res.status(500).json({ error: 'Preview failed' });
    }
});

router.get('/starred', async (req, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    try {
        const [files] = await db.query(`
            (SELECT *, size as size_bytes, owner_id as user_id, mime_type as file_type, 'OWNER' as permission
             FROM drive_files
             WHERE owner_id = ? AND is_starred = 1 AND is_deleted = 0)
            UNION
            (SELECT f.*, f.size as size_bytes, f.owner_id as user_id, f.mime_type as file_type, p.permission
             FROM drive_files f
             JOIN drive_permissions p ON f.id = p.resource_id
             WHERE p.user_id = ? AND p.resource_type = 'FILE' AND f.is_starred = 1 AND f.is_deleted = 0)
        `, [user_id, user_id]);
        res.json({ success: true, files });
    } catch (err) {
        console.error('[Drive] Error in /starred:', err);
        res.status(500).json({ error: 'Failed' });
    }
});

router.get('/recent', async (req, res) => {
    const { user_id, limit } = req.query;
    console.log(`[Drive] GET /recent - user_id: ${user_id}, limit: ${limit}`);
    try {
        // Fetch files owned by user OR shared with user
        const [files] = await db.query(`
            (SELECT *, size as size_bytes, owner_id as user_id, mime_type as file_type, 'OWNER' as permission
             FROM drive_files
             WHERE owner_id = ? AND is_deleted = 0)
            UNION
            (SELECT f.*, f.size as size_bytes, f.owner_id as user_id, f.mime_type as file_type, p.permission
             FROM drive_files f
             JOIN drive_permissions p ON f.id = p.resource_id
             WHERE p.user_id = ? AND p.resource_type = 'FILE' AND f.is_deleted = 0)
            ORDER BY updated_at DESC LIMIT ?
        `, [user_id, user_id, parseInt(limit || '20')]);

        res.json({ success: true, files });
    } catch (err) {
        console.error('[Drive] Error in /recent:', err);
        res.status(500).json({ error: 'Failed' });
    }
});

router.post('/toggle-star', async (req, res) => {
    const { file_id, is_starred, user_id } = req.body;
    try {
        if (!(await checkPermission('FILE', file_id, user_id, 'VIEW'))) return res.status(403).json({ error: 'Forbidden' });
        await db.query('UPDATE drive_files SET is_starred = ? WHERE id = ?', [is_starred ? 1 : 0, file_id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.post('/move', async (req, res) => {
    const { file_id, folder_id, user_id } = req.body;
    try {
        if (!(await checkPermission('FILE', file_id, user_id, 'EDIT'))) return res.status(403).json({ error: 'Forbidden' });
        if (folder_id && !(await checkPermission('FOLDER', folder_id, user_id, 'EDIT'))) return res.status(403).json({ error: 'Forbidden' });
        await db.query('UPDATE drive_files SET folder_id = ? WHERE id = ?', [folder_id || null, file_id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.post('/share', async (req, res) => {
    const { type, id, user_id, target_user_id, permission_type } = req.body;
    try {
        if (!(await checkPermission(type, id, user_id, 'OWNER'))) return res.status(403).json({ error: 'Forbidden' });
        const col = type === 'file' ? 'resource_id' : 'resource_id'; // Both file and folder use resource_id
        const resourceType = type === 'file' ? 'FILE' : 'FOLDER';
        await db.query(`INSERT INTO drive_permissions (resource_id, resource_type, user_id, permission) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE permission = VALUES(permission)`, [id, resourceType, target_user_id, permission_type]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

// Restore from trash
router.post('/restore', async (req, res) => {
    const { file_id, user_id } = req.body;
    try {
        if (!(await checkPermission('FILE', file_id, user_id, 'EDIT'))) return res.status(403).json({ error: 'Forbidden' });
        await db.query('UPDATE drive_files SET is_deleted = 0 WHERE id = ?', [file_id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

// Delete permanently
router.post('/delete-permanent', async (req, res) => {
    const { file_id, user_id } = req.body;
    try {
        if (!(await checkPermission('FILE', file_id, user_id, 'OWNER'))) return res.status(403).json({ error: 'Forbidden' });
        const [[file]] = await db.query('SELECT storage_path, size FROM drive_files WHERE id = ?', [file_id]);
        if (file && fs.existsSync(file.storage_path)) fs.unlinkSync(file.storage_path);

        // Rule 4.1: Permanent deletion frees space (including all versions - Rule 6)
        if (file) {
            const [[versionsSum]] = await db.query('SELECT COALESCE(SUM(size), 0) as total FROM file_versions WHERE file_id = ?', [file_id]);
            const totalFreed = Number(file.size || 0) + Number(versionsSum.total || 0);

            await storageService.updateUsage(user_id, -totalFreed);

            // Cleanup version files from disk
            const [versions] = await db.query('SELECT storage_path FROM file_versions WHERE file_id = ?', [file_id]);
            versions.forEach(v => {
                if (v.storage_path && fs.existsSync(v.storage_path)) fs.unlinkSync(v.storage_path);
            });
        }

        await db.query('DELETE FROM file_versions WHERE file_id = ?', [file_id]);
        await db.query('DELETE FROM drive_files WHERE id = ?', [file_id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

// Empty trash
router.post('/empty-trash', async (req, res) => {
    const { user_id } = req.body;
    try {
        const [files] = await db.query('SELECT id, storage_path, size FROM drive_files WHERE owner_id = ? AND is_deleted = 1', [user_id]);
        let totalFreed = 0;

        for (const f of files) {
            if (f.storage_path && fs.existsSync(f.storage_path)) fs.unlinkSync(f.storage_path);

            const [[versionsSum]] = await db.query('SELECT COALESCE(SUM(size), 0) as total FROM file_versions WHERE file_id = ?', [f.id]);
            totalFreed += Number(f.size || 0) + Number(versionsSum.total || 0);

            // Cleanup version files from disk
            const [versions] = await db.query('SELECT storage_path FROM file_versions WHERE file_id = ?', [f.id]);
            versions.forEach(v => {
                if (v.storage_path && fs.existsSync(v.storage_path)) fs.unlinkSync(v.storage_path);
            });

            await db.query('DELETE FROM file_versions WHERE file_id = ?', [f.id]);
        }

        // Rule 4.2: Empty trash frees space
        await storageService.updateUsage(user_id, -totalFreed);

        await db.query('DELETE FROM drive_files WHERE owner_id = ? AND is_deleted = 1', [user_id]);
        await db.query('DELETE FROM drive_folders WHERE owner_id = ? AND is_deleted = 1', [user_id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.post('/trash', async (req, res) => {
    const { file_id, folder_id, user_id } = req.body;
    try {
        const type = file_id ? 'FILE' : 'FOLDER';
        const id = file_id || folder_id;
        if (!(await checkPermission(type, id, user_id, 'EDIT'))) return res.status(403).json({ error: 'Forbidden' });
        if (type === 'FILE') await db.query('UPDATE drive_files SET is_deleted = 1 WHERE id = ?', [id]);
        else {
            await db.query('UPDATE drive_folders SET is_deleted = 1 WHERE id = ?', [id]);
            await db.query('UPDATE drive_files SET is_deleted = 1 WHERE folder_id = ?', [id]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

// Alias for trash
router.post('/delete', async (req, res) => {
    const { file_id, user_id } = req.body;
    try {
        if (!(await checkPermission('FILE', file_id, user_id, 'EDIT'))) return res.status(403).json({ error: 'Forbidden' });
        await db.query('UPDATE drive_files SET is_deleted = 1 WHERE id = ?', [file_id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.get('/trash', async (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'user_id required' });

    try {
        const [files] = await db.query('SELECT *, size as size_bytes, owner_id as user_id, mime_type as file_type FROM drive_files WHERE owner_id = ? AND is_deleted = 1', [userId]);
        const [folders] = await db.query('SELECT *, owner_id as user_id FROM drive_folders WHERE owner_id = ? AND is_deleted = 1', [userId]);
        res.json({ success: true, folders, files });
    } catch (err) {
        console.error('[Drive] Error in /trash:', err);
        res.status(500).json({ error: 'Failed' });
    }
});

router.get('/files/:id/download', async (req, res) => {
    const { id } = req.params;
    let userId = req.query.user_id;
    const { token } = req.query;

    // Support token auth for direct download links
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
            // Support both old and new token formats
            userId = decoded.user?.id || decoded.id || decoded.userId;
        } catch (e) {
            console.warn('[Drive] Invalid download token:', e.message);
            // Fallback to query user_id if token invalid/expired, relying on it being handled downstream
        }
    }

    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    try {
        if (!(await checkPermission('FILE', id, userId, 'DOWNLOAD'))) {
            console.warn(`[Drive] Download denied for user ${userId} on file ${id}`);
            return res.status(403).json({ error: 'Forbidden' });
        }

        const [[file]] = await db.query('SELECT * FROM drive_files WHERE id = ?', [id]);
        if (!file || !fs.existsSync(file.storage_path)) {
            return res.status(404).json({ error: 'File not found' });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
        fs.createReadStream(file.storage_path).pipe(res);
    } catch (err) {
        console.error('[Drive] Download error:', err);
        res.status(500).json({ error: 'Failed' });
    }
});

// Rename file or folder
router.post('/rename', async (req, res) => {
    const { type, id, newName, user_id } = req.body;
    if (!type || !id || !newName || !user_id) return res.status(400).json({ error: 'Missing data' });

    try {
        if (!(await checkPermission(type, id, user_id, 'EDIT'))) return res.status(403).json({ error: 'Forbidden' });

        if (type === 'file') {
            await db.query('UPDATE drive_files SET name = ? WHERE id = ?', [newName, id]);
        } else {
            await db.query('UPDATE folders SET name = ? WHERE id = ?', [newName, id]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Rename failed' });
    }
});

// Make a copy of a file
router.post('/copy', async (req, res) => {
    const { file_id, user_id } = req.body;
    if (!file_id || !user_id) return res.status(400).json({ error: 'Missing data' });

    try {
        if (!(await checkPermission('FILE', file_id, user_id, 'VIEW'))) return res.status(403).json({ error: 'Forbidden' });

        const [[file]] = await db.query('SELECT * FROM drive_files WHERE id = ?', [file_id]);
        if (!file) return res.status(404).json({ error: 'File not found' });

        // Check storage quota
        const canUpload = await storageService.hasSpace(user_id, file.size);
        if (!canUpload) return res.status(403).json({ error: 'Storage quota exceeded' });

        const newName = `Copy of ${file.name}`;
        const newPath = path.join(uploadDir, `${Date.now()}-copy-${file.name}`);

        // Copy file on disk
        if (fs.existsSync(file.storage_path)) {
            fs.copyFileSync(file.storage_path, newPath);
        } else {
            return res.status(404).json({ error: 'Source file missing on disk' });
        }

        // Determine target folder: if user doesn't have EDIT on current folder, put in root
        let targetFolderId = file.folder_id;
        if (targetFolderId) {
            const hasEdit = await checkPermission('FOLDER', targetFolderId, user_id, 'EDIT');
            if (!hasEdit) targetFolderId = null;
        }

        // Insert into DB
        const [result] = await db.query(
            `INSERT INTO drive_files (name, folder_id, owner_id, size, mime_type, storage_path, user_id) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [newName, targetFolderId, user_id, file.size, file.mime_type, newPath, user_id]
        );

        await storageService.updateUsage(user_id, file.size);

        res.json({ success: true, file_id: result.insertId });
    } catch (err) {
        console.error('Copy file error:', err);
        res.status(500).json({ error: 'Copy failed' });
    }
});

// GET Version History
router.get('/files/:id/versions', async (req, res) => {
    const { id } = req.params;
    const userId = req.query.user_id;
    if (!userId) return res.status(401).json({ error: 'Auth required' });

    try {
        if (!(await checkPermission('FILE', id, userId, 'VIEW'))) return res.status(403).json({ error: 'Forbidden' });

        const [versions] = await db.query(
            'SELECT * FROM file_versions WHERE file_id = ? ORDER BY version_number DESC',
            [id]
        );
        res.json({ success: true, versions });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch versions' });
    }
});

// RESTORE a Version
router.post('/files/:id/versions/:versionId/restore', async (req, res) => {
    const { id, versionId } = req.params;
    const { user_id } = req.body;
    if (!user_id) return res.status(401).json({ error: 'Auth required' });

    try {
        if (!(await checkPermission('FILE', id, user_id, 'EDIT'))) return res.status(403).json({ error: 'Forbidden' });

        const [[file]] = await db.query('SELECT * FROM drive_files WHERE id = ?', [id]);
        const [[version]] = await db.query('SELECT * FROM file_versions WHERE id = ? AND file_id = ?', [versionId, id]);

        if (!file || !version) return res.status(404).json({ error: 'File or version not found' });

        // 1. Save current as a "new" version before restoring (optional, but safer)
        // For simplicity, we'll just swap.

        const oldPath = file.storage_path;
        const oldSize = file.size;
        const oldVersionNum = file.version_current;

        // 2. Update current file with version data
        await db.query(
            'UPDATE drive_files SET storage_path = ?, size = ?, version_current = version_current + 1, updated_at = NOW() WHERE id = ?',
            [version.storage_path, version.size, id]
        );

        // 3. Keep the "old" current as a version entry
        await db.query(
            'INSERT INTO file_versions (file_id, version_number, storage_path, size) VALUES (?, ?, ?, ?)',
            [id, oldVersionNum, oldPath, oldSize]
        );

        // 4. Optionally delete the restored version entry from file_versions to prevent duplicates?
        // Actually, better to just keep it. 

        res.json({ success: true });
    } catch (err) {
        console.error('Restore version error:', err);
        res.status(500).json({ error: 'Restore failed' });
    }
});

module.exports = router;
