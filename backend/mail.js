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
const { sanitizeBody, normalizeEmail, isValidEmailFormat } = require("./utils");

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
    // ✅ CRITICAL: Log the raw request body to debug data corruption
    console.log('REGISTER: Raw request body', JSON.stringify(req.body, null, 2));
    
    // ✅ CRITICAL: Extract raw values from request body
    const rawName = req.body?.name;
    const rawEmail = req.body?.email;
    const password = req.body.password;
    const dateOfBirth = req.body.dateOfBirth;
    const gender = req.body.gender;
    
    // ✅ CRITICAL: Log raw input values
    console.log('REGISTER: Raw input values', {
      rawName: rawName || 'MISSING',
      rawEmail: rawEmail || 'MISSING',
      passwordLength: password ? password.length : 0,
      dateOfBirth: dateOfBirth || 'MISSING',
      gender: gender || 'MISSING'
    });
    
    // ✅ CRITICAL: Validate email is required
    if (!rawEmail) {
      return res.status(400).json({ error: "Email is required" });
    }
    
    // ✅ CRITICAL: Normalize email
    const email = normalizeEmail(String(rawEmail).trim());
    
    // ✅ CRITICAL: Extract email username (part before @)
    const emailUsername = email.split('@')[0] || '';
    
    // 🔒 SAFETY FIX: Handle malformed input where name contains email pattern or equals email
    // This is a defensive backend fix only - does not change existing functionality
    let name = rawName ? String(rawName).trim() : '';
    const originalName = name;
    
    // ✅ CRITICAL: If name contains @ symbol, strip it (recover from corrupted data)
    if (name.includes('@')) {
      // Remove @jeemail.in pattern if present
      name = name.replace(/@jeemail\.in/gi, '');
      // Remove @ and everything after it
      if (name.includes('@')) {
        name = name.split('@')[0].trim();
      }
      console.warn('REGISTER: Name contained @ symbol, stripped email pattern', {
        originalName: originalName,
        email: email,
        emailUsername: emailUsername,
        recoveredName: name
      });
    }
    
    // If name is missing OR equals email (data corruption), recover safely
    if (!name || name === rawEmail || name === email) {
      // Extract username from email as fallback
      const emailParts = email.split('@');
      if (emailParts.length > 0 && emailParts[0]) {
        name = emailParts[0];
        console.warn('REGISTER: Name was missing or equal to email, using email username as fallback', {
          originalName: originalName,
          email: email,
          emailUsername: emailUsername,
          recoveredName: name
        });
      } else {
        return res.status(400).json({ error: "Name is required" });
      }
    }
    
    // ✅ CRITICAL: Final validation - name cannot contain @ symbol (should never happen after recovery)
    if (name.includes('@')) {
      console.error('REGISTER ERROR: Name still contains @ symbol after recovery - severe data corruption!', {
        originalName: originalName,
        name: name,
        email: email,
        emailUsername: emailUsername,
        password: password ? `*** (length: ${password.length})` : 'MISSING'
      });
      return res.status(400).json({ 
        error: "Name cannot contain @ symbol. Please enter your actual name, not your email address." 
      });
    }
    
    // ✅ CRITICAL: Log extracted and processed values
    console.log('REGISTER: Extracted and processed values', {
      originalRawName: rawName || 'MISSING',
      processedName: name || 'MISSING',
      nameLength: name ? name.length : 0,
      originalRawEmail: rawEmail || 'MISSING',
      normalizedEmail: email || 'MISSING',
      emailUsername: emailUsername || 'MISSING',
      emailLength: email ? email.length : 0,
      passwordLength: password ? password.length : 0,
      dateOfBirth: dateOfBirth ? `${dateOfBirth.year}-${dateOfBirth.month}-${dateOfBirth.day}` : 'MISSING',
      gender: gender || 'MISSING'
    });

    if (!password)
      return res.status(400).json({ error: "Password is required" });
    
    // ✅ CRITICAL: Validate that email IS an email address and NOT a password
    if (!email.includes('@')) {
      console.error('REGISTER ERROR: Email does not contain @ symbol - data corruption detected!', {
        name,
        email,
        password: password ? `*** (length: ${password.length})` : 'MISSING'
      });
      return res.status(400).json({ error: "Invalid email format. Email must contain @ symbol." });
    }
    
    // ✅ CRITICAL: Validate that email is NOT actually a password (password might contain @)
    // If email looks like a password (contains @ but doesn't have a valid domain), reject it
    if (email.includes('@') && !email.includes('.')) {
      console.error('REGISTER ERROR: Email appears to be a password (has @ but no domain) - data corruption detected!', {
        name,
        email,
        password: password ? `*** (length: ${password.length})` : 'MISSING'
      });
      return res.status(400).json({ error: "Invalid email format. Email must have a valid domain." });
    }
    
    // ✅ CRITICAL: Validate that password is NOT being used as email
    // If email matches password pattern (contains @ but not a proper email domain), reject
    if (password && email === password) {
      console.error('REGISTER ERROR: Email matches password - data corruption detected!', {
        name,
        email,
        password: password ? `*** (length: ${password.length})` : 'MISSING'
      });
      return res.status(400).json({ error: "Email cannot be the same as password." });
    }
    
    // ✅ CRITICAL: Check if email looks like a password (has @ but domain is not jeemail.in or is invalid)
    const emailParts = email.split('@');
    if (emailParts.length === 2) {
      const domain = emailParts[1];
      // If domain is not jeemail.in and doesn't look like a valid email domain, it might be a password
      if (domain !== 'jeemail.in' && !domain.includes('.')) {
        console.error('REGISTER ERROR: Email domain is invalid - might be password corruption!', {
          name,
          email,
          domain,
          password: password ? `*** (length: ${password.length})` : 'MISSING'
        });
        return res.status(400).json({ error: "Invalid email domain." });
      }
    }

    // ✅ CRITICAL: Detect data swap/corruption - email should not look like a password
    // If email username looks like a password (all numbers, too short, no letters), reject
    const emailLocalPart = email.split('@')[0];
    if (emailLocalPart) {
      // Check if email username looks like a password pattern
      const looksLikePassword = 
        /^\d+$/.test(emailLocalPart) || // All numbers like "123456asd" (but this has letters, so check differently)
        (emailLocalPart.length >= 6 && /^[a-zA-Z0-9]{6,}$/.test(emailLocalPart) && !/[a-z]/.test(emailLocalPart.toLowerCase())) || // All uppercase or mixed case alphanumeric without lowercase
        (emailLocalPart.length >= 8 && /^[0-9a-zA-Z]{8,}$/.test(emailLocalPart) && /[0-9]/.test(emailLocalPart) && !/[a-z]/.test(emailLocalPart.toLowerCase())); // Long alphanumeric with numbers but no lowercase
      
      // More specific: if email username is 8+ chars, all alphanumeric, has numbers, and looks like "123456asd" pattern
      if (emailLocalPart.length >= 8 && /^[0-9a-zA-Z]+$/.test(emailLocalPart) && /[0-9]/.test(emailLocalPart)) {
        // Check if it starts with numbers (common password pattern)
        if (/^[0-9]/.test(emailLocalPart)) {
          console.error('REGISTER ERROR: Email username looks like a password (starts with numbers)!', {
            emailLocalPart: emailLocalPart,
            email: email,
            name: name,
            passwordLength: password ? password.length : 0,
            rawName: rawName,
            rawEmail: rawEmail
          });
          return res.status(400).json({ 
            error: "Invalid email format. Email username should not start with numbers (e.g., '123asd456'). Please use a proper email username that starts with a letter (e.g., 'doe', 'john', 'jane')." 
          });
        }
      }
    }
    
    // ✅ CRITICAL: Validate email format first
    if (!isValidEmailFormat(email)) {
      return res.status(400).json({ 
        error: "Invalid email format. Please enter a valid email address." 
      });
    }
    
    const normalizedEmail = normalizeEmail(email);
    
    // ✅ FIX: Add logging to debug registration
    console.log('REGISTER ATTEMPT:', { 
      originalEmail: email, 
      normalizedEmail: normalizedEmail,
      name: name 
    });

    // ✅ CRITICAL: Validate domain (must be jeemail.in)
    if (!isValidDomain(normalizedEmail)) {
      return res.status(400).json({ 
        error: `Email must be under ${ALLOWED_DOMAIN}` 
      });
    }

    // ✅ CRITICAL: Check for email uniqueness (case-insensitive, like Gmail)
    // Use LOWER() and TRIM() to ensure case-insensitive comparison and handle whitespace
    // Also check the exact normalized email to catch any edge cases
    const [exists] = await db.query(
      "SELECT id, email FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) OR email = ? LIMIT 1",
      [normalizedEmail, normalizedEmail]
    );
    
    console.log('REGISTER CHECK:', { 
      normalizedEmail: normalizedEmail,
      alreadyExists: exists.length > 0,
      existingUserId: exists[0]?.id,
      existingEmail: exists[0]?.email
    });
    
    if (exists.length) {
      return res.status(409).json({ 
        error: "This email address is already registered. Please use a different email or sign in." 
      });
    }

    // ✅ CRITICAL: Validate password before hashing
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: "Password is required" });
    }
    
    // ✅ CRITICAL: Detect if password looks like a name (data swap detection)
    // Password should not be a common name (4-5 chars, all lowercase letters)
    if (password.length <= 5 && /^[a-z]+$/.test(password.toLowerCase())) {
      const commonNames = ['john', 'jane', 'doe', 'mary', 'joe', 'bob', 'tom', 'sam', 'max', 'leo', 'ray', 'jay', 'roy', 'dan', 'ben', 'tim', 'kim', 'amy', 'ann', 'eva', 'mia', 'zoe'];
      if (commonNames.includes(password.toLowerCase())) {
        console.error('REGISTER ERROR: Password looks like a name - possible data swap detected!', {
          password: password,
          name: name,
          email: email,
          emailUsername: emailUsername
        });
        return res.status(400).json({ 
          error: "Password appears to be invalid. Please use a stronger password (at least 6 characters with letters, numbers, or special characters)." 
        });
      }
    }
    
    // ✅ CRITICAL: Validate password length (minimum 6 characters, maximum 128)
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }
    if (password.length > 128) {
      return res.status(400).json({ error: "Password is too long (maximum 128 characters)" });
    }
    
    // ✅ CRITICAL: Don't trim password - user might have intentionally added spaces
    // But ensure it's a valid string
    const passwordString = String(password);
    
    let dobString = null;
    if (dateOfBirth?.year) {
      dobString = `${dateOfBirth.year}-${String(dateOfBirth.month).padStart(
        2,
        "0"
      )}-${String(dateOfBirth.day).padStart(2, "0")}`;
    }

    // ✅ CRITICAL: Hash password with bcrypt (10 salt rounds for security)
    // This creates a secure one-way hash that cannot be reversed
    let hash;
    try {
      hash = await bcrypt.hash(passwordString, 10);
      console.log('REGISTER: Password hashed successfully', { 
        hashLength: hash.length,
        hashPrefix: hash.substring(0, 10) + '...' // Log first 10 chars for debugging
      });
    } catch (hashError) {
      console.error('REGISTER ERROR: Password hashing failed', hashError);
      return res.status(500).json({ error: "Password encryption failed" });
    }
    
    // ✅ CRITICAL: Verify hash was created (should be 60 characters for bcrypt)
    if (!hash || hash.length < 50) {
      console.error('REGISTER ERROR: Invalid hash generated', { hashLength: hash?.length });
      return res.status(500).json({ error: "Password encryption failed" });
    }

    // ✅ CRITICAL: Log values before INSERT to verify correct order
    console.log('REGISTER: Values to INSERT', {
      name: name ? `${name.substring(0, 20)}...` : 'NULL',
      email: normalizedEmail ? `${normalizedEmail.substring(0, 30)}...` : 'NULL',
      passwordHash: hash ? `*** (length: ${hash.length})` : 'NULL',
      dateOfBirth: dobString || 'NULL',
      gender: gender || 'NULL'
    });
    
    // ✅ CRITICAL: Verify values are in correct order before INSERT
    if (name.includes('@')) {
      console.error('REGISTER CRITICAL ERROR: Name contains @ before INSERT! Aborting.', {
        name,
        normalizedEmail
      });
      return res.status(500).json({ error: "Data validation failed: name contains email format" });
    }
    
    if (!normalizedEmail.includes('@')) {
      console.error('REGISTER CRITICAL ERROR: Email does not contain @ before INSERT! Aborting.', {
        name,
        normalizedEmail
      });
      return res.status(500).json({ error: "Data validation failed: email is invalid" });
    }
    
    const [insert] = await db.query(
      `INSERT INTO users (name, email, password, date_of_birth, gender)
       VALUES (?, ?, ?, ?, ?)`,
      [name, normalizedEmail, hash, dobString, gender]
    );
    
    // ✅ CRITICAL: Verify what was actually inserted
    const [verifyInsert] = await db.query(
      "SELECT name, email, LENGTH(password) as pwd_length FROM users WHERE id = ? LIMIT 1",
      [insert.insertId]
    );
    
    if (verifyInsert.length > 0) {
      const inserted = verifyInsert[0];
      console.log('REGISTER: Verification of inserted data', {
        insertedName: inserted.name ? `${inserted.name.substring(0, 20)}...` : 'NULL',
        insertedEmail: inserted.email ? `${inserted.email.substring(0, 30)}...` : 'NULL',
        passwordLength: inserted.pwd_length
      });
      
      // ✅ CRITICAL: Check if data corruption occurred
      if (inserted.name && inserted.name.includes('@')) {
        console.error('REGISTER CRITICAL ERROR: Name field contains @ after INSERT! Data corruption detected!', {
          insertedName: inserted.name,
          insertedEmail: inserted.email,
          expectedName: name,
          expectedEmail: normalizedEmail
        });
        // Try to fix it by updating the record
        await db.query(
          "UPDATE users SET name = ?, email = ? WHERE id = ?",
          [name, normalizedEmail, insert.insertId]
        );
        console.log('REGISTER: Attempted to fix corrupted data');
      }
      
      if (inserted.email && !inserted.email.includes('@')) {
        console.error('REGISTER CRITICAL ERROR: Email field does not contain @ after INSERT! Data corruption detected!', {
          insertedName: inserted.name,
          insertedEmail: inserted.email,
          expectedName: name,
          expectedEmail: normalizedEmail
        });
        // Try to fix it by updating the record
        await db.query(
          "UPDATE users SET name = ?, email = ? WHERE id = ?",
          [name, normalizedEmail, insert.insertId]
        );
        console.log('REGISTER: Attempted to fix corrupted data');
      }
    }
    
    const userId = insert.insertId;
    
    // ✅ CRITICAL: Verify user was created and can be retrieved for login
    const [verifyUser] = await db.query(
      "SELECT id, email, name, LENGTH(password) as pwd_length FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    
    if (verifyUser.length === 0) {
      console.error('REGISTER ERROR: User was not created in database!', { userId });
      return res.status(500).json({ error: "Failed to create user account" });
    }
    
    console.log('REGISTER: User created and verified in database', { 
      userId: verifyUser[0].id,
      email: verifyUser[0].email,
      name: verifyUser[0].name,
      storedHashLength: verifyUser[0].pwd_length 
    });
    
    // ✅ CRITICAL: Test that the user can be found with login query (same query as login uses)
    const [loginTest] = await db.query(
      "SELECT id, email FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) LIMIT 1",
      [normalizedEmail]
    );
    
    if (loginTest.length === 0) {
      console.error('REGISTER ERROR: User cannot be found with login query!', { 
        normalizedEmail,
        userId 
      });
      return res.status(500).json({ error: "User created but login query failed" });
    }
    
    console.log('REGISTER: Login query test passed', { 
      userId: loginTest[0].id,
      email: loginTest[0].email 
    });

    await createSystemFolders(userId);
    
    // ✅ FIX: Log successful registration
    console.log('REGISTER SUCCESS:', { 
      userId: userId,
      name: name,
      normalizedEmail: normalizedEmail 
    });

    // ✅ FIX: Explicitly map fields to ensure correct data structure
    // ✅ CRITICAL: NEVER include password in response
    // ✅ CRITICAL: Return name and email exactly as stored in database (no trimming)
    const responseUser = {
      id: userId,
      name: String(name || ''), // ✅ Return exactly as stored (no trim)
      email: String(normalizedEmail || ''), // ✅ Return exactly as stored (no trim)
      date_of_birth: dobString || null,
      gender: gender || null,
    };
    
    // ✅ CRITICAL: Validate response doesn't contain password
    if ('password' in responseUser) {
      console.error('REGISTER ERROR: Password accidentally included in response!');
      delete responseUser.password;
    }
    
    // ✅ CRITICAL: Validate name is not an email and email is valid
    if (responseUser.name.includes('@')) {
      console.error('REGISTER ERROR: Name field contains email address!', { 
        name: responseUser.name, 
        email: responseUser.email 
      });
      return res.status(500).json({ error: "Data corruption detected" });
    }
    
    if (!responseUser.email.includes('@') || responseUser.email.length > 100) {
      console.error('REGISTER ERROR: Invalid email in response!', { 
        email: responseUser.email 
      });
      return res.status(500).json({ error: "Data corruption detected" });
    }
    
    return res.json({ user: responseUser });
  } catch (err) {
    // ✅ CRITICAL: Map database/validation errors to meaningful HTTP responses
    console.error("REGISTER ERROR:", err);

    // MariaDB trigger/constraint violation for name containing '@'
    // err.errno === 1644 and err.sqlState === '45000' in our tests
    if (err && (err.errno === 1644 || err.sqlState === '45000')) {
      const msg = err.sqlMessage || err.message || "Name cannot contain @ symbol";
      return res.status(400).json({ error: msg });
    }

    // Generic validation or query error
    return res.status(500).json({ error: "Registration failed" });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    // ✅ CRITICAL: Validate email format first
    if (!isValidEmailFormat(email || "")) {
      return res.status(400).json({ 
        error: "Invalid email format. Please enter a valid email address." 
      });
    }
    
    const normalized = normalizeEmail(email || "");
    
    // ✅ FIX: Add logging to debug login issues
    console.log('LOGIN ATTEMPT:', { 
      originalEmail: email, 
      normalizedEmail: normalized,
      hasPassword: !!password 
    });
    
    // ✅ CRITICAL: Use case-insensitive email lookup (like Gmail)
    // Since we store emails in lowercase, we can compare directly, but use LOWER() for safety
    // This ensures emails stored as "user@jeemail.in" match queries for "User@Jeemail.In"
    const [rows] = await db.query(
      "SELECT id, name, email, password, date_of_birth, gender FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) LIMIT 1",
      [normalized]
    );

    console.log('LOGIN QUERY RESULT:', { 
      normalizedEmail: normalized,
      foundUsers: rows.length,
      userId: rows[0]?.id,
      dbEmail: rows[0]?.email,
      queryUsed: "LOWER(TRIM(email)) = LOWER(TRIM(?))"
    });

    if (!rows.length) {
      // ✅ CRITICAL: Try alternative query in case of whitespace or case issues
      const [altRows] = await db.query(
        "SELECT id, name, email, password, date_of_birth, gender FROM users WHERE email = ? LIMIT 1",
        [normalized]
      );
      
      if (altRows.length > 0) {
        console.log('LOGIN: Found user with alternative query (exact match)', { 
          userId: altRows[0].id,
          email: altRows[0].email 
        });
        rows.push(...altRows);
      } else {
        // ✅ CRITICAL: Try one more time with just LOWER() in case TRIM() is causing issues
        const [lowerRows] = await db.query(
          "SELECT id, name, email, password, date_of_birth, gender FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1",
          [normalized]
        );
        
        if (lowerRows.length > 0) {
          console.log('LOGIN: Found user with LOWER() only query', { 
            userId: lowerRows[0].id,
            email: lowerRows[0].email 
          });
          rows.push(...lowerRows);
        } else {
          console.error('LOGIN FAILED: User not found with any query', { 
            normalizedEmail: normalized,
            triedQueries: [
              'LOWER(TRIM(email)) = LOWER(TRIM(?))',
              'email = ?',
              'LOWER(email) = LOWER(?)'
            ]
          });
          return res.status(404).json({ error: "User not found. Please check your email address or register first." });
        }
      }
    }

    const user = rows[0];
    
    // ✅ FIX: Validate that we got the expected columns
    if (!user.id || !user.email || !user.password) {
      console.error("LOGIN ERROR: Invalid user data structure", { 
        hasId: !!user.id, 
        hasEmail: !!user.email, 
        hasPassword: !!user.password,
        keys: Object.keys(user)
      });
      return res.status(500).json({ error: "Database structure error" });
    }
    
    // ✅ CRITICAL: Validate password input
    if (!password || typeof password !== 'string') {
      console.error('LOGIN ERROR: Invalid password provided', { hasPassword: !!password, passwordType: typeof password });
      return res.status(400).json({ error: "Password is required" });
    }
    
    // ✅ CRITICAL: Don't trim password - must match exactly what was stored
    const passwordString = String(password);
    
    // ✅ CRITICAL: Verify stored password hash format (bcrypt hashes are 60 chars)
    if (!user.password || user.password.length < 50) {
      console.error('LOGIN ERROR: Invalid password hash in database', { 
        hashLength: user.password?.length,
        userId: user.id 
      });
      return res.status(500).json({ error: "Database password format error" });
    }
    
    // ✅ CRITICAL: Compare password using bcrypt.compare
    // This securely compares the plain password with the stored hash
    let match;
    try {
      match = await bcrypt.compare(passwordString, user.password);
      console.log('LOGIN: Password comparison result', { 
        userId: user.id,
        email: user.email,
        match: match,
        providedPasswordLength: passwordString.length,
        storedHashLength: user.password.length
      });
    } catch (compareError) {
      console.error('LOGIN ERROR: Password comparison failed', compareError);
      return res.status(500).json({ error: "Password verification failed" });
    }
    
    if (!match) {
      console.warn('LOGIN FAILED: Incorrect password', { 
        userId: user.id,
        email: user.email 
      });
      return res.status(401).json({ error: "Incorrect password" });
    }

    await createSystemFolders(user.id);

    // ✅ FIX: Explicitly map fields to ensure correct mapping
    // ✅ CRITICAL: NEVER include password in response - explicitly exclude it
    // ✅ CRITICAL: Return name and email exactly as stored in database (no trimming)
    const responseUser = {
      id: user.id,
      name: String(user.name || ''), // ✅ Return exactly as stored (no trim)
      email: String(user.email || ''), // ✅ Return exactly as stored (no trim)
      date_of_birth: user.date_of_birth || null,
      gender: user.gender || null,
    };
    
    // ✅ CRITICAL: Validate response doesn't contain password
    if ('password' in responseUser) {
      console.error('LOGIN ERROR: Password accidentally included in response!');
      delete responseUser.password;
    }
    
    // ✅ CRITICAL: Validate name is not an email and email is valid
    if (responseUser.name.includes('@')) {
      console.error('LOGIN ERROR: Name field contains email address!', { 
        name: responseUser.name, 
        email: responseUser.email,
        dbUser: user 
      });
      return res.status(500).json({ error: "Data corruption detected" });
    }
    
    if (!responseUser.email.includes('@') || responseUser.email.length > 100) {
      console.error('LOGIN ERROR: Invalid email in response!', { 
        email: responseUser.email,
        dbUser: user 
      });
      return res.status(500).json({ error: "Data corruption detected" });
    }
    
    return res.json({ user: responseUser });
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
    let folderId = null;

    // Check if folder is a numeric string or number
    const numericFolderId = Number(folder);
    if (!isNaN(numericFolderId) && numericFolderId > 0) {
      folderId = numericFolderId;
    } else {
      // Try to resolve folder name to ID
      const [r] = await db.query(
        "SELECT id FROM mailboxes WHERE user_id = ? AND system_box = ? LIMIT 1",
        [userId, folder]
      );
      if (!r.length) return res.status(400).json({ error: "Invalid folder" });
      folderId = r[0].id;
    }

    if (!folderId) return res.status(400).json({ error: "Invalid folder" });

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

  // Normalize attachments array first (needed for P2P detection)
  const attachmentsList = Array.isArray(attachments) ? attachments : [];

  // 🔒 SERVER-AUTHORITATIVE P2P DECISION
  const hasP2PAttachments =
    attachmentsList.some(a => a && a.p2p_message_id);

  const resolvedP2PEnabled = hasP2PAttachments ? 1 : 0;

  // ❗ NEVER mark delivered at creation time (will be set by /api/p2p/delivered)
  const resolvedP2PDelivered = 0;

  // Debug logging removed to prevent connection errors

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
    const crypto = require("crypto");

const generatedMessageId =
  `<${crypto.randomUUID()}@jeemail.in>`;


    // 2. INSERT email with P2P flags
    // ✅ FIX: Removed created_at from column list (it has a default value)
    const insertSql = `INSERT INTO emails
       (user_id, thread_id, message_id, from_name, from_email, subject, body, is_html, in_reply_to,
        to_header, cc_header, bcc_header, folder_id, is_draft, p2p_enabled, p2p_delivered)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const insertValues = [
      user_id,
      resolvedThreadId,
      generatedMessageId,
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
      resolvedP2PEnabled,
      resolvedP2PDelivered
    ];
    
    // ✅ DEBUG: Log the exact SQL and values being used
    console.log('EMAIL INSERT SQL:', insertSql);
    console.log('EMAIL INSERT VALUES COUNT:', insertValues.length);
    console.log('EMAIL INSERT VALUES:', insertValues.map((v, i) => `${i + 1}. ${typeof v === 'string' && v.length > 50 ? v.substring(0, 50) + '...' : v}`));
    
    const [insert] = await conn.query(insertSql, insertValues);

    const emailId = insert.insertId;

    // Debug logging removed to prevent connection errors

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

      const isP2P =
      typeof a.p2p_message_id === 'string' &&
      a.p2p_message_id.length > 0;
    

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

    // Debug logging removed to prevent connection errors
    
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

// ---------------------------------------------
// CHECK IF EMAIL EXISTS (USED BY SIGNUP)
// ---------------------------------------------
router.get("/users/email/:email", async (req, res) => {
  try {
    const emailParam = req.params.email ? decodeURIComponent(req.params.email) : "";
    const email = emailParam.toLowerCase();

    if (!email) {
      return res.status(400).json({ error: "Email parameter is required" });
    }

    const [rows] = await db.query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    return res.json({ exists: rows.length > 0 });
  } catch (err) {
    console.error("EMAIL CHECK ERROR:", err);
    return res.status(500).json({ error: "Failed to check email" });
  }
});

module.exports = router;
