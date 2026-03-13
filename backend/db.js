const mysql = require("mysql2");

const pool = mysql.createPool({
  host: "localhost",
  user: "mailuser",
  password: "StrongPassword123!",
  database: "maildb",
  waitForConnections: true,
  connectionLimit: 10,
});

process.on('unhandledRejection', err => {
  console.error('🔥 UNHANDLED PROMISE REJECTION:', err);
  process.exit(1);
});

module.exports = pool.promise();
