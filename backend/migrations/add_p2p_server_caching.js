const db = require('../db');

async function up() {
    try {
        console.log('Creating p2p_server_chunks table...');
        await db.query(`
      CREATE TABLE IF NOT EXISTS p2p_server_chunks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        message_id VARCHAR(255) NOT NULL,
        chunk_index INT NOT NULL,
        sender_email VARCHAR(255) NOT NULL,
        recipient_email VARCHAR(255) NOT NULL,
        data_path TEXT NOT NULL,
        expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL 24 HOUR),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY idx_msg_chunk (message_id, chunk_index)
      )
    `);
        console.log('✓ Migration completed!');
    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        process.exit(0);
    }
}

up();
