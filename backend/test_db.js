const db = require('./db');

async function test() {
  try {
    const [emails] = await db.query("SELECT id, subject, is_draft FROM emails ORDER BY id DESC LIMIT 5");
    console.log("Recent Emails:", JSON.stringify(emails, null, 2));

    const [mailboxes] = await db.query("SELECT * FROM mailboxes");
    console.log("Mailboxes:", JSON.stringify(mailboxes, null, 2));

    const [mapping] = await db.query("SELECT * FROM email_mailbox ORDER BY id DESC LIMIT 5");
    console.log("Mapping:", JSON.stringify(mapping, null, 2));

    process.exit(0);
  } catch (err) {
    console.error("DB Error:", err);
    process.exit(1);
  }
}

test();
