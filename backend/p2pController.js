/**
 * backend/p2pController.js
 * Stable P2P WebSocket Controller (Metadata-only)
 */

const WebSocket = require('ws');
const crypto = require('crypto');
const redis = require('redis');
const db = require('./db'); // Promise pool
const { handleCallSignaling } = require('./callSignaling');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Ensure uploads directory exists
const P2P_CHUNKS_DIR = path.join(__dirname, 'uploads', 'p2p_chunks');
if (!fs.existsSync(P2P_CHUNKS_DIR)) {
  fs.mkdirSync(P2P_CHUNKS_DIR, { recursive: true });
}

/* ---------------- SAFETY GUARD ---------------- */

function assertNoFileContent(obj) {
  if (
    obj?.content ||
    obj?.content_base64 ||
    obj?.chunks ||
    obj?.buffer ||
    obj?.blob
  ) {
    throw new Error('🚫 P2P file content must never be stored on server');
  }
}

function broadcastPresence() {
  const peers = getOnlinePeers();
  const emails = peers.map(p => p.email);
  broadcast({
    type: 'online-peers',
    emails: emails // ✅ FIX: Send array of strings for client v10+
  });
}


/* ---------------- REDIS ---------------- */

const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    connectTimeout: 5000,
  },
  password: process.env.REDIS_PASSWORD || undefined
});

let redisConnected = false;

redisClient.connect()
  .then(() => {
    console.log('[P2P] Redis connected');
    redisConnected = true;
  })
  .catch(err => console.warn('[P2P] Redis connection failed (running in memory-only mode):', err.message));

const TEMP_STORAGE_TTL = 3600;

const P2P_POLICIES = {
  MAX_FILE_SIZE_BYTES: 2 * 1024 * 1024 * 1024, // 2GB
  MAX_TRANSFER_DURATION_MS: 48 * 3600 * 1024, // 48 Hours
  QUOTA_PER_RECIPIENT: true // Industry-grade: count once per recipient on fallback
};

/* ---------------- STATE ---------------- */

/* ---------------- STATE ---------------- */

const peerConnections = new Map();
// connectionId → { ws, userId, email, lastSeen }

const rooms = new Map();
// meetingId → Set<connectionId>

/* ---------------- WEBSOCKET SETUP ---------------- */

function setupP2PWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/api/p2p' });

  wss.on('connection', (ws) => {
    const connectionId = crypto.randomUUID();
    ws.connectionId = connectionId; // Attach ID directly to WS
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
      const peer = peerConnections.get(connectionId);
      if (peer) peer.lastSeen = new Date();
    });

    ws.on('message', async raw => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (e) {
        console.error('[P2P] Invalid JSON received');
        return;
      }

      try {
        if (!msg.type) {
          console.warn('[P2P] Missing message type');
          return;
        }

        switch (msg.type) {
          case 'register':
            await handleRegister(ws, connectionId, msg, wss);
            break;

          case 'join-room':
            await handleJoinRoom(ws, msg);
            break;

          case 'leave-room':
            await handleLeaveRoom(ws, msg);
            break;

          case 'room-broadcast':
            // Send to everyone in room EXCEPT sender
            await handleRoomBroadcast(ws, msg);
            break;

          case 'email-initiate':
            await handleEmailInitiate(ws, msg);
            break;

          case 'file-chunk':
            await handleFileChunk(ws, msg);
            break;

          case 'resume-request':
          case 'signal':
          case 'p2p-offer':
          case 'p2p-revoke':
            // Forward these directly to recipient
            if (msg.to) {
              forwardToRecipient(msg.to, msg);
            }
            break;

          case 'chunk-ack':
          case 'key-exchange':
          case 'key-exchange-init':
          case 'key-exchange-ack':
            if (msg.to) {
              forwardToRecipient(msg.to, msg);
            }
            break;

          case 'chunk-request':
            await handleChunkRequest(ws, msg);
            break;

          case 'chunk-request-batch':
            await handleChunkRequestBatch(ws, msg);
            break;

          case 'log-event':
            await handleLogEvent(msg);
            break;


          case 'transfer-complete':
            await handleTransferComplete(msg);
            break;

          case 'CALL_EVENT':
            // NEW: Handle call signaling
            await handleCallSignaling(ws, msg, peerConnections);
            break;

          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;

          default:
            console.warn('[P2P] Unknown message type:', msg.type);
        }
      } catch (err) {
        console.error('[P2P] Message processing error:', err);
        ws.send(JSON.stringify({ type: 'error', message: 'Internal server error processing message' }));
      }
    });

    ws.on('close', async () => {
      await handleDisconnect(connectionId, wss);
    });

    ws.on('error', err => console.error('[P2P] WS error', err));
  });

  // 🚀 ROBUST SCHEMA INIT (Ensures p2p_server_chunks exists on server)
  db.query(`
    CREATE TABLE IF NOT EXISTS p2p_server_chunks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      message_id VARCHAR(255) NOT NULL,
      chunk_index INT NOT NULL,
      sender_email VARCHAR(255) NOT NULL,
      recipient_email VARCHAR(255) NOT NULL,
      data_path TEXT NOT NULL,
      expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL 24 HOUR),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY idx_msg_chunk (message_id, chunk_index)
    )
  `).catch(err => console.warn('[P2P] Schema init warning:', err.message));


  /* ---------------- HEARTBEAT ---------------- */
  setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);

  console.log('[P2P] WebSocket initialized with Room support');
}

