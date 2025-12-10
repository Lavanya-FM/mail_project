#!/usr/bin/env node
/**
 * JeeMail Incoming Message Processor (FINAL FIXED VERSION)
 * - Fully aligned to emails table schema
 * - Stores size_kb and has_attachments for metrics
 */

const { simpleParser } = require("mailparser");
const mysql = require("mysql2/promise");

// Database pool (adjust credentials via env or config)
const db = mysql.createPool({
  host: "127.0.0.1",
  user: "mailuser",
  password: "StrongPassword123!",
  database: "maildb",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

/* ------------------------------------------------------------
   Extract ALL possible recipients
------------------------------------------------------------ */
function extractAllRecipients(parsed) {
  const recipients = [];

  if (parsed.to?.value) parsed.to.value.forEach(r => recipients.push(r.address));
  if (parsed.cc?.value) parsed.cc.value.forEach(r => recipients.push(r.address));
  if (parsed.bcc?.value) parsed.bcc.value.forEach(r => recipients.push(r.address));

  const delivered = parsed.headers.get("delivered-to");
  const original = parsed.headers.get("x-original-to");

  if (delivered) recipients.push(delivered);
  if (original) recipients.push(original);

  return [...new Set(recipients.map(r => (r || "").toLowerCase().trim()))];
}

/* ------------------------------------------------------------
   Save Email Into Database
------------------------------------------------------------ */
async function saveEmail(parsed) {

  const recipients = extractAllRecipients(parsed);

  if (!recipients.length) {
    console.log("❌ No recipients (dropping incoming message)");
    return;
  }

  const placeholders = recipients.map(() => "?").join(",");
  const [users] = await db.query(
    `SELECT id, email FROM users WHERE email IN (${placeholders})`,
    recipients
  );

  if (!users.length) {
    console.log("❌ No matching JeeMail users");
    return;
  }

  const from = parsed.from?.value?.[0] || {};
  const subject = parsed.subject || "(No subject)";

  const body =
    parsed.html ||
    parsed.textAsHtml ||
    `<pre>${parsed.text || ""}</pre>`;

  const messageId = parsed.messageId || null;
  const inReplyTo = parsed.inReplyTo || null;
  const referencesHeader = parsed.references ? parsed.references.join(", ") : null;

  const toHeader = parsed.to?.value?.map(x => x.address).join(", ") || "";
  const ccHeader = parsed.cc?.value?.map(x => x.address).join(", ") || "";
  const bccHeader = parsed.bcc?.value?.map(x => x.address).join(", ") || "";

  // compute attachments info from parsed.attachments
  const attachmentsList = Array.isArray(parsed.attachments) ? parsed.attachments : [];
  const attachmentsTotalBytes = attachmentsList.reduce((s, a) => s + (Number(a.size || 0)), 0);
  const bodyBytes = Buffer.byteLength(body || '', 'utf8');
  const totalBytes = (bodyBytes || 0) + attachmentsTotalBytes;
  const size_kb = Math.max(1, Math.round((totalBytes || 0) / 1024));
  const has_attachments = attachmentsList.length ? 1 : 0;

  const [insertEmail] = await db.query(
    `INSERT INTO emails (
      user_id,
      thread_id,
      from_name,
      from_email,
      subject,
      body,
      is_html,
      message_id,
      in_reply_to,
      references_header,
      created_at,
      to_header,
      cc_header,
      bcc_header,
      folder_id,
      is_read,
      is_starred,
      has_attachments,
      size_kb,
      is_draft
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      null,           // user_id (will map to mailboxes below)
      null,           // thread_id
      from.name || "",
      from.address || "",
      subject,
      body,
      1,
      messageId,
      inReplyTo,
      referencesHeader,
      toHeader,
      ccHeader,
      bccHeader,
      null,           // folder_id (per-user inbox will be used)
      0,              // is_read
      0,              // is_starred
      has_attachments,
      size_kb,
      0               // is_draft
    ]
  );

  const emailId = insertEmail.insertId;
  console.log("📩 Stored incoming email ID:", emailId);

  const storeList = (list, type) =>
    Promise.all(
      (list || []).map(addr =>
        db.query(
          `INSERT INTO email_recipients (email_id, address, type)
           VALUES (?, ?, ?)`,
          [emailId, addr, type]
        )
      )
    );

  await storeList(parsed.to?.value?.map(x => x.address), "to");
  await storeList(parsed.cc?.value?.map(x => x.address), "cc");
  await storeList(parsed.bcc?.value?.map(x => x.address), "bcc");

  for (const user of users) {
    const [[inbox]] = await db.query(
      `SELECT id FROM mailboxes 
       WHERE user_id=? AND system_box='inbox'
       LIMIT 1`,
      [user.id]
    );

    if (!inbox) continue;

    await db.query(
      `INSERT INTO email_mailbox 
        (user_id, email_id, mailbox_id, is_read)
       VALUES (?, ?, ?, 0)`,
      [user.id, emailId, inbox.id]
    );
  }
}

/* ------------------------------------------------------------
   MAIN — Read raw message piped from Postfix
------------------------------------------------------------ */
async function main() {
  let raw = "";

  process.stdin.on("data", chunk => (raw += chunk));

  process.stdin.on("end", async () => {
    try {
      const parsed = await simpleParser(raw);
      await saveEmail(parsed);
    } catch (err) {
      console.error("❌ Incoming email processing error:", err);
    }
    process.exit(0);
  });
}

main();
