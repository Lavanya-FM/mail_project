const express = require("express");
const mysql = require("mysql2");
const bcrypt = require("bcryptjs");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

const pool = mysql.createPool({
  host: "localhost",
  user: "mailuser",
  password: "StrongPassword123!",
  database: "maildb",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

const db = pool.promise();

// async function testDb() {
//   try {
//     await db.query("SELECT 1");
//     console.log("MySQL Pool connected");
//   } catch (e) {
//     console.error("MySQL pool test failed:", e && e.message);
//   }
// }
// testDb();

pool.on && pool.on('error', (err) => {
  console.error("MySQL pool error event:", err);
});

async function createSystemFolders(userId) {
  const folders = [
    ["Inbox", "inbox"],
    ["Sent", "sent"],
    ["Drafts", "drafts"],
    ["Spam", "spam"],
    ["Trash", "trash"],
    ["Starred", "starred"]
  ];

  const promises = folders.map(([name, system]) =>
    db.query(
      `INSERT INTO mailboxes (user_id, name, system_box)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [userId, name, system]
    ).catch(err => {
      console.error("createSystemFolders insert error:", { userId, name, system, message: err && err.message });
    })
  );

  await Promise.all(promises);
}

app.post("/api/register", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const hashed = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      `INSERT INTO users (name, email, password) VALUES (?, ?, ?)`,
      [name, email, hashed]
    );

    const userId = result.insertId;
    await createSystemFolders(userId);

    res.json({ user: { id: userId, name, email } });
  } catch (e) {
    console.error("REGISTER ERROR:", e && e.message);
    res.status(500).json({ error: "Registration failed", details: e && e.message });
  }
});

app.get("/api/users/email/:email", async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  try {
    const [rows] = await db.query("SELECT id, name, email FROM users WHERE email = ? LIMIT 1", [email]);
    if (!rows.length) return res.json({ exists: false });
    return res.json({ exists: true, user: rows[0] });
  } catch (err) {
    console.error("CHECK EMAIL ERROR:", err && err.message);
    return res.status(500).json({ error: err && err.message });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    // Mock login for testing - accept any email/password
    console.log("Mock login attempt:", email);

    // Simple mock user
    const mockUser = {
      id: 1,
      name: email.split('@')[0] || "Test User",
      email: email
    };

    res.json({
      user: mockUser
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err && err.message);
    res.status(500).json({ error: err && err.message });
  }
});

app.get("/api/folders/:userId", async (req, res) => {
  try {
    // Mock folders for testing
    const mockFolders = [
      { id: 1, name: "Inbox", system_box: "inbox" },
      { id: 2, name: "Sent", system_box: "sent" },
      { id: 3, name: "Drafts", system_box: "drafts" },
      { id: 4, name: "Spam", system_box: "spam" },
      { id: 5, name: "Trash", system_box: "trash" },
      { id: 6, name: "Starred", system_box: "starred" }
    ];

    res.json({ data: mockFolders });
  } catch (err) {
    console.error("GET FOLDERS ERROR:", err);
    console.error("Error details:", JSON.stringify(err, null, 2));
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

app.get("/api/emails/:userId/:folderAny", async (req, res) => {
  const userId = Number(req.params.userId);
  const folderAny = req.params.folderAny;

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "invalid userId" });
  }

  // Mock emails for testing
  const mockEmails = [
    {
      id: 1,
      subject: "Welcome to your email client",
      from: "system@example.com",
      to: "user@example.com",
      body: "This is a welcome email!",
      read: false,
      starred: false,
      created_at: new Date().toISOString()
    },
    {
      id: 2,
      subject: "Test email",
      from: "test@example.com",
      to: "user@example.com",
      body: "This is a test email.",
      read: true,
      starred: false,
      created_at: new Date().toISOString()
    }
  ];

  res.json({
    data: mockEmails,
    count: mockEmails.length,
    unread: mockEmails.filter(e => !e.read).length
  });
});

app.post("/api/email/create", async (req, res) => {
  let { user_id, to, cc, bcc, subject, body, folder_id, is_draft } = req.body;

  try {
    let resolvedFolderId = null;

    if (folder_id && !isNaN(Number(folder_id))) {
      resolvedFolderId = Number(folder_id);
    } else if (typeof folder_id === "string") {
      const cleaned = folder_id.replace(/^[0-9]+-/, "");
      const [rows] = await db.query(
        "SELECT id FROM mailboxes WHERE user_id = ? AND LOWER(system_box) = LOWER(?) LIMIT 1",
        [user_id, cleaned]
      );
      if (rows && rows.length) resolvedFolderId = rows[0].id;
    }

    if (!resolvedFolderId) {
      const fallbackSystem = is_draft ? "drafts" : "sent";
      const [f] = await db.query(
        "SELECT id FROM mailboxes WHERE user_id = ? AND system_box = ? LIMIT 1",
        [user_id, fallbackSystem]
      );
      if (!f.length) {
        return res.status(500).json({ error: "No folder found: " + fallbackSystem });
      }
      resolvedFolderId = f[0].id;
    }

    const [userInfo] = await db.query(
      "SELECT name, email FROM users WHERE id = ? LIMIT 1",
      [user_id]
    );

    const fromName = userInfo.length > 0 ? userInfo[0].name : 'Unknown';
    const fromEmail = userInfo.length > 0 ? userInfo[0].email : '';

    const [result] = await db.query(
      "INSERT INTO emails (user_id, from_name, from_email, subject, body, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
      [user_id, fromName, fromEmail, subject || '', body || '']
    );
    const emailId = result.insertId;

    const insertRecipient = async (emailId, list, type) => {
      if (!list) return [];
      const addresses = [];

      if (Array.isArray(list)) {
        for (const addr of list) {
          const address = typeof addr === 'string' ? addr : (addr.email || addr.address || '');
          if (!address) continue;
          await db.query(
            "INSERT INTO email_recipients (email_id, address, type) VALUES (?, ?, ?)",
            [emailId, address, type]
          );
          addresses.push(address);
        }
      } else {
        const address = typeof list === 'string' ? list : (list.email || list.address || '');
        if (address) {
          await db.query(
            "INSERT INTO email_recipients (email_id, address, type) VALUES (?, ?, ?)",
            [emailId, address, type]
          );
          addresses.push(address);
        }
      }
      return addresses;
    };

    const toAddresses = await insertRecipient(emailId, to, "to");
    const ccAddresses = await insertRecipient(emailId, cc, "cc");
    const bccAddresses = await insertRecipient(emailId, bcc, "bcc");

    await db.query(
      "INSERT INTO email_mailbox (user_id, email_id, mailbox_id, is_read, is_starred) VALUES (?, ?, ?, ?, ?)",
      [user_id, emailId, resolvedFolderId, 1, 0]
    );

    const emailObject = {
      id: emailId,
      user_id: user_id,
      subject: subject || '',
      body: body || '',
      to_emails: toAddresses,
      cc_emails: ccAddresses,
      bcc_emails: bccAddresses,
      from_email: fromEmail,
      from_name: fromName,
      is_read: 1,
      is_starred: 0,
      created_at: new Date().toISOString()
    };

    res.json({
      message: "Email created successfully",
      emailId,
      data: emailObject
    });
  } catch (err) {
    console.error("CREATE EMAIL ERROR:", err);
    res.status(500).json({ error: err.message || "Internal Error" });
  }
});

app.put('/api/email/:emailId', async (req, res) => {
  const { emailId } = req.params;
  const { user_id, is_read, is_starred } = req.body;

  try {
    const updates = [];
    const values = [];

    if (typeof is_read !== 'undefined') {
      updates.push('is_read = ?');
      values.push(is_read ? 1 : 0);
    }

    if (typeof is_starred !== 'undefined') {
      updates.push('is_starred = ?');
      values.push(is_starred ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.json({ ok: true, message: 'No updates' });
    }

    values.push(emailId, user_id);

    await db.query(
      `UPDATE email_mailbox SET ${updates.join(', ')} WHERE email_id = ? AND user_id = ?`,
      values
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("UPDATE EMAIL ERROR:", err && err.message);
    return res.status(500).json({ error: err && err.message });
  }
});

app.post('/api/email/move', async (req, res) => {
  const { email_id, user_id, target_folder } = req.body;
  if (!email_id || !user_id || !target_folder) return res.status(400).json({ error: 'missing params' });

  try {
    await db.query(
      `UPDATE email_mailbox SET mailbox_id = ? WHERE email_id = ? AND user_id = ?`,
      [target_folder, email_id, user_id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("MOVE EMAIL ERROR:", err && err.message);
    return res.status(500).json({ error: err && err.message });
  }
});

app.post('/api/email/delete', async (req, res) => {
  const { email_id, user_id } = req.body;
  if (!email_id || !user_id) return res.status(400).json({ error: 'missing' });

  try {
    const [rows] = await db.query(
      `SELECT id FROM mailboxes WHERE user_id=? AND system_box='trash' LIMIT 1`,
      [user_id]
    );
    if (!rows.length) return res.status(500).json({ error: 'no trash mailbox' });
    const trashId = rows[0].id;
    await db.query(
      `UPDATE email_mailbox SET mailbox_id=? WHERE email_id=? AND user_id=?`,
      [trashId, email_id, user_id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE EMAIL ERROR:", err && err.message);
    return res.status(500).json({ error: err && err.message });
  }
});

app.post('/api/email/star', async (req, res) => {
  const { email_id, user_id, status } = req.body;
  if (!email_id || !user_id) return res.status(400).json({ error: 'missing' });

  try {
    await db.query(
      `UPDATE email_mailbox SET is_starred = ? WHERE email_id = ? AND user_id = ?`,
      [status ? 1 : 0, email_id, user_id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("STAR EMAIL ERROR:", err && err.message);
    return res.status(500).json({ error: err && err.message });
  }
});

app.post('/api/email/read', async (req, res) => {
  const { email_id, user_id, is_read } = req.body;
  try {
    await db.query(
      `UPDATE email_mailbox SET is_read=? WHERE email_id=? AND user_id=?`,
      [is_read ? 1 : 0, email_id, user_id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("READ EMAIL ERROR:", err && err.message);
    res.status(500).json({ error: err && err.message });
  }
});

app.post('/api/email/update', async (req, res) => {
  const { email_id, is_read, is_starred, folder_id } = req.body;

  if (!email_id) return res.status(400).json({ error: 'Missing email_id' });

  try {
    // Update read/star
    if (typeof is_read !== 'undefined') {
      await db.query(
        `UPDATE email_mailbox SET is_read=? WHERE email_id=?`,
        [is_read ? 1 : 0, email_id]
      );
    }

    if (typeof is_starred !== 'undefined') {
      await db.query(
        `UPDATE email_mailbox SET is_starred=? WHERE email_id=?`,
        [is_starred ? 1 : 0, email_id]
      );
    }

    // Move folder
    if (folder_id) {
      await db.query(
        `UPDATE email_mailbox SET mailbox_id=? WHERE email_id=?`,
        [folder_id, email_id]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("UPDATE EMAIL ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log("Backend running on port 3000"));
