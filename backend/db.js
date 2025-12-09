const mysql = require("mysql2");

const pool = mysql.createPool({
  host: "127.0.0.1",
  user: "mailuser",
  password: "StrongPassword123!",
  database: "maildb",
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool.promise();
