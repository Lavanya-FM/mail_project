const db = require('../db');

async function migrate() {
    try {
        console.log("🚀 Starting Storage System Migration...");

        // 1. Create user_storage table
        await db.query(`
            CREATE TABLE IF NOT EXISTS user_storage (
                user_id INT PRIMARY KEY,
                total_bytes_used BIGINT DEFAULT 0,
                quota_bytes BIGINT DEFAULT 1073741824,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log("✅ user_storage table verified/created.");

        // 2. Initialize data for existing users
        const [users] = await db.query("SELECT id, storage_limit FROM users");

        for (const user of users) {
            const userId = user.id;
            const limit = user.storage_limit || 1073741824;

            // Calculate current usage
            // A. Drive Files (including recordings which are in 'files')
            const [[driveResult]] = await db.query(
                "SELECT COALESCE(SUM(size), 0) as total FROM files WHERE owner_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)",
                [userId]
            );

            // B. Email Attachments
            const [[emailResult]] = await db.query(`
                SELECT COALESCE(SUM(size_bytes), 0) as total
                FROM email_attachments
                WHERE email_id IN (SELECT DISTINCT email_id FROM email_mailbox WHERE user_id = ?)
            `, [userId]);

            const totalUsed = Number(driveResult.total) + Number(emailResult.total);

            await db.query(`
                INSERT INTO user_storage (user_id, total_bytes_used, quota_bytes)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    total_bytes_used = VALUES(total_bytes_used),
                    quota_bytes = VALUES(quota_bytes)
            `, [userId, totalUsed, limit]);

            console.log(`Initialized User ${userId}: ${totalUsed} bytes used, limit ${limit}`);
        }

        console.log("🏁 Migration Complete.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Migration Failed:", err);
        process.exit(1);
    }
}

migrate();
