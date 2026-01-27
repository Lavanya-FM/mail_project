const db = require('./db');
const path = require('path');
const fs = require('fs');

/**
 * GET header authorization -> user email
 * (Assuming authJwt middleware populates req.user.email)
 */

exports.getMessages = async (req, res) => {
    try {
        const { peerEmail } = req.params;
        const userEmail = req.user.email;

        const [rows] = await db.execute(`
            SELECT * FROM messages 
            WHERE (sender_email = ? AND receiver_email = ?) 
               OR (sender_email = ? AND receiver_email = ?)
            ORDER BY created_at ASC
        `, [userEmail, peerEmail, peerEmail, userEmail]);

        res.json(rows);
    } catch (err) {
        console.error('Failed to fetch messages:', err);
        res.status(500).json({ error: 'Database error' });
    }
};

exports.sendMessage = async (req, res) => {
    try {
        const { receiver_email, content, type } = req.body;
        const sender_email = req.user.email;
        let file_url = null;

        // Handle file if present
        if (req.file) {
            // file stored by multer in 'uploads/'
            file_url = `/uploads/${req.file.filename}`;
        } else if (req.body.file_url) {
            // if client uploaded separately? For now let's assume multipart/form-data for files
            file_url = req.body.file_url;
        }

        const file_name = req.file ? req.file.originalname : null;

        const [result] = await db.execute(`
            INSERT INTO messages (sender_email, receiver_email, content, type, file_url, file_name)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [sender_email, receiver_email, content || '', type || 'text', file_url, file_name]);

        const newMessage = {
            id: result.insertId,
            sender_email,
            receiver_email,
            content: content || '',
            type: type || 'text',
            file_url,
            file_name,
            created_at: new Date(),
            is_read: false
        };

        res.json({ success: true, message: newMessage });

    } catch (err) {
        console.error('Failed to send message:', err);
        res.status(500).json({ error: 'Database error' });
    }
};
