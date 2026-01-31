// p2p-sw.js - TEMPORARILY DISABLED
self.addEventListener("install", e => {
    console.log('[SW] Install');
    self.skipWaiting();
});

self.addEventListener("activate", e => {
    console.log('[SW] Activate');
    self.clients.claim();
});

// Any fetch handlers or other logic should be commented out or removed
// to prevent caching old assets.
