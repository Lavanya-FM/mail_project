/**
 * backend/server.js
 */
const express = require("express");
const mysql = require("mysql2");
const bcrypt = require("bcryptjs");
const cors = require("cors");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors());
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

// DB pool
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

// Configuration
const ALLOWED_DOMAIN = "jeemail.in";
const TRASH_RETENTION_DAYS = 30;

// Test DB
async function testDb() {
  try {
    await db.query("SELECT 1");
    console.log("✅ MySQL Pool connected");
  } catch (e) {
    console.error("❌ MySQL pool test failed:", e && e.message);
  }
}
testDb();

pool.on && pool.on('error', (err) => {
  console.error("MySQL pool error event:", err);
});

// Cleanup old trash emails
async function cleanupOldTrashEmails() {
  try {
    const [result] = await db.query(`
      DELETE em FROM email_mailbox em
      JOIN mailboxes mb ON em.mailbox_id = mb.id
      WHERE mb.system_box = 'trash'
      AND em.deleted_at IS NOT NULL
      AND em.deleted_at < DATE_SUB(NOW(), INTERVAL ? DAY)`, [TRASH_RETENTION_DAYS]);
    
    if (result.affectedRows > 0) {
      console.log(`Cleaned up ${result.affectedRows} old emails from trash (>${TRASH_RETENTION_DAYS} days)`);
    }
  } catch (err) {
    console.error("Error cleaning up trash:", err && err.message);
  }
}
setInterval(cleanupOldTrashEmails, 60 * 60 * 1000);
cleanupOldTrashEmails();

// Create system folders for user
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

// Domain validator
function isValidDomain(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes('@')) return false;
  const parts = trimmed.split('@');
  if (parts.length !== 2) return false;
  
  const domain = parts[1];
  console.log('🔍 Domain validation - Email:', trimmed, 'Domain:', domain, 'Expected:', ALLOWED_DOMAIN.toLowerCase());
  
  if (domain === ALLOWED_DOMAIN.toLowerCase()) return true;
  if (domain.endsWith("." + ALLOWED_DOMAIN.toLowerCase())) return true;
  
  console.log('❌ Domain validation failed');
  return false;
}

// Helper function to normalize email
function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

// ----------------- Routes -----------------

// Register
app.post("/api/register", async (req, res) => {
  try {
    console.log("📝 REGISTER ATTEMPT:", JSON.stringify(req.body));
    const { name, email, password, dateOfBirth, gender } = req.body || {};

    if (!name || !email || !password) {
      console.log("❌ Missing required fields");
      return res.status(400).json({ error: "Missing required fields: name, email or password" });
    }

    const normalizedEmail = normalizeEmail(email);
    console.log("📧 Normalized email:", normalizedEmail);

    // Validate domain
    if (!isValidDomain(normalizedEmail)) {
      console.log("❌ Invalid domain for:", normalizedEmail);
      return res.status(400).json({ error: `Email must be from ${ALLOWED_DOMAIN} domain` });
    }

    // Check duplicate
    const [existing] = await db.query("SELECT id FROM users WHERE email = ? LIMIT 1", [normalizedEmail]);
    if (existing && existing.length) {
      console.log("❌ Email already registered:", normalizedEmail);
      return res.status(409).json({ error: "Email already registered" });
    }
    
    // Format date of birth if provided
    let dobString = null;
    if (dateOfBirth && dateOfBirth.year && dateOfBirth.month && dateOfBirth.day) {
      dobString = `${dateOfBirth.year}-${dateOfBirth.month.padStart(2, '0')}-${dateOfBirth.day.padStart(2, '0')}`;
      console.log("📅 Date of birth:", dobString);
    }

    const hashed = await bcrypt.hash(password, 10);

 // Insert user with additional fields
    const [result] = await db.query(
      `INSERT INTO users (name, email, password, date_of_birth, gender) VALUES (?, ?, ?, ?, ?)`,
      [name.trim(), normalizedEmail, hashed, dobString, gender || null]
    );
    
    const userId = result.insertId;
    console.log("✅ User created with ID:", userId);
    
    await createSystemFolders(userId);
    console.log("✅ System folders created for user:", userId);

    return res.json({ 
      user: { 
        id: userId, 
        name: name.trim(), 
        email: normalizedEmail,
        full_name: name.trim(),
	date_of_birth: dobString,
	gender: gender || null
      } 
    });
  } catch (e) {
    console.error("❌ REGISTER ERROR:", e && e.message, e && e.stack);
    return res.status(500).json({ error: "Registration failed" });
  }
});

