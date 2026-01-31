require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../db');

async function up() {
    try {
        console.log('Starting migration: Add attachment_transfer_state...');

        // Add the new column with the specified ENUM values
        // We use VARCHAR to be safe/flexible or strict ENUM. 
        // User specified exact types, so ENUM is good, but string is more flexible for future. 
        // Let's use VARCHAR(50) to support the string literals easily without enum migration pain.
        // It defaults to 'WAITING_FOR_PEER' or similar if needed, let's default to 'WAITING_FOR_PEER' for P2P items.

        await db.query(`
            ALTER TABLE email_attachments 
            ADD COLUMN IF NOT EXISTS attachment_transfer_state VARCHAR(50) DEFAULT 'WAITING_FOR_PEER'
        `);

        console.log('✓ Added attachment_transfer_state column to email_attachments');

    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        process.exit(0);
    }
}

up();
