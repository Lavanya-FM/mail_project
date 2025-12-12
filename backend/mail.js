/**
 * backend/mail.js
 *
 * Full mail endpoint implementation.
 * - Stores attachments as Base64 in DB (email_attachments.content_base64)
 * - Returns attachments metadata on fetch
 * - Sends attachments via SMTP using Base64 content
 */

const express = require("express");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

const db = require("./db"); // expects exported promise-based query/getConnection interface
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
    const { name, email, password, dateOfBirth, gender } = req.body || {};

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
    const { email, password } = req.body || {};

    const normalized = normalizeEmail(email || "");
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
  try {
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
      `SELECT e.*, m.is_read, m.is_starred, m.mailbox_id
       FROM emails e
       JOIN email_mailbox m 
       ON e.id = m.email_id
       WHERE m.user_id = ? AND m.mailbox_id = ?
       ORDER BY e.created_at DESC`,
      [userId, folderId]
    );

    // fetch recipients + attachments for each email
    for (const email of emails) {
      const [rcp] = await db.query(
        "SELECT address, type FROM email_recipients WHERE email_id = ?",
        [email.id]
      );

      email.to_emails = rcp.filter((x) => x.type === "to").map((x) => x.address);
      email.cc_emails = rcp.filter((x) => x.type === "cc").map((x) => x.address);
      email.bcc_emails = rcp.filter((x) => x.type === "bcc").map((x) => x.address);

      // attachments metadata (do NOT include content_base64 by default)
const [atts] = await db.query(
  `SELECT id, filename, mime_type, size_bytes, content_base64, inline_cid, created_at
   FROM email_attachments
   WHERE email_id = ? ORDER BY id ASC`,
  [email.id]
);
email.attachments = atts || [];
// ADD THIS DEBUG LINE:
console.log(`Email ${email.id} has ${email.attachments.length} attachments:`, 
  email.attachments.map(a => ({ filename: a.filename, mime: a.mime_type }))
);
      email.body = sanitizeBody(email.body);
    }

    res.json({ data: emails });
  } catch (err) {
    console.error("FETCH EMAILS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch emails" });
  }
});