/* ---------------- AUDIT HELPERS ---------------- */

async function logDeliveryEvent(attachmentId, p2pMessageId, sender, recipient, eventType, metadata = {}) {
  try {
    // 1. Immutable Log
    await db.query(
      `INSERT INTO p2p_delivery_logs (attachment_id, p2p_message_id, sender_email, recipient_email, event_type, event_metadata)
             VALUES (?, ?, ?, ?, ?, ?)`,
      [attachmentId || 0, p2pMessageId, sender, recipient, eventType, JSON.stringify(metadata)]
    );

    // 2. State Update
    let status = 'WAITING_FOR_PEER';
    if (eventType === 'STARTED') status = 'TRANSFERRING';
    if (eventType === 'COMPLETED') status = 'COMPLETED';
    if (eventType === 'FAILED') status = 'FAILED';
    if (eventType === 'FALLBACK_INITIATED') status = 'FALLBACK';

    if (attachmentId) {
      await db.query(
        `UPDATE email_attachments SET attachment_transfer_state = ?, last_status_update = NOW() WHERE id = ?`,
        [status, attachmentId]
      );
    } else if (p2pMessageId) {
      await db.query(
        `UPDATE email_attachments SET attachment_transfer_state = ?, last_status_update = NOW() WHERE p2p_message_id = ?`,
        [status, p2pMessageId]
      );
    }
  } catch (err) {
    console.error('[P2P] Audit logging failed:', err);
  }
}

/* ---------------- HANDLERS ---------------- */

