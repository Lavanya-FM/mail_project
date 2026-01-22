// backend/p2pSocket.js
const WebSocket = require('ws');

const clientsByEmail = new Map(); // email -> ws

function initP2PSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/api/p2p' });

  wss.on('connection', (ws) => {
    let email = null;

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

        // 🔔 Notify others
        broadcast({
          type: 'peer-online',
          from: email
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

      broadcast({
        type: 'peer-offline',
        from: email
      }, email);
    });
  });

  function broadcast(message, exceptEmail) {
    for (const [email, client] of clientsByEmail.entries()) {
      if (email !== exceptEmail && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    }
  }
}

module.exports = { initP2PSocket };