// -------------------- GET SINGLE ATTACHMENT (returns base64) --------------------
router.get("/email/:emailId/attachment/:attachmentId", async (req, res) => {
  try {
    const { emailId, attachmentId } = req.params;
    const [[row]] = await db.query(
      `SELECT id, email_id, filename, mime_type, size_bytes, content_base64, created_at
       FROM email_attachments WHERE id = ? AND email_id = ? LIMIT 1`,
      [attachmentId, emailId]
    );

    if (!row) return res.status(404).json({ error: "Attachment not found" });

    // Return base64 payload (client can render or download)
    res.json({
      id: row.id,
      email_id: row.email_id,
      filename: row.filename,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
      created_at: row.created_at,
      content_base64: row.content_base64
    });
  } catch (err) {
    console.error("GET ATTACHMENT ERROR:", err);
    res.status(500).json({ error: "Failed to fetch attachment" });
  }
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
    attachments // array of { filename, content (base64), size, mime_type, encoding? }
  } = req.body || {};

  if (!user_id) return res.status(400).json({ error: "Missing user_id" });

  // normalize recipients
  const extractEmails = arr =>
    (arr || []).map(v =>
      typeof v === "string" ? v.toLowerCase() :
      typeof v === "object" && v.email ? v.email.toLowerCase() :
      null
    ).filter(Boolean);

  const toList = extractEmails(to_emails || to);
  const ccList = extractEmails(cc_emails || cc);
  const bccList = extractEmails(bcc_emails || bcc);

  const cleanBody = sanitizeBody(body || "");

  if (!is_draft && toList.length === 0)
    return res.status(400).json({ error: "Recipient required" });

  // normalize attachments array
  const attachmentsList = Array.isArray(attachments) ? attachments : [];
console.log("=== EMAIL CREATE DEBUG ===");
console.log("Request body keys:", Object.keys(req.body));
console.log("Attachments received:", attachments);
console.log("Attachments list length:", attachmentsList.length);
if (attachmentsList.length > 0) {
  console.log("First attachment:", JSON.stringify({
    filename: attachmentsList[0].filename,
    mime_type: attachmentsList[0].mime_type,
    size: attachmentsList[0].size,
    hasContent: !!attachmentsList[0].content,
    contentPreview: attachmentsList[0].content ? attachmentsList[0].content.substring(0, 50) + "..." : "NO CONTENT"
  }, null, 2));
}
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
        "SELECT id FROM mailboxes WHERE user_id = ? AND system_box = ? LIMIT 1",
        [user_id, box]
      );
      resolvedFolderId = row ? row.id : null;
    }

    // insert email
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
        is_draft ? 1 : 0
      ]
    );

    const emailId = insert.insertId;

    // recipients
    for (const addr of toList)
      await conn.query("INSERT INTO email_recipients (email_id, address, type) VALUES (?, ?, 'to')", [emailId, addr]);
    for (const addr of ccList)
      await conn.query("INSERT INTO email_recipients (email_id, address, type) VALUES (?, ?, 'cc')", [emailId, addr]);
    for (const addr of bccList)
      await conn.query("INSERT INTO email_recipients (email_id, address, type) VALUES (?, ?, 'bcc')", [emailId, addr]);

    // add to sender's mailbox
    await conn.query(
      `INSERT INTO email_mailbox (user_id, email_id, mailbox_id, is_read)
       VALUES (?, ?, ?, 1)`,
      [user_id, emailId, resolvedFolderId]
    );

    // store attachments into DB (base64)
    if (attachmentsList.length) {
      for (const a of attachmentsList) {
        // a should have: filename, content (base64), size, mime_type
        const filename = a.filename || "attachment.bin";
        const mime_type = a.mime_type || a.contentType || null;
        const size_bytes = Number(a.size || a.size_bytes || 0);
        const content_base64 = a.content || null; // **base64 string**

        await conn.query(
          `INSERT INTO email_attachments
           (email_id, filename, mime_type, size_bytes, content_base64, created_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [emailId, filename, mime_type, size_bytes, content_base64]
        );
      }
    }

    // compute size_kb and has_attachments
    const attachmentsTotalBytes = attachmentsList.reduce(
      (s, a) => s + Number(a.size || 0),
      0
    );
    const rawBytes = Buffer.byteLength(cleanBody || '', 'utf8') + attachmentsTotalBytes;
    const size_kb = Math.max(1, Math.round((rawBytes || 0) / 1024));

await conn.query(
  "UPDATE emails SET size_kb = ? WHERE id = ?",
  [size_kb, emailId]
);

    // send SMTP if not draft
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
        subject: subject || "(No Subject)",
        html: cleanBody,
      };
      if (ccList.length) sendOptions.cc = ccList.join(", ");
      if (bccList.length) sendOptions.bcc = bccList.join(", ");

      // attach using Base64 content
      if (attachmentsList.length) {
        sendOptions.attachments = attachmentsList
          .map((a) => {
            if (!a.filename) return null;
            return {
              filename: a.filename,
              content: a.content, // base64 string
              encoding: a.encoding || "base64",
              contentType: a.mime_type || "application/octet-stream"
            };
          })
          .filter(Boolean);
      }

      try {
        await transporter.sendMail(sendOptions);
      } catch (smtpErr) {
        // log but don't fail the DB transaction (we've already stored message)
        console.error("SMTP send error:", smtpErr);
      }
    }

    // deliver to recipients inbox (for local users)
    const all = [...new Set([...toList, ...ccList, ...bccList])];
    if (all.length) {
      const placeholders = all.map(() => "?").join(",");
      const [users] = await conn.query(
        `SELECT id, email FROM users WHERE email IN (${placeholders})`,
        all
      );
      for (const rcp of users) {
        const [[inbox]] = await conn.query(
          "SELECT id FROM mailboxes WHERE user_id = ? AND system_box = 'inbox' LIMIT 1",
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
    try { await conn.rollback(); } catch (e) { /* ignore */ }
    console.error("EMAIL CREATE ERROR:", err);
    res.status(500).json({ error: "Failed to create email" });
  } finally {
    try { conn.release(); } catch (e) { /* ignore */ }
  }
});

// -------------------- UPDATE EMAIL (Generic Update) --------------------
router.post("/email/update", async (req, res) => {
  try {
    console.log("UPDATE REQUEST BODY:", JSON.stringify(req.body, null, 2));
    
    const body = req.body || {};
    
    // Handle multiple field name variations
    const email_id = body.email_id || body.emailId || body.id;
    const user_id = body.user_id || body.userId;
    
    if (!email_id || !user_id) {
      return res.status(400).json({ 
        error: "Missing required fields: email_id and user_id",
        received: body 
      });
    }

    // Check if updates are nested in an 'updates' object or sent directly
    const updatesObj = body.updates || body;
    
    // Whitelist allowed fields
    const allowed = new Set(["is_read", "is_starred", "is_deleted", "isRead", "isStarred", "isDeleted"]);
    const updateFields = [];
    const updateValues = [];

    // Map camelCase to snake_case
    const fieldMap = {
      'isRead': 'is_read',
      'isStarred': 'is_starred',
      'isDeleted': 'is_deleted'
    };

    for (const key of Object.keys(updatesObj)) {
      const dbField = fieldMap[key] || key;
      
      if (!allowed.has(key) && !allowed.has(dbField)) continue;
      
      // Skip non-boolean update fields
      if (['email_id', 'emailId', 'id', 'user_id', 'userId', 'updates'].includes(key)) continue;
      
      updateFields.push(`${dbField} = ?`);
      updateValues.push(updatesObj[key] ? 1 : 0);
    }

    // If marking deleted, set deleted_at
    if ((updatesObj.is_deleted || updatesObj.isDeleted) === true) {
      updateFields.push("deleted_at = NOW()");
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ 
        error: "No valid update fields provided. Allowed: is_read, is_starred, is_deleted",
        received: body
      });
    }

    updateValues.push(email_id, user_id);
    const sql = `UPDATE email_mailbox SET ${updateFields.join(", ")} WHERE email_id = ? AND user_id = ?`;
    
    const [result] = await db.query(sql, updateValues);
    
    console.log("UPDATE SUCCESS:", { email_id, user_id, affectedRows: result.affectedRows });

    return res.json({ 
      success: true, 
      message: "Email flags updated",
      affectedRows: result.affectedRows 
    });
  } catch (err) {
    console.error("EMAIL UPDATE ERROR:", err);
    return res.status(500).json({ error: "Server error while updating email" });
  }
});

// -------------------- MOVE EMAIL TO FOLDER --------------------
router.post("/email/move", async (req, res) => {
  try {
    console.log("MOVE REQUEST BODY:", JSON.stringify(req.body, null, 2));
    
    const body = req.body || {};
    
    // Handle multiple field name variations
    const email_id = body.email_id || body.emailId || body.id || body.messageId;
    const user_id = body.user_id || body.userId;
    const folder_id = body.folder_id || body.folderId || body.mailbox_id || body.mailboxId || body.labelId || body.destination || body.target_folder || body.targetFolder;
    const folder_name = body.folder_name || body.folderName || body.folder || body.label || body.to;

    if (!email_id || !user_id) {
      return res.status(400).json({ 
        error: "Missing required fields: email_id and user_id",
        received: body
      });
    }

    let targetFolderId = folder_id || null;

    // If folder_name is provided, resolve it to folder_id
    if (!targetFolderId && folder_name) {
      const [[folder]] = await db.query(
        `SELECT id FROM mailboxes WHERE user_id = ? AND (system_box = ? OR name = ?) LIMIT 1`,
        [user_id, folder_name, folder_name]
      );
      if (!folder) {
        return res.status(404).json({ 
          error: `Folder '${folder_name}' not found for user ${user_id}` 
        });
      }
      targetFolderId = folder.id;
    }

    if (!targetFolderId) {
      return res.status(400).json({ 
        error: "Target folder not specified. Provide folder_id or folder_name",
        received: body
      });
    }

    // Verify folder exists and belongs to user
    const [[folderCheck]] = await db.query(
      "SELECT id FROM mailboxes WHERE id = ? AND user_id = ? LIMIT 1", 
      [targetFolderId, user_id]
    );
    
    if (!folderCheck) {
      return res.status(403).json({ error: "Invalid folder or access denied" });
    }

    // Check if email exists in user's mailbox
    const [[exists]] = await db.query(
      "SELECT * FROM email_mailbox WHERE email_id = ? AND user_id = ? LIMIT 1", 
      [email_id, user_id]
    );
    
    if (!exists) {
      return res.status(404).json({ error: "Email not found in user's mailboxes" });
    }

    // Move the email
    const [result] = await db.query(
      "UPDATE email_mailbox SET mailbox_id = ? WHERE email_id = ? AND user_id = ?", 
      [targetFolderId, email_id, user_id]
    );

    console.log("MOVE SUCCESS:", { email_id, user_id, targetFolderId, affectedRows: result.affectedRows });

    return res.json({ 
      success: true, 
      message: "Email moved", 
      folder_id: targetFolderId,
      affectedRows: result.affectedRows
    });
  } catch (err) {
    console.error("MOVE EMAIL ERROR:", err);
    return res.status(500).json({ error: "Server error while moving email" });
  }
});

// -------------------- DELETE / TRASH / PERMANENT already exist below --------------------

router.post("/email/read", async (req, res) => {
  const { email_id, user_id, is_read } = req.body || {};
  await db.query(
    "UPDATE email_mailbox SET is_read = ? WHERE email_id = ? AND user_id = ?",
    [is_read ? 1 : 0, email_id, user_id]
  );
  res.json({ success: true });
});

router.post("/email/star", async (req, res) => {
  const { email_id, user_id, status } = req.body || {};

  const target = status ? "starred" : "inbox";
  const [[row]] = await db.query(
    "SELECT id FROM mailboxes WHERE user_id = ? AND system_box = ? LIMIT 1",
    [user_id, target]
  );

  await db.query(
    "UPDATE email_mailbox SET is_starred = ?, mailbox_id = ? WHERE email_id = ? AND user_id = ?",
    [status ? 1 : 0, row.id, email_id, user_id]
  );

  res.json({ success: true });
});

router.post("/email/delete", async (req, res) => {
  const { email_id, user_id } = req.body || {};

  const [[trash]] = await db.query(
    "SELECT id FROM mailboxes WHERE user_id = ? AND system_box = 'trash' LIMIT 1",
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

router.post("/email/delete-permanent", async (req, res) => {
  const { email_id, user_id } = req.body || {};

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
