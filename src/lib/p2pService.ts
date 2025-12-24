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

/* ---------------------------------------------------- */
/* -------------------- CONSTANTS --------------------- */
/* ---------------------------------------------------- */

const P2P_LIMITS = {
  BASE_KBPS: 256,
  MIN_KBPS: 32,
  MAX_KBPS: 512,
  CHUNK_SIZE: 64 * 1024,
};

const ACK_TIMEOUT_MS = 3000;

type NetworkType = 'internet' | 'mobile' | 'wifi';

/* ---------------------------------------------------- */
/* -------------------- TYPES ------------------------- */
/* ---------------------------------------------------- */

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

interface TransferState {
  messageId: string;
  recipientEmail: string;
  attachments: File[];
  missingChunks: Set<number>,
  totalChunks: number;
  progress: number;
  bytesSent: number;
  paused: boolean;
  lastSentAt: Map<number, number>;
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ---------------------------------------------------- */
/* ------------------ SERVICE -------------------------- */
/* ---------------------------------------------------- */

class StrictP2PService {
  private ws: WebSocket | null = null;
  private email = '';
  private userId: string | number = '';
  private connected = false;
  private isRegistering = false;

  private keyPair!: CryptoKeyPair;
  private onlinePeers = new Set<string>();

  private sessionKeys = new Map<string, CryptoKey>();
  private ephemeralKeys = new Map<string, CryptoKeyPair>();

  private activeTransfers = new Map<string, TransferState>();
  private transferSenders = new Map<string, string>();
 
  // --- ACK-driven throttling ---
  private currentKBPS = P2P_LIMITS.BASE_KBPS;
  private lastAckAt = performance.now();

  // --- Receive buffer ---
  private receivedChunks = new Map<string, Map<number, Uint8Array>>();

  hasSessionKey(email: string): boolean {
    return this.sessionKeys.has(email);
  }

  isPeerOnline(email: string): boolean {
    return this.onlinePeers.has(email);
  }

  pauseTransfer(messageId: string) {
    const transfer = this.activeTransfers.get(messageId);
    if (transfer) {
      transfer.paused = true;
      console.log('[P2P] Transfer paused:', messageId);
    }
  }

  resumeTransfer(messageId: string) {
    const transfer = this.activeTransfers.get(messageId);
    if (transfer) {
      transfer.paused = false;
      console.log('[P2P] Transfer resumed:', messageId);
    }
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

    // Resume only from stored state
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith('p2p-recv-')) continue;

      const messageId = key.replace('p2p-recv-', '');
      const received = JSON.parse(localStorage.getItem(key)!);

      const sender =
        this.transferSenders.get(messageId) ||
        localStorage.getItem(`p2p-sender-${messageId}`);

      if (!sender) continue;

      this.send({
        type: 'resume-request',
        to: sender,
        messageId,
        data: { received }
      });
    }
  };

  this.ws.onmessage = async (e) => {
    const message = JSON.parse(e.data);
    await this.handle(message);
  };

  this.ws.onclose = () => {
    this.connected = false;
    this.isRegistering = false;

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

      case 'online-peers':
         if (Array.isArray(msg.data)) {
         this.onlinePeers.clear();
         msg.data.forEach((email: string) => this.onlinePeers.add(email));
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
          this.onlinePeers.delete(msg.from);
          this.sessionKeys.delete(msg.from);
          console.log('[P2P] Peer offline:', msg.from);
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

if (msg.data?.received) {
  t.missingChunks.clear();
  for (let i = 0; i < t.totalChunks; i++) {
    if (!msg.data.received.includes(i)) {
      t.missingChunks.add(i);
    }
  }
} else if (msg.chunkIndex !== undefined) {
    t.missingChunks.add(msg.chunkIndex);
  }
  break;
}

case 'transfer-complete':
  window.dispatchEvent(new CustomEvent('p2p-delivered', {
    detail: {
      messageId: msg.messageId,
      from: msg.from
    }
  }));
  break;
    }
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

    if (rtt < 100) {
      this.currentKBPS = Math.min(this.currentKBPS + 16, P2P_LIMITS.MAX_KBPS);
    } else if (rtt > 400) {
      this.currentKBPS = Math.max(this.currentKBPS - 32, P2P_LIMITS.MIN_KBPS);
    }
  }

  /* ---------------------------------------------------- */
  /* ------------------ SEND FILE ---------------------- */
  /* ---------------------------------------------------- */

