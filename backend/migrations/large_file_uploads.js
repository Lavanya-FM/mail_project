const db = require('../db');

async function up() {
    try {
        console.log('🔄 Creating Chunked Uploads storage...');

        // 1. Upload Chunks Table (for trackability and resume support)
        await db.query(`
            CREATE TABLE IF NOT EXISTS upload_sessions (
                id VARCHAR(128) PRIMARY KEY,
                user_id INT NOT NULL,
                file_name VARCHAR(255) NOT NULL,
                file_size BIGINT NOT NULL,
                mime_type VARCHAR(100),
                folder_id INT NULL,
                total_chunks INT NOT NULL,
                uploaded_chunks INT DEFAULT 0,
                storage_path VARCHAR(512) NOT NULL,
                is_completed TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (user_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB;
        `);

        console.log('✅ Chunked Upload tables created!');
    } catch (err) {
        console.error('❌ Migration failed:', err);
        throw err;
    }
}

if (require.main === module) {
    up().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { up };
