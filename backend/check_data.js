const pool = require('./db');

async function check() {
    try {
        const [rows] = await pool.query('SELECT * FROM folders LIMIT 5');
        console.log('Folders data:', rows);
    } catch (err) {
        console.error('Check failed:', err);
    } finally {
        process.exit(0);
    }
}

check();
