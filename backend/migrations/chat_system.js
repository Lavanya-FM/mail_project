const db = require('../db');

async function up() {
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sender_email VARCHAR(255) NOT NULL,
                receiver_email VARCHAR(255) NOT NULL,
                content TEXT,
                file_url TEXT,
                type ENUM('text', 'file') DEFAULT 'text',
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_sender (sender_email),
                INDEX idx_receiver (receiver_email)
            )
        `);
        console.log('✅ Messages table created');
    } catch (err) {
        console.error('❌ Failed to create messages table:', err);
    } finally {
        process.exit(0);
    }
}

up();
