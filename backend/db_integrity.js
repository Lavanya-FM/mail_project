const db = require('./db');
async function run() {
    try {
        console.log('--- DB INTEGRITY CHECK ---');
        const tasks = [
            "ALTER TABLE drive_files ADD COLUMN IF NOT EXISTS owner_id INT DEFAULT 0",
            "ALTER TABLE drive_files ADD COLUMN IF NOT EXISTS is_deleted TINYINT(1) DEFAULT 0",
            "ALTER TABLE drive_files ADD COLUMN IF NOT EXISTS is_starred TINYINT(1) DEFAULT 0",
            "ALTER TABLE drive_files ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100)",
            "ALTER TABLE drive_folders ADD COLUMN IF NOT EXISTS owner_id INT DEFAULT 0",
            "ALTER TABLE drive_folders ADD COLUMN IF NOT EXISTS is_deleted TINYINT(1) DEFAULT 0",
            "ALTER TABLE drive_folders ADD COLUMN IF NOT EXISTS parent_folder_id INT",
            "UPDATE drive_files SET owner_id = user_id WHERE owner_id = 0",
            "UPDATE drive_folders SET owner_id = user_id WHERE owner_id = 0"
        ];
        for (const sql of tasks) {
            try {
                await db.query(sql);
                console.log(`✅ SUCCESS: ${sql}`);
            } catch (e) {
                console.log(`❌ FAILED: ${sql} - ${e.message}`);
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