// Check email/username existence - NEW ENDPOINT
app.get("/api/users/check/:username", async (req, res) => {
  const username = decodeURIComponent(req.params.username || '').trim().toLowerCase();
  const email = `${username}@${ALLOWED_DOMAIN}`;
  
  console.log("🔍 Checking username existence:", username, "→", email);
  
  try {
    const [rows] = await db.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    
    if (!rows.length) {
      console.log("✅ Username available:", username);
      return res.json({ exists: false, available: true });
    }
    
    console.log("❌ Username taken:", username);
    return res.json({ exists: true, available: false });
  } catch (err) {
    console.error("❌ CHECK USERNAME ERROR:", err && err.message);
    return res.status(500).json({ error: "DB error" });
  }
});
// Check email existence
app.get("/api/users/email/:email", async (req, res) => {
  const email = normalizeEmail(decodeURIComponent(req.params.email || ''));
  console.log("🔍 Checking email existence:", email);
  
  try {
    const [rows] = await db.query("SELECT id, name, email FROM users WHERE email = ? LIMIT 1", [email]);
    if (!rows.length) {
      console.log("❌ Email not found:", email);
      return res.json({ exists: false });
    }
    console.log("✅ Email found:", email);
    return res.json({ exists: true, user: rows[0] });
  } catch (err) {
    console.error("❌ CHECK EMAIL ERROR:", err && err.message);
    return res.status(500).json({ error: "DB error" });
  }
});

// Login - UPDATED to return additional user info
app.post("/api/login", async (req, res) => {
  try {
    console.log("🔐 LOGIN ATTEMPT:", JSON.stringify({ email: req.body?.email, hasPassword: !!req.body?.password }));
    
    const { email, password } = req.body || {};
    
    if (!email || !password) {
      console.log("❌ Missing email or password");
      return res.status(400).json({ error: "Missing email or password" });
    }
    
    const normalizedEmail = normalizeEmail(email);
    console.log("📧 Normalized email for login:", normalizedEmail);
    
    // Query database with additional fields
    const [rows] = await db.query(
      "SELECT id, name, email, password, date_of_birth, gender FROM users WHERE email = ? LIMIT 1", 
      [normalizedEmail]
    );
    
    console.log("🔍 Query result:", rows.length > 0 ? "User found" : "User NOT found");
    
    if (!rows.length) {
      console.log("❌ User not found for email:", normalizedEmail);
      return res.status(404).json({ error: "User not found" });
    }
    
    const user = rows[0];
    console.log("👤 Found user ID:", user.id, "Email:", user.email);
    
    // Verify password
    const match = await bcrypt.compare(password, user.password);
    console.log("🔑 Password match:", match);
    
    if (!match) {
      console.log("❌ Incorrect password for:", normalizedEmail);
      return res.status(401).json({ error: "Incorrect password" });
    }
    
    // Ensure system folders exist
    await createSystemFolders(user.id);
    console.log("✅ System folders ensured for user:", user.id);
    
    const responseData = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        full_name: user.name,
        date_of_birth: user.date_of_birth,
        gender: user.gender
      }
    };
    
    console.log("✅ LOGIN SUCCESS - Sending response:", JSON.stringify(responseData));
    return res.json(responseData);
  } catch (err) {
    console.error("❌ LOGIN ERROR:", err && err.message, err && err.stack);
    return res.status(500).json({ error: "Login failed" });
  }
});

// Get folders
app.get("/api/folders/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log("📁 Fetching folders for user:", userId);
    
    const [rows] = await db.query(
      `SELECT id, name, system_box FROM mailboxes 
       WHERE user_id=? ORDER BY id ASC`,
      [userId]
    );
    
    console.log("✅ Found", rows.length, "folders for user:", userId);
    return res.json({ data: rows });
  } catch (err) {
    console.error("❌ GET FOLDERS ERROR:", err && err.message);
    return res.status(500).json({ error: "DB error" });
  }
});

