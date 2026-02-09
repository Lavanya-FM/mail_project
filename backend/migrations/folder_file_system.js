const db = require('../db');

async function up() {
    try {
        console.log('🔄 Re-Creating JeeDrive Folders and Files tables...');

        // 0. Cleanup existing empty/incorrect tables if they exist
        // Drop files first because it might reference folders (though we saw no refs, safety first)
        await db.query(`DROP TABLE IF EXISTS files`);
        await db.query(`DROP TABLE IF EXISTS folders`);

        // 1. Folders Table
        await db.query(`
            CREATE TABLE folders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                parent_id INT NULL,
                owner_id INT NOT NULL,
                is_deleted TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX (parent_id),
                INDEX (owner_id),
                FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE SET NULL
            ) ENGINE=InnoDB;
        `);

        // 2. Files Table
        await db.query(`
            CREATE TABLE files (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                folder_id INT NULL,
                owner_id INT NOT NULL,
                size BIGINT DEFAULT 0,
                mime_type VARCHAR(100),
                storage_path VARCHAR(512),
                version_current INT DEFAULT 1,
                is_deleted TINYINT(1) DEFAULT 0,
                is_starred TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX (folder_id),
                INDEX (owner_id),
                FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
            ) ENGINE=InnoDB;
        `);

        console.log('✅ JeeDrive tables created successfully!');
    } catch (err) {
        console.error('❌ Migration failed:', err);
        throw err;
    }
}

if (require.main === module) {
    up().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { up };
