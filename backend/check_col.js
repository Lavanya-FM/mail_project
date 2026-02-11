const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkColumns() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'jeemail',
        password: process.env.DB_PASSWORD || 'securepass',
        database: process.env.DB_NAME || 'jeemail_db'
    });

    const [rows] = await db.query("SHOW COLUMNS FROM emails LIKE 'sent_at'");
    console.log("Columns:", rows);
    await db.end();
}

checkColumns().catch(console.error);