async function handleRegister(ws, connectionId, msg, wss) {
  const { token, publicKey } = msg;

  if (!token) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Auth token required'
    }));
    return;
  }

  let user;
  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET || "your_jwt_secret"
    );
    user = payload.user || payload;
  } catch (e) {
    console.error('[P2P] Token verification failed:', e.message);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Invalid auth token'
    }));
    ws.close();
    return;
  }

  let { id: userId, email: rawEmail } = user;
  const email = rawEmail ? rawEmail.trim().toLowerCase() : ''; // ✅ FIX: Normalize email

  // Implicitly valid because token is valid
  try {
    // ✅ VERIFY USER EXISTS IN DATABASE
    const [userCheck] = await db.query(
      'SELECT id FROM users WHERE id = ? AND email = ?',
      [userId, email]
    );

    if (!userCheck || userCheck.length === 0) {
      console.error(`[P2P] User not found: userId=${userId}, email=${email}`);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'User not found. Please log in again.'
      }));
      ws.close();
      return;
    }

    // Store connection
    peerConnections.set(connectionId, {
      ws,
      userId,
      email,
      p2pCapable: !!publicKey,
      publicKey: publicKey, // Store it
      lastSeen: new Date()
    });


    broadcastPresence();

    // Save to database with public key
    await db.query(
      `INSERT INTO p2p_peers (user_id, email, connection_id, is_online, public_key)
       VALUES (?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE 
         is_online = 1,
         connection_id = VALUES(connection_id),
         public_key = VALUES(public_key)`,
      [userId, email, connectionId, publicKey ? JSON.stringify(publicKey) : null]
    );

    // Store metadata on WebSocket
    ws.userId = userId;
    ws.email = email;
    ws.connectionId = connectionId;

    // Confirm registration
    ws.send(JSON.stringify({
      type: 'registered',
      connectionId,
      email,
      onlinePeers: getOnlinePeers()
    }));

    // Notify others
    broadcastToPeers(wss, {
      type: 'peer-online',
      email: email, // ✅ FIX: Client expects 'email' not 'from'
      publicKey,
      p2pCapable: !!publicKey
    }, ws);

    console.log(`[P2P] Registered: ${email} (user_id: ${userId}, p2pCapable: ${!!publicKey})`);

    // Check for pending transfers to this user and notify sender if online
    await notifyPendingTransfers(email);


  } catch (error) {
    console.error('[P2P] Registration error:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Registration failed'
    }));
  }
}

async function handleEmailInitiate(ws, msg) {
  const { from, to, data } = msg;

  assertNoFileContent(data);
  assertNoFileContent(data.file);

  const bothOnline = isPeerOnline(to);

  ws.send(JSON.stringify({
    type: 'transfer-ready',
    messageId: data.id,
    recipientOnline: bothOnline
  }));

  await db.query(
    `INSERT INTO p2p_file_metadata
     (email_id, message_id, sender_email, recipient_email,
      filename, mime_type, size_bytes, checksum_sha256)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status = 'transferring'`,
    [
      data.emailId,
      data.id,
      from,
      to,
      data.file.name,
      data.file.type,
      data.file.size,
      data.file.checksum
    ]
  );

  if (bothOnline) {
    sendToPeer(to, {
      type: 'transfer-request',
      from,
      data
    });
  }

  await logDeliveryEvent(data.attachmentId, data.id, from, to, 'STARTED', {
    filename: data.file.name,
    size: data.file.size
  });
}


async function handleFileChunk(ws, msg) {
  const { to, from, payload, messageId, chunkIndex } = msg;

  if (!messageId || !payload || !to) {
    console.error('[P2P] Invalid file-chunk message', msg);
    return;
  }

  // 1. SAVE TO SERVER DISK (Optimized for resumption)
  try {
    const chunkFile = path.join(P2P_CHUNKS_DIR, `${messageId}_${chunkIndex || 0}.chunk`);
    const chunkData = JSON.stringify({
      payload,
      data: msg.data, // 🚀 CRITICAL: Include the actual base64 data
      from,
      to,
      timestamp: Date.now()
    });

    // Non-blocking-ish write (we don't await it if we want maximum speed, but safer to await)
    fs.writeFileSync(chunkFile, chunkData);

    // Also track in DB (optional but good for cleanup)
    await db.query(`
      INSERT INTO p2p_server_chunks (message_id, chunk_index, sender_email, recipient_email, data_path)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE data_path = VALUES(data_path), expires_at = (CURRENT_TIMESTAMP + INTERVAL 24 HOUR)
    `, [messageId, chunkIndex || 0, from, to, chunkFile]).catch(e => { });

  } catch (err) {
    console.error('[P2P] Failed to cache chunk on server:', err.message);
  }

  // 2. FORWARD IF RECIPIENT ONLINE
  const peer = findPeerByEmail(to);
  if (peer && peer.ws.readyState === WebSocket.OPEN) {
    peer.ws.send(JSON.stringify(msg));
  }

  // 3. ACK SENDER
  ws.send(JSON.stringify({ type: 'chunk-ack', messageId, chunkIndex }));
}

