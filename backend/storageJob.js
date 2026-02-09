/**
 * backend/storageJob.js
 * Nightly reconciliation and cleanup job
 */
const db = require('./db');

async function reconcileStorage() {
    console.log("[StorageJob] 🚀 Starting Nightly Reconciliation...");
    try {
        const [users] = await db.query("SELECT id FROM users");

        for (const user of users) {
            const userId = user.id;

            // 1. Calculate Actual Usage
            const [[driveResult]] = await db.query(
                "SELECT COALESCE(SUM(size), 0) as total FROM files WHERE owner_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)",
                [userId]
            );

            const [[emailResult]] = await db.query(`
                SELECT COALESCE(SUM(size_bytes), 0) as total
                FROM email_attachments
                WHERE email_id IN (SELECT DISTINCT email_id FROM email_mailbox WHERE user_id = ?)
            `, [userId]);

            // Note: Add Jeemeet or other specific logic here if needed

            const actualUsed = Number(driveResult.total) + Number(emailResult.total);

            // 2. Update user_storage
            await db.query(`
                INSERT INTO user_storage (user_id, total_bytes_used)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE total_bytes_used = ?
            `, [userId, actualUsed, actualUsed]);

            console.log(`[StorageJob] Reconciled User ${userId}: ${actualUsed} bytes.`);
        }
        console.log("[StorageJob] ✅ Reconciliation Complete.");
    } catch (err) {
        console.error("[StorageJob] ❌ Reconciliation Failed:", err);
    }
}

async function purgeTrash() {
    console.log("[StorageJob] 🗑️ Starting Trash Purge...");
    try {
        const RETENTION_DAYS = 30;

        // 1. Purge Drive Files
        const [trashedFiles] = await db.query(`
            SELECT id, owner_id, size, storage_path 
            FROM files 
            WHERE is_deleted = 1 AND updated_at < (CURRENT_TIMESTAMP - INTERVAL ? DAY)
        `, [RETENTION_DAYS]);

        const fs = require('fs');
        const storageService = require('./storageService');

        for (const file of trashedFiles) {
            if (file.storage_path && fs.existsSync(file.storage_path)) {
                fs.unlinkSync(file.storage_path);
            }
            await db.query("DELETE FROM files WHERE id = ?", [file.id]);
            await storageService.updateUsage(file.owner_id, -file.size);
            console.log(`[StorageJob] Purged Drive File ${file.id} (Owner: ${file.owner_id})`);
        }

        // 2. Purge Emails (Already handled in mail.js if implemented there, but let's consolidate)
        // Note: Email permanent deletion is trickier due to sharing/multiple labels
        // For now, let's focus on Drive.

        console.log("[StorageJob] ✅ Trash Purge Complete.");
    } catch (err) {
        console.error("[StorageJob] ❌ Trash Purge Failed:", err);
    }
}

async function run() {
    await reconcileStorage();
    await purgeTrash();
    process.exit(0);
}

if (require.main === module) {
    run();
}

module.exports = { reconcileStorage, purgeTrash };
