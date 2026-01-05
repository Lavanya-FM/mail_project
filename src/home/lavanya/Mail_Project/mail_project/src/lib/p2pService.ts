// src/lib/p2pService.ts
// Green, carbon-aware, ACK-controlled P2P transfer service

import {
  generateKeyPair,
  exportPublicKey,
  exportKeyPair,
  importStoredKeyPair,
  importPublicKey,
  deriveSharedKey,
  encrypt,
  decrypt
} from './p2pCrypto';

import {
  calculateCarbonMetrics
} from './carbonService';

import { enhancedP2PService } from './enhancedP2PService';

import {
  encryptChunkAES,
  decryptChunkAES,
  sha256
} from './p2pCrypto';

import {
  saveChunk,
  getChunk,
  getReceivedChunkIndexes,
  getMeta
} from './p2pStorage';

/* ---------------------------------------------------- */
/* -------------------- CONSTANTS --------------------- */
/* ---------------------------------------------------- */

const P2P_LIMITS = {
  BASE_KBPS: 256,
  MIN_KBPS: 32,
  MAX_KBPS: 512,
  CHUNK_SIZE: 64 * 1024,
};

const MAX_RETRIES_PER_CHUNK = 5;
const chunkRetries = new Map<string, number>();

const PARALLEL_LANES = navigator.hardwareConcurrency >= 8 ? 4 : 3; //Increase Parallelism safely

const ACK_TIMEOUT_MS = 2000;// Faster ACK feedback

type NetworkType = 'internet' | 'mobile' | 'wifi';

/* ---------------------------------------------------- */
/* -------------------- TYPES ------------------------- */
/* ---------------------------------------------------- */

enum TransferPhase {
  INIT = 'INIT',
  OFFERED = 'OFFERED',
  SENDING = 'SENDING',
  DONE = 'DONE',
  FAILED = 'FAILED'
}

interface EncryptedPayload {
  iv: number[];
  ciphertext: number[];
  tag: number[];
}

interface StrictMessage {
  type:
  | 'register'
  | 'registered'
  | 'peer-online'
  | 'peer-offline'
  | 'online-peers'
  | 'key-exchange'
  | 'p2p-offer'
  | 'p2p-offer-ack'
  | 'file-chunk'
  | 'chunk-ack'
  | 'resume-request'
  | 'transfer-complete'
  | 'error'
  | 'ping'
  | 'pong';
  from?: string;
  to?: string;
  publicKey?: number[];
  payload?: EncryptedPayload;
  messageId?: string;
  message?: string;
  chunkIndex?: number;
  progress?: number;
  data?: any;
  timestamp?: number;
}

type StopReason =
  | 'NETWORK_DROP'
  | 'SENDER_OFFLINE'
  | 'THROTTLED'
  | 'CHUNK_TIMEOUT'
  | 'USER_PAUSED'
  | 'SYSTEM_SLEEP'
  | null;

interface ReceiverTransferState {
  messageId: string;
  fileName: string;
  mimeType: string;
  totalChunks: number;
  receivedChunks: Set<number>;
  verifiedChunks: Set<number>;
  failedChunks: Set<number>;
  status: 'receiving' | 'paused' | 'failed' | 'complete';
  reason: StopReason;
  lastUpdated: number;
}

interface TransferState {
  messageId: string;
  recipientEmail: string;
  attachments: File[];
  missingChunks: Set<number>,
  totalChunks: number;
  progress: number;
  bytesSent: number;
  paused: boolean;
  phase: TransferPhase;  
  retryCount: Map<number, number>;
  lastSentAt: Map<number, number>;
}

/* ---------------------------------------------------- */

class StrictP2PService {
  private ws: WebSocket | null = null;
  private email = '';
  private userId: string | number = '';
  private connected = false;
  private isRegistering = false;
private congestion = {
  rtt: 0,
  loss: 0,
  window: 4,
  lastAck: performance.now()
};

  private keyPair!: CryptoKeyPair;
  private onlinePeers = new Set<string>();

  private sessionKeys = new Map<string, CryptoKey>();
  private ephemeralKeys = new Map<string, CryptoKeyPair>();

  private async verifyFile(messageId: string, fileBuffer: ArrayBuffer): Promise<boolean> {
    const meta = await getMeta(messageId);
    if (!meta?.checksum) return true;

    const hash = await sha256(fileBuffer);
    return hash === meta.checksum;
  }

  private activeTransfers = new Map<string, TransferState>();
  private transferSenders = new Map<string, string>();
  private receivedFiles = new Map<string, Blob>();

  private mediaSources = new Map<string, MediaSource>();
  private sourceBuffers = new Map<string, SourceBuffer>();
  private videoQueues = new Map<string, Uint8Array[]>();

  // --- ACK-driven throttling ---
  private currentKBPS = P2P_LIMITS.BASE_KBPS;
  private lastAckAt = performance.now();

  // --- ETA Tracker
  private receiveSpeed = new Map<string, {
    lastBytes: number;
    lastTime: number;
    speedBps: number;
  }>();

  // --- Sender Speed Tracker
  private sendSpeed = new Map<string, {
    lastBytes: number;
    lastTime: number;
    speedBps: number;
  }>();

  // --- Receive buffer ---
  private receivedChunks = new Map<string, Map<number, Uint8Array>>();
  private receiverTransfers = new Map<string, ReceiverTransferState>();
  
  // --- Queue system (one file at a time) ---
  private receiverQueue: string[] = []; // messageIds in queue
  private currentProcessingMessageId: string | null = null;

