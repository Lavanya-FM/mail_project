const db = require('../db');

async function up() {
    try {
        console.log('🔄 Creating Permissions and Versioning tables...');

        // 1. File/Folder Permissions
        await db.query(`
            CREATE TABLE IF NOT EXISTS file_permissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                file_id INT NULL,
                folder_id INT NULL,
                user_id INT NOT NULL,
                permission_type ENUM('VIEW', 'EDIT', 'DOWNLOAD') NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (file_id),
                INDEX (folder_id),
                INDEX (user_id),
                FOREIGN KEY (file_id) REFERENCES drive_files(id) ON DELETE CASCADE,
                FOREIGN KEY (folder_id) REFERENCES drive_folders(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB;
        `);

        // 2. File Versions
        await db.query(`
            CREATE TABLE IF NOT EXISTS file_versions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                file_id INT NOT NULL,
                version_number INT NOT NULL,
                storage_path VARCHAR(512) NOT NULL,
                size BIGINT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (file_id),
                FOREIGN KEY (file_id) REFERENCES drive_files(id) ON DELETE CASCADE
            ) ENGINE=InnoDB;
        `);

        console.log('✅ JeeDrive Security & Versioning tables created!');
    } catch (err) {
        console.error('❌ Migration failed:', err);
        throw err;
    }
}

if (require.main === module) {
    up().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { up };
