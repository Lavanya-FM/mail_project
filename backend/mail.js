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


// -------------------- CHUNKED STREAMING --------------------
router.get("/email/:emailId/attachment/:attachmentId", async (req, res) => {
  try {
    const { emailId, attachmentId } = req.params;
    const userId = req.query.user_id;

    const [[row]] = await db.query(
      `
      SELECT filename, mime_type, content_base64
      FROM email_attachments
      WHERE id = ?
        AND email_id = ?
        AND email_id IN (
          SELECT email_id
          FROM email_mailbox
          WHERE user_id = ?
        )
      LIMIT 1
      `,
      [attachmentId, emailId, userId]
    );

    if (!row || !row.content_base64) {
      return res.status(404).json({ error: "Attachment not found" });
    }

    const buffer = Buffer.from(row.content_base64, "base64");
    const fileSize = buffer.length;
    const range = req.headers.range;

    const inlinePreviewable =
      row.mime_type?.startsWith("image/") ||
      row.mime_type === "application/pdf" ||
      row.mime_type === "image/svg+xml" ||
      row.mime_type?.startsWith("video/");

const forceDownload = req.query.download === "1";
const forceInline = req.query.inline === "1";

let disposition = `attachment; filename="${row.filename}"`;

if (!forceDownload && (forceInline || inlinePreviewable)) {
  disposition = `inline; filename="${row.filename}"`;
}

    res.setHeader("Content-Type", row.mime_type || "application/octet-stream");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Disposition", disposition);

    // ---- CHUNKED STREAMING ----
    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        res.status(416).setHeader("Content-Range", `bytes */${fileSize}`);
        return res.end();
      }

      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      res.setHeader("Content-Length", end - start + 1);

      return res.end(buffer.slice(start, end + 1));
    }

    // ---- FULL FILE ----
    res.setHeader("Content-Length", fileSize);
    res.end(buffer);
  } catch (err) {
    console.error("ATTACHMENT STREAM ERROR:", err);
    res.status(500).json({ error: "Failed to stream attachment" });
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

// -------------------- GET THREAD (Conversation View) --------------------
router.get("/email/thread/:threadId", async (req, res) => {
  try {
    const { threadId } = req.params;
    const userId = req.query.user_id;

    if (!threadId || !userId) {
      return res.status(400).json({ error: "Missing threadId or user_id" });
    }

    const [emails] = await db.query(
      `
      SELECT e.*, m.is_read, m.is_starred, m.mailbox_id
      FROM emails e
      JOIN email_mailbox m ON e.id = m.email_id
      WHERE e.thread_id = ?
        AND m.user_id = ?
      ORDER BY e.created_at ASC
      `,
      [threadId, userId]
    );

    for (const email of emails) {
      // recipients
      const [rcp] = await db.query(
        "SELECT address, type FROM email_recipients WHERE email_id = ?",
        [email.id]
      );

      email.to_emails = rcp.filter(r => r.type === "to").map(r => r.address);
      email.cc_emails = rcp.filter(r => r.type === "cc").map(r => r.address);
      email.bcc_emails = rcp.filter(r => r.type === "bcc").map(r => r.address);

      // ✅ attachment metadata including P2P fields
      const [atts] = await db.query(
        `
        SELECT id, filename, mime_type, size_bytes, delivery_mode, delivered, p2p_message_id
        FROM email_attachments
        WHERE email_id = ?
        `,
        [email.id]
      );

      email.attachments = atts.map(att => ({
        ...att,
        is_p2p: att.delivery_mode === 'P2P',
        p2p_pending: att.delivery_mode === 'P2P' && !att.delivered
      }));
      email.has_attachments = atts.length > 0;
      email.attachment_count = atts.length;

      email.body = sanitizeBody(email.body);
    }

    return res.json({ data: emails });
  } catch (err) {
    console.error("THREAD FETCH ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch thread" });
  }
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
// fetch attachment metadata including P2P fields (NO base64)
const [atts] = await db.query(
  `
  SELECT
    id,
    filename,
    mime_type,
    size_bytes,
    delivery_mode,
    delivered,
    p2p_message_id
  FROM email_attachments
  WHERE email_id = ?
  `,
  [email.id]
);

// Mark P2P attachments with is_p2p flag for frontend
email.attachments = atts.map(att => ({
  ...att,
  is_p2p: att.delivery_mode === 'P2P',
  p2p_pending: att.delivery_mode === 'P2P' && !att.delivered
}));
email.has_attachments = atts.length > 0;
email.attachment_count = atts.length;

      const [rcp] = await db.query(
        "SELECT address, type FROM email_recipients WHERE email_id = ?",
        [email.id]
      );

      email.to_emails = rcp.filter((x) => x.type === "to").map((x) => x.address);
      email.cc_emails = rcp.filter((x) => x.type === "cc").map((x) => x.address);
      email.bcc_emails = rcp.filter((x) => x.type === "bcc").map((x) => x.address);

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

// -------------------- CREATE / SEND EMAIL --------------------
router.post("/email/create", async (req, res) => {
  console.log("=== EMAIL CREATE DEBUG ===");
  console.log("Request body keys:", Object.keys(req.body));

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
    attachments, // array of { filename, content (base64), size, mime_type, encoding? }
    p2p_enabled,
    p2p_delivered
  } = req.body;

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

  // normalize attachments array - check for P2P mode
  // If P2P is enabled and delivered, don't store attachments in DB (they were sent via P2P)
  const attachmentsList = Array.isArray(attachments) ? attachments : [];

  console.log("=== EMAIL CREATE DEBUG ===");
  console.log("P2P Enabled:", p2p_enabled);
  console.log("P2P Delivered:", p2p_delivered);
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

  let resolvedThreadId;

  resolvedThreadId = null;

  try {
    const [[sender]] = await conn.query(
      "SELECT name, email FROM users WHERE id = ? LIMIT 1",
      [user_id]
    );

    // resolve folder
const box = is_draft ? "drafts" : "sent";

const [[mailbox]] = await conn.query(
  "SELECT id FROM mailboxes WHERE user_id = ? AND system_box = ? LIMIT 1",
  [user_id, box]
);

if (!mailbox) {
  throw new Error(`Mailbox '${box}' not found for user ${user_id}`);
}

const resolvedFolderId = mailbox.id;


    // -------------------- THREAD RESOLUTION --------------------
    resolvedThreadId = null;

    if (in_reply_to) {
      const [[parent]] = await conn.query(
        "SELECT thread_id FROM emails WHERE id = ?",
        [in_reply_to]
      );
      resolvedThreadId = parent?.thread_id || null;
    }

    // 2. INSERT email with P2P flags
    const [insert] = await conn.query(
      `INSERT INTO emails
       (user_id, thread_id, from_name, from_email, subject, body, is_html, in_reply_to,
        to_header, cc_header, bcc_header, folder_id, is_draft, p2p_enabled, p2p_delivered, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        user_id,
        resolvedThreadId,
        sender.name,
        sender.email,
        subject || "(No Subject)",
        cleanBody,
        1,
        in_reply_to || null,
        toList.join(", "),
        ccList.join(", "),
        bccList.join(", "),
        resolvedFolderId,
        is_draft ? 1 : 0,
        p2p_enabled ? 1 : 0,
        p2p_delivered ? 1 : 0
      ]
    );

    const emailId = insert.insertId;

    // ✅ Only now emailId exists - update thread_id if needed
    if (!resolvedThreadId) {
      await conn.query(
        "UPDATE emails SET thread_id = ? WHERE id = ?",
        [emailId, emailId]
      );
    }
    
    // recipients
    for (const addr of toList)
      await conn.query("INSERT INTO email_recipients (email_id, address, type) VALUES (?, ?, 'to')", [emailId, addr]);
    for (const addr of ccList)
      await conn.query("INSERT INTO email_recipients (email_id, address, type) VALUES (?, ?, 'cc')", [emailId, addr]);
    for (const addr of bccList)
      await conn.query("INSERT INTO email_recipients (email_id, address, type) VALUES (?, ?, 'bcc')", [emailId, addr]);

    // add to sender's mailbox
await conn.query(
  `
  INSERT INTO email_mailbox
    (user_id, email_id, mailbox_id, is_read)
  VALUES (?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    mailbox_id = VALUES(mailbox_id),
    is_read = VALUES(is_read)
  `,
  [user_id, emailId, resolvedFolderId, 1]
);

    // store attachments into DB (base64) - only if not sent via P2P
    if (attachmentsList.length) {
      for (const a of attachmentsList) {
        const filename = a.filename || "attachment.bin";
        const mime_type = a.mime_type || a.contentType || null;
        const size_bytes = Number(a.size || a.size_bytes || 0);
const content_base64 =
  typeof a.content_base64 === 'string'
    ? a.content_base64
    : typeof a.content === 'string'
      ? a.content
      : null;

        const isP2P = p2p_enabled === true;

    // For P2P: store content_base64 as FALLBACK (like torrent seeder)
    // This allows download even if direct P2P transfer fails
    await conn.query(
      `INSERT INTO email_attachments
       (email_id, filename, mime_type, size_bytes,
        content_base64, delivery_mode, delivered, p2p_message_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
       [
       emailId,
       filename,
       mime_type,
       size_bytes,
       content_base64, // Always store content as fallback
       isP2P ? 'P2P' : 'EMAIL',
       isP2P ? 0 : 1,
       a.p2p_message_id || null
       ]
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
  `
  UPDATE emails
  SET
    has_attachments = ?,
    attachment_count = ?
  WHERE id = ?
  `,
  [
    attachmentsList.length > 0 ? 1 : 0,
    attachmentsList.length,
    emailId
  ]
);

    // send SMTP if not draft and not P2P delivered
    if (!is_draft && !p2p_enabled) {
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
              content: a.content_base64 || a.content,
              encoding: "base64",

              contentType: a.mime_type || "application/octet-stream"
            };
          })
          .filter(Boolean);
      }

      try {
        await transporter.sendMail(sendOptions);
      } catch (smtpErr) {
        console.error("SMTP send error:", smtpErr);
      }
    }

    // deliver to recipients inbox (for local users) - only if not P2P delivered
    {
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
    
    const email_id = body.email_id || body.emailId || body.id;
    const user_id = body.user_id || body.userId;
    
    if (!email_id || !user_id) {
      return res.status(400).json({ 
        error: "Missing required fields: email_id and user_id",
        received: body 
      });
    }

    const updatesObj = body.updates || body;
    
    const allowed = new Set(["is_read", "is_starred", "is_deleted", "isRead", "isStarred", "isDeleted"]);
    const updateFields = [];
    const updateValues = [];

    const fieldMap = {
      'isRead': 'is_read',
      'isStarred': 'is_starred',
      'isDeleted': 'is_deleted'
    };

    for (const key of Object.keys(updatesObj)) {
      const dbField = fieldMap[key] || key;
      
      if (!allowed.has(key) && !allowed.has(dbField)) continue;
      
      if (['email_id', 'emailId', 'id', 'user_id', 'userId', 'updates'].includes(key)) continue;
      
      updateFields.push(`${dbField} = ?`);
      updateValues.push(updatesObj[key] ? 1 : 0);
    }

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

// -------------------- UPDATE P2P DELIVERY STATUS --------------------
router.post("/p2p/delivered", async (req, res) => {
  try {
    const { p2p_message_id } = req.body;
    
    if (!p2p_message_id) {
      return res.status(400).json({ error: "Missing p2p_message_id" });
    }

    // Update attachment as delivered
    const [result] = await db.query(
      `UPDATE email_attachments SET delivered = 1, delivered_at = NOW() WHERE p2p_message_id = ?`,
      [p2p_message_id]
    );

    // Also update the email's p2p_delivered flag
    await db.query(
      `UPDATE emails e
       JOIN email_attachments a ON e.id = a.email_id
       SET e.p2p_delivered = 1
       WHERE a.p2p_message_id = ?`,
      [p2p_message_id]
    );

    console.log("[P2P] Marked as delivered:", p2p_message_id, "affected:", result.affectedRows);
    
    return res.json({ success: true, affectedRows: result.affectedRows });
  } catch (err) {
    console.error("P2P DELIVERED ERROR:", err);
    return res.status(500).json({ error: "Failed to update delivery status" });
  }
});

// -------------------- MOVE EMAIL TO FOLDER --------------------
router.post("/email/move", async (req, res) => {
  try {
    console.log("MOVE REQUEST BODY:", JSON.stringify(req.body, null, 2));
    
    const body = req.body || {};
    
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

    const [[folderCheck]] = await db.query(
      "SELECT id FROM mailboxes WHERE id = ? AND user_id = ? LIMIT 1", 
      [targetFolderId, user_id]
    );
    
    if (!folderCheck) {
      return res.status(403).json({ error: "Invalid folder or access denied" });
    }

    const [[exists]] = await db.query(
      "SELECT * FROM email_mailbox WHERE email_id = ? AND user_id = ? LIMIT 1", 
      [email_id, user_id]
    );
    
    if (!exists) {
      return res.status(404).json({ error: "Email not found in user's mailboxes" });
    }

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

module.exports = router;
