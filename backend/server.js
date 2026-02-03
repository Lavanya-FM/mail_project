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

// Specific 404 for uploads to prevent SPA fallback
app.get('/p2p-sw.js', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/p2p-sw.js'), {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Clear-Site-Data': '"cache", "storage"'
    }
  });
});

app.use('/uploads', (req, res) => {
  res.status(404).json({ error: 'File not found' });
});
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

// Disable caching for all static files to ensure new builds are seen immediately
app.use(express.static(clientBuildPath, {
  etag: false,
  lastModified: false,
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// Handle SPA fallback - send index.html for any other requests
// Disable cache for index.html to ensure new builds are seen
app.get(/(.*)/, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  // Read index.html
  const indexPath = path.join(clientBuildPath, 'index.html');
  try {
    const html = require('fs').readFileSync(indexPath, 'utf8');

    // Nuke the cache
    res.setHeader('Clear-Site-Data', '"cache", "storage", "serviceWorkers"');

    res.send(html);
  } catch (err) {
    res.status(500).send('Error loading index.html');
  }
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
