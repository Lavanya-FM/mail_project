const db = require('../db');

async function up() {
    try {
        console.log('🔄 Ensuring versioning columns exist in drive_files...');

        // 0. Ensure storage_path exists (some old schemas used filepath)
        try {
            await db.query('SELECT storage_path FROM drive_files LIMIT 1');
        } catch (e) {
            console.log('Adding storage_path column to drive_files...');
            await db.query('ALTER TABLE drive_files ADD COLUMN storage_path VARCHAR(512)');
            // Sync from filepath if it exists
            try {
                await db.query('UPDATE drive_files SET storage_path = filepath WHERE storage_path IS NULL AND filepath IS NOT NULL');
                console.log('✅ Synced data from filepath to storage_path');
            } catch (e2) {
                // filepath might not exist either, that's fine
            }
        }

        // 1. Add version_current to drive_files if missing
        try {
            await db.query('SELECT version_current FROM drive_files LIMIT 1');
        } catch (e) {
            console.log('Adding version_current column to drive_files...');
            await db.query('ALTER TABLE drive_files ADD COLUMN version_current INT DEFAULT 1');
        }

        // 2. Add size column to drive_files if missing (some old schemas used size_bytes)
        // Check if size exists
        try {
            await db.query('SELECT size FROM drive_files LIMIT 1');
        } catch (e) {
            console.log('Adding size column to drive_files...');
            await db.query('ALTER TABLE drive_files ADD COLUMN size BIGINT DEFAULT 0 AFTER name');
        }

        // 3. Add mime_type to drive_files if missing
        try {
            await db.query('SELECT mime_type FROM drive_files LIMIT 1');
        } catch (e) {
            console.log('Adding mime_type column to drive_files...');
            await db.query('ALTER TABLE drive_files ADD COLUMN mime_type VARCHAR(100) AFTER size');
        }

        // 4. Ensure file_versions table references the correct table
        // We drop and recreate it if it's already there to fix the foreign key
        console.log('🔄 Re-verifying file_versions table...');
        await db.query('DROP TABLE IF EXISTS file_versions');

        await db.query(`
            CREATE TABLE file_versions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                file_id BIGINT NOT NULL,
                version_number INT NOT NULL,
                storage_path VARCHAR(512) NOT NULL,
                size BIGINT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (file_id),
                FOREIGN KEY (file_id) REFERENCES drive_files(id) ON DELETE CASCADE
            ) ENGINE=InnoDB;
        `);

        console.log('✅ Versioning columns and table verified!');
    } catch (err) {
        console.error('❌ Migration failed:', err);
        throw err;
    }
}

if (require.main === module) {
    up().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { up };
