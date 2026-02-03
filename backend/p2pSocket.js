// backend/p2pSocket.js
const WebSocket = require('ws');

const clientsByEmail = new Map(); // email -> { ws, lastHeartbeat, isAlive }
const rooms = new Map(); // meetingId -> Set<email>

function initP2PSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/api/p2p' });

  wss.on('connection', (ws) => {
    let email = null;
    let joinedRooms = new Set();

    // 🚀 HEARTBEAT: Mark connection as alive
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
      if (email) {
        const client = clientsByEmail.get(email);
        if (client) {
          client.lastHeartbeat = Date.now();
        }
      }
    });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      // 🔐 REGISTER USER
      if (msg.type === 'register' && (msg.email || msg.from)) {
        const rawEmail = msg.email || msg.from;
        email = rawEmail.trim().toLowerCase();

        console.log(`[P2P SERVER] Registering ${email}`);

        // 🚨 ENFORCE: One socket per email (close old connection if exists)
        const existingClient = clientsByEmail.get(email);
        if (existingClient && existingClient.ws !== ws) {
          console.log(`[P2P SERVER] Closing old connection for ${email}`);
          existingClient.ws.close();
          clientsByEmail.delete(email);
        }

        // Send current online peers to this new user FIRST (before adding them)
        const currentOnline = Array.from(clientsByEmail.keys());
        ws.send(JSON.stringify({
          type: 'online-peers',
          emails: currentOnline
        }));
        console.log(`[P2P SERVER] Sent current snapshot to ${email}:`, currentOnline);

        // Now add this user with heartbeat tracking
        clientsByEmail.set(email, {
          ws: ws,
          lastHeartbeat: Date.now(),
          isAlive: true
        });

        // ✅ ACKNOWLEDGE REGISTRATION
        ws.send(JSON.stringify({
          type: 'registered',
          email: email
        }));

        // 🔔 BROADCAST FULL SNAPSHOT TO EVERYONE
        broadcastOnlinePeers();

        // 🔔 ALSO notify others individually
        const peerOnlineMsg = JSON.stringify({ type: 'peer-online', email: email });
        for (const [otherEmail, client] of clientsByEmail.entries()) {
          if (otherEmail !== email && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(peerOnlineMsg);
          }
        }
      }

      // 🏠 ROOM MANAGEMENT
      if (msg.type === 'join-room' && msg.meetingId && email) {
        const roomId = msg.meetingId;
        if (!rooms.has(roomId)) rooms.set(roomId, new Set());

        const room = rooms.get(roomId);
        room.add(email);
        joinedRooms.add(roomId);

        // Notify User of success + participants
        const participants = Array.from(room).map(p => ({ email: p }));
        ws.send(JSON.stringify({
          type: 'room-joined',
          meetingId: roomId,
          participants
        }));

        // Notify Room of new peer
        broadcastToRoom(roomId, {
          type: 'peer-joined-room',
          meetingId: roomId,
          peer: { email }
        }, email);
      }

      if (msg.type === 'leave-room' && msg.meetingId && email) {
        leaveRoom(msg.meetingId, email);
      }

      if (msg.type === 'room-broadcast' && msg.meetingId) {
        broadcastToRoom(msg.meetingId, {
          type: 'room-message',
          meetingId: msg.meetingId,
          from: email,
          payload: msg.payload
        }, email);
      }

      // 🔄 MANUAL PRESENCE REQUEST
      if (msg.type === 'request-presence' && email) {
        console.log(`[P2P SERVER] ${email} requested presence update`);
        const emails = Array.from(clientsByEmail.keys());
        ws.send(JSON.stringify({
          type: 'online-peers',
          emails: emails
        }));
      }

      // 🔁 ROUTE ANY DIRECTED MESSAGE (Secure, Call, File Chunk)
      if (msg.to) {
        const recipients = Array.isArray(msg.to) ? msg.to : [msg.to];
        recipients.forEach(to => {
          const targetClient = clientsByEmail.get(to);
          if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
            targetClient.ws.send(JSON.stringify(msg));
          }
        });
      }
    });

    ws.on('close', () => {
      if (!email) return;

      console.log(`[P2P SERVER] Disconnecting ${email}`);

      clientsByEmail.delete(email);

      // Leave all rooms
      joinedRooms.forEach(roomId => leaveRoom(roomId, email));

      // 🔔 BROADCAST FULL SNAPSHOT TO EVERYONE
      broadcastOnlinePeers();

      // 🔔 ALSO notify others individually
      const peerOfflineMsg = JSON.stringify({ type: 'peer-offline', email: email });
      for (const client of clientsByEmail.values()) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(peerOfflineMsg);
        }
      }
      console.log(`[P2P SERVER] Notified others that ${email} went offline`);
    });

    function leaveRoom(roomId, email) {
      if (rooms.has(roomId)) {
        const room = rooms.get(roomId);
        room.delete(email);
        if (room.size === 0) rooms.delete(roomId);
        else {
          broadcastToRoom(roomId, {
            type: 'peer-left-room',
            meetingId: roomId,
            connectionId: email // using email as ID
          }, email);
        }
      }
    }
  });

  function broadcastOnlinePeers() {
    const emails = Array.from(clientsByEmail.keys());
    console.log(`[P2P SERVER] Broadcasting online peers snapshot:`, emails);

    const message = JSON.stringify({
      type: 'online-peers',
      emails: emails
    });

    let sentCount = 0;
    for (const client of clientsByEmail.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
        sentCount++;
      }
    }
    console.log(`[P2P SERVER] Sent presence snapshot to ${sentCount} clients`);
  }

  function broadcastToRoom(roomId, message, exceptEmail) {
    if (!rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    const jsonMsg = JSON.stringify(message);
    for (const memberEmail of room) {
      if (memberEmail !== exceptEmail) {
        const client = clientsByEmail.get(memberEmail);
        if (client && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(jsonMsg);
        }
      }
    }
  }

  // 🚀 HEARTBEAT MONITOR: Ping all clients every 10 seconds
  const heartbeatInterval = setInterval(() => {
    const now = Date.now();
    const staleThreshold = 30000; // 30 seconds

    for (const [email, client] of clientsByEmail.entries()) {
      // Check if connection is stale
      if (now - client.lastHeartbeat > staleThreshold) {
        console.log(`[P2P SERVER] Stale connection detected for ${email}, terminating...`);
        client.ws.terminate();
        clientsByEmail.delete(email);

        // Notify others
        broadcastOnlinePeers();
        const peerOfflineMsg = JSON.stringify({ type: 'peer-offline', email: email });
        for (const otherClient of clientsByEmail.values()) {
          if (otherClient.ws.readyState === WebSocket.OPEN) {
            otherClient.ws.send(peerOfflineMsg);
          }
        }
        continue;
      }

      // Send ping
      if (client.ws.readyState === WebSocket.OPEN) {
        client.isAlive = false;
        client.ws.ping();
      } else {
        // Connection is already closed
        clientsByEmail.delete(email);
        broadcastOnlinePeers();
      }
    }
  }, 10000); // Every 10 seconds

  // 🔄 PERIODIC PRESENCE BROADCAST (every 30 seconds)
  const presenceInterval = setInterval(() => {
    if (clientsByEmail.size > 0) {
      console.log('[P2P SERVER] Periodic presence broadcast');
      broadcastOnlinePeers();
    }
  }, 30000);

  // Cleanup on server shutdown
  wss.on('close', () => {
    clearInterval(heartbeatInterval);
    clearInterval(presenceInterval);
  });
}

module.exports = { initP2PSocket };
