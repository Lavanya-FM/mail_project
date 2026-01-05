/**
 * backend/server.js
 * HTTP + WebSocket bootstrap ONLY
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');

const app = express();
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));
app.use(cors());

// -------------------------
// AUTH (HTTP ONLY)
// -------------------------
const authJwt = require('./authJwt');
app.use((req, res, next) => {
  if (req.path === '/api/p2p') return next();
  authJwt(req, res, next);
});

// -------------------------
// ROUTES
// -------------------------
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api', require('./mail'));
app.use('/api/drive', require('./drive'));
app.use('/api/carbon', require('./carbonService'));

// -------------------------
// HTTP SERVER
// -------------------------
const server = http.createServer(app);

// -------------------------
// P2P WEBSOCKET (DELEGATED)
// -------------------------
const { setupP2PWebSocket } = require('./p2pController');
setupP2PWebSocket(server);

process.on('unhandledRejection', err => {
  console.error('🔥 UNHANDLED PROMISE:', err);
  process.exit(1);
});

// -------------------------
// START
// -------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 HTTP + WebSocket server running on ${PORT}`);
});
