const db = require('./db');

(async () => {
    console.log('=== Storage Analysis for User 1 ===\n');

    // Get largest attachments
    const [large] = await db.query(`
        SELECT ea.id, ea.filename, ea.size_bytes, e.subject 
        FROM email_attachments ea 
        JOIN emails e ON ea.email_id = e.id 
        WHERE e.user_id = 1 
        ORDER BY ea.size_bytes DESC 
        LIMIT 10
    `);

    console.log('Top 10 largest attachments:');
    large.forEach(a => {
        const sizeMB = (a.size_bytes / 1024 / 1024).toFixed(2);
        console.log(`  ${sizeMB} MB - ${a.filename} (${a.subject || 'no subject'})`);
    });

    // Get total count
    const [[count]] = await db.query(`
        SELECT COUNT(*) as count, SUM(size_bytes) as total 
        FROM email_attachments ea 
        JOIN emails e ON ea.email_id = e.id 
        WHERE e.user_id = 1
    `);

    const totalGB = (count.total / 1024 / 1024 / 1024).toFixed(2);
    console.log(`\nTotal: ${count.count} attachments, ${totalGB} GB`);

    // Temporary fix: Set quota to 100 GB to allow sending
    console.log('\n=== Applying Temporary Fix ===');
    await db.query('UPDATE user_storage SET quota_bytes = ? WHERE user_id = 1', [107374182400]); // 100 GB
    console.log('✓ Increased quota to 100 GB');

    const [[verify]] = await db.query('SELECT total_bytes_used, quota_bytes FROM user_storage WHERE user_id = 1');
    const usedGB = (verify.total_bytes_used / 1024 / 1024 / 1024).toFixed(2);
    const quotaGB = (verify.quota_bytes / 1024 / 1024 / 1024).toFixed(2);
    const percent = ((verify.total_bytes_used / verify.quota_bytes) * 100).toFixed(1);

    console.log(`\nNew quota: ${usedGB} GB / ${quotaGB} GB (${percent}%)`);
    console.log('✓ User can now send emails!');

    process.exit(0);
})();
