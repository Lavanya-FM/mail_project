/**
 * backend/storageController.js
 * Handles storage quota calculations and analytics
 */
const express = require('express');
const db = require('./db');
const router = express.Router();

const storageService = require('./storageService');

// Get total storage usage for a user
router.get('/quota', async (req, res) => {
    try {
        const userId = req.query.user_id;
        if (!userId) {
            return res.status(400).json({ error: "user_id is required" });
        }

        // Rule 9: Unified Usage Retrieval (O(1))
        const usage = await storageService.getUserUsage(userId);

        // Optional: Get breakdown for display
        // We can do this dynamically or cache it. For now, let's keep it simple.
        const [driveResult] = await db.query(
            `SELECT COALESCE(SUM(size), 0) as total FROM files WHERE owner_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)`, [userId]
        );
        const [emailResult] = await db.query(
            `SELECT COALESCE(SUM(size_bytes), 0) as total FROM email_attachments WHERE email_id IN (SELECT DISTINCT email_id FROM email_mailbox WHERE user_id = ?)`, [userId]
        );

        const driveUsage = Number(driveResult[0]?.total || 0);
        const emailUsage = Number(emailResult[0]?.total || 0);

        res.json({
            user_id: userId,
            used_bytes: usage.usedBytes,
            quota_bytes: usage.quotaBytes,
            percentage_used: usage.percentUsed,
            breakdown: {
                drive: driveUsage,
                email: emailUsage,
                meet: 0 // Placeholder for Jeemeet specific if split
            }
        });

    } catch (err) {
        console.error('STORAGE QUOTA ERROR:', err);
        res.status(500).json({ error: "Failed to calculate storage quota" });
    }
});

router.get('/breakdown', async (req, res) => {
    try {
        const userId = req.query.user_id;
        if (!userId) return res.json({ images: 0, videos: 0, documents: 0, others: 0 });

        let images = 0, videos = 0, documents = 0, others = 0;

        // 1. Process Drive Files
        const [driveFiles] = await db.query(`
            SELECT name as filename, size 
            FROM files 
            WHERE owner_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
        `, [userId]);

        for (const file of driveFiles) {
            const ext = (file.filename || '').split('.').pop().toLowerCase();
            const size = Number(file.size || 0);
            if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) images += size;
            else if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) videos += size;
            else if (['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) documents += size;
            else others += size;
        }

        // 2. Process Email Attachments
        const [emailFiles] = await db.query(`
            SELECT filename, size_bytes as size, mime_type
            FROM email_attachments
            WHERE email_id IN (
                SELECT DISTINCT email_id FROM email_mailbox WHERE user_id = ?
            )
        `, [userId]);

        for (const file of emailFiles) {
            const ext = (file.filename || '').split('.').pop().toLowerCase();
            const mime = (file.mime_type || '').toLowerCase();
            const size = Number(file.size || 0);

            if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) images += size;
            else if (mime.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) videos += size;
            else if (mime.startsWith('application/pdf') || ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) documents += size;
            else others += size;
        }

        res.json({ images, videos, documents, others });
    } catch (e) {
        console.error("Storage breakdown error:", e);
        res.status(500).json({ error: "Failed to calculate breakdown", details: e.message });
    }
});

router.get('/large-files', async (req, res) => {
    try {
        const userId = req.query.user_id;
        if (!userId) return res.json({ files: [] });

        // 1. Get large Drive Files
        const [driveFiles] = await db.query(`
            SELECT id, name as filename, size as size_bytes, updated_at 
            FROM files 
            WHERE owner_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) AND size > 1048576 
            ORDER BY size DESC LIMIT 20
        `, [userId]);

        // 2. Get large Email Attachments
        const [emailFiles] = await db.query(`
            SELECT id, filename, size_bytes, created_at as updated_at
            FROM email_attachments
            WHERE email_id IN (SELECT email_id FROM email_mailbox WHERE user_id = ?)
              AND size_bytes > 1048576
            ORDER BY size_bytes DESC LIMIT 20
        `, [userId]);

        const allLarge = [
            ...driveFiles.map(f => ({ ...f, name: f.filename, source: 'Drive' })),
            ...emailFiles.map(f => ({ ...f, name: f.filename, source: 'Email' }))
        ].sort((a, b) => b.size_bytes - a.size_bytes).slice(0, 20);

        res.json({ files: allLarge });
    } catch (e) {
        console.error("Large files error:", e);
        res.json({ files: [] });
    }
});

router.get('/duplicates', async (req, res) => {
    res.json({ files: [] }); // Placeholder for now
});

router.get('/suggestions', async (req, res) => {
    try {
        const userId = req.query.user_id;
        if (!userId) return res.json({ suggestions: [] });

        const suggestions = [];

        // 1. Check if over quota
        const [userResult] = await db.query(`SELECT storage_limit FROM users WHERE id = ?`, [userId]);
        const limit = Number(userResult[0]?.storage_limit || 1073741824);

        const [driveResult] = await db.query(`SELECT SUM(size) as size FROM files WHERE owner_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)`, [userId]);
        const [emailResult] = await db.query(`SELECT SUM(size_bytes) as size FROM email_attachments WHERE email_id IN (SELECT email_id FROM email_mailbox WHERE user_id = ?)`, [userId]);

        const totalUsed = (Number(driveResult[0]?.size) || 0) + (Number(emailResult[0]?.size) || 0);

        if (totalUsed >= limit) {
            suggestions.push({
                title: "Storage Full",
                description: "You've exceeded your storage limit. New emails and files may not be saved.",
                potential_savings: totalUsed - limit,
                type: 'large_file',
                action: "Upgrade Now"
            });
        } else if (totalUsed > limit * 0.8) {
            suggestions.push({
                title: "Running Low on Space",
                description: "You have used more than 80% of your storage.",
                potential_savings: 0,
                type: 'large_file',
                action: "Manage Storage"
            });
        }

        // 2. Check for large files
        if (totalUsed > 0) {
            suggestions.push({
                title: "Clean up Large Files",
                description: "Review large attachments and files that are taking up space.",
                potential_savings: Math.min(totalUsed, 524288000), // Max 500MB suggested savings
                type: 'large_file',
                action: "View Large Files"
            });
        }

        res.json({ suggestions });
    } catch (e) {
        console.error("Suggestions error:", e);
        res.json({ suggestions: [] });
    }
});

module.exports = router;
