const db = require('../db');

async function run() {
    console.log('--- Migrating: Threading System ---');

    let conn;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        // 1. Create Conversations Table
        // Stores aggregated conversation metadata
        await conn.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        subject_normalized VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        participant_hash VARCHAR(64),
        INDEX idx_subject_norm (subject_normalized),
        INDEX idx_last_message (last_message_at)
      )
    `);

        // 2. Add Threading Columns to emails table one by one to avoid syntax errors if column exists
        // We use a helper function to add column if not exists
        const addColumn = async (colDef) => {
            try {
                await conn.query(`ALTER TABLE emails ADD COLUMN ${colDef}`);
            } catch (e) {
                // Ignore duplicate column error (1060)
                if (e.errno !== 1060) console.warn(`Note on adding column ${colDef}: ${e.message}`);
            }
        };

        await addColumn("subject_normalized VARCHAR(255)");
        await addColumn("references_header TEXT");
        await addColumn("conversation_id INT");

        // 3. Modify columns (ensure correct type/length)
        try {
            await conn.query(`ALTER TABLE emails MODIFY COLUMN message_id VARCHAR(255)`);
        } catch (e) { console.warn("Note on modify message_id: " + e.message); }

        try {
            await conn.query(`ALTER TABLE emails MODIFY COLUMN in_reply_to VARCHAR(255)`);
        } catch (e) { console.warn("Note on modify in_reply_to: " + e.message); }

        // 4. Create Indices
        const createIndex = async (idxName, colName) => {
            try {
                await conn.query(`CREATE INDEX ${idxName} ON emails (${colName})`);
            } catch (e) {
                // Ignore duplicate index error (1061)
                if (e.errno !== 1061) console.warn(`Note on index ${idxName}: ${e.message}`);
            }
        };

        await createIndex('idx_email_message_id', 'message_id');
        await createIndex('idx_email_in_reply_to', 'in_reply_to');
        await createIndex('idx_email_conversation_id', 'conversation_id');
        await createIndex('idx_email_subject_norm', 'subject_normalized');

        // 5. Backfill conversation_id from thread_id (legacy support)
        // If we have a thread_id but no conversation_id, set it.
        await conn.query(`
        UPDATE emails 
        SET conversation_id = thread_id 
        WHERE conversation_id IS NULL AND thread_id IS NOT NULL
    `);

        await conn.commit();
        console.log('--- Migration: Threading System Complete ---');

    } catch (err) {
        if (conn) await conn.rollback();
        console.error('Migration Failed:', err);
        process.exit(1);
    } finally {
        if (conn) conn.release();
        process.exit(0);
    }
}

run();
