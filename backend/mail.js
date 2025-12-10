/**
 * backend/mail.js
 * MAIL FUNCTIONS ONLY (updated to store size_kb and has_attachments)
 */

const express = require("express");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

const db = require("./db");
const { sanitizeBody, normalizeEmail } = require("./utils");

const router = express.Router();

// -------------------- CONFIG --------------------
const ALLOWED_DOMAIN = "jeemail.in";
const TRASH_RETENTION_DAYS = 30;

// -------------------- HELPERS --------------------
function isValidDomain(email) {
  if (!email || !email.includes("@")) return false;
  return email.split("@")[1].toLowerCase() === ALLOWED_DOMAIN;
}

async function createSystemFolders(userId) {
  const folderList = [
    ["Inbox", "inbox"],
    ["Sent", "sent"],
    ["Drafts", "drafts"],
    ["Spam", "spam"],
    ["Trash", "trash"],
    ["Starred", "starred"],
  ];

  for (const [name, system_box] of folderList) {
    await db.query(
      `INSERT INTO mailboxes (user_id, name, system_box)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [userId, name, system_box]
    );
  }
}

// -------------------- AUTH ROUTES --------------------

// REGISTER
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, dateOfBirth, gender } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ error: "Missing fields" });

    const normalizedEmail = normalizeEmail(email);

    if (!isValidDomain(normalizedEmail))
      return res
        .status(400)
        .json({ error: `Email must be under ${ALLOWED_DOMAIN}` });

    const [exists] = await db.query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail]
    );
    if (exists.length)
      return res.status(409).json({ error: "Email already exists" });

    let dobString = null;
    if (dateOfBirth?.year) {
      dobString = `${dateOfBirth.year}-${String(dateOfBirth.month).padStart(
        2,
        "0"
      )}-${String(dateOfBirth.day).padStart(2, "0")}`;
    }

    const hash = await bcrypt.hash(password, 10);

    const [insert] = await db.query(
      `INSERT INTO users (name, email, password, date_of_birth, gender)
       VALUES (?, ?, ?, ?, ?)`,
      [name, normalizedEmail, hash, dobString, gender]
    );

    const userId = insert.insertId;
    await createSystemFolders(userId);

    return res.json({
      user: {
        id: userId,
        name,
        email: normalizedEmail,
        date_of_birth: dobString,
        gender: gender || null,
      },
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const normalized = normalizeEmail(email);
    const [rows] = await db.query(
      "SELECT * FROM users WHERE email = ? LIMIT 1",
      [normalized]
    );

    if (!rows.length) return res.status(404).json({ error: "User not found" });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Incorrect password" });

    await createSystemFolders(user.id);

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        date_of_birth: user.date_of_birth,
        gender: user.gender,
      },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// -------------------- FOLDER ROUTES --------------------

router.get("/folders/:userId", async (req, res) => {
  const userId = req.params.userId;

  const [rows] = await db.query(
    `SELECT id, name, system_box 
     FROM mailboxes 
     WHERE user_id = ? ORDER BY id ASC`,
    [userId]
  );

  res.json({ data: rows });
});

// -------------------- FETCH EMAILS --------------------

router.get("/emails/:userId/:folder", async (req, res) => {
  const userId = req.params.userId;
  const folder = req.params.folder;

  // resolve folder id
  let folderId = folder;

  if (isNaN(folder)) {
    const [r] = await db.query(
      "SELECT id FROM mailboxes WHERE user_id = ? AND system_box = ? LIMIT 1",
      [userId, folder]
    );
    if (!r.length) return res.status(400).json({ error: "Invalid folder" });
    folderId = r[0].id;
  }

  const [emails] = await db.query(
    `SELECT e.*, m.is_read, m.is_starred
     FROM emails e
     JOIN email_mailbox m 
     ON e.id = m.email_id
     WHERE m.user_id = ? AND m.mailbox_id = ?
     ORDER BY e.created_at DESC`,
    [userId, folderId]
  );

  for (const email of emails) {
    const [rcp] = await db.query(
      "SELECT address, type FROM email_recipients WHERE email_id = ?",
      [email.id]
    );

    email.to_emails = rcp.filter((x) => x.type === "to").map((x) => x.address);
    email.cc_emails = rcp.filter((x) => x.type === "cc").map((x) => x.address);
    email.bcc_emails = rcp.filter((x) => x.type === "bcc").map((x) => x.address);

    email.body = sanitizeBody(email.body);
  }

  res.json({ data: emails });
});

// -------------------- CREATE / SEND EMAIL --------------------
router.post("/email/create", async (req, res) => {
  const {
    user_id,
    to,
    to_emails,
    cc,
    cc_emails,
    bcc,
    bcc_emails,
    subject,
    body,
    is_draft,
    in_reply_to,
    folder_id,
    attachments // optional array of { filename, size } provided by frontend if available
  } = req.body;

  if (!user_id) return res.status(400).json({ error: "Missing user_id" });

  // Helper function to extract emails from different formats
  const extractEmails = (arrayData) => {
    if (!arrayData || !Array.isArray(arrayData)) return [];
    return arrayData.map(item => {
      if (typeof item === 'string') {
        return item.toLowerCase();
      } else if (typeof item === 'object' && item.email) {
        return item.email.toLowerCase();
      }
      return null;
    }).filter(Boolean);
  };

  // Support both formats: 'to' and 'to_emails'
  const toList = extractEmails(to_emails || to || []);
  const ccList = extractEmails(cc_emails || cc || []);
  const bccList = extractEmails(bcc_emails || bcc || []);

  const cleanBody = sanitizeBody(body);

  if (!is_draft && toList.length === 0)
    return res.status(400).json({ error: "Recipient required" });

  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    const [[sender]] = await conn.query(
      "SELECT name, email FROM users WHERE id = ? LIMIT 1",
      [user_id]
    );

    // resolve folder
    let resolvedFolderId = folder_id;
    if (!resolvedFolderId) {
      const box = is_draft ? "drafts" : "sent";
      const [[row]] = await conn.query(
        "SELECT id FROM mailboxes WHERE user_id = ? AND system_box = ?",
        [user_id, box]
      );
      resolvedFolderId = row ? row.id : null;
    }

    // insert email metadata (initial insert; we'll update size_kb/has_attachments after)
    const [insert] = await conn.query(
      `INSERT INTO emails 
      (user_id, from_name, from_email, subject, body, is_html, in_reply_to,
       to_header, cc_header, bcc_header, folder_id, is_draft, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        user_id,
        sender.name,
        sender.email,
        subject || "(No Subject)",
        cleanBody,
        in_reply_to || null,
        toList.join(", "),
        ccList.join(", "),
        bccList.join(", "),
        resolvedFolderId,
        is_draft ? 1 : 0,
      ]
    );

    const emailId = insert.insertId;

    // recipients
    for (const addr of toList)
      await conn.query(
        "INSERT INTO email_recipients (email_id, address, type) VALUES (?, ?, 'to')",
        [emailId, addr]
      );
    for (const addr of ccList)
      await conn.query(
        "INSERT INTO email_recipients (email_id, address, type) VALUES (?, ?, 'cc')",
        [emailId, addr]
      );
    for (const addr of bccList)
      await conn.query(
        "INSERT INTO email_recipients (email_id, address, type) VALUES (?, ?, 'bcc')",
        [emailId, addr]
      );

    // add to sender's mailbox
    await conn.query(
      `INSERT INTO email_mailbox (user_id, email_id, mailbox_id, is_read)
       VALUES (?, ?, ?, 1)`,
      [user_id, emailId, resolvedFolderId]
    );

    // compute size_kb and has_attachments
    const attachmentsList = Array.isArray(attachments) ? attachments : [];
    const attachmentsTotalBytes = attachmentsList.reduce((s, a) => s + (Number(a.size || 0)), 0);
    const rawBytes = Buffer.byteLength(cleanBody || '', 'utf8') + attachmentsTotalBytes;
    const size_kb = Math.max(1, Math.round((rawBytes || 0) / 1024)); // at least 1 KB
    const has_attachments = attachmentsList.length ? 1 : 0;

    // update inserted email with size_kb and has_attachments (and folder_id just in case)
    await conn.query(
      'UPDATE emails SET has_attachments = ?, size_kb = ?, folder_id = ? WHERE id = ?',
      [has_attachments, size_kb, resolvedFolderId, emailId]
    );

    // send mail via SMTP if not draft
    if (!is_draft) {
      const transporter = nodemailer.createTransport({
        host: "127.0.0.1",
        port: 25,
        secure: false,
        tls: { rejectUnauthorized: false },
      });

      const sendOptions = {
        from: `"${sender.name}" <${sender.email}>`,
        to: toList.join(", "),
        subject: subject,
        html: cleanBody,
      };
      if (ccList.length) sendOptions.cc = ccList.join(", ");
      if (bccList.length) sendOptions.bcc = bccList.join(", ");

      // If frontend included attachments and they are available as objects with `path` or `content`,
      // you could attach them here. For now we don't attach the actual file unless you manage upload storage.
      if (attachmentsList.length) {
        // map to nodemailer attachments if they have `filename` and `content` or `path`
        sendOptions.attachments = attachmentsList
          .map((a) => {
            const item = {};
            if (a.path) item.path = a.path;
            if (a.content) item.content = a.content;
            if (a.filename) item.filename = a.filename;
            return Object.keys(item).length ? item : null;
          })
          .filter(Boolean);
      }

      try {
        await transporter.sendMail(sendOptions);
      } catch (smtpErr) {
        // Non-fatal: log but continue — message still stored in your DB
        console.error("SMTP send error:", smtpErr);
      }
    }

    // deliver to recipients inbox
    const all = [...new Set([...toList, ...ccList, ...bccList])];
    if (all.length) {
      const placeholders = all.map(() => "?").join(",");
      const [users] = await conn.query(
        `SELECT id, email FROM users WHERE email IN (${placeholders})`,
        all
      );
      for (const rcp of users) {
        const [[inbox]] = await conn.query(
          "SELECT id FROM mailboxes WHERE user_id = ? AND system_box = 'inbox'",
          [rcp.id]
        );
        if (!inbox) continue;
        await conn.query(
          `INSERT INTO email_mailbox (user_id, email_id, mailbox_id, is_read)
           VALUES (?, ?, ?, 0)`,
          [rcp.id, emailId, inbox.id]
        );
      }
    }

    await conn.commit();
    res.json({ success: true, email_id: emailId });
  } catch (err) {
    await conn.rollback();
    console.error("EMAIL CREATE ERROR:", err);
    res.status(500).json({ error: "Failed to create email" });
  } finally {
    conn.release();
  }
});