async function handleChunkRequest(ws, msg) {
  const { messageId, chunkIndex, to, from } = msg;
  const chunkFile = path.join(P2P_CHUNKS_DIR, `${messageId}_${chunkIndex}.chunk`);

  if (fs.existsSync(chunkFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(chunkFile, 'utf8'));
      ws.send(JSON.stringify({
        type: 'file-chunk',
        from: data.from,
        to: ws.email,
        messageId,
        chunkIndex,
        data: data.data, // 🚀 CRITICAL
        payload: data.payload,
        cached: true
      }));
      return; // Served from server
    } catch (e) {
      console.error('[P2P] Failed to read cached chunk:', e);
    }
  }

  // Fallback: forward to sender if online
  if (to) {
    forwardToRecipient(to, msg);
  }
}

async function handleChunkRequestBatch(ws, msg) {
  const { messageId, chunkIndices, to, from } = msg;
  const missingInCache = [];

  for (const idx of chunkIndices) {
    const chunkFile = path.join(P2P_CHUNKS_DIR, `${messageId}_${idx}.chunk`);
    if (fs.existsSync(chunkFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(chunkFile, 'utf8'));
        ws.send(JSON.stringify({
          type: 'file-chunk',
          from: data.from,
          to: ws.email,
          messageId,
          chunkIndex: idx,
          data: data.data, // 🚀 CRITICAL
          payload: data.payload,
          cached: true
        }));
      } catch (e) {
        missingInCache.push(idx);
      }
    } else {
      missingInCache.push(idx);
    }
  }

  // Forward remaining requests to original sender if they are online
  if (missingInCache.length > 0 && to) {
    forwardToRecipient(to, {
      ...msg,
      chunkIndices: missingInCache
    });
  }
}

async function handleTransferComplete(msg) {
  sendToPeer(msg.from, {
    type: 'p2p-transfer-complete',
    emailId: msg.emailId
  });

  await db.query(
    `UPDATE p2p_file_metadata
     SET status = 'completed',
         delivered_at = NOW(),
         completed_at = NOW()
     WHERE message_id = ?`,
    [msg.messageId]
  );

  await db.query(
    `
    UPDATE email_attachments
    SET delivered = 1,
        delivery_mode = 'P2P',
        delivered_at = NOW()
    WHERE p2p_message_id = ?
    `,
    [msg.messageId]
  );

  if (redisConnected) {
    const pattern = `p2p:${msg.messageId}:*`;
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  }

  // 🚀 DELETE CACHED DISK CHUNKS ON SUCCESS
  try {
    const [chunks] = await db.query('SELECT data_path FROM p2p_server_chunks WHERE message_id = ?', [msg.messageId]);
    if (chunks && chunks.length > 0) {
      for (const c of chunks) {
        if (fs.existsSync(c.data_path)) fs.unlinkSync(c.data_path);
      }
      await db.query('DELETE FROM p2p_server_chunks WHERE message_id = ?', [msg.messageId]);
      console.log(`[P2P] Purged ${chunks.length} cached chunks for ${msg.messageId}`);
    }
  } catch (e) {
    console.warn('[P2P] Cache purge failed:', e.message);
  }

  // AUDIT LOG
  await logDeliveryEvent(null, msg.messageId, msg.from, msg.to, 'COMPLETED');

  // QUOTA ACCOUNTING
  try {
    const [meta] = await db.query('SELECT size_bytes, recipient_email FROM p2p_file_metadata WHERE message_id = ?', [msg.messageId]);
    if (meta && meta[0]) {
      // Industry-standard: Count once per recipient
      await db.query('UPDATE users SET storage_used_bytes = storage_used_bytes + ? WHERE email = ?', [meta[0].size_bytes, meta[0].recipient_email]);
    }
  } catch (e) {
    console.error('[P2P] Quota update failed:', e);
  }
}

