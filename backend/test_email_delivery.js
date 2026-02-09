const db = require('./db');

(async () => {
    try {
        console.log('=== Email Delivery Test ===\n');

        // Get recent emails
        const [recent] = await db.query(`
            SELECT e.id, e.subject, e.is_draft, e.from_email, e.created_at,
                   (SELECT COUNT(*) FROM email_mailbox em WHERE em.email_id = e.id) as mailbox_count
            FROM emails e 
            ORDER BY e.created_at DESC 
            LIMIT 5
        `);

        console.log('Recent emails:');
        for (const r of recent) {
            console.log(`  ID: ${r.id}, Subject: "${r.subject}", Draft: ${r.is_draft}, Mailboxes: ${r.mailbox_count}`);

            // Get mailbox details for this email
            const [mailboxes] = await db.query(`
                SELECT m.system_box, u.email as user_email
                FROM email_mailbox em
                JOIN mailboxes m ON em.mailbox_id = m.id
                JOIN users u ON em.user_id = u.id
                WHERE em.email_id = ?
            `, [r.id]);

            if (mailboxes.length > 0) {
                mailboxes.forEach(mb => {
                    console.log(`    → ${mb.user_email}: ${mb.system_box}`);
                });
            } else {
                console.log('    → NO MAILBOXES (ERROR!)');
            }
        }

        console.log('\n=== Folder Counts ===');
        const [folders] = await db.query(`
            SELECT m.system_box, u.email, COUNT(em.id) as count
            FROM mailboxes m
            JOIN users u ON m.user_id = u.id
            LEFT JOIN email_mailbox em ON em.mailbox_id = m.id
            WHERE m.system_box IN ('sent', 'inbox')
            GROUP BY m.id, m.system_box, u.email
            ORDER BY u.id, m.system_box
        `);

        folders.forEach(f => {
            console.log(`  ${f.email} - ${f.system_box}: ${f.count} emails`);
        });

    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
})();