async startTransfer(recipientEmail: string, files: File[]) {
  if (await this.shouldDeferTransfer()) {
    setTimeout(() => this.startTransfer(recipientEmail, files), 30000);
    return;
  }

  const key = this.sessionKeys.get(recipientEmail);
  if (!key) throw new Error('No session key');

  let totalBytesAllFiles = 0;

  for (const file of files) {
    const messageId = crypto.randomUUID();
    const totalChunks = Math.ceil(file.size / P2P_LIMITS.CHUNK_SIZE);

    // 🔥 Emit initial progress event
    window.dispatchEvent(new CustomEvent('p2p-progress', {
      detail: {
        messageId,
        fileName: file.name,
        progress: 0
      }
    }));

    const missingChunks = new Set<number>();
    for (let i = 0; i < totalChunks; i++) missingChunks.add(i);

    const transfer: TransferState = {
      messageId,
      recipientEmail,
      attachments: [file],
      missingChunks,
      totalChunks,
      progress: 0,
      bytesSent: 0,
      paused: false,
      lastSentAt: new Map()
    };

    this.activeTransfers.set(messageId, transfer);
    
    const PARALLEL_LANES = 3;

    const lanes = Array.from({ length: PARALLEL_LANES }, async (_, lane) => {
      for (let i = lane; i < totalChunks; i += PARALLEL_LANES) {
        // Skip if ACKed
        if (!transfer.missingChunks.has(i)) continue;

        // Skip if recently sent
        const lastSent = transfer.lastSentAt.get(i);
        if (lastSent && Date.now() - lastSent < ACK_TIMEOUT_MS) continue;

        // Check pause state
        while (transfer.paused) {
          await new Promise(r => setTimeout(r, 300));
        }

        const start = i * P2P_LIMITS.CHUNK_SIZE;
        const end = Math.min(start + P2P_LIMITS.CHUNK_SIZE, file.size);
        const buffer = await file.slice(start, end).arrayBuffer();

        await this.throttle(buffer.byteLength);
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

        // 🔥 Emit progress event
        window.dispatchEvent(new CustomEvent('p2p-progress', {
          detail: {
            messageId,
            fileName: file.name,
            progress: transfer.progress
          }
        }));
      }
    });

    await Promise.all(lanes);

    const watchdog = setInterval(() => {
      const now = Date.now();
      for (const chunkIndex of transfer.missingChunks) {
        const last = transfer.lastSentAt.get(chunkIndex) || 0;
        if (now - last > ACK_TIMEOUT_MS) {
          transfer.lastSentAt.delete(chunkIndex);
        }
      }
    }, 1000);

    // Wait until all chunks are ACKed
    while (transfer.missingChunks.size > 0) {
      await new Promise(r => setTimeout(r, 500));
    }

    totalBytesAllFiles += file.size;
    this.activeTransfers.delete(messageId);
    clearInterval(watchdog);

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

    const raw = new Uint8Array(chunk).buffer;
    const verify = await sha256(raw);

    if (verify !== checksum) {
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

    this.receivedChunks.get(messageId)!.set(
      chunkIndex,
      new Uint8Array(chunk)
    );

    this.send({
      type: 'chunk-ack',
      to: from,
      messageId,
      timestamp: Date.now()
    });
localStorage.setItem(
  `p2p-recv-${messageId}`,
  JSON.stringify([...this.receivedChunks.get(messageId)!.keys()])
);

    // 🔥 AUTO ASSEMBLE WHEN COMPLETE
    if (this.receivedChunks.get(messageId)!.size === totalChunks) {
      this.assembleFile(messageId, fileName, mimeType);
    }
  }

  private assembleFile(messageId: string, fileName: string, mimeType: string) {
    const chunks = this.receivedChunks.get(messageId);
    if (!chunks) return;

    const ordered = Array.from(chunks.entries())
      .sort((a, b) => a[0] - b[0])
      .map(e => e[1]);

    const blob = new Blob(ordered, { type: mimeType });
    const url = URL.createObjectURL(blob);

    // Auto-download

this.send({
  type: 'transfer-complete',
  from: this.email,
  to: this.transferSenders.get(messageId)!,
  messageId
});

window.dispatchEvent(new CustomEvent('p2p-attachment-ready', {
  detail: {
    messageId,
    fileName,
    mimeType,
    blob
  }
}));
URL.revokeObjectURL(url);
this.transferSenders.delete(messageId);
this.receivedChunks.delete(messageId);

localStorage.removeItem(`p2p-recv-${messageId}`);
localStorage.removeItem(`p2p-sender-${messageId}`);

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
}

/* ---------------------------------------------------- */
/* ------------------ SINGLETON ------------------------ */
/* ---------------------------------------------------- */

export const p2pService = new StrictP2PService();

window.addEventListener('beforeunload', () => {
  p2pService.disconnect();
});
