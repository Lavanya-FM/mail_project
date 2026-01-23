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
  const online = getOnlinePeers().map(p => p.email);

  broadcast({
    type: 'online-peers',
    data: online
  });
}

/* ---------------- REDIS ---------------- */

const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
  },
  password: process.env.REDIS_PASSWORD || undefined
});

redisClient.connect()
  .then(() => console.log('[P2P] Redis connected'))
  .catch(err => console.error('[P2P] Redis error', err));

const TEMP_STORAGE_TTL = 3600;

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

          case 'chunk-request':
            await handleChunkRequest(ws, msg);
            break;

          case 'chunk-ack':
          case 'key-exchange':
          case 'resume-request':
          case 'signal':
            // Forward these directly to recipient
            if (msg.to) {
              forwardToRecipient(msg.to, msg);
            }
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

  const { id: userId, email } = user;

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
      onlinePeers: getOnlinePeers()
    }));

    // Notify others
    broadcastToPeers(wss, {
      type: 'peer-online',
      from: email,
      publicKey
    }, ws);

    console.log(`[P2P] Registered: ${email} (user_id: ${userId})`);

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
}

async function handleFileChunk(ws, msg) {
  const { to, from, payload, messageId } = msg;

  // ----------- VALIDATION -----------
  if (!messageId || !payload || !to) {
    console.error('[P2P] Invalid file-chunk message', msg);
    return;
  }

  // Encrypted payload ONLY – server must never inspect contents
  assertNoFileContent(payload);

  // ----------- FORWARD IF RECIPIENT ONLINE -----------
  const peer = findPeerByEmail(to);

  if (peer && peer.ws.readyState === WebSocket.OPEN) {
    peer.ws.send(JSON.stringify(msg));
  } else {
    // ----------- TEMP STORE (ENCRYPTED ONLY) -----------
    const key = `p2p:${messageId}:${Date.now()}`;

    await redisClient.set(
      key,
      JSON.stringify({ payload, from }),
      { EX: TEMP_STORAGE_TTL }
    );
  }

  // ----------- ACK BACK TO SENDER -----------
  ws.send(JSON.stringify({
    type: 'chunk-ack',
    messageId
  }));
}

async function handleChunkRequest(ws, msg) {
  const { messageId, fileName, chunkIndex, to } = msg;
  const key = `p2p:${messageId}:${fileName}:${chunkIndex}`;
  const cached = await redisClient.get(key);

  if (!cached) return;

  sendToPeer(to, {
    type: 'file-chunk',
    from: ws.email,
    to,
    messageId,
    payload: JSON.parse(cached).payload
  });
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

  const pattern = `p2p:${msg.messageId}:*`;
  const keys = await redisClient.keys(pattern);
  if (keys.length > 0) {
    await redisClient.del(keys);
  }
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
   SET delivered = 0
   WHERE message_id IN (
     SELECT message_id
     FROM p2p_file_metadata
     WHERE status = 'failed'
   )`
  );

  broadcastToPeers(wss, {
    type: 'peer-offline',
    from: peer.email
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
  for (const peer of peerConnections.values()) {
    if (peer.email === recipientEmail && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(JSON.stringify(message));
    }
  }
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
  for (const peer of peerConnections.values()) {
    if (peer.email === email) return peer;
  }
  return null;
}

function isPeerOnline(email) {
  return !!findPeerByEmail(email);
}

function getOnlinePeers() {
  return [...peerConnections.values()].map(p => ({
    email: p.email,
    userId: p.userId
  }));
}

/* ---------------- EXPORT ---------------- */

module.exports = { setupP2PWebSocket };
