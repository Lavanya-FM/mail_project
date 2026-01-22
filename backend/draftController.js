/**
 * backend/draftController.js
 * Gmail-style draft management backend
 * Handles versioned draft operations with optimistic locking
 */

const express = require('express');
const db = require('./db');
const { sanitizeBody } = require('./utils');

const router = express.Router();

/**
 * Generate unique thread ID
 */
function generateThreadId() {
    return `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * POST /api/drafts - Create new draft
 */
router.post('/drafts', async (req, res) => {
    try {
        const {
            user_id,
            from_email,
            from_name,
            thread_id,
            subject,
            body,
            to_emails,
            cc_emails,
            bcc_emails
        } = req.body;

        if (!user_id || !from_email) {
            return res.status(400).json({ error: 'user_id and from_email required' });
        }

        // Generate thread_id if not provided
        const finalThreadId = thread_id || generateThreadId();

        // Create draft email
        const [result] = await db.query(
            `INSERT INTO emails (
        from_email, from_name, subject, body,
        thread_id, is_draft, draft_version,
        created_at, last_modified
      ) VALUES (?, ?, ?, ?, ?, 1, 1, NOW(), NOW())`,
            [
                from_email,
                from_name || from_email,
                subject || '',
                sanitizeBody(body || ''),
                finalThreadId
            ]
        );

        const emailId = result.insertId;

        // Add to user's drafts folder
        const [[draftsFolder]] = await db.query(
            'SELECT id FROM mailboxes WHERE user_id = ? AND system_box = ? LIMIT 1',
            [user_id, 'drafts']
        );

        if (draftsFolder) {
            await db.query(
                `INSERT INTO email_mailbox (email_id, user_id, mailbox_id, is_read, is_starred)
         VALUES (?, ?, ?, 0, 0)`,
                [emailId, user_id, draftsFolder.id]
            );
        }

        // Store recipients
        const toList = Array.isArray(to_emails) ? to_emails : [];
        const ccList = Array.isArray(cc_emails) ? cc_emails : [];
        const bccList = Array.isArray(bcc_emails) ? bcc_emails : [];

        for (const recipient of toList) {
            const email = typeof recipient === 'string' ? recipient : recipient.email;
            if (email) {
                await db.query(
                    'INSERT INTO email_recipients (email_id, address, type) VALUES (?, ?, ?)',
                    [emailId, email, 'to']
                );
            }
        }

        for (const recipient of ccList) {
            const email = typeof recipient === 'string' ? recipient : recipient.email;
            if (email) {
                await db.query(
                    'INSERT INTO email_recipients (email_id, address, type) VALUES (?, ?, ?)',
                    [emailId, email, 'cc']
                );
            }
        }

        for (const recipient of bccList) {
            const email = typeof recipient === 'string' ? recipient : recipient.email;
            if (email) {
                await db.query(
                    'INSERT INTO email_recipients (email_id, address, type) VALUES (?, ?, ?)',
                    [emailId, email, 'bcc']
                );
            }
        }

        console.log(`[Draft] Created draft ${emailId} for user ${user_id}`);

        res.json({
            draft_id: emailId,
            thread_id: finalThreadId,
            version: 1,
            created_at: new Date().toISOString()
        });

    } catch (error) {
        console.error('[Draft] Create failed:', error);
        res.status(500).json({ error: 'Failed to create draft' });
    }
});

/**
 * PATCH /api/drafts/:id - Update draft (versioned)
 */
router.patch('/drafts/:id', async (req, res) => {
    try {
        const draftId = parseInt(req.params.id);
        const { version, changes } = req.body;

        if (!version || !changes) {
            return res.status(400).json({ error: 'version and changes required' });
        }

        // Check current version (optimistic locking)
        const [[draft]] = await db.query(
            'SELECT draft_version, is_draft FROM emails WHERE id = ? AND is_draft = 1',
            [draftId]
        );

        if (!draft) {
            return res.status(404).json({ error: 'Draft not found' });
        }

        if (draft.draft_version !== version) {
            return res.status(409).json({
                error: 'Version conflict',
                server_version: draft.draft_version,
                client_version: version
            });
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if ('subject' in changes) {
            updates.push('subject = ?');
            values.push(changes.subject);
        }

        if ('body' in changes) {
            updates.push('body = ?');
            values.push(sanitizeBody(changes.body));
        }

        // Always increment version and update timestamp
        updates.push('draft_version = draft_version + 1');
        updates.push('last_modified = NOW()');

        values.push(draftId);

        await db.query(
            `UPDATE emails SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        // Update recipients if changed
        if ('to_emails' in changes || 'cc_emails' in changes || 'bcc_emails' in changes) {
            // Delete existing recipients
            await db.query('DELETE FROM email_recipients WHERE email_id = ?', [draftId]);

            // Insert new recipients
            const toList = changes.to_emails || [];
            const ccList = changes.cc_emails || [];
            const bccList = changes.bcc_emails || [];

            for (const email of toList) {
                const addr = typeof email === 'string' ? email : email.email;
                if (addr) {
                    await db.query(
                        'INSERT INTO email_recipients (email_id, address, type) VALUES (?, ?, ?)',
                        [draftId, addr, 'to']
                    );
                }
            }

            for (const email of ccList) {
                const addr = typeof email === 'string' ? email : email.email;
                if (addr) {
                    await db.query(
                        'INSERT INTO email_recipients (email_id, address, type) VALUES (?, ?, ?)',
                        [draftId, addr, 'cc']
                    );
                }
            }

            for (const email of bccList) {
                const addr = typeof email === 'string' ? email : email.email;
                if (addr) {
                    await db.query(
                        'INSERT INTO email_recipients (email_id, address, type) VALUES (?, ?, ?)',
                        [draftId, addr, 'bcc']
                    );
                }
            }
        }

        const newVersion = version + 1;

        console.log(`[Draft] Updated draft ${draftId} to version ${newVersion}`);

        res.json({
            version: newVersion,
            last_modified: new Date().toISOString(),
            status: 'updated'
        });

    } catch (error) {
        console.error('[Draft] Update failed:', error);
        res.status(500).json({ error: 'Failed to update draft' });
    }
});

