const db = require('./backend/db');

async function run() {
    try {
        console.log("Connecting to DB...");
        const [users] = await db.query("SELECT id, email, full_name, storage_used, storage_limit FROM users");
        console.log("Users found:", users.length);

        for (const u of users) {
            console.log(`\n--- User User: ${u.id} (${u.email}) ---`);

            // Check Drive Files
            const [drive] = await db.query("SELECT COUNT(*) as count, SUM(size) as total_size FROM drive_files WHERE user_id = ?", [u.id]);
            console.log(`Drive Files: ${drive[0].count}, Total Size: ${drive[0].total_size}`);

            // Check Mail Attachments (via email_mailbox)
            // This assumes email_mailbox correctly links user to email
            const [mail] = await db.query(`
                SELECT COUNT(*) as count, SUM(ea.size_bytes) as total_size
                FROM email_attachments ea
                JOIN email_mailbox em ON ea.email_id = em.email_id
                WHERE em.user_id = ?
            `, [u.id]);

            console.log(`Mail Attachments: ${mail[0].count}, Total Size: ${mail[0].total_size}`);

            // Check total directly
            const total = Number(drive[0].total_size || 0) + Number(mail[0].total_size || 0);
            console.log(`Calculated Total: ${total} bytes (${(total / 1024 / 1024).toFixed(2)} MB)`);
        }

        process.exit(0);
    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
}

run();
