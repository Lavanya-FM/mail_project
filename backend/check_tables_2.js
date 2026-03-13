const db = require('./db');
async function check() {
    try {
        const [files] = await db.query('DESCRIBE files');
        console.log('files columns:', files.map(c => c.Field));
        try {
            const [drive_files] = await db.query('DESCRIBE drive_files');
            console.log('drive_files columns:', drive_files.map(c => c.Field));
        } catch (e) { console.log('drive_files DOES NOT EXIST'); }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
check();
