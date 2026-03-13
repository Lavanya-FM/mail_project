const db = require('../db');

async function up() {
    try {
        console.log('🔄 Creating file_versions table...');

        await db.query(`
            CREATE TABLE IF NOT EXISTS file_versions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                file_id INT NOT NULL,
                version_number INT NOT NULL,
                storage_path VARCHAR(512) NOT NULL,
                size BIGINT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (file_id),
                FOREIGN KEY (file_id) REFERENCES drive_files(id) ON DELETE CASCADE
            ) ENGINE=InnoDB;
        `);

        console.log('✅ file_versions table created successfully!');
    } catch (err) {
        console.error('❌ Migration failed:', err);
        throw err;
    }
}

if (require.main === module) {
    up().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { up };
