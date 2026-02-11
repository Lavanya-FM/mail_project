const db = require('../db');
const crypto = require('crypto');

/**
 * threadingService.js
 * Implements Gmail-like threading logic based on Message-ID, References, and Subject/Participant heuristics.
 */

// Normalize subject by removing Re:, Fwd:, etc.
function normalizeSubject(subject) {
    if (!subject) return '';
    // Remove Re:, Fwd:, FW:, etc. (case insensitive) at the start
    // Also remove potential localized versions if needed, but sticking to standard for now.
    // Regex: ^((Re|Fwd|Fw|Aw|Antwort|Weitergeleitet):\s*)+
    return subject.replace(/^((re|fwd|fw|aw|antwort|weitergeleitet):\s*)+/gi, '').trim();
}

/**
 * Calculate a participant hash to help heuristic matching.
 * This is a hash of sorted emails of sender + recipients.
 */
function getParticipantHash(sender, recipients) {
    const all = [sender, ...recipients].map(e => (e || '').toLowerCase().trim()).filter(Boolean);
    all.sort(); // Sort to make order independent
    const unique = [...new Set(all)];
    return crypto.createHash('md5').update(unique.join(',')).digest('hex');
}

/**
 * Find or create a conversation/thread for a new email.
 * This is the CORE threading logic.
 * 
 * @param {Object} emailHeaders - { messageId, inReplyTo, references, subject, sender, recipients }
 * @returns {Promise<number>} conversationId
 */
async function resolveThreadId(conn, emailHeaders) {
    const query = (sql, params) => (conn || db).query(sql, params);
    const { messageId, inReplyTo, references, subject } = emailHeaders;

    // console.log('[Threading] Resolving thread for:', { messageId, inReplyTo, subject });

    let conversationId = null;

    // STEP 1: Check In-Reply-To (Header based)
    // Determine if inReplyTo refers to a Message-ID (string) or Internal ID (int)
    // Standard email uses Message-ID strings like <abc@domain.com>
    if (inReplyTo) {
        // Try matching Message-ID first (standard)
        const [rows] = await query(
            `SELECT conversation_id, thread_id FROM emails WHERE message_id = ? LIMIT 1`,
            [inReplyTo]
        );
        if (rows.length > 0) {
            if (rows[0].conversation_id) return rows[0].conversation_id;
            if (rows[0].thread_id) return rows[0].thread_id; // Fallback to legacy
        }

        // Fallback: Check if it is an internal numeric ID (legacy internal reply)
        if (!isNaN(Number(inReplyTo))) {
            const [intRows] = await query(
                `SELECT conversation_id, thread_id FROM emails WHERE id = ? LIMIT 1`,
                [Number(inReplyTo)]
            );
            if (intRows.length > 0) {
                if (intRows[0].conversation_id) return intRows[0].conversation_id;
                if (intRows[0].thread_id) return intRows[0].thread_id;
            }
        }
    }

    // STEP 2: Check References
    if (references) {
        const refs = Array.isArray(references) ? references : references.split(/\s+/).filter(Boolean);
        if (refs.length > 0) {
            // Use placeholders for checking any reference
            const placeholders = refs.map(() => '?').join(',');
            const [rows] = await query(
                `SELECT conversation_id, thread_id FROM emails WHERE message_id IN (${placeholders}) LIMIT 1`,
                refs
            );
            if (rows.length > 0) {
                if (rows[0].conversation_id) return rows[0].conversation_id;
                if (rows[0].thread_id) return rows[0].thread_id;
            }
        }
    }

    // STEP 3: Heuristic Match (Normalized Subject)
    const normSubject = normalizeSubject(subject || '');
    if (normSubject) {
        // Check existing conversations
        const [convRows] = await query(
            `SELECT id FROM conversations WHERE subject_normalized = ? ORDER BY last_message_at DESC LIMIT 1`,
            [normSubject]
        );
        if (convRows.length > 0) {
            return convRows[0].id;
        }

        // Check recent emails (fallback if conversations table empty)
        const [emailRows] = await query(
            `SELECT conversation_id, thread_id FROM emails WHERE subject_normalized = ? ORDER BY id DESC LIMIT 1`,
            [normSubject]
        );
        if (emailRows.length > 0) {
            if (emailRows[0].conversation_id) return emailRows[0].conversation_id;
            if (emailRows[0].thread_id) return emailRows[0].thread_id;
        }
    }

    // STEP 4: Create New Conversation
    console.log('[Threading] Creating new conversation for:', normSubject);
    const [res] = await query(
        `INSERT INTO conversations (subject_normalized, created_at, last_message_at) VALUES (?, NOW(), NOW())`,
        [normSubject]
    );

    return res.insertId;
}

/**
 * Update conversation metadata when a new message is added.
 */
async function updateConversation(conversationId) {
    await db.query(`
        UPDATE conversations SET last_message_at = NOW() WHERE id = ?
    `, [conversationId]);
}

module.exports = {
    resolveThreadId,
    normalizeSubject,
    updateConversation
};