// Get emails
app.get("/api/emails/:userId/:folderAny", async (req, res) => {
  const userId = Number(req.params.userId);
  const folderAny = req.params.folderAny;

  console.log("📬 Fetching emails - User:", userId, "Folder:", folderAny);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "invalid userId" });
  }

  let folderId = null;

  if (!isNaN(Number(folderAny))) {
    folderId = Number(folderAny);
  } else {
    try {
      const [rows] = await db.query(
        "SELECT id FROM mailboxes WHERE user_id=? AND LOWER(system_box)=LOWER(?) LIMIT 1",
        [userId, folderAny]
      );

      if (rows.length) folderId = rows[0].id;
    } catch (err) {
      console.error("❌ DB error resolving mailbox:", err && err.message);
      return res.status(500).json({ error: "db error" });
    }
  }

  if (!folderId) {
    console.error("❌ Folder not found:", folderAny);
    return res.status(400).json({ error: "invalid folderId" });
  }

  try {
    const [emails] = await db.query(
      `SELECT e.*, m.is_read, m.is_starred, m.deleted_at 
       FROM emails e
       JOIN email_mailbox m ON e.id = m.email_id
       WHERE m.user_id = ? AND m.mailbox_id = ?
       ORDER BY e.created_at DESC`,
      [userId, folderId]
    );

    console.log("✅ Found", emails.length, "emails in folder:", folderId);

    for (let email of emails) {
      // Fetch recipients from email_recipients table
      const [recipients] = await db.query(
        `SELECT address, type FROM email_recipients WHERE email_id = ?`,
        [email.id]
      );

      const toList = recipients.filter(r => r.type === 'to').map(r => r.address);
      const ccList = recipients.filter(r => r.type === 'cc').map(r => r.address);
      const bccList = recipients.filter(r => r.type === 'bcc').map(r => r.address);

      // ✅ Set recipient arrays
      email.to_emails = toList;
      email.cc_emails = ccList;
      email.bcc_emails = bccList;
      
      // ✅ Also set headers for backward compatibility
      email.to_header = email.to_header || toList.join(', ');
      email.cc_header = email.cc_header || ccList.join(', ');
      email.bcc_header = email.bcc_header || bccList.join(', ');
      
      // Set defaults
      email.from_email = email.from_email || '';
      email.from_name = email.from_name || 'Unknown';
      email.subject = email.subject || '(No Subject)';
      email.body = email.body || '';
      
      // 🔍 DEBUG: Log the first email's recipient data
      if (email.id) {
        console.log(`📧 Email ID ${email.id}:`);
        console.log(`   From: ${email.from_name} <${email.from_email}>`);
        console.log(`   To: ${JSON.stringify(toList)}`);
        console.log(`   To Header: ${email.to_header}`);
        console.log(`   Subject: ${email.subject}`);
      }
    }

    return res.json({ data: emails });
  } catch (err) {
    console.error("❌ DB error fetching emails:", err && err.message);
    return res.status(500).json({ error: "db error" });
  }
});