/**
 * GET /api/drafts/:id - Get draft
 */
router.get('/drafts/:id', async (req, res) => {
    try {
        const draftId = parseInt(req.params.id);

        const [[draft]] = await db.query(
            `SELECT id, from_email, from_name, subject, body, thread_id,
              draft_version, created_at, last_modified
       FROM emails
       WHERE id = ? AND is_draft = 1`,
            [draftId]
        );

        if (!draft) {
            return res.status(404).json({ error: 'Draft not found' });
        }

        // Get recipients
        const [recipients] = await db.query(
            'SELECT address, type FROM email_recipients WHERE email_id = ?',
            [draftId]
        );

        const to_emails = recipients.filter(r => r.type === 'to').map(r => r.address);
        const cc_emails = recipients.filter(r => r.type === 'cc').map(r => r.address);
        const bcc_emails = recipients.filter(r => r.type === 'bcc').map(r => r.address);

        res.json({
            draft_id: draft.id,
            from_email: draft.from_email,
            from_name: draft.from_name,
            subject: draft.subject,
            body: draft.body,
            thread_id: draft.thread_id,
            to_emails,
            cc_emails,
            bcc_emails,
            version: draft.draft_version,
            created_at: draft.created_at,
            last_modified: draft.last_modified
        });

    } catch (error) {
        console.error('[Draft] Get failed:', error);
        res.status(500).json({ error: 'Failed to get draft' });
    }
});

/**
 * POST /api/drafts/:id/send - Send draft (transition to sent message)
 */
router.post('/drafts/:id/send', async (req, res) => {
    try {
        const draftId = parseInt(req.params.id);
        const { version, p2p_enabled } = req.body;

        // Verify version
        const [[draft]] = await db.query(
            'SELECT draft_version, is_draft FROM emails WHERE id = ? AND is_draft = 1',
            [draftId]
        );

        if (!draft) {
            return res.status(404).json({ error: 'Draft not found' });
        }

        if (draft.draft_version !== version) {
            return res.status(409).json({
                error: 'Version conflict - draft was modified',
                server_version: draft.draft_version
            });
        }

        // Generate new message ID
        const messageId = `<${Date.now()}.${Math.random().toString(36).substr(2, 9)}@jeemail.in>`;

        // Transition: draft → sent message
        await db.query(
            `UPDATE emails SET
        is_draft = 0,
        draft_version = NULL,
        message_id = ?,
        sent_at = NOW(),
        p2p_enabled = ?,
        p2p_delivered = 0
       WHERE id = ?`,
            [messageId, p2p_enabled ? 1 : 0, draftId]
        );

        // Move from drafts to sent folder
        const [[user]] = await db.query(
            'SELECT user_id FROM email_mailbox WHERE email_id = ? LIMIT 1',
            [draftId]
        );

        if (user) {
            const [[sentFolder]] = await db.query(
                'SELECT id FROM mailboxes WHERE user_id = ? AND system_box = ? LIMIT 1',
                [user.user_id, 'sent']
            );

            if (sentFolder) {
                await db.query(
                    'UPDATE email_mailbox SET mailbox_id = ? WHERE email_id = ?',
                    [sentFolder.id, draftId]
                );
            }
        }

        console.log(`[Draft] Sent draft ${draftId} as message ${messageId}`);

        res.json({
            message_id: messageId,
            sent_at: new Date().toISOString(),
            status: 'sent'
        });

        // TODO: Trigger actual SMTP send or P2P transfer here
        // This would integrate with existing mail.js send logic

    } catch (error) {
        console.error('[Draft] Send failed:', error);
        res.status(500).json({ error: 'Failed to send draft' });
    }
});

/**
 * DELETE /api/drafts/:id - Delete draft
 */
router.delete('/drafts/:id', async (req, res) => {
    try {
        const draftId = parseInt(req.params.id);

        // Delete draft and related data
        await db.query('DELETE FROM email_recipients WHERE email_id = ?', [draftId]);
        await db.query('DELETE FROM email_attachments WHERE email_id = ?', [draftId]);
        await db.query('DELETE FROM email_mailbox WHERE email_id = ?', [draftId]);
        await db.query('DELETE FROM emails WHERE id = ? AND is_draft = 1', [draftId]);

        console.log(`[Draft] Deleted draft ${draftId}`);

        res.json({ status: 'deleted' });

    } catch (error) {
        console.error('[Draft] Delete failed:', error);
        res.status(500).json({ error: 'Failed to delete draft' });
    }
});

/**
 * GET /api/drafts - List all drafts for user
 */
router.get('/drafts', async (req, res) => {
    try {
        const userId = req.query.user_id;

        if (!userId) {
            return res.status(400).json({ error: 'user_id required' });
        }

        const [drafts] = await db.query(
            `SELECT e.id, e.from_email, e.subject, e.thread_id,
              e.draft_version, e.created_at, e.last_modified
       FROM emails e
       JOIN email_mailbox em ON e.id = em.email_id
       WHERE em.user_id = ? AND e.is_draft = 1
       ORDER BY e.last_modified DESC`,
            [userId]
        );

        res.json({ drafts });

    } catch (error) {
        console.error('[Draft] List failed:', error);
        res.status(500).json({ error: 'Failed to list drafts' });
    }
});

module.exports = router;
