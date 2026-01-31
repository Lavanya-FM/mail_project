const db = require('../db');

async function up() {
    try {
        console.log('Starting P2P and Mail System robust logics migration...');

        // 1. Enhance email_attachments for better delivery tracking
        console.log('Altering email_attachments table...');
        await db.query(`
            ALTER TABLE email_attachments 
            ADD COLUMN IF NOT EXISTS delivery_status ENUM('PENDING', 'TRANSFERRING', 'DELIVERED', 'FAILED', 'FALLBACK') DEFAULT 'PENDING',
            ADD COLUMN IF NOT EXISTS fallback_triggered TINYINT(1) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS last_status_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        `);

        // 2. Create Immutable Delivery Logs
        console.log('Creating p2p_delivery_logs table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS p2p_delivery_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                attachment_id INT NOT NULL,
                p2p_message_id VARCHAR(255),
                sender_email VARCHAR(255) NOT NULL,
                recipient_email VARCHAR(255) NOT NULL,
                event_type ENUM('STARTED', 'PROGRESS', 'COMPLETED', 'FAILED', 'HASH_MISMATCH', 'FALLBACK_INITIATED'),
                event_metadata JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 3. Update Quota Accounting (add a column to users if not present)
        console.log('Altering users table for quota...');
        await db.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS storage_used_bytes BIGINT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS storage_limit_bytes BIGINT DEFAULT 1073741824 -- 1GB default
        `);

        console.log('✓ Migration completed!');
    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        process.exit(0);
    }
}

up();