// Create email - improved: add entries for recipients' inboxes
app.post("/api/email/create", async (req, res) => {
  let { user_id, to, cc, bcc, subject, body, folder_id, is_draft, attachments } = req.body || {};

  console.log("\n=================================================");
  console.log("📥 CREATE EMAIL REQUEST RECEIVED");
  console.log("=================================================");
  console.log("Raw request body:", JSON.stringify(req.body, null, 2));
  console.log("user_id:", user_id);
  console.log("to (raw):", to);
  console.log("cc (raw):", cc);
  console.log("bcc (raw):", bcc);
  console.log("subject:", subject);
  console.log("is_draft:", is_draft);
  console.log("has attachments:", !!attachments);
  console.log("=================================================\n");

  if (!user_id) {
    console.log("❌ Missing user_id");
    return res.status(400).json({ error: 'missing user_id' });
  }

  const normalizeList = (list) => {
    console.log("  📋 Normalizing list:", list);
    if (!list) return [];
    if (Array.isArray(list)) {
      const result = list
        .map(addr => (typeof addr === 'string' ? addr : (addr?.email || addr?.address || '')))
        .map(a => a && String(a).trim().toLowerCase())
        .filter(Boolean);
      console.log("  ✅ Array normalized to:", result);
      return result;
    }
    if (typeof list === 'string') {
      const result = [list.trim().toLowerCase()];
      console.log("  ✅ String normalized to:", result);
      return result;
    }
    if (typeof list === 'object') {
      const address = list.email || list.address || '';
      const result = address ? [String(address).trim().toLowerCase()] : [];
      console.log("  ✅ Object normalized to:", result);
      return result;
    }
    console.log("  ⚠️ Unknown type, returning empty array");
    return [];
  };

  const toList = normalizeList(to);
  const ccList = normalizeList(cc);
  const bccList = normalizeList(bcc);
  
  console.log("\n📧 NORMALIZED RECIPIENTS:");
  console.log("  To:", toList);
  console.log("  Cc:", ccList);
  console.log("  Bcc:", bccList);
  
  const allRecipients = Array.from(new Set([...toList, ...ccList, ...bccList]));
  console.log("  All unique recipients:", allRecipients);
  console.log("");

  let conn;
  try {
    conn = await pool.promise().getConnection();
    await conn.beginTransaction();

    // Resolve folder for sender
    let resolvedFolderId = null;
    if (folder_id && !isNaN(Number(folder_id))) {
      resolvedFolderId = Number(folder_id);
    } else if (typeof folder_id === "string") {
      const cleaned = folder_id.replace(/^[0-9]+-/, "");
      const [rows] = await conn.query(
        "SELECT id FROM mailboxes WHERE user_id = ? AND LOWER(system_box) = LOWER(?) LIMIT 1",
        [user_id, cleaned]
      );
      if (rows && rows.length) resolvedFolderId = rows[0].id;
    }

    if (!resolvedFolderId) {
      const fallbackSystem = is_draft ? "drafts" : "sent";
      const [f] = await conn.query(
        "SELECT id FROM mailboxes WHERE user_id = ? AND system_box = ? LIMIT 1",
        [user_id, fallbackSystem]
      );
      if (!f.length) {
        await conn.rollback();
        conn.release();
        return res.status(500).json({ error: "No folder found: " + fallbackSystem });
      }
      resolvedFolderId = f[0].id;
    }

    // sender info
    const [userInfo] = await conn.query("SELECT name, email FROM users WHERE id = ? LIMIT 1", [user_id]);
    const fromName = userInfo.length > 0 ? userInfo[0].name : 'Unknown';
    const fromEmail = userInfo.length > 0 ? userInfo[0].email : '';

// insert into emails WITH HEADERS
const [insertResult] = await conn.query(
  `INSERT INTO emails 
    (user_id, from_name, from_email, subject, body, created_at, to_header, cc_header, bcc_header)
    VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, ?)`,
  [
    user_id,
    fromName,
    fromEmail,
    subject || '',
    body || '',
    toList.join(", "),
    ccList.join(", "),
    bccList.join(", ")
  ]
);
const emailId = insertResult.insertId;

    // insert recipients
    const insertRecipientRows = async (list, type) => {
      if (!list || !list.length) return [];
      const added = [];
      for (const raw of list) {
        const address = String(raw || '').trim();
        if (!address) continue;
        await conn.query(
          "INSERT INTO email_recipients (email_id, address, type) VALUES (?, ?, ?)",
          [emailId, address, type]
        );
        added.push(address);
      }
      return added;
    };

    const toAdded = await insertRecipientRows(toList, "to");
    const ccAdded = await insertRecipientRows(ccList, "cc");
    const bccAdded = await insertRecipientRows(bccList, "bcc");

    // Insert mailbox entry for sender (Sent or Drafts)
    await conn.query(
      "INSERT INTO email_mailbox (user_id, email_id, mailbox_id, is_read, is_starred, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)",
      [user_id, emailId, resolvedFolderId, 1, 0]
    );

    // For local recipients: find corresponding users and add inbox entries
    if (allRecipients.length > 0) {
      const placeholders = allRecipients.map(() => '?').join(',');
      const [recipientUsers] = await conn.query(
        `SELECT id, email FROM users WHERE LOWER(email) IN (${placeholders})`,
        allRecipients
      );

      const emailToUserId = {};
      for (const u of recipientUsers) {
        emailToUserId[(u.email || '').toString().toLowerCase()] = u.id;
      }

      for (const addr of allRecipients) {
        const matchedUserId = emailToUserId[addr];
        if (!matchedUserId) {
          console.log('CREATE EMAIL: non-local recipient or user not found:', addr);
          continue;
        }

        const [mb] = await conn.query(
          "SELECT id FROM mailboxes WHERE user_id = ? AND system_box = 'inbox' LIMIT 1",
          [matchedUserId]
        );

        if (!mb.length) {
          console.warn('CREATE EMAIL: Inbox not found for user', matchedUserId, addr);
          continue;
        }
        const inboxId = mb[0].id;

        await conn.query(
          "INSERT INTO email_mailbox (user_id, email_id, mailbox_id, is_read, is_starred, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)",
          [matchedUserId, emailId, inboxId, 0, 0]
        );
      }
    }

    await conn.commit();
    conn.release();

    const emailObject = {
      id: emailId,
      user_id: user_id,
      subject: subject || '',
      body: body || '',
      to_emails: toAdded,
      cc_emails: ccAdded,
      bcc_emails: bccAdded,
      from_email: fromEmail,
      from_name: fromName,
      is_read: 1,
      is_starred: 0,
      created_at: new Date().toISOString(),
      deleted_at: null
    };

    return res.json({ message: "Email created successfully", emailId, data: emailObject });
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch(e) {}
      try { conn.release(); } catch(e) {}
    }
    console.error("CREATE EMAIL ERROR (transaction):", err && err.message, err && err.stack);
    return res.status(500).json({ error: "Internal Error" });
  }
});

