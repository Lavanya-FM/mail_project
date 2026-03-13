const db = require('./db');
async function check() {
    try {
        const [tables] = await db.query('SHOW TABLES');
        console.log('Tables:', tables);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
check();