// -------------------- UPDATE EMAIL FLAGS --------------------

router.post("/email/read", async (req, res) => {
  const { email_id, user_id, is_read } = req.body;

  await db.query(
    "UPDATE email_mailbox SET is_read = ? WHERE email_id = ? AND user_id = ?",
    [is_read ? 1 : 0, email_id, user_id]
  );

  res.json({ success: true });
});

router.post("/email/star", async (req, res) => {
  const { email_id, user_id, status } = req.body;

  const target = status ? "starred" : "inbox";
  const [[row]] = await db.query(
    "SELECT id FROM mailboxes WHERE user_id = ? AND system_box = ?",
    [user_id, target]
  );

  await db.query(
    "UPDATE email_mailbox SET is_starred = ?, mailbox_id = ? WHERE email_id = ? AND user_id = ?",
    [status ? 1 : 0, row.id, email_id, user_id]
  );

  res.json({ success: true });
});

// DELETE → TRASH
router.post("/email/delete", async (req, res) => {
  const { email_id, user_id } = req.body;

  const [[trash]] = await db.query(
    "SELECT id FROM mailboxes WHERE user_id = ? AND system_box = 'trash'",
    [user_id]
  );

  await db.query(
    `UPDATE email_mailbox 
     SET mailbox_id = ?, is_deleted = 1, deleted_at = NOW()
     WHERE email_id = ? AND user_id = ?`,
    [trash.id, email_id, user_id]
  );

  res.json({ success: true });
});

// PERMANENT DELETE
router.post("/email/delete-permanent", async (req, res) => {
  const { email_id, user_id } = req.body;

  await db.query(
    "DELETE FROM email_mailbox WHERE email_id = ? AND user_id = ?",
    [email_id, user_id]
  );

  await db.query(
    "DELETE FROM emails WHERE id = ? AND id NOT IN (SELECT email_id FROM email_mailbox)",
    [email_id]
  );

  res.json({ success: true });
});

// -------------------- EXPORT ROUTER --------------------
module.exports = router;
