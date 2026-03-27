/**
 * backend/storageService.js
 * Incremental storage accounting service (Gmail-style)
 */
const db = require('./db');

/**
 * Update a user's total storage usage by a specific delta.
 * @param {number|string} userId 
 * @param {number} deltaBytes - Positive to add, negative to subtract
 */
async function updateUsage(userId, deltaBytes) {
    if (!userId || deltaBytes === 0) return;
    try {
        await db.query(`
            INSERT INTO user_storage (user_id, total_bytes_used, quota_bytes)
            VALUES (?, ?, 26843545600)
            ON DUPLICATE KEY UPDATE 
                total_bytes_used = total_bytes_used + ?,
                updated_at = CURRENT_TIMESTAMP
        `, [userId, Math.max(0, deltaBytes), deltaBytes]); // Math.max(0, deltaBytes) is a fallback for the insert part if it doesn't exist

        console.log(`[StorageService] Updated User ${userId} usage by ${deltaBytes} bytes.`);
    } catch (err) {
        console.error(`[StorageService] Failed to update usage for User ${userId}:`, err);
    }
}

/**
 * Check if a user has enough space for an incoming file.
 * @param {number|string} userId 
 * @param {number} incomingSizeBytes 
 * @returns {Promise<boolean>}
 */
async function hasSpace(userId, incomingSizeBytes) {
    try {
        const [[storage]] = await db.query(
            "SELECT total_bytes_used, quota_bytes FROM user_storage WHERE user_id = ?",
            [userId]
        );

        if (!storage) return true; // Default behavior if not in table yet

        return (storage.total_bytes_used + incomingSizeBytes) <= storage.quota_bytes;
    } catch (err) {
        console.error(`[StorageService] Error checking space for User ${userId}:`, err);
        return true; // Fail safe (allow) during errors
    }
}

/**
 * Get accurate usage for a user.
 */
async function getUserUsage(userId) {
    const [[storage]] = await db.query(
        "SELECT total_bytes_used as usedBytes, quota_bytes as quotaBytes FROM user_storage WHERE user_id = ?",
        [userId]
    );

    if (!storage) {
        return { usedBytes: 0, quotaBytes: 26843545600, percentUsed: 0 };
    }

    const percentUsed = storage.quotaBytes > 0
        ? Math.min(100, Math.round((storage.usedBytes / storage.quotaBytes) * 100))
        : 0;

    return {
        usedBytes: Number(storage.usedBytes),
        quotaBytes: Number(storage.quotaBytes),
        percentUsed
    };
}

module.exports = {
    updateUsage,
    hasSpace,
    getUserUsage
};
