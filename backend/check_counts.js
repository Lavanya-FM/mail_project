const db = require('./db');
async function check() {
    try {
        const [f] = await db.query('SELECT COUNT(*) as c FROM files').catch(e => [{ c: 'ERROR' }]);
        const [df] = await db.query('SELECT COUNT(*) as c FROM drive_files').catch(e => [{ c: 'ERROR' }]);
        console.log('files count:', f[0].c);
        console.log('drive_files count:', df[0].c);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
check();
