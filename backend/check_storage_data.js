const db = require('./db');

async function check() {
    try {
        const userId = 41;
        console.log('Checking storage data for user:', userId);

        // 1. Files
        const [files] = await db.query('SELECT COUNT(*) as count, SUM(size) as total_size FROM files WHERE owner_id = ?', [userId]);
        console.log('Files:', files[0]);

        // 2. Email attachments
        const [attachments] = await db.query(`
      SELECT COUNT(*) as count, SUM(size_bytes) as total_size
      FROM email_attachments
      WHERE email_id IN (
        SELECT DISTINCT email_id FROM email_mailbox WHERE user_id = ?
      )
    `, [userId]);
        console.log('Attachments:', attachments[0]);

        // 3. User limit
        const [user] = await db.query('SELECT storage_limit, storage_used_bytes FROM users WHERE id = ?', [userId]);
        console.log('User:', user[0]);

        // 4. All users
        const [allUsers] = await db.query('SELECT id, email, storage_limit FROM users');
        console.log('All Users:', allUsers);

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

check();
