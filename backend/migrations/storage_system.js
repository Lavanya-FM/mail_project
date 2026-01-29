const db = require('../db');

async function up() {
    try {
        console.log('Starting storage system migration...');

        console.log('Creating drive_files table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS drive_files (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                name VARCHAR(255),
                filename VARCHAR(255) NOT NULL,
                filepath VARCHAR(255) NOT NULL,
                size BIGINT DEFAULT 0,
                is_starred TINYINT(1) DEFAULT 0,
                is_deleted TINYINT(1) DEFAULT 0,
                folder_id INT,
                deleted_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('Creating email_attachments table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS email_attachments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email_id INT NOT NULL,
                filename VARCHAR(255),
                mime_type VARCHAR(100),
                size_bytes BIGINT DEFAULT 0,
                content_base64 LONGTEXT,
                delivery_mode VARCHAR(20),
                delivered TINYINT(1) DEFAULT 0,
                p2p_message_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('Creating drive_folders table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS drive_folders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                parent_folder_id INT DEFAULT NULL,
                name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        console.log('Creating p2p_peers table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS p2p_peers (
                user_id INT NOT NULL,
                email VARCHAR(255) PRIMARY KEY,
                connection_id VARCHAR(255),
                is_online TINYINT(1) DEFAULT 0,
                public_key JSON,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        console.log('Creating p2p_file_metadata table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS p2p_file_metadata (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email_id INT,
                message_id VARCHAR(255) UNIQUE,
                sender_email VARCHAR(255),
                recipient_email VARCHAR(255),
                filename VARCHAR(255),
                mime_type VARCHAR(100),
                size_bytes BIGINT,
                checksum_sha256 VARCHAR(64),
                status VARCHAR(50) DEFAULT 'initiated',
                delivered_at TIMESTAMP NULL,
                completed_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('Creating email_mailbox table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS email_mailbox (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                email_id INT NOT NULL,
                mailbox_id INT,
                is_read TINYINT(1) DEFAULT 0,
                is_starred TINYINT(1) DEFAULT 0,
                UNIQUE KEY unique_user_email (user_id, email_id)
            )
        `);

        console.log('✓ Migration completed successfully!');
    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        process.exit(0);
    }
}

up();
