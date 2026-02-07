const db = require('./db');

async function run() {
    try {
        console.log("Connecting to DB...");
        const [users] = await db.query("SELECT id, email, full_name FROM users");
        console.log("Users found:", users.length);

        for (const u of users) {
            const userId = u.id;
            console.log(`\n--- User User: ${userId} (${u.email}) ---`);

            // Check Drive Files
            const [drive] = await db.query("SELECT COUNT(*) as count, SUM(size) as total_size FROM drive_files WHERE user_id = ?", [userId]);
            const driveSize = Number(drive[0].total_size || 0);
            console.log(`Drive Files: ${drive[0].count}, Total Size: ${driveSize}`);

            // Check Email Attachments
            // We want to sum up attachments where the user is the OWNER of the mailbox associated with the email?
            // Or attachments sent by the user?
            // The logic in storageController.js is:
            /*
            SELECT COALESCE(SUM(ea.size_bytes), 0) as total_size
            FROM email_attachments ea
            JOIN email_mailbox em ON ea.email_id = em.email_id
            WHERE em.user_id = ?
            */
            const [mail] = await db.query(`
                SELECT COUNT(*) as count, SUM(ea.size_bytes) as total_size
                FROM email_attachments ea
                JOIN email_mailbox em ON ea.email_id = em.email_id
                WHERE em.user_id = ?
            `, [userId]);

            const mailSize = Number(mail[0].total_size || 0);
            console.log(`Mail Attachments: ${mail[0].count}, Total Size: ${mailSize}`);

            // Check total directly
            const total = driveSize + mailSize;
            console.log(`Calculated Total: ${total} bytes (${(total / 1024 / 1024).toFixed(2)} MB)`);

            // Also check the raw queries to debug if 0
            if (total === 0) {
                console.log("  DEBUG: Checking for ANY attachments for this user...");
                const [anyMailbox] = await db.query("SELECT * FROM email_mailbox WHERE user_id = ? LIMIT 5", [userId]);
                console.log("  Mailbox entries:", anyMailbox.length);
                if (anyMailbox.length > 0) {
                    const emailIds = anyMailbox.map(m => m.email_id);
                    const [atts] = await db.query("SELECT * FROM email_attachments WHERE email_id IN (?)", [emailIds]);
                    console.log("  Attachments found for these emails:", atts.length);
                }
            }
        }

        process.exit(0);
    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
}

run();
