/**
 * Migration: Add category column to emails table
 * For categorizing emails (e.g., 'inbox', 'meeting_invite', 'notification')
 */

const db = require('../db');

async function up() {
    try {
        console.log('🔄 Adding category column to emails table...');

        // Check if column already exists
        const [columns] = await db.query(`
            SHOW COLUMNS FROM emails LIKE 'category'
        `);

        if (columns.length > 0) {
            console.log('✅ category column already exists, skipping...');
            return;
        }

        // Add category column
        await db.query(`
            ALTER TABLE emails 
            ADD COLUMN category VARCHAR(50) DEFAULT 'inbox'
        `);

        console.log('✅ category column added successfully!');

        // Create index for faster queries
        await db.query(`
            CREATE INDEX idx_emails_category ON emails(category)
        `);

        console.log('✅ Index created on category column!');

    } catch (err) {
        console.error('❌ Migration failed:', err);
        throw err;
    }
}

async function down() {
    try {
        console.log('🔄 Removing category column from emails table...');

        // Drop index first
        await db.query(`
            DROP INDEX idx_emails_category ON emails
        `);

        // Remove column
        await db.query(`
            ALTER TABLE emails 
            DROP COLUMN category
        `);

        console.log('✅ category column removed successfully!');

    } catch (err) {
        console.error('❌ Rollback failed:', err);
        throw err;
    }
}

// Run migration if called directly
if (require.main === module) {
    up()
        .then(() => {
            console.log('✅ Migration completed!');
            process.exit(0);
        })
        .catch((err) => {
            console.error('❌ Migration failed:', err);
            process.exit(1);
        });
}

module.exports = { up, down };