  hasSessionKey(email: string): boolean {
    return this.sessionKeys.has(email);
  }

  isPeerOnline(email: string): boolean {
    return this.onlinePeers.has(email);
  }

getReceiveProgress(messageId: string): {
  percentage: number;
  received: number;
  total: number;
  status: 'receiving' | 'paused' | 'complete' | 'not-started';
} {
  const rt = this.receiverTransfers.get(messageId);

  if (!rt) {
    return {
      percentage: 0,
      received: 0,
      total: 0,
      status: 'not-started'
    };
  }

  const received = rt.receivedChunks.size;
  const total = rt.totalChunks || 0;

  const percentage =
    total > 0 ? Math.floor((received / total) * 100) : 0;

  return {
    percentage,
    received,
    total,
    status: rt.status
  };
}

  pauseTransfer(messageId: string) {
    const transfer = this.activeTransfers.get(messageId);
    if (transfer) {
      console.log('[P2P] Transfer paused:', messageId);
    }
  }

resumeTransfer(messageId: string) {
  const t = this.activeTransfers.get(messageId);
  if (t) {
    t.paused = false;
    t.phase = TransferPhase.SENDING;
  }
}

  // --- USER CONTROLLED BANDWIDTH ---
  public setUserBandwidth(kbps: number) {
    this.currentKBPS = Math.min(
      P2P_LIMITS.MAX_KBPS,
      Math.max(P2P_LIMITS.MIN_KBPS, kbps)
    );

    console.log('[P2P] User bandwidth set to', this.currentKBPS, 'KBPS');
  }  

// ============================================================
  // DEBUG: Inspect in-memory + IndexedDB storage
  // ============================================================
  async debugStorage(): Promise<void> {
    console.log('[P2P] === STORAGE DEBUG ===');
    console.log(
      '[P2P] Files in memory:',
      Array.from(this.receivedFiles.keys())
    );

    try {
      const db = await this.openDB();
      const tx = db.transaction('files', 'readonly');
      const store = tx.objectStore('files');

      const allFiles = await new Promise<any[]>((resolve) => {
        const files: any[] = [];
        const cursor = store.openCursor();

        cursor.onsuccess = () => {
          const c = cursor.result;
          if (!c) {
            resolve(files);
            return;
          }
          files.push({
            messageId: c.value.messageId,
            fileName: c.value.fileName,
            size: c.value.blob?.size
          });
          c.continue();
        };
      });

      console.log('[P2P] Files in IndexedDB:', allFiles);
    } catch (error) {
      console.error('[P2P] Error reading storage:', error);
    }

    console.log('[P2P] === END DEBUG ===');
  }


async resumeReceive(messageId: string) {
  const meta = await getMeta(messageId);
  if (!meta) return;

  const received = await getReceivedChunkIndexes(messageId);
  const missing: number[] = [];

  for (let i = 0; i < meta.totalChunks; i++) {
    if (!received.includes(i)) missing.push(i);
  }

  // 🔴 HARD STOP
  if (missing.length === 0) return;

  const sender = this.transferSenders.get(messageId);
  if (!sender) return;

  missing.forEach(idx => this.retryChunk(messageId, idx, sender));
}

  /* ---------------------------------------------------- */
  /* ------------------ CONNECT ------------------------- */
  /* ---------------------------------------------------- */

