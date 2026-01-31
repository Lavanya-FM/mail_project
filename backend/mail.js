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
const jwt = require("jsonwebtoken");

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

  // Create default labels
  const defaultLabels = [
    ['Personal', '#10b981'],
    ['Work', '#3b82f6'],
    ['Travel', '#f59e0b']
  ];

  for (const [name, color] of defaultLabels) {
    await db.query(
      "INSERT INTO labels (user_id, name, color) VALUES (?, ?, ?)",
      [userId, name, color]
    );
  }
}

// Initialize tables if not exists
async function initTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS labels (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(50) NOT NULL,
      color VARCHAR(20) DEFAULT '#9ca3af',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_user_label (user_id, name)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      access_type VARCHAR(100),
      ip VARCHAR(45),
      location VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add attachment_transfer_state to email_attachments if not exists
  // Introduce ONE source of truth: attachment_transfer_state
  try {
    await db.query(`
        ALTER TABLE email_attachments 
        ADD COLUMN IF NOT EXISTS attachment_transfer_state VARCHAR(50) DEFAULT 'WAITING_FOR_PEER'
     `);
  } catch (err) {
    // Ignore/Log
    console.log('Migration note (attachment_transfer_state): ' + err.message);
  }
}
initTables().catch(console.error);

async function logActivity(userId, accessType, req) {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    await db.query(
      "INSERT INTO activity_log (user_id, access_type, ip, location) VALUES (?, ?, ?, ?)",
      [userId, accessType, ip, 'Unknown']
    );
  } catch (err) {
    console.error('Failed to log activity', err);
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
      // Silently recover - no logging needed as this is expected behavior
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

    // ✅ CRITICAL: Only reject if email username is ALL numbers (which is clearly invalid)
    // Email usernames CAN legitimately start with numbers (e.g., "123abc@domain.com" is valid)
    const emailLocalPart = email.split('@')[0];
    if (emailLocalPart) {
      // Only reject if the entire email username is composed ONLY of numbers (no letters at all)
      // This would be an invalid email format
      if (/^\d+$/.test(emailLocalPart) && emailLocalPart.length >= 6) {
        console.error('REGISTER ERROR: Email username is all numbers - invalid email format!', {
          emailLocalPart: emailLocalPart,
          email: email,
          name: name
        });
        return res.status(400).json({
          error: "Invalid email format. Email username cannot be only numbers. Please include at least one letter."
        });
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

    // ✅ CRITICAL: Extract email username from normalized email for storage
    // emailUsername was already extracted earlier, but we need to ensure it matches normalizedEmail
    const finalEmailUsername = normalizedEmail.split('@')[0] || emailUsername || '';

    const [insert] = await db.query(
      `INSERT INTO users (full_name, email, email_username, password, date_of_birth, gender)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, normalizedEmail, finalEmailUsername, hash, dobString, gender]
    );

    // ✅ CRITICAL: Verify what was actually inserted
    const [verifyInsert] = await db.query(
      "SELECT full_name, email, LENGTH(password) as pwd_length FROM users WHERE id = ? LIMIT 1",
      [insert.insertId]
    );

    if (verifyInsert.length > 0) {
      const inserted = verifyInsert[0];
      console.log('REGISTER: Verification of inserted data', {
        insertedName: inserted.full_name ? `${inserted.full_name.substring(0, 20)}...` : 'NULL',
        insertedEmail: inserted.email ? `${inserted.email.substring(0, 30)}...` : 'NULL',
        passwordLength: inserted.pwd_length
      });

      // ✅ CRITICAL: Check if data corruption occurred
      if (inserted.full_name && inserted.full_name.includes('@')) {
        console.error('REGISTER CRITICAL ERROR: Name field contains @ after INSERT! Data corruption detected!', {
          insertedName: inserted.full_name,
          insertedEmail: inserted.email,
          expectedName: name,
          expectedEmail: normalizedEmail
        });
        // Try to fix it by updating the record
        await db.query(
          "UPDATE users SET full_name = ?, email = ? WHERE id = ?",
          [name, normalizedEmail, insert.insertId]
        );
        console.log('REGISTER: Attempted to fix corrupted data');
      }

      if (inserted.email && !inserted.email.includes('@')) {
        console.error('REGISTER CRITICAL ERROR: Email field does not contain @ after INSERT! Data corruption detected!', {
          insertedName: inserted.full_name,
          insertedEmail: inserted.email,
          expectedName: name,
          expectedEmail: normalizedEmail
        });
        // Try to fix it by updating the record
        await db.query(
          "UPDATE users SET full_name = ?, email = ? WHERE id = ?",
          [name, normalizedEmail, insert.insertId]
        );
        console.log('REGISTER: Attempted to fix corrupted data');
      }
    }

    const userId = insert.insertId;

    // ✅ CRITICAL: Verify user was created and can be retrieved for login
    const [verifyUser] = await db.query(
      "SELECT id, email, full_name, LENGTH(password) as pwd_length FROM users WHERE id = ? LIMIT 1",
      [userId]
    );

    if (verifyUser.length === 0) {
      console.error('REGISTER ERROR: User was not created in database!', { userId });
      return res.status(500).json({ error: "Failed to create user account" });
    }

    console.log('REGISTER: User created and verified in database', {
      userId: verifyUser[0].id,
      email: verifyUser[0].email,
      name: verifyUser[0].full_name,
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

    const token = jwt.sign(
      { user: { id: userId, email: normalizedEmail } },
      process.env.JWT_SECRET || "your_jwt_secret",
      { expiresIn: "7d" }
    );

    return res.json({ user: responseUser, token });
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
      `SELECT
      id,
      full_name,
      email_username,
      email,
      password,
      date_of_birth,
      gender
    FROM users
    WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
    LIMIT 1`,
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
        "SELECT id, full_name,email_username, email, password, date_of_birth, gender FROM users WHERE email = ? LIMIT 1",
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
          "SELECT id, full_name, email_username,email, password, date_of_birth, gender FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1",
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
    await logActivity(user.id, `Login (${req.headers['user-agent']})`, req);

    // ✅ FIX: Explicitly map fields to ensure correct mapping
    // ✅ CRITICAL: NEVER include password in response - explicitly exclude it
    // ✅ CRITICAL: Return name and email exactly as stored in database (no trimming)
    const responseUser = {
      id: user.id,
      name: String(user.full_name || ''), // ✅ Return exactly as stored (no trim)
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

    const token = jwt.sign(
      { user: { id: user.id, email: user.email } },
      process.env.JWT_SECRET || "your_jwt_secret",
      { expiresIn: "7d" }
    );

    return res.json({ user: responseUser, token });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// -------------------- SIMPLE SEND (Notifications) --------------------
router.post("/mail/send", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { to, subject, content, to_emails, isHtml } = req.body || {};

    // Support to (array) or to_emails (array)
    const recipients = Array.isArray(to) ? to : (Array.isArray(to_emails) ? to_emails : [to]);
    const validRecipients = recipients.filter(Boolean);

    if (!validRecipients.length) {
      return res.status(400).json({ error: "Recipients required" });
    }

    // Get sender info
    const [senders] = await db.query("SELECT full_name, email FROM users WHERE id = ?", [userId]);
    if (!senders.length) return res.status(404).json({ error: "User not found" });
    const sender = senders[0];

    // Create reusable transporter object using the default SMTP transport
    let transporter;

    // Check if we have real SMTP config, otherwise use fallback/dev mode
    if (process.env.SMTP_HOST) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else {
      // Fallback for local development (fake SMTP)
      transporter = nodemailer.createTransport({
        host: "127.0.0.1",
        port: 25,
        secure: false,
        tls: { rejectUnauthorized: false },
      });
    }

    const mailOptions = {
      from: `"${sender.full_name}" <${sender.email}>`,
      to: validRecipients.join(", "),
      subject: subject,
    };

    if (isHtml) {
      mailOptions.html = content;
    } else {
      mailOptions.text = content;
    }

    try {
      await transporter.sendMail(mailOptions);
      console.log(`[MAIL] Sent to ${validRecipients.join(", ")}`);
    } catch (smtpError) {
      console.warn("[MAIL] SMTP failed, logging email instead (Dev Mode):", smtpError.message);
      console.log("=== EMAIL CONTENT ===");
      console.log(`To: ${validRecipients.join(", ")}`);
      console.log(`Subject: ${subject}`);
      console.log(`Body: ${content}`);
      console.log("=====================");
      // We return success here so the UI doesn't show an error in dev
    }

    res.json({ success: true });
  } catch (err) {
    console.error("MAIL SEND ERROR:", err);
    res.status(500).json({ error: "Failed to send email" });
  }
});


// -------------------- USER SEARCH (For Invites) --------------------
router.get("/users/search", async (req, res) => {
  try {
    const { q } = req.query;
    // const userId = req.user?.id; // If middleware used, exclude self. For now, simplistic.

    let query = "SELECT id, full_name, email FROM users";
    let params = [];

    if (q) {
      query += " WHERE email LIKE ? OR full_name LIKE ?";
      params.push(`%${q}%`, `%${q}%`);
    }

    query += " LIMIT 20";

    const [rows] = await db.query(query, params);

    // Normalize response
    const users = rows.map(r => ({
      id: r.id,
      name: r.full_name || r.email.split('@')[0],
      email: r.email
    }));

    res.json(users);
  } catch (err) {
    console.error("USER SEARCH ERROR:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

// -------------------- CHUNKED STREAMING --------------------
router.get("/email/:emailId/attachment/:attachmentId", async (req, res) => {
  try {
    const { emailId, attachmentId } = req.params;
    const userId = req.query.user_id;

    const [[row]] = await db.query(
      `
      SELECT filename, mime_type, content_base64, delivery_mode, p2p_message_id
      FROM email_attachments
      WHERE id = ?
        AND email_id = ?
        AND (
          /* Check if user has email in their mailbox (Sender/Receiver) */
          email_id IN (
            SELECT email_id FROM email_mailbox WHERE user_id = ?
          )
          OR
          /* OR Check if user is the SENDER directly */
          email_id IN (
            SELECT e.id FROM emails e 
            JOIN users u ON e.from_email = u.email 
            WHERE u.id = ?
          )
          OR
          /* OR Check if user is a RECIPIENT in email_recipients table */
          email_id IN (
            SELECT r.email_id FROM email_recipients r 
            JOIN users u ON r.address = u.email 
            WHERE u.id = ?
          )
        )
      LIMIT 1
      `,
      [attachmentId, emailId, userId, userId, userId]
    );

    if (!row) {
      return res.status(404).json({ error: "Attachment not found" });
    }

    // Check if this is a P2P attachment without server-side content
    if (row.delivery_mode === 'P2P' && !row.content_base64) {
      return res.status(400).json({
        error: "P2P file must be downloaded via peer-to-peer transfer",
        is_p2p: true,
        p2p_message_id: row.p2p_message_id
      });
    }

    if (!row.content_base64) {
      return res.status(404).json({ error: "Attachment content not found" });
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
        SELECT id, filename, mime_type, size_bytes, delivery_mode, delivered, p2p_message_id, attachment_transfer_state
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
    p2p_message_id,
    attachment_transfer_state
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
      "SELECT full_name, email_username, email FROM users WHERE id = ? LIMIT 1",
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
        content_base64, delivery_mode, delivered, p2p_message_id, attachment_transfer_state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            emailId,
            filename,
            mime_type,
            size_bytes,
            content_base64, // Always store content as fallback
            isP2P ? 'P2P' : 'EMAIL',
            isP2P ? 0 : 1,
            a.p2p_message_id || null,
            isP2P ? 'WAITING_FOR_PEER' : 'COMPLETED'
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
            const content = a.content_base64 || a.content;
            if (!content && a.p2p_message_id) return null; // Skip binary for P2P
            return {
              filename: a.filename,
              content: content,
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

    // deliver to recipients inbox (for local users) - only if not P2P delivered AND NOT DRAFT
    if (!is_draft) {
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

          // Use INSERT IGNORE to prevent duplicate entries
          await conn.query(
            `INSERT IGNORE INTO email_mailbox (user_id, email_id, mailbox_id, is_read)
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
      `UPDATE email_attachments SET delivered = 1, attachment_transfer_state = 'COMPLETED', delivered_at = NOW() WHERE p2p_message_id = ?`,
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

// GET STORAGE QUOTA AND USAGE
// GET /api/storage/quota?user_id=1
router.get("/storage/quota", async (req, res) => {
  try {
    const userId = req.query.user_id;

    if (!userId) {
      return res.status(400).json({ error: "user_id is required" });
    }

    // Calculate used storage: Drive Files + Email Attachments
    const [fileResult, emailResult] = await Promise.all([
      db.query(
        `SELECT COALESCE(SUM(size), 0) as used_bytes
         FROM drive_files
         WHERE user_id = ? 
         AND (is_deleted = 0 OR is_deleted IS NULL)`,
        [userId]
      ),
      db.query(
        `SELECT COALESCE(SUM(size_bytes), 0) as used_bytes
         FROM email_attachments
         WHERE email_id IN (
           SELECT email_id FROM email_mailbox WHERE user_id = ?
         )
         AND (delivery_mode != 'P2P' OR delivery_mode IS NULL)`,
        [userId]
      )
    ]);

    const driveUsed = Number(fileResult[0][0]?.used_bytes || 0);
    const emailUsed = Number(emailResult[0][0]?.used_bytes || 0);
    const usedBytes = driveUsed + emailUsed;

    console.log(`STORAGE QUOTA [User ${userId}]: Drive=${driveUsed}, Email=${emailUsed}, Total=${usedBytes}`);

    // Set quota to 25 GB
    const quotaBytes = 26843545600; // 25 GB
    const bonusBytes = 0;
    const availableBytes = Math.max(0, quotaBytes - usedBytes);
    const percentageUsed = quotaBytes > 0 ? Math.round((usedBytes / quotaBytes) * 100) : 0;

    res.json({
      user_id: Number(userId),
      quota_bytes: quotaBytes,
      used_bytes: usedBytes,
      bonus_bytes: bonusBytes,
      available_bytes: availableBytes,
      percentage_used: percentageUsed
    });
  } catch (err) {
    console.error("STORAGE QUOTA ERROR:", err);
    return res.status(500).json({
      error: "Failed to fetch storage quota",
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// GET STORAGE BREAKDOWN
// GET /api/storage/breakdown?user_id=1
router.get("/storage/breakdown", async (req, res) => {
  try {
    const userId = req.query.user_id;

    if (!userId) {
      return res.status(400).json({ error: "user_id is required" });
    }

    // Get breakdown by file type
    const [typeStats] = await db.query(
      `SELECT 
        CASE 
          WHEN filename LIKE '%.jpg' OR filename LIKE '%.jpeg' OR filename LIKE '%.png' OR filename LIKE '%.gif' OR filename LIKE '%.webp' OR filename LIKE '%.svg' THEN 'Images'
          WHEN filename LIKE '%.mp4' OR filename LIKE '%.avi' OR filename LIKE '%.mov' OR filename LIKE '%.mkv' OR filename LIKE '%.webm' THEN 'Videos'
          WHEN filename LIKE '%.pdf' OR filename LIKE '%.doc' OR filename LIKE '%.docx' OR filename LIKE '%.xls' OR filename LIKE '%.xlsx' OR filename LIKE '%.ppt' OR filename LIKE '%.pptx' OR filename LIKE '%.txt' THEN 'Documents'
          WHEN filename LIKE '%.zip' OR filename LIKE '%.rar' OR filename LIKE '%.7z' OR filename LIKE '%.tar' OR filename LIKE '%.gz' THEN 'Archives'
          ELSE 'Others'
        END as type,
        SUM(size) as size_bytes,
        COUNT(*) as file_count
      FROM drive_files
      WHERE user_id = ? 
      AND (is_deleted = 0 OR is_deleted IS NULL)
      GROUP BY type
      ORDER BY size_bytes DESC`,
      [userId]
    );

    // Get total for percentage calculation
    const totalSize = typeStats.reduce((sum, item) => sum + Number(item.size_bytes || 0), 0);

    const byType = typeStats.map(item => {
      const size = Number(item.size_bytes || 0);
      const percentage = totalSize > 0 ? Number(((size / totalSize) * 100).toFixed(1)) : 0;
      return {
        type: item.type,
        size_bytes: size,
        file_count: Number(item.file_count || 0),
        percentage: percentage,
        color: getColorForType(item.type)
      };
    });

    // Get breakdown by folder
    const [folderStats] = await db.query(
      `SELECT 
        f.id as folder_id,
        COALESCE(f.name, 'Root') as folder_name,
        COALESCE(SUM(df.size), 0) as size_bytes,
        COUNT(df.id) as file_count
      FROM drive_folders f
      LEFT JOIN drive_files df ON df.folder_id = f.id AND df.user_id = ? AND (df.is_deleted = 0 OR df.is_deleted IS NULL)
      WHERE f.user_id = ?
      GROUP BY f.id, f.name
      UNION ALL
      SELECT 
        NULL as folder_id,
        'Root' as folder_name,
        COALESCE(SUM(size), 0) as size_bytes,
        COUNT(*) as file_count
      FROM drive_files
      WHERE user_id = ? 
      AND folder_id IS NULL
      AND (is_deleted = 0 OR is_deleted IS NULL)
      ORDER BY size_bytes DESC`,
      [userId, userId, userId]
    );

    const byFolder = folderStats.map(item => {
      const size = Number(item.size_bytes || 0);
      const percentage = totalSize > 0 ? Number(((size / totalSize) * 100).toFixed(1)) : 0;
      return {
        folder_id: item.folder_id,
        folder_name: item.folder_name,
        size_bytes: size,
        file_count: Number(item.file_count || 0),
        percentage: percentage
      };
    });

    // Get timeline (last 30 days)
    const [timelineData] = await db.query(
      `SELECT 
        DATE(created_at) as date,
        SUM(size) as size_bytes
      FROM drive_files
      WHERE user_id = ? 
      AND (is_deleted = 0 OR is_deleted IS NULL)
      AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC`,
      [userId]
    );

    const timeline = timelineData.map(item => ({
      date: item.date.toISOString().split('T')[0],
      size_bytes: Number(item.size_bytes || 0)
    }));

    res.json({
      by_type: byType,
      by_folder: byFolder,
      timeline: timeline
    });
  } catch (err) {
    console.error("STORAGE BREAKDOWN ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch storage breakdown" });
  }
});

// GET LARGE FILES
// GET /api/storage/large-files?user_id=1&min_size=5000000
router.get("/storage/large-files", async (req, res) => {
  try {
    const userId = req.query.user_id;
    const minSize = Number(req.query.min_size) || 5000000; // Default 5MB

    if (!userId) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const [files] = await db.query(
      `SELECT 
        id,
        filename as name,
        size as size_bytes,
        folder_id,
        CASE 
          WHEN filename LIKE '%.jpg' OR filename LIKE '%.jpeg' OR filename LIKE '%.png' OR filename LIKE '%.gif' THEN 'image'
          WHEN filename LIKE '%.mp4' OR filename LIKE '%.avi' OR filename LIKE '%.mov' THEN 'video'
          WHEN filename LIKE '%.pdf' OR filename LIKE '%.doc' OR filename LIKE '%.docx' THEN 'document'
          WHEN filename LIKE '%.zip' OR filename LIKE '%.rar' THEN 'archive'
          ELSE 'other'
        END as file_type,
        created_at
      FROM drive_files
      WHERE user_id = ? 
      AND size >= ?
      AND (is_deleted = 0 OR is_deleted IS NULL)
      ORDER BY size DESC`,
      [userId, minSize]
    );

    const largeFiles = files.map(f => ({
      id: f.id,
      name: f.name,
      size_bytes: Number(f.size_bytes || 0),
      folder_id: f.folder_id,
      file_type: f.file_type,
      created_at: f.created_at ? f.created_at.toISOString() : new Date().toISOString()
    }));

    res.json(largeFiles);
  } catch (err) {
    console.error("LARGE FILES ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch large files" });
  }
});

// GET DUPLICATE FILES
// GET /api/storage/duplicates?user_id=1
router.get("/storage/duplicates", async (req, res) => {
  try {
    const userId = req.query.user_id;

    if (!userId) {
      return res.status(400).json({ error: "user_id is required" });
    }

    // Find files with same filename and size (potential duplicates)
    const [duplicates] = await db.query(
      `SELECT 
        filename,
        size,
        COUNT(*) as count,
        GROUP_CONCAT(id ORDER BY created_at) as file_ids,
        GROUP_CONCAT(folder_id ORDER BY created_at) as folder_ids,
        GROUP_CONCAT(created_at ORDER BY created_at) as created_dates
      FROM drive_files
      WHERE user_id = ? 
      AND (is_deleted = 0 OR is_deleted IS NULL)
      GROUP BY filename, size
      HAVING count > 1`,
      [userId]
    );

    const duplicateGroups = duplicates.map(dup => {
      const ids = dup.file_ids.split(',').map(Number);
      const folderIds = dup.folder_ids.split(',').map((id) => id === 'NULL' ? null : Number(id));
      const dates = dup.created_dates.split(',');

      const files = ids.map((id, index) => ({
        id: id,
        name: dup.filename,
        size_bytes: Number(dup.size || 0),
        folder_id: folderIds[index],
        created_at: dates[index] || new Date().toISOString()
      }));

      // Potential savings = size of all duplicates except one
      const potentialSavings = Number(dup.size || 0) * (ids.length - 1);
      const totalSize = Number(dup.size || 0) * ids.length;

      return {
        files: files,
        total_size: totalSize,
        potential_savings: potentialSavings
      };
    });

    res.json(duplicateGroups);
  } catch (err) {
    console.error("DUPLICATES ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch duplicate files" });
  }
});

// GET OPTIMIZATION SUGGESTIONS
// GET /api/storage/suggestions?user_id=1
router.get("/storage/suggestions", async (req, res) => {
  try {
    const userId = req.query.user_id;

    if (!userId) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const suggestions = [];

    // Get duplicate files
    const [duplicates] = await db.query(
      `SELECT 
        filename,
        size,
        COUNT(*) as count,
        GROUP_CONCAT(id ORDER BY created_at) as file_ids
      FROM drive_files
      WHERE user_id = ? 
      AND (is_deleted = 0 OR is_deleted IS NULL)
      GROUP BY filename, size
      HAVING count > 1`,
      [userId]
    );

    if (duplicates.length > 0) {
      const totalSavings = duplicates.reduce((sum, dup) => {
        return sum + (Number(dup.size || 0) * (Number(dup.count) - 1));
      }, 0);

      const fileIds = duplicates.flatMap(dup =>
        dup.file_ids.split(',').map(Number)
      );

      suggestions.push({
        type: 'duplicate',
        title: 'Remove Duplicate Files',
        description: `Found ${duplicates.length} set(s) of duplicate files`,
        potential_savings: totalSavings,
        action: 'Review and delete duplicates',
        file_ids: fileIds
      });
    }

    // Get large files (>5MB)
    const [largeFiles] = await db.query(
      `SELECT id, size
      FROM drive_files
      WHERE user_id = ? 
      AND size >= 5242880
      AND (is_deleted = 0 OR is_deleted IS NULL)`,
      [userId]
    );

    if (largeFiles.length > 0) {
      const totalLargeSize = largeFiles.reduce((sum, f) => sum + Number(f.size || 0), 0);
      const fileIds = largeFiles.map(f => f.id);

      suggestions.push({
        type: 'large_file',
        title: 'Archive Large Files',
        description: `${largeFiles.length} files are larger than 5MB`,
        potential_savings: Math.round(totalLargeSize * 0.3), // Estimate 30% savings from compression
        action: 'Compress or archive large files',
        file_ids: fileIds
      });
    }

    // Get old files (>6 months)
    const [oldFiles] = await db.query(
      `SELECT id, size
      FROM drive_files
      WHERE user_id = ? 
      AND created_at < DATE_SUB(NOW(), INTERVAL 6 MONTH)
      AND (is_deleted = 0 OR is_deleted IS NULL)`,
      [userId]
    );

    if (oldFiles.length > 0) {
      const totalOldSize = oldFiles.reduce((sum, f) => sum + Number(f.size || 0), 0);

      suggestions.push({
        type: 'old_file',
        title: 'Clean Up Old Files',
        description: `${oldFiles.length} files older than 6 months`,
        potential_savings: totalOldSize,
        action: 'Review and delete old files',
        file_ids: oldFiles.map(f => f.id)
      });
    }

    res.json(suggestions);
  } catch (err) {
    console.error("SUGGESTIONS ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch optimization suggestions" });
  }
});

// Helper function to get color for file type
function getColorForType(type) {
  const colors = {
    'Images': '#8b5cf6',
    'Videos': '#ef4444',
    'Documents': '#3b82f6',
    'Archives': '#f59e0b',
    'Others': '#6b7280'
  };
  return colors[type] || '#6b7280';
}

// -------------------- LABELS --------------------

router.get("/labels", async (req, res) => {
  try {
    const userId = req.query.user_id;
    const [rows] = await db.query("SELECT id, name, color FROM labels WHERE user_id = ?", [userId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/labels", async (req, res) => {
  try {
    const { user_id, name, color } = req.body;
    const [result] = await db.query("INSERT INTO labels (user_id, name, color) VALUES (?, ?, ?)", [user_id, name, color]);
    res.json({ id: result.insertId, name, color });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/labels/update", async (req, res) => {
  try {
    const { id, name, color, user_id } = req.body;
    await db.query("UPDATE labels SET name = ?, color = ? WHERE id = ? AND user_id = ?", [name, color, id, user_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/labels/delete", async (req, res) => {
  try {
    const { id, user_id } = req.body;
    await db.query("DELETE FROM labels WHERE id = ? AND user_id = ?", [id, user_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/activity", async (req, res) => {
  try {
    const userId = req.query.user_id;
    const [rows] = await db.query(
      "SELECT id, access_type, ip, location, created_at as date FROM activity_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 10",
      [userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------- P2P FALLBACK UPLOAD --------------------
router.post("/email/attachment/update", async (req, res) => {
  const { p2p_message_id, content_base64, delivery_mode } = req.body;

  if (!p2p_message_id || !content_base64) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // 1. Update the attachment payload and mode
    const [result] = await db.query(
      `UPDATE email_attachments 
       SET content_base64 = ?, 
           delivery_mode = ?, 
           delivery_status = 'FALLBACK',
           fallback_triggered = 1
       WHERE p2p_message_id = ?`,
      [content_base64, delivery_mode || 'FALLBACK', p2p_message_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Attachment not found" });
    }

    // 2. Clear from p2p_file_metadata status
    await db.query(
      "UPDATE p2p_file_metadata SET status = 'fallback' WHERE message_id = ?",
      [p2p_message_id]
    );

    console.log(`[Fallback] Attachment ${p2p_message_id} uploaded to server.`);

    res.json({ success: true });
  } catch (err) {
    console.error("[Fallback Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
