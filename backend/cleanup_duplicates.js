const db = require('./db');
const storageService = require('./storageService');

(async () => {
    console.log('=== Storage Cleanup Tool ===\n');

    const userId = 1;

    // Find duplicate attachments (same filename, size)
    const [duplicates] = await db.query(`
        SELECT ea.filename, ea.size_bytes, COUNT(*) as count, 
               GROUP_CONCAT(ea.id) as ids,
               GROUP_CONCAT(e.subject) as subjects
        FROM email_attachments ea
        JOIN emails e ON ea.email_id = e.id
        WHERE e.user_id = ?
        GROUP BY ea.filename, ea.size_bytes
        HAVING COUNT(*) > 1
        ORDER BY ea.size_bytes DESC
        LIMIT 20
    `, [userId]);

    console.log('Duplicate attachments found:');
    let totalDuplicateSize = 0;

    duplicates.forEach(d => {
        const sizeMB = (d.size_bytes / 1024 / 1024).toFixed(2);
        const duplicateSize = d.size_bytes * (d.count - 1); // Keep one, remove others
        totalDuplicateSize += duplicateSize;
        console.log(`  ${d.filename}`);
        console.log(`    Size: ${sizeMB} MB x ${d.count} copies = ${(d.size_bytes * d.count / 1024 / 1024).toFixed(2)} MB`);
        console.log(`    Can save: ${(duplicateSize / 1024 / 1024).toFixed(2)} MB by removing ${d.count - 1} duplicates`);
        console.log(`    IDs: ${d.ids}`);
        console.log('');
    });

    console.log(`Total potential savings: ${(totalDuplicateSize / 1024 / 1024 / 1024).toFixed(2)} GB\n`);

    // Show cleanup commands
    console.log('=== Cleanup Commands ===');
    console.log('To remove ALL duplicate attachments (keeping one of each):');
    console.log('');

    for (const d of duplicates) {
        const ids = d.ids.split(',');
        const idsToDelete = ids.slice(1); // Keep first, delete rest
        if (idsToDelete.length > 0) {
            console.log(`-- Remove ${idsToDelete.length} duplicates of ${d.filename}`);
            console.log(`DELETE FROM email_attachments WHERE id IN (${idsToDelete.join(',')});`);
        }
    }

    console.log('\n=== Manual Cleanup ===');
    console.log('Run these SQL commands to clean up duplicates, then recalculate storage.');

    process.exit(0);
})();