async function handleLogEvent(msg) {
  const { messageId, eventType, metadata, from, to } = msg;
  await logDeliveryEvent(null, messageId, from, to, eventType, metadata);
}


async function handleDisconnect(connectionId, wss) {
  const peer = peerConnections.get(connectionId);
  if (!peer) return;

  peerConnections.delete(connectionId);

  // Cleanup Rooms
  if (peer.ws.rooms) {
    for (const meetingId of peer.ws.rooms) {
      if (rooms.has(meetingId)) {
        rooms.get(meetingId).delete(connectionId);
        // Notify others
        broadcastToRoom(meetingId, {
          type: 'peer-left-room',
          meetingId,
          connectionId,
          email: peer.email
        }, peer.ws);

        if (rooms.get(meetingId).size === 0) {
          rooms.delete(meetingId);
        }
      }
    }
  }

  broadcastPresence();

  await db.query(
    `UPDATE p2p_peers SET is_online = 0 WHERE connection_id = ?`,
    [connectionId]
  );

  await db.query(
    `UPDATE p2p_file_metadata
     SET status = 'failed'
     WHERE (sender_email = ? OR recipient_email = ?)
       AND status IN ('initiated','transferring')`,
    [peer.email, peer.email]
  );

  await db.query(
    `UPDATE email_attachments
   SET delivered = 0, attachment_transfer_state = 'FAILED'
   WHERE p2p_message_id IN (
     SELECT message_id
     FROM p2p_file_metadata
     WHERE status = 'failed'
   )`
  );


  broadcastToPeers(wss, {
    type: 'peer-offline',
    email: peer.email // ✅ FIX: Client expects 'email' not 'from'
  }, peer.ws);
}

/* ---------------- ROOM HANDLERS ---------------- */

async function handleJoinRoom(ws, msg) {
  const { meetingId, userId, email, role = 'participant' } = msg; // TODO: Validate role
  if (!meetingId) return;

  if (!rooms.has(meetingId)) {
    rooms.set(meetingId, new Set());
  }
  rooms.get(meetingId).add(ws.connectionId);
  if (!ws.rooms) ws.rooms = new Set();
  ws.rooms.add(meetingId);

  // Notify others in room
  broadcastToRoom(meetingId, {
    type: 'peer-joined-room',
    meetingId,
    peer: {
      connectionId: ws.connectionId,
      email,
      userId,
      role
    }
  }, ws);

  // Send list of existing participants to the new joiner
  const participants = [];
  for (const cid of rooms.get(meetingId)) {
    if (cid === ws.connectionId) continue;
    const p = peerConnections.get(cid);
    if (p) {
      participants.push({
        connectionId: cid,
        email: p.email,
        userId: p.userId
      });
    }
  }

  ws.send(JSON.stringify({
    type: 'room-joined',
    meetingId,
    participants,
    role
  }));

  console.log(`[Room] ${email} joined ${meetingId} as ${role}`);
}

async function handleLeaveRoom(ws, msg) {
  const { meetingId } = msg;
  if (rooms.has(meetingId)) {
    rooms.get(meetingId).delete(ws.connectionId);
    broadcastToRoom(meetingId, {
      type: 'peer-left-room',
      meetingId,
      connectionId: ws.connectionId
    }, ws);

    if (rooms.get(meetingId).size === 0) {
      rooms.delete(meetingId);
    }
  }
  if (ws.rooms) ws.rooms.delete(meetingId);
}

async function handleRoomBroadcast(ws, msg) {
  const { meetingId, payload } = msg;
  if (!rooms.has(meetingId)) return;

  // Validate user is in room
  if (!rooms.get(meetingId).has(ws.connectionId)) return;

  broadcastToRoom(meetingId, {
    type: 'room-message',
    meetingId,
    from: ws.connectionId,
    payload
  }, ws);
}

