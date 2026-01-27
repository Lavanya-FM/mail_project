// backend/p2pSocket.js
const WebSocket = require('ws');

const clientsByEmail = new Map(); // email -> ws
const rooms = new Map(); // meetingId -> Set<email>

function initP2PSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/api/p2p' });

  wss.on('connection', (ws) => {
    let email = null;
    let joinedRooms = new Set();

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      // 🔐 REGISTER USER
      if (msg.type === 'register' && msg.from) {
        email = msg.from;
        clientsByEmail.set(email, ws);

        // ✅ ACKNOWLEDGE REGISTRATION
        ws.send(JSON.stringify({ type: 'registered' }));

        // 🔔 Notify others
        broadcast({
          type: 'peer-online',
          from: email
        }, email);
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

      // 🔁 ROUTE ANY DIRECTED MESSAGE (Secure, Call, File Chunk)
      if (msg.to) {
        const recipients = Array.isArray(msg.to) ? msg.to : [msg.to];
        recipients.forEach(to => {
          const target = clientsByEmail.get(to);
          if (target && target.readyState === WebSocket.OPEN) {
            target.send(JSON.stringify(msg));
          }
        });
      }
    });

    ws.on('close', () => {
      if (!email) return;

      clientsByEmail.delete(email);

      // Leave all rooms
      joinedRooms.forEach(roomId => leaveRoom(roomId, email));

      broadcast({
        type: 'peer-offline',
        from: email
      }, email);
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

  function broadcast(message, exceptEmail) {
    for (const [email, client] of clientsByEmail.entries()) {
      if (email !== exceptEmail && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    }
  }

  function broadcastToRoom(roomId, message, exceptEmail) {
    if (!rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    for (const memberEmail of room) {
      if (memberEmail !== exceptEmail) {
        const client = clientsByEmail.get(memberEmail);
        if (client && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(message));
        }
      }
    }
  }
}

module.exports = { initP2PSocket };