  async connect(userId: string | number, email: string): Promise<void> {
    if (this.connected || this.isRegistering) return;
    this.isRegistering = true;

    this.email = email;
    this.userId = userId;

    const stored = localStorage.getItem('p2p-keypair');
    this.keyPair = stored
      ? await importStoredKeyPair(stored)
      : await generateKeyPair();

    if (!stored) {
      localStorage.setItem('p2p-keypair', await exportKeyPair(this.keyPair));
    }

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}/api/p2p`);

this.ws.onopen = async () => {
  const pub = await exportPublicKey(this.keyPair.publicKey);

  this.send({
    type: 'register',
    from: this.email,
    email: this.email,
    userId: this.userId,
    publicKey: Array.from(new Uint8Array(pub)),
    timestamp: Date.now()
  });

const db = await this.openDB();
const tx = db.transaction('files', 'readonly');
const store = tx.objectStore('files');

store.openCursor().onsuccess = (e) => {
  const cursor = (e.target as any).result;
  if (!cursor) return;

  const { messageId, blob } = cursor.value;
  this.receivedFiles.set(messageId, blob);
  cursor.continue();
};

// Restore receiver transfer states (for UI + resume)
store.openCursor().onsuccess = (e) => {
  const cursor = (e.target as any).result;
  if (!cursor) return;

  const { messageId, fileName, mimeType } = cursor.value;

  this.receiverTransfers.set(messageId, {
    messageId,
    fileName,
    mimeType,
    totalChunks: 0,
    receivedChunks: new Set(),
    verifiedChunks: new Set(),
    failedChunks: new Set(),
    status: 'complete',
    reason: null,
    lastUpdated: Date.now()
  });

  cursor.continue();
};

  // Resume only from stored state
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('p2p-recv-')) continue;

    const messageId = key.replace('p2p-recv-', '');
    const received = JSON.parse(localStorage.getItem(key)!);

    const sender =
      this.transferSenders.get(messageId) ||
      localStorage.getItem(`p2p-sender-${messageId}`);

    const persisted = await this.loadChunks(messageId);
if (persisted.size) {
  this.receivedChunks.set(messageId, persisted);

  this.receiverTransfers.set(messageId, {
    messageId,
    fileName: 'unknown',
    mimeType: 'application/octet-stream',
    totalChunks: persisted.size,
    receivedChunks: new Set(persisted.keys()),
    status: 'paused',
    reason: 'NETWORK_DROP',
    lastUpdated: Date.now()
  });
}

    if (!sender) continue;

for (let i = 0; i < persisted.size; i++) {
  if (!received.includes(i)) {
    this.retryChunk(messageId, i, sender);
  }
}
  }
};

    this.ws.onmessage = async (e) => {
      const message = JSON.parse(e.data);
      await this.handle(message);
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.isRegistering = false;
for (const messageId of Array.from(this.receiverTransfers.keys())) {
  this.markReceiverPaused(messageId, 'NETWORK_DROP');
}

      if (!this.email || !this.userId) return;

      setTimeout(() => {
        this.connect(this.userId, this.email);
      }, 3000);
    };
  }

  /* ---------------------------------------------------- */
  /* ------------- GREEN SCHEDULING -------------------- */
  /* ---------------------------------------------------- */

  private async shouldDeferTransfer(): Promise<boolean> {
    const conn = (navigator as any).connection;
    if (conn?.saveData || conn?.effectiveType === '2g') return true;

    if ('getBattery' in navigator) {
      const battery = await (navigator as any).getBattery();
      if (!battery.charging && battery.level < 0.2) return true;
    }
    return false;
  }

  private resolveNetworkType(): NetworkType {
    const conn = (navigator as any).connection;
    if (!conn) return 'internet';
    if (conn.type === 'cellular') return 'mobile';
    if (conn.type === 'wifi') return 'wifi';
    return 'internet';
  }

  /* ---------------------------------------------------- */
  /* ------------------ THROTTLING --------------------- */
  /* ---------------------------------------------------- */

  private async throttle(bytes: number) {
    const bytesPerMs = (this.currentKBPS * 1024) / 1000;
    const delay = bytes / bytesPerMs;
    await new Promise(r => setTimeout(r, delay));
  }

private async carbonAwareThrottle(bytes: number) {
  const network = this.resolveNetworkType();

  const metrics = calculateCarbonMetrics(
    0,
    bytes / (1024 ** 3),
    network,
    'realistic'
  );

  // Use derived intensity instead of nonexistent carbonScore
  if (metrics.co2e > 0.05) {
    this.currentKBPS = Math.max(P2P_LIMITS.MIN_KBPS, 64);
  } else {
    this.currentKBPS = Math.min(
      P2P_LIMITS.MAX_KBPS,
      this.currentKBPS + 32
    );
  }

  await this.throttle(bytes);
}

private markReceiverPaused(messageId: string, reason: StopReason) {
  const rt = this.receiverTransfers.get(messageId);
  if (!rt) return;

  rt.status = 'paused';
  rt.reason = reason;
  rt.lastUpdated = Date.now();

  window.dispatchEvent(new CustomEvent('p2p-receiver-paused', {
    detail: {
      messageId,
      reason
    }
  }));
}

  /* ---------------------------------------------------- */
  /* ------------------ MESSAGE HANDLER ---------------- */
  /* ---------------------------------------------------- */

  private async handle(msg: StrictMessage) {
    switch (msg.type) {
      case 'registered':
        this.connected = true;
        this.isRegistering = false;
        console.log('[P2P] Successfully registered');
        break;

case 'p2p-offer': {
  const { messageId, from, data } = msg;

  // 🔔 UI text trigger
  window.dispatchEvent(
    new CustomEvent('p2p-incoming-file', {
      detail: {
        messageId,
        from,
        fileName: data.fileName,
        size: data.size,
        mimeType: data.mimeType
      }
    })
  );

  // Prepare receiver state
  this.receiverTransfers.set(messageId!, {
    messageId: messageId!,
    fileName: data.fileName,
    mimeType: data.mimeType,
    totalChunks: data.totalChunks,
    receivedChunks: new Set(),
    verifiedChunks: new Set(),
    failedChunks: new Set(),
    status: 'paused',
    reason: 'USER_PAUSED',
    lastUpdated: Date.now()
  });

  // Add to queue if not already processing
  if (!this.currentProcessingMessageId) {
    this.currentProcessingMessageId = messageId!;
    this.processNextInQueue();
  } else {
    // Add to queue
    if (!this.receiverQueue.includes(messageId!)) {
      this.receiverQueue.push(messageId!);
      window.dispatchEvent(new CustomEvent('p2p-queued', {
        detail: { messageId, fileName: data.fileName, queuePosition: this.receiverQueue.length }
      }));
    }
  }

  break;
}

case 'p2p-offer-ack': {
  const t = this.activeTransfers.get(msg.messageId!);
  if (t) {
    t.paused = false;
    t.phase = TransferPhase.SENDING;
  }
  break;
}

      case 'online-peers':
        if (Array.isArray(msg.data)) {
          this.onlinePeers.clear();
          msg.data.forEach(async (email: string) => {
            this.onlinePeers.add(email);

            if (email === this.email) return;

            // 🔐 Initiate key exchange if missing
            if (!this.sessionKeys.has(email)) {
              try {
                const eph = await crypto.subtle.generateKey(
                  { name: 'ECDH', namedCurve: 'P-256' },
                  true,
                  ['deriveKey']
                );
                this.ephemeralKeys.set(email, eph);
                const pub = await crypto.subtle.exportKey('raw', eph.publicKey);

                this.send({
                  type: 'key-exchange',
                  to: email,
                  from: this.email,
                  publicKey: Array.from(new Uint8Array(pub))
                });
              } catch (err) {
                console.error('[P2P] Key exchange init failed', err);
              }
            }
          });
        }
        break;

      case 'error':
        console.error('[P2P] Server error:', msg.message);
        if (msg.message?.includes('not found')) {
          // User doesn't exist, disconnect
          this.disconnect();
          window.dispatchEvent(new CustomEvent('p2p-auth-error', {
            detail: { message: msg.message }
          }));
        }
        break;

      case 'peer-online': {
        const peerEmail = msg.from;
        if (peerEmail) this.onlinePeers.add(peerEmail);

        // 🔐 initiate key exchange if not already done
        if (!this.sessionKeys.has(peerEmail)) {
          const eph = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            true,// MUST be extractable (public key only)
            ['deriveKey']
          );

          this.ephemeralKeys.set(peerEmail, eph);

          const pub = await crypto.subtle.exportKey('raw', eph.publicKey);

          this.send({
            type: 'key-exchange',
            to: peerEmail,
            from: this.email,
            publicKey: Array.from(new Uint8Array(pub))
          });
        }

        break;
      }

      case 'peer-offline':
        if (msg.from) {
          const from = msg.from;
          this.onlinePeers.delete(from);
          this.sessionKeys.delete(from);
          console.log('[P2P] Peer offline:', from);
        }
for (const [id, rt] of this.receiverTransfers) {
  if (this.transferSenders.get(id) === msg.from) {
    this.markReceiverPaused(id, 'SENDER_OFFLINE');
  }
}

        break;

      case 'key-exchange': {
        const peerEmail = msg.from;
        if (!peerEmail || !msg.publicKey) break;

        let eph = this.ephemeralKeys.get(peerEmail);

        // If peer initiated exchange first, generate our ephemeral key now
        if (!eph) {
          eph = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            ['deriveKey']
          );
          this.ephemeralKeys.set(peerEmail, eph);

          const pub = await crypto.subtle.exportKey('raw', eph.publicKey);
          this.send({
            type: 'key-exchange',
            to: peerEmail,
            from: this.email,
            publicKey: Array.from(new Uint8Array(pub))
          });
        }

        const peerPub = await crypto.subtle.importKey(
          'raw',
          new Uint8Array(msg.publicKey),
          { name: 'ECDH', namedCurve: 'P-256' },
          false,
          []
        );

        const sessionKey = await crypto.subtle.deriveKey(
          { name: 'ECDH', public: peerPub },
          eph.privateKey,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );

        this.sessionKeys.set(peerEmail, sessionKey);
        console.log('[P2P] Session key established with', peerEmail);
        break;
      }

      case 'chunk-ack': {
        this.adjustRate();
        const t = this.activeTransfers.get(msg.messageId!);
        if (t && msg.chunkIndex !== undefined) {
          t.missingChunks.delete(msg.chunkIndex);
          t.retryCount.delete(msg.chunkIndex);
        }
        break;
      }

      case 'file-chunk':
        if (msg.from && msg.payload) {
          await this.receiveChunk(msg.from, msg.payload);
        }
        break;

      case 'resume-request': {
        const t = this.activeTransfers.get(msg.messageId!);
        if (!t) break;

if (Array.isArray(msg.data?.received)) {
  t.missingChunks = new Set(
    [...Array(t.totalChunks).keys()]
      .filter(i => !msg.data.received.includes(i))
  );
} else if (typeof msg.chunkIndex === 'number') {
  t.missingChunks.add(msg.chunkIndex);
}
      
        t.paused = false;      
        break;
      }

case 'transfer-complete': {
  const t = this.activeTransfers.get(msg.messageId!);
  if (t) {
    t.phase = TransferPhase.DONE;
  }

  window.dispatchEvent(new CustomEvent('p2p-delivered', {
    detail: {
      messageId: msg.messageId,
      from: msg.from
    }
  }));
  break;
}

      default:
        break;
    }
  }

private dbPromise: Promise<IDBDatabase> | null = null;

private openDB(): Promise<IDBDatabase> {
  if (this.dbPromise) return this.dbPromise;

  this.dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('p2p-transfer-db', 2);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains('chunks')) {
        db.createObjectStore('chunks', {
          keyPath: ['messageId', 'chunkIndex']
        });
      }

      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', {
          keyPath: 'messageId'
        });
      }
    };

    req.onsuccess = () => {
      resolve(req.result); // ✅ CORRECT
    };

    req.onerror = () => {
      reject(req.error);
    };
  });

  return this.dbPromise;
}

private async storeChunk(messageId: string, chunkIndex: number, data: Uint8Array) {
  const db = await this.openDB();
  const tx = db.transaction('chunks', 'readwrite');
  tx.objectStore('chunks').put({ messageId, chunkIndex, data });
}

private async loadChunks(messageId: string): Promise<Map<number, Uint8Array>> {
  const db = await this.openDB();
  const tx = db.transaction('chunks', 'readonly');
  const store = tx.objectStore('chunks');

  return new Promise((resolve) => {
    const result = new Map<number, Uint8Array>();
    const cursor = store.openCursor();

    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return resolve(result);

      if (c.key[0] === messageId) {
        result.set(c.key[1], c.value.data);
      }
      c.continue();
    };
  });
}

private async clearChunks(messageId: string) {
  const db = await this.openDB();
  const tx = db.transaction('chunks', 'readwrite');
  const store = tx.objectStore('chunks');

  const cursor = store.openCursor();
  cursor.onsuccess = () => {
    const c = cursor.result;
    if (!c) return;
    if (c.key[0] === messageId) store.delete(c.key);
    c.continue();
  };
}

  /* ---------------------------------------------------- */
  /* ------------------ KEY EXCHANGE ------------------- */
  /* ---------------------------------------------------- */

  private async establishKey(peer: string, pub: number[]) {
    if (this.sessionKeys.has(peer)) return;
    const their = await importPublicKey(new Uint8Array(pub).buffer);
    const shared = await deriveSharedKey(this.keyPair.privateKey, their);
    this.sessionKeys.set(peer, shared);
  }

  /* ---------------------------------------------------- */
  /* ----------- ACK-DRIVEN RATE CONTROL ---------------- */
  /* ---------------------------------------------------- */

  private adjustRate() {
    const now = performance.now();
    const rtt = now - this.lastAckAt;
    this.lastAckAt = now;

    // Network throttle detection
    const isThrottled = rtt > 400 || this.currentKBPS <= P2P_LIMITS.MIN_KBPS + 16;
    const isLowBandwidth = this.currentKBPS < 64;

    if (rtt < 100) {
      this.currentKBPS = Math.min(this.currentKBPS + 16, P2P_LIMITS.MAX_KBPS);
    } else if (rtt > 400) {
      this.currentKBPS = Math.max(this.currentKBPS - 32, P2P_LIMITS.MIN_KBPS);
      
      // Emit throttle event
      window.dispatchEvent(new CustomEvent('p2p-network-throttle', {
        detail: { isThrottled, isLowBandwidth, currentKBPS: this.currentKBPS }
      }));
    }

    // Low bandwidth mode indicator
    if (isLowBandwidth) {
      window.dispatchEvent(new CustomEvent('p2p-low-bandwidth', {
        detail: { currentKBPS: this.currentKBPS }
      }));
    }
  }

  /* ---------------------------------------------------- */
  /* ------------------ SEND FILE ---------------------- */
  /* ---------------------------------------------------- */

  async startTransfer(recipientEmail: string | string[], files: File[], messageIds: string[]) {
    if (await this.shouldDeferTransfer()) {
      setTimeout(() => this.startTransfer(recipientEmail, files, messageIds), 30000);
      return;
    }

    // Support multiple recipients (comma-separated string or array)
    const recipients = Array.isArray(recipientEmail) 
      ? recipientEmail 
      : recipientEmail.split(',').map(e => e.trim()).filter(Boolean);

    if (recipients.length === 0) {
      throw new Error('No recipients specified');
    }

    // Start transfer for each recipient independently
    const transferPromises = recipients.map(async (recipient) => {
      const key = this.sessionKeys.get(recipient);
      if (!key) {
        console.warn(`[P2P] No session key for ${recipient}, skipping`);
        return;
      }
      
      return this.startTransferToRecipient(recipient, files, messageIds, key);
    });

    await Promise.allSettled(transferPromises);
  }

  private async startTransferToRecipient(recipientEmail: string, files: File[], messageIds: string[], key: CryptoKey) {

    let totalBytesAllFiles = 0;

    for (let index = 0; index < files.length; index++) {
  const file = files[index];
  const messageId = messageIds[index]; //Indexed loop
 
  const totalChunks = Math.ceil(file.size / P2P_LIMITS.CHUNK_SIZE);

  const missingChunks = new Set<number>();
    for (let i = 0; i < totalChunks; i++) missingChunks.add(i); 

      // 🔥 Emit initial progress event
      window.dispatchEvent(new CustomEvent('p2p-progress', {
        detail: {
          messageId,
          fileName: file.name,
          progress: 0
        }
      }));

      const transfer: TransferState = {
        messageId,
        recipientEmail,
        attachments: [file],
        missingChunks,
        totalChunks,
        progress: 0,
        bytesSent: 0,
        paused: false,  // Start immediately - don't wait
        phase: TransferPhase.SENDING, 
        retryCount: new Map(),
        lastSentAt: new Map()
      };

      this.activeTransfers.set(messageId, transfer);

const watchdog = setInterval(() => {
  const t = this.activeTransfers.get(messageId);
  if (!t) {
    clearInterval(watchdog);
    return;
  }

  if (t.phase === TransferPhase.SENDING && t.missingChunks.size > 0) {
    console.warn('[P2P] Watchdog: pending chunks', [...t.missingChunks]);
  }
}, 3000);

// ✅ NOW safe
      this.send({
         type: 'p2p-offer',
         from: this.email,
         to: recipientEmail,
         messageId,
         data: {
           fileName: file.name,
           size: file.size,
           totalChunks,
           mimeType: file.type,
  }
});

transfer.phase = TransferPhase.OFFERED;

navigator.serviceWorker?.addEventListener('message', e => {
  if (e.data?.type === 'P2P_RESUME_REQUEST') {
    this.resumeReceive(e.data.messageId);
  }
});


      const lanes = Array.from({ length: PARALLEL_LANES }, async (_, lane) => {
        for (let i = lane; i < totalChunks; i += PARALLEL_LANES) {
          // Skip if ACKed
if (!transfer.missingChunks.has(i)) continue;

const lastSent = transfer.lastSentAt.get(i);
if (lastSent && Date.now() - lastSent < ACK_TIMEOUT_MS) continue;

// ✅ reserve only when actually sending
transfer.missingChunks.delete(i);

          // Check pause state
while (transfer.paused) {
  window.dispatchEvent(new CustomEvent('p2p-paused', {
    detail: {
      messageId,
      reason: 'USER_PAUSED'
    }
  }));
  await new Promise(r => setTimeout(r, 300));
}

          const start = i * P2P_LIMITS.CHUNK_SIZE;
          const end = Math.min(start + P2P_LIMITS.CHUNK_SIZE, file.size);
          const buffer = await file.slice(start, end).arrayBuffer();

          await this.carbonAwareThrottle(buffer.byteLength);
          const checksum = await sha256(buffer);

          const encrypted = await encrypt(key, {
            messageId,
            fileName: file.name,
            mimeType: file.type,
            chunkIndex: i,
            totalChunks,
            checksum,
            chunk: Array.from(new Uint8Array(buffer))
          });

          this.send({
            type: 'file-chunk',
            from: this.email,
            to: recipientEmail,
            payload: encrypted,
            messageId // 🔥 Add messageId to message
          });

          transfer.lastSentAt.set(i, Date.now());
          transfer.bytesSent += buffer.byteLength;
          transfer.progress = Math.round(
            (transfer.bytesSent / file.size) * 100
          );

          // Calculate send speed
          const now = Date.now();
          let speed = this.sendSpeed.get(messageId);
          if (!speed) {
            speed = { lastBytes: transfer.bytesSent, lastTime: now, speedBps: 0 };
            this.sendSpeed.set(messageId, speed);
          } else {
            const deltaBytes = transfer.bytesSent - speed.lastBytes;
            const deltaTime = (now - speed.lastTime) / 1000;
            if (deltaTime > 0) {
              speed.speedBps = deltaBytes / deltaTime;
            }
            speed.lastBytes = transfer.bytesSent;
            speed.lastTime = now;
          }

          // Calculate ETA
          const remainingBytes = file.size - transfer.bytesSent;
          const etaSeconds = speed.speedBps > 0 
            ? Math.ceil(remainingBytes / speed.speedBps)
            : null;

          // 🔥 Emit progress event with speed and ETA
          window.dispatchEvent(new CustomEvent('p2p-progress', {
            detail: {
              messageId,
              fileName: file.name,
              progress: transfer.progress,
              speedBps: speed.speedBps,
              etaSeconds
            }
          }));
        }
      });

      await Promise.all(lanes);

      // Wait until all chunks are ACKed
      while (transfer.missingChunks.size > 0) {
        await new Promise(r => setTimeout(r, 500));
      }

      totalBytesAllFiles += file.size;

clearInterval(watchdog);
this.transferSenders.delete(messageId);
this.activeTransfers.delete(messageId);

      // 🔥 Emit completion event
      window.dispatchEvent(new CustomEvent('p2p-delivered', {
        detail: {
          messageId,
          fileName: file.name
        }
      }));
    }

    // Carbon credit calculation
    const gbTransferred = totalBytesAllFiles / (1024 ** 3);
    const metrics = calculateCarbonMetrics(
      0,
      gbTransferred,
      this.resolveNetworkType(),
      'gamified'
    );

    window.dispatchEvent(new CustomEvent('carbon-earned', { detail: metrics }));
  }

  /* ---------------------------------------------------- */
  /* ------------------ QUEUE SYSTEM -------------------- */
  /* ---------------------------------------------------- */

  private processNextInQueue() {
    if (this.currentProcessingMessageId) {
      // Still processing current file
      return;
    }

    if (this.receiverQueue.length === 0) {
      return;
    }

    const nextMessageId = this.receiverQueue.shift()!;
    this.currentProcessingMessageId = nextMessageId;

    const rt = this.receiverTransfers.get(nextMessageId);
    if (rt) {
      rt.status = 'receiving';
      rt.reason = null;
      
      window.dispatchEvent(new CustomEvent('p2p-transfer-started', {
        detail: { messageId: nextMessageId, fileName: rt.fileName }
      }));
    }
  }

  private onTransferComplete(messageId: string) {
    if (this.currentProcessingMessageId === messageId) {
      this.currentProcessingMessageId = null;
      this.processNextInQueue();
    }
  }

  /* ---------------------------------------------------- */
  /* ------------------ RECEIVE SIDE ------------------- */
  /* ---------------------------------------------------- */

private async receiveChunk(from: string, payload: EncryptedPayload) {
  const key = this.sessionKeys.get(from);
  if (!key) return;

  const data = await decrypt(key, payload);
  const {
    messageId,
    chunkIndex,
    totalChunks,
    chunk,
    fileName,
    mimeType,
    checksum
  } = data;

  this.transferSenders.set(messageId, from);
  localStorage.setItem(`p2p-sender-${messageId}`, from);

const rawChunk = new Uint8Array(chunk);
const encrypted = await encryptChunkAES(key, rawChunk);

  const raw = new Uint8Array(chunk).buffer;
  const verify = await sha256(raw);

if (verify !== checksum) {
  let rt = this.receiverTransfers.get(messageId);
  if (rt) {
    rt.failedChunks.add(chunkIndex);
  }

  this.send({
    type: 'resume-request',
    to: from,
    messageId,
    chunkIndex
  });
  return;
}

  if (!this.receivedChunks.has(messageId)) {
    this.receivedChunks.set(messageId, new Map());
  }

  const chunkData = new Uint8Array(chunk);
  this.receivedChunks.get(messageId)!.set(chunkIndex, chunkData);
  await this.storeChunk(messageId, chunkIndex, chunkData);

  let rt = this.receiverTransfers.get(messageId);
  if (!rt) {
    rt = {
      messageId,
      fileName,
      mimeType: mimeType || 'application/octet-stream',
      totalChunks,
      receivedChunks: new Set(),
      verifiedChunks: new Set(),
      failedChunks: new Set(),
      status: 'receiving',
      reason: null,
      lastUpdated: Date.now()
    };
    this.receiverTransfers.set(messageId, rt);
  }

  rt.receivedChunks.add(chunkIndex);
  rt.verifiedChunks.add(chunkIndex);
  rt.lastUpdated = Date.now();

const now = Date.now();
const bytesReceived = rt.receivedChunks.size * P2P_LIMITS.CHUNK_SIZE;

let speed = this.receiveSpeed.get(messageId);
if (!speed) {
  speed = { lastBytes: bytesReceived, lastTime: now, speedBps: 0 };
  this.receiveSpeed.set(messageId, speed);
} else {
  const deltaBytes = bytesReceived - speed.lastBytes;
  const deltaTime = (now - speed.lastTime) / 1000;
  if (deltaTime > 0) {
    speed.speedBps = deltaBytes / deltaTime;
  }
  speed.lastBytes = bytesReceived;
  speed.lastTime = now;
}

const remainingBytes =
  (totalChunks - rt.receivedChunks.size) * P2P_LIMITS.CHUNK_SIZE;

const etaSeconds =
  speed.speedBps > 0
    ? Math.ceil(remainingBytes / speed.speedBps)
    : null;

  // ✅ EMIT PROGRESS (UI + ETA + Speed)
  window.dispatchEvent(new CustomEvent('p2p-receiver-progress', {
    detail: {
      messageId,
      received: rt.receivedChunks.size,
      total: totalChunks,
      percentage: Math.floor((rt.receivedChunks.size / totalChunks) * 100),
      status: rt.status,
      timestamp: Date.now(),
      etaSeconds,
      speedBps: speed.speedBps
    }
  }));

  this.send({
    type: 'chunk-ack',
    to: from,
    messageId,
    chunkIndex,
    timestamp: Date.now()
  });

  localStorage.setItem(
    `p2p-recv-${messageId}`,
    JSON.stringify([...rt.receivedChunks])
  );

if (rt.receivedChunks.size === totalChunks) {
  await this.assembleFile(messageId, fileName, mimeType);
  this.onTransferComplete(messageId);
} else if (rt.failedChunks.size > 0) {
  rt.status = 'failed';

  window.dispatchEvent(
    new CustomEvent('p2p-receiver-failed', {
      detail: {
        messageId,
        failedChunks: [...rt.failedChunks]
      }
    })
  );
}
}

private chunkRetries = new Map<string, number>();
private readonly MAX_RETRIES_PER_CHUNK = 5;

private retryChunk(messageId: string, chunkIndex: number, to: string) {
  const key = `${messageId}:${chunkIndex}`;
  const count = this.chunkRetries.get(key) ?? 0;

  if (count >= this.MAX_RETRIES_PER_CHUNK) {
    console.error('[P2P] Chunk permanently aborted:', key);

window.dispatchEvent(new CustomEvent('p2p-transfer-failed', {
  detail: {
    messageId,
    reason: 'CHUNK_RETRY_EXCEEDED'
  }
}));
return;
}
  this.chunkRetries.set(key, count + 1);

  this.send({
    type: 'resume-request',
    to,
    messageId,
    chunkIndex
  });
}

// ============================================================================
// FIX 1: Update p2pService.ts - assembleFile method
// ============================================================================

private async assembleFile(
  messageId: string,
  fileName: string,
  mimeType: string
) {
  const chunks = await this.loadChunks(messageId);
  if (!chunks || chunks.size === 0) return;

  const ordered = Array.from(chunks.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, data]) => data);

  const blob = new Blob(ordered, {
    type: mimeType || 'application/octet-stream'
  });

  // Persist
  const db = await this.openDB();
  const tx = db.transaction('files', 'readwrite');
  tx.objectStore('files').put({ messageId, fileName, mimeType, blob });
  await new Promise(res => (tx.oncomplete = () => res(true)));

  this.receivedFiles.set(messageId, blob);

  const rt = this.receiverTransfers.get(messageId);
  if (rt) rt.status = 'complete';

  window.dispatchEvent(new CustomEvent('p2p-file-ready', {
    detail: { messageId, fileName }
  }));

  await this.clearChunks(messageId);
}

  /* ---------------------------------------------------- */
  /* ------------------ UTIL ---------------------------- */
  /* ---------------------------------------------------- */

  private send(msg: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect() {
    this.ws?.close(1000);
    this.connected = false;
    this.sessionKeys.clear();
    this.onlinePeers.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }

isRecipientOnline(email: string): boolean {
  return this.onlinePeers.has(email);
}


// ============================================================================
// FIX 2: Update downloadReceivedFile method
// ============================================================================

async downloadReceivedFile(messageId: string, fileName: string) {
  console.log('[P2P] Download requested for:', messageId, fileName);
  
  let blob = this.receivedFiles.get(messageId);

  if (!blob) {
    console.log('[P2P] File not in memory, checking IndexedDB...');
    try {
      const db = await this.openDB();
      const tx = db.transaction('files', 'readonly');
      const store = tx.objectStore('files');
      const record = await new Promise<any>((resolve, reject) => {
        const req = store.get(messageId);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      if (record?.blob) {
        blob = record.blob;
        this.receivedFiles.set(messageId, blob);
        console.log('[P2P] File retrieved from IndexedDB:', blob.size, 'bytes');
      }
    } catch (error) {
      console.error('[P2P] Failed to retrieve file from IndexedDB:', error);
    }
  }

  if (!blob) {
    console.error('[P2P] Download failed, blob missing:', messageId);
    
    window.dispatchEvent(new CustomEvent('p2p-download-failed', {
      detail: { messageId, fileName, error: 'File not found in storage' }
    }));
    return;
  }

  try {
    console.log('[P2P] Creating download for:', fileName, blob.size, 'bytes', blob.type);
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    
    // Trigger download
    a.click();
    
    console.log('[P2P] Download triggered successfully');
    
    // Cleanup after a delay
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);

    // Notify UI that download succeeded
    window.dispatchEvent(new CustomEvent('p2p-download-success', {
      detail: { messageId, fileName, size: blob.size }
    }));

  } catch (error) {
    console.error('[P2P] Download error:', error);
    
    window.dispatchEvent(new CustomEvent('p2p-download-failed', {
      detail: { 
        messageId, 
        fileName, 
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }));
  }
}

// ============================================================================
// FIX 3: Add method to check if file exists
// ============================================================================

async hasReceivedFile(messageId: string): Promise<boolean> {
  if (this.receivedFiles.has(messageId)) {
    return true;
  }

  try {
    const db = await this.openDB();
    const tx = db.transaction('files', 'readonly');
    const store = tx.objectStore('files');
    const record = await new Promise<any>((resolve, reject) => {
      const req = store.get(messageId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return !!record?.blob;
  } catch (error) {
    console.error('[P2P] Error checking for file:', error);
    return false;
  }
}
}

/* ---------------------------------------------------- */
/* ------------------ SINGLETON ------------------------ */
/* ---------------------------------------------------- */

export const p2pService = new StrictP2PService();

window.addEventListener('beforeunload', () => {
  p2pService.disconnect();
});

window.addEventListener('p2p-retry-transfer', (e: any) => {
  const { messageId } = e.detail;
  const rt = p2pService.receiverTransfers.get(messageId);
  if (!rt) return;

  rt.failedChunks.clear();
  rt.status = 'receiving';

  const sender = p2pService.transferSenders.get(messageId);
  if (sender) {
    p2pService.send({
      type: 'resume-request',
      to: sender,
      messageId
    });
  }
});

window.addEventListener('p2p-download-file', async (e: any) => {
  const { messageId, fileName } = e.detail;
  console.log('[P2P] Download event received:', messageId, fileName);
  
  // Check single-download policy
  if (enhancedP2PService.hasBeenDownloaded(messageId)) {
    console.warn('[P2P] File already downloaded:', messageId);
    window.dispatchEvent(new CustomEvent('p2p-download-failed', {
      detail: { 
        messageId, 
        fileName, 
        error: 'This file can only be downloaded once for security reasons.'
      }
    }));
    return;
  }
  
  const hasFile = await p2pService.hasReceivedFile(messageId);
  
  if (hasFile) {
    await p2pService.downloadReceivedFile(messageId, fileName);
    
    // Record the download
    const userId = localStorage.getItem('userId') || 'unknown';
    enhancedP2PService.recordDownload(messageId, fileName, userId);
  } else {
    console.error('[P2P] File not found for messageId:', messageId);
    window.dispatchEvent(new CustomEvent('p2p-download-failed', {
      detail: { 
        messageId, 
        fileName, 
        error: 'File not found. It may have been deleted or never received.'
      }
    }));
  }
});

// Helper to mark P2P transfer as delivered in database
async function markP2PDelivered(messageId: string) {
  try {
    const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
    await fetch(`${API_BASE}/api/p2p/delivered`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p2p_message_id: messageId })
    });
    console.log('[P2P] Marked as delivered in DB:', messageId);
  } catch (err) {
    console.error('[P2P] Failed to update delivered status:', err);
  }
}

// Receiver: File is ready for download
window.addEventListener('p2p-file-ready', async (e: any) => {
  const { messageId, fileName } = e.detail;
  console.log('[P2P] File ready for download:', messageId, fileName);
  await markP2PDelivered(messageId);
});

// Sender: Transfer confirmed complete by receiver
window.addEventListener('p2p-delivered', async (e: any) => {
  const { messageId } = e.detail;
  console.log('[P2P] Transfer confirmed delivered:', messageId);
  await markP2PDelivered(messageId);
});

// Handle download errors (replaces alert())
window.addEventListener('p2p-download-error', (e: any) => {
  const { error } = e.detail;
  console.warn('[P2P] Download error:', error);
  // Import toast dynamically to avoid circular deps
  import('react-hot-toast').then(({ default: toast }) => {
    toast.error(error || 'P2P file not available');
  });
});

window.addEventListener('p2p-video-stream-init', (e: any) => {
  const { mediaSource, messageId } = e.detail;
  const video = document.querySelector(`video[data-message-id="${messageId}"]`) as HTMLVideoElement;
  if (video) {
    video.src = URL.createObjectURL(mediaSource);
  }
});
window.addEventListener('p2p-accept-file', (e: any) => {
  const { messageId } = e.detail;
const transfer = p2pService.activeTransfers.get(messageId);
if (transfer) {
  transfer.paused = false;
}
});