function broadcastToRoom(meetingId, msg, excludeWs) {
  if (!rooms.has(meetingId)) return;
  for (const cid of rooms.get(meetingId)) {
    const peer = peerConnections.get(cid);
    if (peer && peer.ws !== excludeWs && peer.ws.readyState === 1) { // WebSocket.OPEN
      peer.ws.send(JSON.stringify(msg));
    }
  }
}

/* ---------------- HELPERS ---------------- */

function sendToPeer(email, msg) {
  for (const peer of peerConnections.values()) {
    if (peer.email === email && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(JSON.stringify(msg));
    }
  }
}

function forwardToRecipient(recipientEmail, message) {
  let forwarded = false;
  const target = recipientEmail ? recipientEmail.toLowerCase() : '';
  for (const peer of peerConnections.values()) {
    if (peer.email.toLowerCase() === target && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(JSON.stringify(message));
      forwarded = true;
    }
  }
  return forwarded;
}

function broadcast(msg, exceptWs = null) {
  for (const peer of peerConnections.values()) {
    if (peer.ws !== exceptWs && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(JSON.stringify(msg));
    }
  }
}

function broadcastToPeers(wss, message, excludeWs) {
  for (const peer of peerConnections.values()) {
    if (peer.ws !== excludeWs && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(JSON.stringify(message));
    }
  }
}

function findPeerByEmail(email) {
  if (!email) return null;
  const searchEmail = email.toLowerCase();
  for (const peer of peerConnections.values()) {
    if (peer.email.toLowerCase() === searchEmail) return peer;
  }
  return null;
}

function isPeerOnline(email) {
  return !!findPeerByEmail(email);
}

async function notifyPendingTransfers(recipientEmail) {
  try {
    const [pending] = await db.query(
      "SELECT sender_email, message_id FROM p2p_file_metadata WHERE recipient_email = ? AND status IN ('initiated', 'transferring')",
      [recipientEmail]
    );

    // Also check for pending P2P email attachments
    const [pendingEmails] = await db.query(
      `SELECT e.from_email as sender_email, a.p2p_message_id as message_id
       FROM email_attachments a
       JOIN emails e ON a.email_id = e.id
       JOIN email_recipients r ON e.id = r.email_id
       WHERE r.address = ? 
         AND a.delivery_mode = 'P2P' 
         AND a.delivered = 0`,
      [recipientEmail]
    );

    const allPending = [...pending, ...pendingEmails];

    for (const row of allPending) {
      const sender = findPeerByEmail(row.sender_email);
      if (sender) {
        sender.ws.send(JSON.stringify({
          type: 'recipient-available',
          recipient: recipientEmail,
          messageId: row.message_id
        }));
      }
    }
  } catch (err) {
    console.error('[P2P] Failed to notify pending transfers:', err);
  }
}

function getOnlinePeers() {
  return [...peerConnections.values()].map(p => ({
    email: p.email,
    userId: p.userId,
    p2pCapable: p.p2pCapable,
    publicKey: p.publicKey // Store raw public key bytes if needed, or already JSON string
  }));
}



/* ---------------- CLEANUP ---------------- */

async function cleanupExpiredChunks() {
  try {
    const [expired] = await db.query('SELECT id, data_path FROM p2p_server_chunks WHERE expires_at < NOW()');
    if (expired && expired.length > 0) {
      console.log(`[P2P] Cleaning up ${expired.length} expired chunks...`);
      for (const row of expired) {
        if (fs.existsSync(row.data_path)) {
          fs.unlinkSync(row.data_path);
        }
      }
      const ids = expired.map(r => r.id);
      await db.query('DELETE FROM p2p_server_chunks WHERE id IN (?)', [ids]);
    }
  } catch (err) {
    if (err.code !== 'ER_NO_SUCH_TABLE') {
      console.warn('[P2P] Chunk cleanup failed:', err.message);
    }
  }
}

// Run cleanup every hour
setInterval(cleanupExpiredChunks, 3600000);

/* ---------------- EXPORT ---------------- */

module.exports = { setupP2PWebSocket };
