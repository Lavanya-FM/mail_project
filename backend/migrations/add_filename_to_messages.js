const db = require('../db');

async function migrate() {
    console.log('Starting migration: add_filename_to_messages...');
    try {
        await db.query(`
            ALTER TABLE messages
            ADD COLUMN file_name VARCHAR(255) NULL AFTER file_url
        `);
        console.log('✅ Added file_name column to messages table');
    } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
            console.log('ℹ️ Column file_name already exists, skipping.');
        } else {
            console.error('❌ Migration failed:', error);
            throw error;
        }
    }
}

if (require.main === module) {
    migrate()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = { migrate };
