/**
 * Database migration for Gmail-style draft system
 * Run this to add necessary columns and tables
 */

const db = require('../db');

async function migrate() {
  console.log('Starting draft system migration...');

  try {
    // 1. Add draft_version column to emails table
    console.log('Adding draft_version column...');
    await db.query(`
      ALTER TABLE emails 
      ADD COLUMN IF NOT EXISTS draft_version INT DEFAULT NULL
    `);

    // 2. Add last_modified column to emails table
    console.log('Adding last_modified column...');
    await db.query(`
      ALTER TABLE emails 
      ADD COLUMN IF NOT EXISTS last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    `);

    // 3. Add original_message_id column (for tracking draft → sent transition)
    console.log('Adding original_message_id column...');
    await db.query(`
      ALTER TABLE emails 
      ADD COLUMN IF NOT EXISTS original_message_id VARCHAR(255) DEFAULT NULL
    `);

    // 4. Create draft_sync_queue table for offline sync
    console.log('Creating draft_sync_queue table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS draft_sync_queue (
        id INT AUTO_INCREMENT PRIMARY KEY,
        draft_id INT NOT NULL,
        user_id INT NOT NULL,
        changes JSON NOT NULL,
        version INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        synced BOOLEAN DEFAULT FALSE,
        INDEX idx_draft_user (draft_id, user_id),
        INDEX idx_synced (synced),
        INDEX idx_created (created_at)
      )
    `);

    // 5. Update existing drafts to have version = 1
    console.log('Initializing draft versions...');
    await db.query(`
      UPDATE emails 
      SET draft_version = 1 
      WHERE is_draft = 1 AND draft_version IS NULL
    `);

    // 6. Create index on is_draft for faster queries
    console.log('Creating indexes...');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_is_draft ON emails(is_draft)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_thread_draft ON emails(thread_id, is_draft)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_last_modified ON emails(last_modified)
    `);

    console.log('✓ Migration completed successfully!');
    console.log('');
    console.log('Summary:');
    console.log('- Added draft_version column to emails table');
    console.log('- Added last_modified column to emails table');
    console.log('- Added original_message_id column to emails table');
    console.log('- Created draft_sync_queue table');
    console.log('- Created necessary indexes');
    console.log('- Initialized existing drafts with version = 1');

  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  migrate()
    .then(() => {
      console.log('\nMigration complete. You can now use the draft system.');
      process.exit(0);
    })
    .catch(err => {
      console.error('\nMigration failed:', err);
      process.exit(1);
    });
}

module.exports = { migrate };
