/**
 * backend/meetingInvites.js
 * 
 * Handles sending meeting invitations via email
 * and storing them in a dedicated "Meeting Invites" category
 */

const express = require('express');
const router = express.Router();
const db = require('./db');

/**
 * Send meeting invite via email
 * POST /api/meeting-invites/send
 * 
 * Body: {
 *   fromUserId: number,
 *   toEmail: string,
 *   meetingId: string,
 *   meetingTitle: string,
 *   meetingDate: string (optional),
 *   meetingTime: string (optional)
 * }
 */
router.post('/send', async (req, res) => {
    try {
        const { fromUserId, toEmail, meetingId, meetingTitle, meetingDate, meetingTime } = req.body;

        // Validate inputs
        if (!fromUserId || !toEmail || !meetingId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: fromUserId, toEmail, meetingId'
            });
        }

        // Get sender info
        const [[sender]] = await db.query(
            'SELECT id, email, name FROM users WHERE id = ?',
            [fromUserId]
        );

        if (!sender) {
            return res.status(404).json({
                success: false,
                error: 'Sender not found'
            });
        }

        // Get recipient info (or use email if not registered)
        let recipientId = null;
        const [[recipient]] = await db.query(
            'SELECT id, email, name FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))',
            [toEmail]
        );

        if (recipient) {
            recipientId = recipient.id;
        }

        // Generate meeting link
        const meetingLink = `${process.env.APP_URL || 'http://jeemail.in'}/meet/${meetingId}`;

        // Create email subject
        const subject = meetingTitle
            ? `Meeting Invitation - ${meetingTitle}`
            : `Meeting Invitation from ${sender.name}`;

        // Create email body (HTML)
        const dateTimeInfo = (meetingDate || meetingTime)
            ? `<p><strong>📅 Scheduled for:</strong> ${meetingDate || ''} ${meetingTime || ''}</p>`
            : '';

        const body = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .meeting-link { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
        .meeting-link:hover { background: #5568d3; }
        .meeting-id { background: #e0e0e0; padding: 10px; border-radius: 5px; font-family: monospace; margin: 10px 0; }
        .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎥 You're Invited to a JeeMeet!</h1>
        </div>
        <div class="content">
            <p>Hi there!</p>
            <p><strong>${sender.name}</strong> (${sender.email}) has invited you to join a video conference.</p>
            
            ${dateTimeInfo}
            
            <p><strong>Meeting ID:</strong></p>
            <div class="meeting-id">${meetingId}</div>
            
            <p style="text-align: center;">
                <a href="${meetingLink}" class="meeting-link">🎥 Join Meeting</a>
            </p>
            
            <p><strong>Or copy this link:</strong></p>
            <p style="word-break: break-all; background: #fff; padding: 10px; border-radius: 5px;">${meetingLink}</p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            
            <p><strong>What is JeeMeet?</strong></p>
            <p>JeeMeet is a secure, peer-to-peer video conferencing platform. Your conversations are private and encrypted.</p>
        </div>
        <div class="footer">
            <p>Sent via <strong>JeeMeet</strong> - Secure Video Conferencing</p>
            <p>© 2026 Jeemail.in - All rights reserved</p>
        </div>
    </div>
</body>
</html>
        `.trim();

        // Plain text version
        const bodyText = `
You're invited to join a JeeMeet video conference!

Invited by: ${sender.name} (${sender.email})
${meetingDate ? `Date: ${meetingDate}` : ''}
${meetingTime ? `Time: ${meetingTime}` : ''}

Meeting ID: ${meetingId}
Meeting Link: ${meetingLink}

Click the link above to join the meeting.

---
Sent via JeeMeet - Secure Video Conferencing
        `.trim();

        // Store in emails table as a sent email with category 'meeting_invite'
        const [result] = await db.query(`
            INSERT INTO emails (
                user_id, 
                sender, 
                recipient, 
                subject, 
                body, 
                body_text,
                folder, 
                category,
                is_read,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
            fromUserId,           // user_id (sender)
            sender.email,         // sender
            toEmail,              // recipient
            subject,              // subject
            body,                 // body (HTML)
            bodyText,             // body_text (plain)
            'sent',               // folder
            'meeting_invite',     // category (special category)
            1,                    // is_read (sender has read it)
        ]);

        const emailId = result.insertId;

        // If recipient is a registered user, also create an inbox copy for them
        if (recipientId) {
            await db.query(`
                INSERT INTO emails (
                    user_id, 
                    sender, 
                    recipient, 
                    subject, 
                    body, 
                    body_text,
                    folder, 
                    category,
                    is_read,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `, [
                recipientId,          // user_id (recipient)
                sender.email,         // sender
                toEmail,              // recipient
                subject,              // subject
                body,                 // body (HTML)
                bodyText,             // body_text (plain)
                'inbox',              // folder
                'meeting_invite',     // category (special category)
                0,                    // is_read (unread for recipient)
            ]);
        }

        // TODO: If recipient is not registered, send actual SMTP email
        // For now, we only store in database for registered users

        res.json({
            success: true,
            message: 'Meeting invite sent successfully',
            emailId: emailId,
            recipientRegistered: !!recipientId,
            meetingLink: meetingLink
        });

    } catch (error) {
        console.error('Error sending meeting invite:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send meeting invite'
        });
    }
});

/**
 * Get all meeting invites for a user
 * GET /api/meeting-invites?userId=123
 */
router.get('/', async (req, res) => {
    try {
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required'
            });
        }

        // Get all emails with category 'meeting_invite'
        const [invites] = await db.query(`
            SELECT 
                id,
                sender,
                recipient,
                subject,
                body,
                body_text,
                folder,
                category,
                is_read,
                is_starred,
                created_at
            FROM emails
            WHERE user_id = ? 
            AND category = 'meeting_invite'
            AND folder != 'trash'
            ORDER BY created_at DESC
        `, [userId]);

        res.json({
            success: true,
            invites: invites,
            count: invites.length
        });

    } catch (error) {
        console.error('Error fetching meeting invites:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch meeting invites'
        });
    }
});

/**
 * Get meeting invite count for a user
 * GET /api/meeting-invites/count?userId=123
 */
router.get('/count', async (req, res) => {
    try {
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required'
            });
        }

        const [[result]] = await db.query(`
            SELECT COUNT(*) as count
            FROM emails
            WHERE user_id = ? 
            AND category = 'meeting_invite'
            AND folder != 'trash'
            AND is_read = 0
        `, [userId]);

        res.json({
            success: true,
            unreadCount: result.count
        });

    } catch (error) {
        console.error('Error fetching meeting invite count:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch meeting invite count'
        });
    }
});

module.exports = router;
