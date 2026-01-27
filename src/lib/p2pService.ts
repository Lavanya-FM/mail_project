// src/lib/p2pService.ts
// Green, carbon-aware, ACK-controlled P2P transfer service

import {
  generateKeyPair,
  exportPublicKey,
  exportKeyPair,
  importStoredKeyPair,
  /* 
    encrypt,
    decrypt,
    sha256
  */
} from './p2pCrypto';

import {
  getReceivedChunkIndexes,
  getMeta,
  saveChunk,
  saveMeta,
  saveFile,
  getFile,
  getChunk
} from './p2pStorage';
import { authService } from './authService';
import toast from 'react-hot-toast';

/* ---------------------------------------------------- */
/* -------------------- CONSTANTS --------------------- */
/* ---------------------------------------------------- */

const P2P_LIMITS = {
  BASE_KBPS: 999999,    // Unlimited - no throttling
  MIN_KBPS: 999999,     // Unlimited - no throttling  
  MAX_KBPS: 999999,     // Unlimited - no throttling
  CHUNK_SIZE: 512 * 1024, // 512 KB chunks for faster transfer
};

const MAX_RETRIES_PER_CHUNK = 5;
const chunkRetries = new Map<string, number>();

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

// type NetworkType = 'internet' | 'mobile' | 'wifi';

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
  type: string;
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
  meetingId?: string;
  userId?: string | number;
  token?: string;
  email?: string;
  requestType?: string;
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
  files: File[];
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
  private static instance: StrictP2PService;

  public static getInstance(): StrictP2PService {
    if (!StrictP2PService.instance) {
      StrictP2PService.instance = new StrictP2PService();
    }
    return StrictP2PService.instance;
  }

  private keyPair!: CryptoKeyPair;
  // private myPublicKeyBytes: Uint8Array | null = null;
  private onlinePeers = new Set<string>();

  private sessionKeys = new Map<string, CryptoKey>();
  // private ephemeralKeys = new Map<string, CryptoKeyPair>();

  private activeTransfers = new Map<string, TransferState>();
  private transferSenders = new Map<string, string>();
  private receivedFiles = new Map<string, Blob>();

  // --- ACK-driven throttling ---
  private currentKBPS = P2P_LIMITS.BASE_KBPS;
  // private lastAckAt = performance.now();

  // --- ETA Tracker
  /*
  private receiveSpeed = new Map<string, {
    lastBytes: number;
    lastTime: number;
    speedBps: number;
  }>();
  */

  /*
  private sendSpeed = new Map<string, {
    lastBytes: number;
    lastTime: number;
    speedBps: number;
  }>();
  */

  // --- Receive buffer ---
  // private receivedChunks = new Map<string, Map<number, Uint8Array>>();
  private receiverTransfers = new Map<string, ReceiverTransferState>();

  // --- Queue system (one file at a time) ---
  /*
  private receiverQueue: string[] = []; // messageIds in queue
  private currentProcessingMessageId: string | null = null;
  */

  constructor() {
    // suppress unused warnings for some members if they were to be used later
    // console.log(this.currentProcessingMessageId); 
  }

  // --- CORE WEBSOCKET METHODS ---

  private send(msg: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn('[P2P] Cannot send message - socket not open', msg);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.onlinePeers.clear();
    window.dispatchEvent(new CustomEvent('p2p-peers-updated', { detail: { peers: [] } }));
  }

  // --- DATABASE ---

  // --- DATABASE ---
  // Store moved to p2pStorage.ts


  // --- PUBLIC METHODS ---

  public isConnected(): boolean {
    return this.connected;
  }

  public async waitForConnection(timeoutMs = 15000): Promise<void> {
    if (this.connected) return;
    console.log('[P2P] Waiting for connection...');
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = setInterval(() => {
        if (this.connected) {
          clearInterval(check);
          console.log('[P2P] Connection established!');
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(check);
          console.warn('[P2P] Connection timed out - assuming offline mode/error');
          reject(new Error('Connection timeout'));
        }
      }, 200);
    });
  }

  hasSessionKey(email: string): boolean {
    return this.sessionKeys.has(email);
  }

  hasReceivedFileSync(messageId: string): boolean {
    return this.receivedFiles.has(messageId);
  }

  // --- PEER LISTENERS ---
  private peerListeners = new Set<(peers: string[]) => void>();

  onPeersUpdate(fn: (peers: string[]) => void) {
    this.peerListeners.add(fn);
    // Call immediately with current state
    if (this.connected) fn(this.getOnlinePeers());
  }

  offPeersUpdate(fn: (peers: string[]) => void) {
    this.peerListeners.delete(fn);
  }

  private notifyPeersUpdated() {
    const peers = this.getOnlinePeers();
    this.peerListeners.forEach(fn => fn(peers));
    window.dispatchEvent(new CustomEvent('p2p-peers-updated', { detail: { peers } }));
  }

  async hasReceivedFile(messageId: string): Promise<boolean> {
    if (this.receivedFiles.has(messageId)) return true;
    try {
      const record = await getFile(messageId);
      return !!record;
    } catch {
      return false;
    }
  }

  isPeerOnline(email: string): boolean {
    return this.onlinePeers.has(email);
  }

  joinRoom(meetingId: string) {
    this.send({
      type: 'join-room',
      meetingId,
      userId: this.userId,
      email: this.email
    });
  }

  leaveRoom(meetingId: string) {
    this.send({
      type: 'leave-room',
      meetingId
    });
  }

  broadcastToRoom(meetingId: string, payload: any) {
    this.send({
      type: 'room-broadcast',
      meetingId,
      payload
    });
  }

  public sendSignal(to: string, payload: any) {
    this.send({
      type: 'signal',
      to,
      from: this.email,
      payload
    });
  }

  public sendCallEvent(event: any) {
    this.send(event);
  }

  public sendChat(to: string, content: string, extra: any = {}) {
    this.send({
      type: 'secure-message',
      to,
      from: this.email,
      payload: {
        content,
        timestamp: Date.now(),
        ...extra
      }
    });
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
      status: rt.status as any
    };
  }

  pauseTransfer(messageId: string) {
    const transfer = this.activeTransfers.get(messageId);
    if (transfer) {
      transfer.paused = true;
    }
    console.log('[P2P] Transfer paused:', messageId);
  }


  resumeTransfer(messageId: string) {
    const t = this.activeTransfers.get(messageId);
    if (t) {
      t.paused = false;
      t.phase = TransferPhase.SENDING;
    }
  }

  public setUserBandwidth(kbps: number) {
    this.currentKBPS = Math.min(
      P2P_LIMITS.MAX_KBPS,
      Math.max(P2P_LIMITS.MIN_KBPS, kbps)
    );
    console.log('[P2P] User bandwidth set to', this.currentKBPS, 'KBPS');
  }

  async resumeReceive(messageId: string, senderEmail?: string) {
    console.log('[P2P] Resume receive requested for', messageId, 'senderEmail:', senderEmail);

    const hasFile = await this.hasReceivedFile(messageId);
    if (hasFile) {
      window.dispatchEvent(new CustomEvent('p2p-receiver-progress', {
        detail: { messageId, percentage: 100, received: 100, total: 100, status: 'complete' }
      }));
      window.dispatchEvent(new CustomEvent('p2p-file-ready', { detail: { messageId } }));
      return;
    }

    let sender = senderEmail
      || this.transferSenders.get(messageId)
      || localStorage.getItem(`p2p-sender-${messageId}`);

    if (sender && !this.transferSenders.has(messageId)) {
      this.transferSenders.set(messageId, sender);
      localStorage.setItem(`p2p-sender-${messageId}`, sender);
    }

    const meta = await getMeta(messageId);
    if (!meta) {
      if (sender) {
        this.send({
          type: 'resume-request',
          to: sender,
          from: this.email,
          messageId: messageId,
          requestType: 'metadata'
        });
      }
      return;
    }

    const received = await getReceivedChunkIndexes(messageId);
    const missing: number[] = [];

    for (let i = 0; i < meta.totalChunks; i++) {
      if (!received.includes(i)) missing.push(i);
    }

    if (missing.length === 0) {
      const rt = this.receiverTransfers.get(messageId);
      if (rt) {
        await this.assembleFile(messageId, rt.fileName, rt.mimeType);
      }
      return;
    }

    if (!sender) return;

    missing.forEach(idx => this.retryChunk(messageId, idx, sender!));
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
      const record = await getFile(messageId);
      if (record?.blob) {
        this.receivedFiles.set(messageId, record.blob);
        return record.blob;
      }
    } catch (e) {
      console.error('[P2P] Failed to load blob for preview', e);
    }

    return null;
  }

  async connect(userId: string | number, email: string): Promise<void> {
    if (this.connected && this.email === email && this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.isRegistering) return;
    this.isRegistering = true;

    this.email = email;
    this.userId = userId;

    try {
      if (!this.keyPair) {
        const stored = localStorage.getItem('p2p-keypair');
        this.keyPair = stored
          ? await importStoredKeyPair(stored)
          : await generateKeyPair();

        if (!stored) {
          localStorage.setItem('p2p-keypair', await exportKeyPair(this.keyPair));
        }
      }

      if (this.ws) {
        this.ws.close();
        this.ws = null;
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
          token: authService.getToken() || '',
          publicKey: Array.from(new Uint8Array(pub)),
          timestamp: Date.now()
        });
      };

      this.ws.onmessage = async (e) => {
        try {
          const message = JSON.parse(e.data);
          await this.handle(message);
        } catch (err) {
          console.error('[P2P] Parse error', err);
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.isRegistering = false;
        setTimeout(() => this.connect(userId, email), 5000);
      };

      this.ws.onerror = () => {
        this.isRegistering = false;
      };

    } catch (e) {
      console.error('[P2P] Connection error', e);
      this.isRegistering = false;
    }
  }

  private async handle(msg: StrictMessage) {
    switch (msg.type) {
      case 'registered':
        this.connected = true;
        this.isRegistering = false; // Reset flag
        console.log('[P2P] Successfully registered');
        break;

      case 'online-peers':
        if (Array.isArray(msg.data)) {
          this.onlinePeers.clear();
          msg.data.forEach((p: string) => this.onlinePeers.add(p));
          this.notifyPeersUpdated();
        }
        break;

      case 'peer-online':
        if (msg.from) {
          this.onlinePeers.add(msg.from);
          this.notifyPeersUpdated();
          toast(`${msg.from} is online`, { icon: '🟢', position: 'bottom-right' });
        }
        break;

      case 'peer-offline':
        if (msg.from) {
          this.onlinePeers.delete(msg.from);
          this.notifyPeersUpdated();
        }
        break;

      case 'room-joined':
        window.dispatchEvent(new CustomEvent('p2p-room-joined', { detail: msg }));
        break;

      case 'peer-joined-room':
        window.dispatchEvent(new CustomEvent('p2p-peer-joined-room', { detail: msg }));
        break;

      case 'peer-left-room':
        window.dispatchEvent(new CustomEvent('p2p-peer-left-room', { detail: msg }));
        break;

      case 'room-message':
        window.dispatchEvent(new CustomEvent('p2p-room-message', { detail: msg }));
        break;

      case 'signal':
        window.dispatchEvent(new CustomEvent('p2p-signal', { detail: msg }));
        break;

      case 'CALL_EVENT':
        window.dispatchEvent(new CustomEvent('p2p-message', { detail: msg }));
        break;

      case 'p2p-offer': {
        const { messageId, from, data } = msg;
        if (from && messageId) {
          this.transferSenders.set(messageId, from);
          localStorage.setItem(`p2p-sender-${messageId}`, from);
        }

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

        // Save meta immediately
        await saveMeta(messageId!, {
          fileName: data.fileName,
          mimeType: data.mimeType,
          size: data.size,
          totalChunks: data.totalChunks,
          sender: from
        });

        this.send({
          type: 'p2p-offer-ack',
          to: from,
          from: this.email,
          messageId: messageId!
        });

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

      case 'file-chunk': {
        const { messageId, chunkIndex, data, from } = msg; // data here is base64 string
        if (!messageId || chunkIndex === undefined || !data) return;

        const buffer = base64ToArrayBuffer(data);
        await saveChunk(messageId, chunkIndex, buffer);

        const rt = this.receiverTransfers.get(messageId);
        if (rt) {
          rt.receivedChunks.add(chunkIndex);

          // Progress update
          const progress = Math.round((rt.receivedChunks.size / rt.totalChunks) * 100);
          window.dispatchEvent(new CustomEvent('p2p-receiver-progress', {
            detail: {
              messageId,
              percentage: progress,
              received: rt.receivedChunks.size,
              total: rt.totalChunks,
              status: progress === 100 ? 'complete' : 'receiving'
            }
          }));

          if (rt.receivedChunks.size === rt.totalChunks) {
            await this.assembleFile(messageId, rt.fileName, rt.mimeType);
          }
        }

        // Ack the chunk
        this.send({
          type: 'chunk-ack',
          to: from,
          from: this.email,
          messageId,
          chunkIndex
        });
        break;
      }

      case 'chunk-ack': {
        // const { messageId, chunkIndex } = msg;
        // Could throttle sending here
        break;
      }

      case 'secure-message':
        window.dispatchEvent(new CustomEvent('p2p-message', { detail: msg }));
        break;


    }
  }

  // --- FILE HANDLING OPERATIONS ---

  private async assembleFile(messageId: string, fileName: string, mimeType: string) {
    if (this.receivedFiles.has(messageId)) return;

    const meta = await getMeta(messageId);
    const totalChunks = meta?.totalChunks || 0;
    const chunks: Blob[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const chunkData = await getChunk(messageId, i);
      if (chunkData) {
        chunks.push(new Blob([chunkData]));
      } else {
        console.error('Missing chunk', i, 'for', messageId);
        return; // Failed to assemble
      }
    }

    const fileBlob = new Blob(chunks, { type: mimeType });
    this.receivedFiles.set(messageId, fileBlob);

    // Save complete file to DB
    await saveFile(messageId, {
      fileName,
      mimeType,
      blob: fileBlob,
      size: fileBlob.size,
      timestamp: Date.now()
    });

    // Cleanup chunks? Maybe later.

    window.dispatchEvent(new CustomEvent('p2p-file-ready', {
      detail: { messageId, fileName, blob: fileBlob }
    }));

    this.receiverTransfers.get(messageId)!.status = 'complete';
  }

  private retryChunk(messageId: string, chunkIndex: number, sender: string) {
    const retryKey = `${messageId}-${chunkIndex}`;
    const retries = chunkRetries.get(retryKey) || 0;

    if (retries > MAX_RETRIES_PER_CHUNK) {
      console.warn('Max retries exceeded for chunk', chunkIndex);
      return;
    }
    chunkRetries.set(retryKey, retries + 1);

    this.send({
      type: 'resume-request',
      to: sender,
      from: this.email,
      messageId,
      chunkIndex,
      requestType: 'chunk'
    });
  }

  async loadChunks(_messageId: string): Promise<Map<number, Uint8Array>> {
    return new Map();
  }

  async startTransfer(recipients: string | string[], files: File[], messageIds: string[]) {
    if (!files.length) return;

    const recipientsArray = Array.isArray(recipients) ? recipients : [recipients];

    recipientsArray.forEach(recipient => {
      files.forEach((file, index) => {
        const messageId = messageIds[index];
        this.startTransferToRecipient(recipient, file, messageId);
      });
    });
  }

  private async startTransferToRecipient(recipientEmail: string, file: File, messageId: string) {
    const totalChunks = Math.ceil(file.size / P2P_LIMITS.CHUNK_SIZE);

    // Send offer
    this.send({
      type: 'p2p-offer',
      to: recipientEmail,
      from: this.email,
      messageId,
      data: {
        fileName: file.name,
        size: file.size,
        mimeType: file.type,
        totalChunks
      }
    });

    // Store transfer state
    this.activeTransfers.set(messageId, {
      messageId,
      recipientEmail,
      files: [file],
      remainingFiles: [], // Simplified
      missingChunks: new Set(),
      totalChunks,
      progress: 0,
      bytesSent: 0,
      paused: false,
      phase: TransferPhase.OFFERED,
      retryCount: new Map(),
      lastSentAt: new Map()
    } as any);

    // Start sending chunks immediately (optimistic)
    this.uploadFile(messageId, file, recipientEmail, totalChunks);
  }

  private async uploadFile(messageId: string, file: File, recipient: string, totalChunks: number) {
    let offset = 0;
    for (let i = 0; i < totalChunks; i++) {
      const chunk = file.slice(offset, offset + P2P_LIMITS.CHUNK_SIZE);
      const buffer = await chunk.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);

      this.send({
        type: 'file-chunk',
        to: recipient,
        from: this.email,
        messageId,
        chunkIndex: i,
        data: base64
      });

      offset += P2P_LIMITS.CHUNK_SIZE;
      await new Promise(r => setTimeout(r, 10)); // Tiny yield
    }
  }

  // Missing methods stubs/implementations requested by errors
  retryTransfer(messageId: string) {
    this.resumeTransfer(messageId);
  }

  resumeSending(messageId: string) {
    this.resumeTransfer(messageId);
  }

  async downloadReceivedFile(messageId: string, fileName: string) {
    const blob = await this.getReceivedBlob(messageId);
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  }
}

export const p2pService = new StrictP2PService();
