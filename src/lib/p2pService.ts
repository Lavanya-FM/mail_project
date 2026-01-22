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
  BASE_KBPS: 999999,    // Unlimited - no throttling
  MIN_KBPS: 999999,     // Unlimited - no throttling  
  MAX_KBPS: 999999,     // Unlimited - no throttling
  CHUNK_SIZE: 512 * 1024, // 512 KB chunks for faster transfer
};

// Helper functions for base64 encoding/decoding binary data
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 32768; // Process in chunks to avoid call stack issues
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

const MAX_RETRIES_PER_CHUNK = 5;
const chunkRetries = new Map<string, number>();

// Maximum parallel lanes for fastest transfer
const PARALLEL_LANES = navigator.hardwareConcurrency >= 4 ? 16 : 12;

const ACK_TIMEOUT_MS = 500; // Very fast ACK timeout

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
  private myPublicKeyBytes: Uint8Array | null = null;
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

  // --- Pending chunks (arrived before key exchange) ---
  private pendingChunks = new Map<string, Array<{ from: string; payload: EncryptedPayload }>>();

  hasSessionKey(email: string): boolean {
    return this.sessionKeys.has(email);
  }

  // Synchronous check using in-memory cache (fast path for UI)
  hasReceivedFileSync(messageId: string): boolean {
    return this.receivedFiles.has(messageId);
  }

  isPeerOnline(email: string): boolean {
    return this.onlinePeers.has(email);
  }

  public getOnlinePeers(): string[] {
    return Array.from(this.onlinePeers);
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


  async resumeReceive(messageId: string, senderEmail?: string) {
    console.log('[P2P] Resume receive requested for', messageId, 'senderEmail:', senderEmail);

    // First check if file is already complete
    const hasFile = await this.hasReceivedFile(messageId);
    if (hasFile) {
      console.log('[P2P] File already complete for', messageId);
      // Ensure UI is updated to 100%
      window.dispatchEvent(new CustomEvent('p2p-receiver-progress', {
        detail: { messageId, percentage: 100, received: 100, total: 100, status: 'complete' }
      }));
      window.dispatchEvent(new CustomEvent('p2p-file-ready', { detail: { messageId, fileName: (await getMeta(messageId))?.fileName } }));
      return;
    }

    // ✅ FIX: Try multiple sources for sender email
    let sender = senderEmail
      || this.transferSenders.get(messageId)
      || localStorage.getItem(`p2p-sender-${messageId}`);

    // If we have a sender, store it for future use
    if (sender && !this.transferSenders.has(messageId)) {
      this.transferSenders.set(messageId, sender);
      localStorage.setItem(`p2p-sender-${messageId}`, sender);
    }

    const meta = await getMeta(messageId);
    if (!meta) {
      console.warn('[P2P] No metadata found for', messageId, '- requesting from sender');

      if (sender && this.isPeerOnline(sender)) {
        // Request metadata by sending a resume-request
        this.send({
          type: 'resume-request',
          to: sender,
          from: this.email,
          messageId: messageId,
          requestType: 'metadata'
        });
        console.log('[P2P] Requested metadata for', messageId, 'from', sender);
      } else {
        console.warn('[P2P] Cannot request metadata - sender offline or unknown:', sender);
        // Don't return early - try to continue with missing chunks request
      }
      // Continue to check for missing chunks even if metadata is missing
    }

    // If we still don't have metadata, we can't proceed
    if (!meta) {
      return;
    }

    const received = await getReceivedChunkIndexes(messageId);
    const missing: number[] = [];

    for (let i = 0; i < meta.totalChunks; i++) {
      if (!received.includes(i)) missing.push(i);
    }

    // 🔴 HARD STOP
    if (missing.length === 0) {
      console.log('[P2P] All chunks already received for', messageId);
      // Try to assemble the file
      const rt = this.receiverTransfers.get(messageId);
      if (rt) {
        await this.assembleFile(messageId, rt.fileName, rt.mimeType);
      }
      return;
    }

    // ✅ FIX: Ensure we have sender before requesting missing chunks
    if (!sender) {
      console.warn('[P2P] Cannot request missing chunks - sender unknown for', messageId);
      return;
    }

    console.log('[P2P] Requesting', missing.length, 'missing chunks for', messageId, 'from', sender);
    missing.forEach(idx => this.retryChunk(messageId, idx, sender));
  }

  async getPreviewURL(messageId: string): Promise<string | null> {
    const blob = await this.getReceivedBlob(messageId);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }

  async getReceivedBlob(messageId: string): Promise<Blob | null> {
    if (this.receivedFiles.has(messageId)) {
      return this.receivedFiles.get(messageId)!;
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

      if (record?.blob) {
        this.receivedFiles.set(messageId, record.blob);
        return record.blob;
      }
    } catch (e) {
      console.error('[P2P] Failed to load blob for preview', e);
    }

    return null;
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

    // Cache public key
    const rawKey = await exportPublicKey(this.keyPair.publicKey);
    this.myPublicKeyBytes = new Uint8Array(rawKey);

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
    // Never defer - always transfer immediately
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
    // No throttling - maximum speed
    return;
  }

  private async carbonAwareThrottle(bytes: number) {
    // No throttling - send at maximum speed
    return;
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

        console.log('[P2P] Offer received:', messageId, 'from', from);

        // ✅ FIX: Store sender for this messageId
        if (from && messageId) {
          this.transferSenders.set(messageId, from);
          localStorage.setItem(`p2p-sender-${messageId}`, from);
        }

        // 1️⃣ PREPARE RECEIVER STATE FIRST
        this.receiverTransfers.set(messageId!, {
          messageId: messageId!,
          fileName: data.fileName,
          mimeType: data.mimeType,
          totalChunks: data.totalChunks,
          receivedChunks: new Set(),
          verifiedChunks: new Set(),
          failedChunks: new Set(),
          status: 'receiving',
          reason: null,
          lastUpdated: Date.now()
        });

        // 2️⃣ **ACK IMMEDIATELY — THIS IS THE MISSING PIECE**
        this.send({
          type: 'p2p-offer-ack',
          to: from,
          from: this.email,
          messageId: messageId!
        });

        console.log('[P2P] Offer ACK sent for', messageId);

        // 3️⃣ THEN notify UI (NON-BLOCKING)
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

        break;
      }

      case 'p2p-offer-ack': {
        const t = this.activeTransfers.get(msg.messageId!);
        if (t) {
          t.paused = false;
          t.phase = TransferPhase.SENDING;
          // Transfer already started, this confirms receiver is ready
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
          window.dispatchEvent(new CustomEvent('p2p-peers-updated', {
            detail: { peers: Array.from(this.onlinePeers) }
          }));
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

        // ✅ NEW: Auto-resume any pending receives for this peer
        if (peerEmail) {
          for (const [messageId, senderEmail] of this.transferSenders.entries()) {
            if (senderEmail === peerEmail) {
              const rt = this.receiverTransfers.get(messageId);
              // Only auto-resume if not already complete
              if (rt && rt.status !== 'complete') {
                console.log('[P2P] Peer came online, auto-resuming receive for', messageId, 'from', peerEmail);
                // Fire and forget – resume on background
                this.resumeReceive(messageId, peerEmail).catch(err => {
                  console.warn('[P2P] Auto-resume failed for', messageId, err);
                });
              }
            }
          }
        }

        window.dispatchEvent(new CustomEvent('p2p-peers-updated', {
          detail: { peers: Array.from(this.onlinePeers) }
        }));

        break;
      }

      case 'peer-offline':
        if (msg.from) {
          const from = msg.from;
          this.onlinePeers.delete(from);
          this.sessionKeys.delete(from);
          console.log('[P2P] Peer offline:', from);
          window.dispatchEvent(new CustomEvent('p2p-peers-updated', {
            detail: { peers: Array.from(this.onlinePeers) }
          }));
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

        // Process any pending chunks that arrived before key exchange
        const pending = this.pendingChunks.get(peerEmail);
        if (pending && pending.length > 0) {
          console.log(`[P2P] Processing ${pending.length} queued chunks from ${peerEmail}`);
          const chunksToProcess = [...pending];
          this.pendingChunks.delete(peerEmail);

          // Process chunks asynchronously
          for (const { from, payload } of chunksToProcess) {
            this.receiveChunk(from, payload).catch(err => {
              console.error('[P2P] Error processing queued chunk:', err);
            });
          }
        }
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
          console.log('[P2P] Received file-chunk from', msg.from, 'messageId:', msg.messageId);
          await this.receiveChunk(msg.from, msg.payload);
        } else {
          console.warn('[P2P] Invalid file-chunk message:', msg);
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
        // Forward unknown messages (like CALL_EVENT) to other listeners
        window.dispatchEvent(new CustomEvent('p2p-message', { detail: msg }));
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
        const db = req.result;

        // Safety check: if stores are missing (old/corrupt DB), recreate database
        const hasChunks = db.objectStoreNames.contains('chunks');
        const hasFiles = db.objectStoreNames.contains('files');

        if (!hasChunks || !hasFiles) {
          console.warn('[P2P] IndexedDB schema mismatch. Resetting p2p-transfer-db.');
          db.close();
          const delReq = indexedDB.deleteDatabase('p2p-transfer-db');
          delReq.onsuccess = () => {
            // Clear cached promise and reopen
            this.dbPromise = undefined as any;
            this.openDB().then(resolve).catch(reject);
          };
          delReq.onerror = () => {
            reject(delReq.error);
          };
          return;
        }

        resolve(db);
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
    // No rate limiting - always use maximum speed
    this.lastAckAt = performance.now();
    this.currentKBPS = P2P_LIMITS.MAX_KBPS;
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

      navigator.serviceWorker?.addEventListener('message', e => {
        if (e.data?.type === 'P2P_RESUME_REQUEST') {
          this.resumeReceive(e.data.messageId);
        }
      });

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

      // Start sending immediately (receiver auto-accepts)
      // Small delay to ensure offer is processed
      await new Promise(r => setTimeout(r, 100));
      transfer.phase = TransferPhase.SENDING;
      transfer.paused = false;

      navigator.serviceWorker?.addEventListener('message', e => {
        if (e.data?.type === 'P2P_RESUME_REQUEST') {
          this.resumeReceive(e.data.messageId);
        }
      });
      self.addEventListener('sync', event => {
        if (event.tag.startsWith('p2p-resume-')) {
          const messageId = event.tag.replace('p2p-resume-', '');

          event.waitUntil(
            self.clients.matchAll().then(clients => {
              clients.forEach(client =>
                client.postMessage({
                  type: 'P2P_RESUME_REQUEST',
                  messageId
                })
              );
            })
          );
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

          // Check pause state (skip if not paused)
          if (transfer.paused) {
            window.dispatchEvent(new CustomEvent('p2p-paused', {
              detail: { messageId, reason: 'USER_PAUSED' }
            }));
            while (transfer.paused) {
              await new Promise(r => setTimeout(r, 50));
            }
          }

          const start = i * P2P_LIMITS.CHUNK_SIZE;
          const end = Math.min(start + P2P_LIMITS.CHUNK_SIZE, file.size);
          const buffer = await file.slice(start, end).arrayBuffer();

          await this.carbonAwareThrottle(buffer.byteLength);
          const checksum = await sha256(buffer);

          // Use base64 encoding for much smaller payload size
          const encrypted = await encrypt(key, {
            messageId,
            fileName: file.name,
            mimeType: file.type,
            chunkIndex: i,
            totalChunks,
            checksum,
            chunkBase64: arrayBufferToBase64(buffer), // base64 instead of number array
            isBase64: true // flag to indicate new format
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

      // Wait until all chunks are ACKed (minimal wait)
      let waitCount = 0;
      while (transfer.missingChunks.size > 0 && waitCount < 100) {
        await new Promise(r => setTimeout(r, 10)); // Very fast polling
        waitCount++;
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
    if (!key) {
      console.warn('[P2P] No session key for', from, '- queuing chunk for later decryption');
      // Queue chunk until key exchange completes
      if (!this.pendingChunks.has(from)) {
        this.pendingChunks.set(from, []);
      }
      this.pendingChunks.get(from)!.push({ from, payload });

      // Trigger key exchange if not already in progress
      if (!this.sessionKeys.has(from)) {
        this.send({
          type: 'key-exchange',
          to: from,
          from: this.email,
          publicKey: Array.from(this.myPublicKeyBytes || new Uint8Array())
        });
      }
      return;
    }

    let data;
    try {
      data = await decrypt(key, payload);
    } catch (err) {
      console.error('[P2P] Decryption failed:', err);
      return;
    }

    const {
      messageId,
      chunkIndex,
      totalChunks,
      chunk,
      chunkBase64,
      isBase64,
      fileName,
      mimeType,
      checksum
    } = data;

    this.transferSenders.set(messageId, from);
    localStorage.setItem(`p2p-sender-${messageId}`, from);

    // Handle both old (array) and new (base64) formats
    let rawChunk: Uint8Array;
    if (isBase64 && chunkBase64) {
      rawChunk = new Uint8Array(base64ToArrayBuffer(chunkBase64));
    } else if (chunk) {
      rawChunk = new Uint8Array(chunk);
    } else {
      console.error('[P2P] No chunk data received');
      return;
    }

    const raw = rawChunk.buffer;
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

    this.receivedChunks.get(messageId)!.set(chunkIndex, rawChunk);
    await this.storeChunk(messageId, chunkIndex, rawChunk);

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

    console.log('[P2P] Chunk received:', chunkIndex, '/', totalChunks, 'for', messageId, 'Total received:', rt.receivedChunks.size);

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
      window.dispatchEvent(new CustomEvent('p2p-transfer-failed', {
        detail: {
          messageId,
          reason: 'CHUNK_RETRY_EXCEEDED'
        }
      }));
      return;
    }

    this.chunkRetries.set(key, count + 1);

    const backoffMs = Math.min(1000 * Math.pow(2, count), 30000);

    setTimeout(() => {
      this.send({
        type: 'resume-request',
        to,
        messageId,
        chunkIndex
      });
    }, backoffMs);
  }


  // ============================================================================
  // FIX 1: Update p2pService.ts - assembleFile method
  // ============================================================================

  private async assembleFile(
    messageId: string,
    fileName: string,
    mimeType: string
  ) {
    // 🔒 HARD STOP if already assembled
    if (this.receivedFiles.has(messageId)) return;

    const chunks = await this.loadChunks(messageId);
    if (!chunks || chunks.size === 0) return;

    const ordered = Array.from(chunks.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, data]) => data);

    const blob = new Blob(ordered, {
      type: mimeType || 'application/octet-stream'
    });

    // Persist to IndexedDB
    const db = await this.openDB();
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put({
      messageId,
      fileName,
      mimeType,
      blob,
      completedAt: Date.now() // 🔑 terminal marker
    });
    await new Promise(res => (tx.oncomplete = () => res(true)));

    // 🔒 Lock completion in memory
    this.receivedFiles.set(messageId, blob);

    const rt = this.receiverTransfers.get(messageId);
    if (rt) {
      rt.status = 'complete';
      rt.reason = null;
      rt.lastUpdated = Date.now();
    }

    // 🔥 SINGLE FINAL EVENT
    window.dispatchEvent(new CustomEvent('p2p-file-ready', {
      detail: {
        messageId,
        fileName,
        status: 'complete'
      }
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
  // --- PUBLIC CONTROL METHODS ---
  public retryTransfer(messageId: string) {
    const rt = this.receiverTransfers.get(messageId);
    if (!rt) return;

    rt.failedChunks.clear();
    rt.status = 'receiving';

    const sender = this.transferSenders.get(messageId);
    if (sender) {
      this.send({
        type: 'resume-request',
        to: sender,
        messageId
      });
    }
  }

  public resumeSending(messageId: string) {
    const transfer = this.activeTransfers.get(messageId);
    if (transfer) {
      transfer.paused = false;
    }
  }

  public async sendFiles(to: string, files: File[]) {
    if (!this.connected) {
      console.warn('[P2P] Cannot send files - not connected');
      return;
    }

    for (const file of files) {
      const messageId = crypto.randomUUID();
      const totalChunks = Math.ceil(file.size / P2P_LIMITS.CHUNK_SIZE);

      this.activeTransfers.set(messageId, {
        messageId,
        recipientEmail: to,
        attachments: [file], // Store file
        missingChunks: new Set(),
        totalChunks,
        progress: 0,
        bytesSent: 0,
        paused: false,
        phase: TransferPhase.OFFERED,
        retryCount: new Map(),
        lastSentAt: new Map()
      });

      console.log('[P2P] Sending file offer:', file.name, 'to', to);

      // Trigger offer
      this.send({
        type: 'p2p-offer',
        to,
        from: this.email,
        messageId,
        data: {
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
          totalChunks
        }
      });

      // The actual chunk sending starts when 'p2p-offer-ack' is received
    }
  }

  public sendChat(to: string, content: string) {
    this.send({
      type: 'secure-message',
      to,
      from: this.email,
      payload: { content, timestamp: Date.now() }
    });
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
  p2pService.retryTransfer(messageId);
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
  // Show error using a custom event that UI components listen to
  window.dispatchEvent(new CustomEvent('show-toast', {
    detail: { type: 'error', message: error || 'P2P file not available' }
  }));
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
  p2pService.resumeSending(messageId);
});