// Update email flags
app.put('/api/email/:emailId', async (req, res) => {
  const { emailId } = req.params;
  const { user_id, is_read, is_starred } = req.body || {};
  
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
    return res.status(500).json({ error: "DB error" });
  }
});

// Move email to another mailbox
app.post('/api/email/move', async (req, res) => {
  const { email_id, user_id, target_folder } = req.body || {};
  if (!email_id || !user_id || !target_folder) return res.status(400).json({ error: 'missing params' });

  try {
    await db.query(
      `UPDATE email_mailbox SET mailbox_id = ? WHERE email_id = ? AND user_id = ?`,
      [target_folder, email_id, user_id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("MOVE EMAIL ERROR:", err && err.message);
    return res.status(500).json({ error: "DB error" });
  }
});

// Move email to spam (robust)
app.post('/api/email/spam', async (req, res) => {
  const { email_id, user_id } = req.body || {};
  if (!email_id || !user_id) return res.status(400).json({ error: 'missing' });

  try {
    // find spam mailbox id
    const [rows] = await db.query(
      `SELECT id FROM mailboxes WHERE user_id=? AND system_box='spam' LIMIT 1`,
      [user_id]
    );
    if (!rows.length) return res.status(500).json({ error: 'no spam mailbox' });
    const spamId = rows[0].id;

    // ensure email_mailbox row exists (insert if missing)
    await db.query(
      `INSERT INTO email_mailbox (user_id, email_id, mailbox_id, is_read, is_starred, deleted_at)
       SELECT ?, ?, ?, 0, 0, NULL
       FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM email_mailbox WHERE user_id=? AND email_id=?)`,
      [user_id, email_id, spamId, user_id, email_id]
    );

    // move it to spam
    await db.query(
      `UPDATE email_mailbox SET mailbox_id=?, deleted_at = NULL WHERE email_id=? AND user_id=?`,
      [spamId, email_id, user_id]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("SPAM EMAIL ERROR (robust):", err && err.message);
    return res.status(500).json({ error: "DB error" });
  }
});

// Delete -> move to trash (robust)
app.post('/api/email/delete', async (req, res) => {
  const { email_id, user_id } = req.body || {};
  if (!email_id || !user_id) return res.status(400).json({ error: 'missing' });

  try {
    const [rows] = await db.query(
      `SELECT id FROM mailboxes WHERE user_id=? AND system_box='trash' LIMIT 1`,
      [user_id]
    );
    if (!rows.length) return res.status(500).json({ error: 'no trash mailbox' });
    const trashId = rows[0].id;

    // ensure row exists
    await db.query(
      `INSERT INTO email_mailbox (user_id, email_id, mailbox_id, is_read, is_starred, deleted_at)
       SELECT ?, ?, ?, 0, 0, NOW()
       FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM email_mailbox WHERE user_id=? AND email_id=?)`,
      [user_id, email_id, trashId, user_id, email_id]
    );

    // move to trash and set deleted_at
    await db.query(
      `UPDATE email_mailbox SET mailbox_id=?, deleted_at=NOW() WHERE email_id=? AND user_id=?`,
      [trashId, email_id, user_id]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE EMAIL ERROR (robust):", err && err.message);
    return res.status(500).json({ error: "DB error" });
  }
});

// Permanently delete
app.post('/api/email/delete-permanent', async (req, res) => {
  const { email_id, user_id } = req.body || {};
  if (!email_id || !user_id) return res.status(400).json({ error: 'missing' });

  try {
    await db.query(`DELETE FROM email_mailbox WHERE email_id=? AND user_id=?`, [email_id, user_id]);
    await db.query(`DELETE FROM email_recipients WHERE email_id=?`, [email_id]);
    await db.query(`DELETE FROM emails WHERE id=?`, [email_id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("PERMANENT DELETE ERROR:", err && err.message);
    return res.status(500).json({ error: "DB error" });
  }
});

// Star
app.post('/api/email/star', async (req, res) => {
  const { email_id, user_id, status } = req.body || {};
  if (!email_id || !user_id) return res.status(400).json({ error: 'missing' });

  try {
    // Find Starred folder
    const [rows] = await db.query(
      `SELECT id FROM mailboxes WHERE user_id=? AND system_box='starred' LIMIT 1`,
      [user_id]
    );

    if (!rows.length) return res.status(500).json({ error: 'no starred mailbox' });

    const starredId = rows[0].id;

    // If starring → move to Starred folder
    if (status) {
      await db.query(
        `UPDATE email_mailbox SET mailbox_id = ?, is_starred = 1 WHERE email_id = ? AND user_id = ?`,
        [starredId, email_id, user_id]
      );
    } else {
      // If un-starring → move back to Inbox
      const [inbox] = await db.query(
        `SELECT id FROM mailboxes WHERE user_id=? AND system_box='inbox' LIMIT 1`,
        [user_id]
      );

      await db.query(
        `UPDATE email_mailbox SET mailbox_id = ?, is_starred = 0 WHERE email_id = ? AND user_id = ?`,
        [inbox[0].id, email_id, user_id]
      );
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("STAR EMAIL ERROR:", err && err.message);
    return res.status(500).json({ error: "DB error" });
  }
});

// Read flag
app.post('/api/email/read', async (req, res) => {
  const { email_id, user_id, is_read } = req.body || {};
  if (!email_id || !user_id) return res.status(400).json({ error: 'missing' });

  try {
    await db.query(
      `UPDATE email_mailbox SET is_read=? WHERE email_id=? AND user_id=?`,
      [is_read?1:0, email_id, user_id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("READ EMAIL ERROR:", err && err.message);
    return res.status(500).json({ error: "DB error" });
  }
});

app.post('/api/email/label', async (req, res) => {
  const { email_id, user_id, label } = req.body || {};

  if (!email_id || !user_id || !label)
    return res.status(400).json({ error: 'missing parameters' });

  try {
    // Find the label's folder
    const [rows] = await db.query(
      `SELECT id FROM mailboxes WHERE user_id=? AND name=? LIMIT 1`,
      [user_id, label]
    );

    if (!rows.length) return res.status(404).json({ error: "label folder not found" });

    const labelFolderId = rows[0].id;

    // Move email to that folder
    await db.query(
      `UPDATE email_mailbox SET mailbox_id=? WHERE email_id=? AND user_id=?`,
      [labelFolderId, email_id, user_id]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("LABEL EMAIL ERROR:", err && err.message);
    return res.status(500).json({ error: "DB error" });
  }
});

// Config endpoint
app.get('/api/config', (req, res) => {
  res.json({
    allowed_domain: ALLOWED_DOMAIN,
    trash_retention_days: TRASH_RETENTION_DAYS
  });
});

app.listen(3000, () => console.log("🚀 Backend running on port 3000"));
