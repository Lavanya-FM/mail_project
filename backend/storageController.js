/**
 * backend/storageController.js
 * Handles storage quota calculations and analytics
 */
const express = require('express');
const db = require('./db');
const router = express.Router();

// Get total storage usage for a user
router.get('/quota', async (req, res) => {
    try {
        const userId = req.query.user_id;
        if (!userId) {
            return res.status(400).json({ error: "user_id is required" });
        }

        console.log(`[Storage] Calculating quota for user ${userId}`);

        // 1. Get Drive Usage
        const [driveResult] = await db.query(
            `SELECT COALESCE(SUM(size), 0) as total_size 
             FROM drive_files 
             WHERE user_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)`,
            [userId]
        );
        const driveUsage = Number(driveResult[0]?.total_size || 0);

        // 2. Get Email Attachments Usage
        // Use subquery to get distinct emails to avoid double counting due to multiple mailbox labels
        const [emailResult] = await db.query(
            `SELECT COALESCE(SUM(size_bytes), 0) as total_size
             FROM email_attachments
             WHERE email_id IN (
                 SELECT DISTINCT email_id FROM email_mailbox WHERE user_id = ?
             )`,
            [userId]
        );
        const emailUsage = Number(emailResult[0]?.total_size || 0);

        const totalUsed = driveUsage + emailUsage;

        console.log(`[Storage] User ${userId}: Drive=${driveUsage}, Email=${emailUsage}, Total=${totalUsed}`);

        // 3. Get User Limit
        const [userResult] = await db.query(
            `SELECT storage_limit FROM users WHERE id = ?`,
            [userId]
        );
        const limit = Number(userResult[0]?.storage_limit || 1073741824); // Default 1GB

        res.json({
            user_id: userId,
            storage_used_bytes: totalUsed,
            storage_limit_bytes: limit,
            breakdown: {
                drive_bytes: driveUsage,
                email_bytes: emailUsage
            },
            // Debug info for frontend to display if needed
            debug: {
                drive_usage_raw: driveResult[0]?.total_size,
                email_usage_raw: emailResult[0]?.total_size
            }
        });

    } catch (err) {
        console.error('STORAGE QUOTA ERROR:', err);
        res.status(500).json({ error: "Failed to calculate storage quota", details: err.message });
    }
});

router.get('/breakdown', async (req, res) => {
    try {
        const userId = req.query.user_id; // authJwt ensures req.user but we use query for consistency with service
        if (!userId) return res.json({ images: 0, videos: 0, documents: 0, others: 0 });

        // Simple categorization based on file_type or mime_type if available
        // For now, let's just query drive_files extensions
        const [rows] = await db.query(`
            SELECT filename, size 
            FROM drive_files 
            WHERE user_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
        `, [userId]);

        let images = 0, videos = 0, documents = 0, others = 0;

        for (const file of rows) {
            const ext = (file.filename || '').split('.').pop().toLowerCase();
            const size = Number(file.size || 0);

            if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) images += size;
            else if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) videos += size;
            else if (['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) documents += size;
            else others += size;
        }

        res.json({ images, videos, documents, others });
    } catch (e) {
        console.error("Storage breakdown error:", e);
        res.json({ images: 0, videos: 0, documents: 0, others: 0 });
    }
});

router.get('/large-files', async (req, res) => {
    try {
        const userId = req.query.user_id;
        const [files] = await db.query(`
            SELECT id, filename, size as size_bytes, updated_at 
            FROM drive_files 
            WHERE user_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) AND size > 10485760 
            ORDER BY size DESC LIMIT 10
        `, [userId]);

        // Map to format expected by frontend
        const mapped = files.map(f => ({
            id: f.id,
            name: f.filename,
            size_bytes: f.size_bytes,
            updated_at: f.updated_at
        }));

        res.json({ files: mapped });
    } catch (e) {
        res.json({ files: [] });
    }
});

router.get('/duplicates', async (req, res) => {
    res.json({ files: [] }); // Placeholder for now
});

router.get('/suggestions', async (req, res) => {
    res.json({ suggestions: [] }); // Placeholder
});

module.exports = router;
