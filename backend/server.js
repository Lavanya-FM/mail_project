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
app.use('/api', require('./draftController')); // Gmail-style draft management
app.use('/api/drive', require('./drive'));
app.use('/api/carbon', require('./carbonService'));

// Chat Routes
const chatController = require('./chatController');
const multer = require('multer');
const upload = multer({ dest: path.join(__dirname, 'uploads/') });

app.get('/api/chat/:peerEmail', chatController.getMessages);
app.post('/api/chat/send', upload.single('file'), chatController.sendMessage);

// -------------------------
// STATIC FILES (Frontend)
// -------------------------
// Serve static files from the React app (ONE level up in dist)
const clientBuildPath = path.join(__dirname, '../dist');
app.use(express.static(clientBuildPath));

// Handle SPA fallback - send index.html for any other requests
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

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
