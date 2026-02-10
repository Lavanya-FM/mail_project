const db = require('./db');

async function checkOrphans() {
    try {
        const [orphans] = await db.query(`
      SELECT em.id, em.email_id, em.mailbox_id, em.user_id 
      FROM email_mailbox em 
      LEFT JOIN emails e ON em.email_id = e.id 
      WHERE e.id IS NULL
    `);

        console.log(`Found ${orphans.length} orphaned email_mailbox entries.`);
        if (orphans.length > 0) {
            console.log('Sample orphans:', orphans.slice(0, 5));
        }

        const [mailboxes] = await db.query("SELECT * FROM mailboxes");
        console.log('Mailboxes:', mailboxes.map(m => ({ id: m.id, name: m.name, system_box: m.system_box })));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkOrphans();
