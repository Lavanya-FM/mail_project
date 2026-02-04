// src/lib/p2pService.ts
// Green, carbon-aware, ACK-controlled P2P transfer service

import {
  generateKeyPair,
  exportPublicKey,
  exportKeyPair,
  importStoredKeyPair,
  importPublicKey,
  deriveSharedKey,
  encryptChunkAES,
  decryptChunkAES
} from './p2pCrypto';

import {
  getReceivedChunkIndexes,
  getMeta,
  getAllMetas,
  saveChunk,
  saveFile,
  getFile,
  getChunk,
  deleteTransferData,
  savePendingTransfer,
  getAllPendingTransfers,
  clearChunks,
  saveMeta
} from './p2pStorage';
import toast from 'react-hot-toast';
import { normalizeEmail } from '../utils/normalizeEmail';
import { setOnlinePeers, updatePeerStatus, isPeerOnline as isPeerOnlineStore, subscribePresence, getOnlinePeersSnapshot } from './presenceStore';
import { authService } from './authService';

/* ---------------------------------------------------- */
/* -------------------- CONSTANTS --------------------- */
/* ---------------------------------------------------- */

const P2P_LIMITS = {
  BASE_KBPS: 999999,    // Unlimited - no throttling
  MIN_KBPS: 999999,     // Unlimited - no throttling  
  MAX_KBPS: 999999,     // Unlimited - no throttling
  CHUNK_SIZE: 2 * 1024 * 1024, // 🚀 2MB CHUNKS (Doubled for Max Throughput)
};

const chunkRetries = new Map<string, number>();

// Helper functions for base64 encoding/decoding binary data
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  // 🚀 ULTRA-FAST Base64 for 1TB files (Avoids slow string concatenation)
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  let binary = "";
  for (let i = 0; i < len; i += 32768) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 32768, len)) as any);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
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

export enum AttachmentState {
  WAITING_FOR_PEER = 'WAITING_FOR_PEER',
  READY = 'READY',
  TRANSFERRING = 'TRANSFERRING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  FALLBACK = 'FALLBACK',
  CONNECTED = 'CONNECTED',
  INIT = 'INIT',
  HANDSHAKING = 'HANDSHAKING',
  KEY_READY = 'KEY_READY',
  RECEIVING = 'RECEIVING'
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
  onlinePeers?: any[];
  emails?: string[];
  online?: string[];
  timestamp?: number;
  meetingId?: string;
  userId?: string | number;
  email?: string;
  requestType?: string;
  chunkIndices?: number[];
  resumeIndex?: number;
}

type StopReason = string | null;

interface ReceiverTransferState {
  messageId: string;
  fileName: string;
  mimeType: string;
  totalChunks: number;
  receivedChunks: Set<number>;
  verifiedChunks: Set<number>;
  failedChunks: Set<number>;
  status: 'INIT' | 'HANDSHAKING' | 'KEY_READY' | 'RECEIVING' | 'COMPLETED' | 'FAILED' | 'PAUSED';
  reason: StopReason;
  lastUpdated: number;
  // Speed/ETA Tracking
  actualSize?: number;
  startTime?: number;
  lastBytes?: number;
  lastTime?: number;
  speedBps?: number;
  etaSeconds?: number | null;
  chunkSize?: number; // Store the chunk size used for this transfer
}

interface TransferState {
  messageId: string;
  recipientEmail: string;
  files: File[];
  totalChunks: number;
  progress: number;
  bytesSent: number;
  paused: boolean;
  phase: TransferPhase;
  currentChunkIndex: number; // For sender-driven flow
  lastChunkTime: number;
  speedBps?: number;
  etaSeconds?: number | null;
  startTime?: number;
  lastBytes?: number;
  lastTime?: number;
}

/* ---------------------------------------------------- */

class StrictP2PService {
  private ws: WebSocket | null = null;
  private email = '';
  private userId: string | number = '';
  private connected = false;
  private isRegistering = false;
  private retryCount = 0;
  private reconnectionTimeout: any = null;
  private pingInterval: any = null;
  private static instance: StrictP2PService;

  public static getInstance(): StrictP2PService {
    if (!StrictP2PService.instance) {
      StrictP2PService.instance = new StrictP2PService();
    }
    return StrictP2PService.instance;
  }

  private keyPair!: CryptoKeyPair;
  // private myPublicKeyBytes: Uint8Array | null = null;
  // private onlinePeers = new Set<string>(); // Moved to presenceStore

  // 1️⃣ Session must be PER PEER & PER MESSAGE — NOT just per peer
  // Key = peerEmail:messageId
  private peerSessions = new Map<string, {
    sessionKey: CryptoKey | null;
    ready: boolean;
    handshaking: boolean;
  }>();

  // 4️⃣ Sender start condition registry
  private senderTransferRegistry = new Map<string, {
    fileId: string;
    file: File;
    peerEmail: string;
    messageId: string;
    started: boolean;
    offered: boolean;
    currentChunkIndex: number;
    totalChunks: number;
    status: 'QUEUED' | 'WAITING_FOR_PEER' | 'HANDSHAKING' | 'TRANSFERRING' | 'PAUSED' | 'COMPLETE' | 'FAILED' | 'FALLBACK_SERVER';
    resumeAttempts?: number;
    lastAttemptTime?: number;
    acknowledgedChunks?: Set<number>;
    speedBps?: number;
    etaSeconds?: number | null;
    lastTime?: number;
    reason?: string | null;
    chunkSize?: number;
    startTime?: number;
  }>();

  private activeTransfers = new Map<string, TransferState>();
  private pullWatchdogs = new Map<string, any>();
  private transferSenders = new Map<string, string>();
  // private presenceListeners = new Set<(peers: Set<string>) => void>();
  private connectionListeners = new Set<(connected: boolean) => void>();

  public onConnectionChange(callback: (connected: boolean) => void) {
    this.connectionListeners.add(callback);
    callback(this.isConnected()); // Notify immediately
    return () => this.connectionListeners.delete(callback);
  }

  private notifyConnection(connected: boolean) {
    console.log(`[P2P] Connection status changed: ${connected}`);
    this.connectionListeners.forEach(cb => {
      try { cb(connected); } catch (e) { console.error(e); }
    });
  }
  private receivedFiles = new Map<string, Blob>();
  // MessageId -> ChunkIndex -> StrictMessage
  private receiverChunkBuffer = new Map<string, Map<number, StrictMessage>>();
  private pendingSignals: any[] = [];
  private pendingRequests = new Map<string, Set<number>>();
  private waitingForSender = new Map<string, string>(); // messageId -> senderEmail
  private completedTransfers = new Set<string>(); // Cache of completed message IDs
  private pendingDiskWrites = new Map<string, Set<Promise<void>>>(); // messageId -> Set of active saveChunk promises

  // --- ACK-driven throttling ---
  private currentKBPS = P2P_LIMITS.BASE_KBPS;
  // private lastAckAt = performance.now();

  // --- Presence Listeners ---
  private presenceListeners = new Set<(peers: string[]) => void>();

  public onPresenceChange(callback: (peers: string[]) => void) {
    this.presenceListeners.add(callback);
    // Immediately call with current snapshot if available
    import('./presenceStore').then(({ getOnlinePeersSnapshot }) => {
      callback(Array.from(getOnlinePeersSnapshot()));
    });
    return () => this.presenceListeners.delete(callback);
  }

  private notifyPresenceListeners(peers: string[]) {
    this.presenceListeners.forEach(cb => {
      try { cb(peers); } catch (e) { console.error(e); }
    });
  }
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
    console.log("🚀 [P2P SERVICE] V55 LOADED - TURBO MODE + ETA");
    // suppress unused warnings for some members if they were to be used later
    // console.log(this.currentProcessingMessageId); 

    // ✅ FIX 8: Resume trigger when recipient comes online (Store Subscription)
    subscribePresence(() => {
      this.triggerPresenceResumption();
    });

    // ✅ FIX: Handle network connectivity changes
    window.addEventListener('online', () => {
      console.log('[P2P] Network is ONLINE. Attempting to reconnect...');
      if (this.email && this.userId) {
        // Force reconnect if we have credentials
        this.connect(this.userId, this.email);

        // Request fresh presence data immediately
        setTimeout(() => {
          this.send({ type: 'request-presence' }, true);
        }, 1000);
      }
    });

    window.addEventListener('offline', () => {
      console.log('Build Version: 2026-02-04.v112-NO-DISCONNECTS');
      this.disconnect();
    });

    // 🚀 REAL-TIME PRESENCE: Request presence updates every 15 seconds
    setInterval(() => {
      if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'request-presence' }, true);
      }
    }, 15000);
  }

  // --- CORE WEBSOCKET METHODS ---

  public requestPresence() {
    if (this.isConnected()) {
      console.log('[P2P] Requesting manual presence refresh...');
      this.send({ type: 'request-presence' });
    }
  }

  private send(msg: any, silent = false) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      if (!silent) {
        console.warn(`[P2P] Socket not open (state: ${this.ws?.readyState}), queueing signal:`, msg.type || msg);
      }
      this.pendingSignals.push(msg);

      // If we are not currently trying to connect, trigger a connection
      if (!this.connected && !this.isRegistering && this.email) {
        this.connect(this.userId, this.email);
      }
    }
  }

  private async waitForSocketOpen(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    console.log('[P2P] Waiting for socket to open before handshake...');
    return new Promise((resolve) => {
      const waitStart = Date.now();
      const check = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          clearInterval(check);
          resolve();
        } else if (Date.now() - waitStart > 10000) { // 10s wait
          clearInterval(check);
          resolve();
        }
      }, 200);
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    setOnlinePeers([]); // Clear global store
    this.notifyConnection(false);
    this.resetState();
  }

  private resetState() {
    console.log('[P2P] Clearing internal state...');
    this.peerSessions.clear();
    this.activeTransfers.clear();
    // Do not clear senderTransferRegistry purely? Maybe pause them?
    // If we disconnect, we should probably pause/fail them.
    // For now, clear purely in-memory maps.
    this.receiverChunkBuffer.clear();
    this.pendingRequests.clear();
    // this.receiverTransfers.clear(); // Keep this for rehydration? 
    // If user switches, rehydration will load new user's data. 
    // But in-memory map might have old user's data. 
    this.receiverTransfers.clear();
    this.transferSenders.clear();
    this.activeTransfers.clear();
    this.waitingForSender.clear();
  }

  // --- DATABASE ---

  // --- DATABASE ---
  // Store moved to p2pStorage.ts


  // --- PUBLIC METHODS ---

  public isConnected(): boolean {
    return this.connected && !!this.ws && this.ws.readyState === WebSocket.OPEN;
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
    const emailLower = email.toLowerCase();
    const session = this.peerSessions.get(emailLower);
    return !!(session && session.ready && session.sessionKey);
  }

  hasReceivedFileSync(messageId: string): boolean {
    return this.receivedFiles.has(messageId) || this.completedTransfers.has(messageId);
  }



  // ✅ FIX 6: TRIGGER RESUME ON PRESENCE CHANGE
  private triggerPresenceResumption() {
    if (!this.connected) {
      console.log("[P2P][RESUME] Skipped — signaling offline");
      return;
    }
    console.log("[P2P][RESUME] Checking resumption for all transfers...");

    // 🚚 SENDER RESUMPTION
    this.senderTransferRegistry.forEach((t, messageId) => {
      const emailLower = t.peerEmail.toLowerCase();
      if (isPeerOnlineStore(emailLower)) {
        if (t.status === 'WAITING_FOR_PEER' || t.status === 'QUEUED') {
          console.log(`[P2P][SENDER] Peer ${emailLower} is online. Resuming ${messageId}...`);
          this.tryStartSender(messageId);
        }
      }
    });

    // 📥 RECEIVER RESUMPTION
    this.receiverTransfers.forEach((rt, messageId) => {
      const sender = this.transferSenders.get(messageId)?.toLowerCase();
      if (sender && isPeerOnlineStore(sender)) {
        if (rt.status === 'PAUSED' || rt.status === 'INIT') {
          console.log(`[P2P][RECEIVER] Sender ${sender} is online. Resuming ${messageId}...`);
          this.resumeReceive(messageId, sender);
        }
      }

      // Check waiting queue
      // Check waiting queue
      const waitingSender = this.waitingForSender.get(messageId)?.toLowerCase();
      if (waitingSender && isPeerOnlineStore(waitingSender)) {
        console.log(`[P2P][RECEIVER] Waiting sender ${waitingSender} came online for ${messageId}`);
        this.waitingForSender.delete(messageId);
        this.resumeReceive(messageId, waitingSender);
      }
    });
  }

  on(event: string, fn: any) {
    window.addEventListener(`p2p-${event}`, fn);
  }

  off(event: string, fn: any) {
    window.removeEventListener(`p2p-${event}`, fn);
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

  // private normalizeEmail(email: string): string { ... } // Replaced by import

  isPeerOnline(email: string): boolean {
    return isPeerOnlineStore(email);
  }

  getOnlinePeers(): string[] {
    return Array.from(getOnlinePeersSnapshot());
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

  public cleanupTransfer(messageId: string, wipeFile = true) {
    console.log(`[P2P] Cleaning up transfer data for ${messageId}, wipeFile=${wipeFile}`);

    // 1. Memory cleanup
    this.activeTransfers.delete(messageId);
    this.senderTransferRegistry.delete(messageId);
    this.receiverTransfers.delete(messageId);
    this.transferSenders.delete(messageId);
    this.receivedFiles.delete(messageId); // Clear from memory cache
    this.receiverChunkBuffer.delete(messageId);
    this.pendingRequests.delete(messageId);
    if (!wipeFile) {
      this.completedTransfers.add(messageId);
    }

    // 2. Storage cleanup (IndexedDB)
    if (wipeFile) {
      deleteTransferData(messageId);
    } else {
      // Just clear parts, keep the file record
      clearChunks(messageId);
      // We might want to clear meta too, but keep the file
    }

    // 3. LocalStorage cleanup
    localStorage.removeItem(`p2p-sender-${messageId}`);
    localStorage.removeItem(`p2p-receiver-${messageId}`);

    // 4. Session key cleanup
    for (const key of Array.from(this.peerSessions.keys())) {
      if (key.endsWith(`:${messageId}`)) {
        this.peerSessions.delete(key);
      }
    }

    // 5. Retry state cleanup
    for (const key of Array.from(chunkRetries.keys())) {
      if (key.startsWith(messageId)) {
        chunkRetries.delete(key);
      }
    }

    window.dispatchEvent(new CustomEvent('p2p-cleanup', { detail: { messageId } }));
  }

  cancelSenderTransfer(messageId: string) {
    console.log(`[P2P] Cancelling sender transfer ${messageId}`);
    const t = this.senderTransferRegistry.get(messageId);
    if (t) {
      t.status = 'FAILED';
      t.started = false;
    }
    this.activeTransfers.delete(messageId);

    window.dispatchEvent(new CustomEvent('p2p-progress', {
      detail: { messageId, status: 'failed' }
    }));

    this.cleanupTransfer(messageId, true);
  }

  pauseTransfer(messageId: string) {
    const transfer = this.activeTransfers.get(messageId);
    if (transfer) {
      transfer.paused = true;
      window.dispatchEvent(new CustomEvent('p2p-progress', {
        detail: { messageId, status: 'paused' }
      }));
    }
    console.log('[P2P] Transfer paused:', messageId);
  }


  resumeTransfer(messageId: string) {
    const t = this.activeTransfers.get(messageId);
    if (t) {
      t.paused = false;
      t.phase = TransferPhase.SENDING;
      window.dispatchEvent(new CustomEvent('p2p-progress', {
        detail: { messageId, progress: t.progress, status: 'transferring' }
      }));
    }
  }

  public hasFileInRegistry(messageId: string): boolean {
    return this.senderTransferRegistry.has(messageId);
  }

  public registerFile(file: File, messageId: string) {
    const chunkSize = P2P_LIMITS.CHUNK_SIZE;
    this.senderTransferRegistry.set(messageId, {
      fileId: messageId,
      file: file,
      peerEmail: '', // To be set on offer
      messageId: messageId,
      started: false,
      offered: false,
      currentChunkIndex: 0,
      totalChunks: Math.ceil(file.size / chunkSize),
      status: 'QUEUED',
      acknowledgedChunks: new Set(),
      startTime: Date.now(),
      speedBps: 0,
      etaSeconds: null,
      chunkSize: chunkSize
    });
  }

  public async offerTransfer(messageId: string, to: string) {
    const t = this.senderTransferRegistry.get(messageId);
    if (!t) return;
    t.peerEmail = to;
    console.log(`[P2P] Offering transfer back to ${to} for message ${messageId}`);

    // Ensure we are connected
    await this.waitForConnection();

    // Start the process
    this.initiateHandshake(to, messageId);
  }

  public setUserBandwidth(kbps: number) {
    this.currentKBPS = Math.min(
      P2P_LIMITS.MAX_KBPS,
      Math.max(P2P_LIMITS.MIN_KBPS, kbps)
    );
    console.log('[P2P] User bandwidth set to', this.currentKBPS, 'KBPS');
  }

  async resumeReceive(messageId: string, senderEmail?: string) {
    if (await this.hasReceivedFile(messageId)) {
      console.log(`[P2P] File ${messageId} already received, skipping resume`);
      this.completedTransfers.add(messageId);
      return;
    }

    let sender = senderEmail
      || this.transferSenders.get(messageId);

    if (sender && !this.transferSenders.has(messageId)) {
      this.transferSenders.set(messageId, sender);
    }

    // 🚀 NEW: Check if sender is online before trying to pull
    if (sender && !this.isPeerOnline(sender.toLowerCase())) {
      console.log(`[P2P] Sender ${sender} is OFFLINE. Queuing resume for ${messageId}`);
      this.waitingForSender.set(messageId, sender);

      const rt = this.receiverTransfers.get(messageId);
      if (rt) {
        rt.reason = 'Sender is offline. Waiting for them to connect...';
        this.notifyReceiverProgress(rt, sender);
      }

      return;
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

    const rt = this.receiverTransfers.get(messageId);
    if (!rt) {
      // Hydrate from meta
      this.receiverTransfers.set(messageId, {
        messageId,
        fileName: meta.fileName,
        mimeType: meta.mimeType,
        totalChunks: meta.totalChunks,
        receivedChunks: new Set(),
        verifiedChunks: new Set(),
        failedChunks: new Set(),
        status: 'INIT',
        reason: null,
        lastUpdated: Date.now()
      });
    }

    await this.syncReceiverStateFromDB(messageId);

    if (!sender) {
      console.warn(`[P2P] No sender known for ${messageId}, cannot pull`);
      return;
    }

    // 🚀 CRITICAL: Check if transfer is already complete
    const rtCheck = this.receiverTransfers.get(messageId);
    if (rtCheck && rtCheck.receivedChunks.size === rtCheck.totalChunks) {
      console.log(`[P2P] Transfer ${messageId} already complete (${rtCheck.receivedChunks.size}/${rtCheck.totalChunks}). Triggering assembly...`);
      rtCheck.status = 'COMPLETED';

      // Trigger file assembly immediately
      await this.assembleFile(messageId, rtCheck.fileName, rtCheck.mimeType);
      return;
    }

    // 🚀 Switch to pull model for resume
    console.log(`[P2P] Resuming pull loop for ${messageId} from ${sender}`);
    if (rt) rt.status = 'RECEIVING'; // Explicitly unpause
    const emailLower = sender.toLowerCase();
    if (!this.peerSessions.has(emailLower) || !this.peerSessions.get(emailLower)?.ready) {
      this.ensureSession(sender, messageId);
    } else {
      this.pullMissingChunks(messageId, sender);
    }
  }

  async pauseReceive(messageId: string) {
    const rt = this.receiverTransfers.get(messageId);
    if (rt) {
      console.log(`[P2P] Pausing transfer ${messageId}`);
      rt.status = 'PAUSED';
      // Notify UI update
      this.syncReceiverStateFromDB(messageId); // triggers p2p-receiver-progress event
    }
  }

  async cancelTransfer(messageId: string) {
    console.log(`[P2P] Cancelling transfer ${messageId}`);
    const rt = this.receiverTransfers.get(messageId);
    if (rt) {
      rt.status = 'FAILED'; // Use FAILED to indicate stop
      // Notify UI
      window.dispatchEvent(new CustomEvent('p2p-error', {
        detail: { messageId, error: 'Transfer cancelled by user', code: 'CANCELLED' }
      }));

      // Notify sender using new REVOKE message if possible?
      // For now, just stop pulling.
    }

    // Clear data
    await deleteTransferData(messageId);
    this.receiverTransfers.delete(messageId);
    this.pendingRequests.delete(messageId);
    this.receiverChunkBuffer.delete(messageId);
  }

  private async syncReceiverStateFromDB(messageId: string) {
    const rt = this.receiverTransfers.get(messageId);
    if (!rt) return;

    const received = await getReceivedChunkIndexes(messageId);
    received.forEach(idx => rt.receivedChunks.add(idx));

    const total = rt.totalChunks;
    const count = rt.receivedChunks.size;
    const progress = total > 0 ? Math.round((count / total) * 100) : 0;

    const totalBytes = rt.actualSize || (total * P2P_LIMITS.CHUNK_SIZE);
    const receivedBytes = Math.min(totalBytes, count * P2P_LIMITS.CHUNK_SIZE);

    console.log(`[P2P] Synced ${count}/${total} chunks for ${messageId} (${progress}%)`);

    if (progress === 100 && rt.status !== 'COMPLETED' && !this.completedTransfers.has(messageId)) {
      console.log(`[P2P] All chunks found on disk for ${messageId}, triggering assembly`);
      rt.status = 'COMPLETED';
      this.completedTransfers.add(messageId); // 🚀 Track completion
      await this.assembleFile(messageId, rt.fileName, rt.mimeType);
      return; // assembleFile will handle UI notify
    }

    window.dispatchEvent(new CustomEvent('p2p-receiver-progress', {
      detail: {
        messageId,
        percentage: progress,
        progress,
        received: receivedBytes,
        total: totalBytes,
        status: (progress === 100 || this.completedTransfers.has(messageId)) ? 'COMPLETED' :
          (rt.status === 'PAUSED' ? 'PAUSED' : 'RECEIVING'),
        from: this.transferSenders.get(messageId),
        fileName: rt.fileName
      }
    }));
  }

  async getPreviewURL(messageId: string): Promise<string | null> {
    const blob = await this.getReceivedBlob(messageId);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }

  public getDownloadedFile(messageId: string): Blob | undefined {
    return this.receivedFiles.get(messageId);
  }

  public getTransferState(messageId: string) {
    // 1. Check sender side first (if we are the sender, this is our primary state)
    const st = this.senderTransferRegistry.get(messageId);
    if (st) {
      const acked = st.acknowledgedChunks?.size || 0;
      const total = st.totalChunks;
      const progress = total > 0 ? Math.round((acked / total) * 100) : 0;

      return {
        messageId,
        progress,
        status: st.status,
        speedBps: st.speedBps,
        etaSeconds: st.etaSeconds,
        reason: st.reason
      };
    }

    // 2. Check receiver side
    const rt = this.receiverTransfers.get(messageId);
    if (rt) {
      const count = rt.receivedChunks.size;
      const total = rt.totalChunks;
      const progress = total > 0 ? Math.round((count / total) * 100) : 0;

      return {
        messageId,
        progress,
        status: (progress === 100 || this.completedTransfers.has(messageId)) ? 'COMPLETED' : rt.status,
        speedBps: rt.speedBps,
        etaSeconds: rt.etaSeconds,
        reason: rt.reason
      };
    }

    return null;
  }

  public async getReceivedBlob(messageId: string): Promise<Blob | null> {
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

  // ✅ FIX 10: FALLBACK TO SERVER AFTER HARD FAILURE
  private checkAndTriggerFallback(messageId: string): boolean {
    const t = this.senderTransferRegistry.get(messageId);
    if (!t) return false;

    const now = Date.now();
    const resumeAttempts = t.resumeAttempts || 0;
    const lastAttempt = t.lastAttemptTime || now;
    const timeSinceLastAttempt = now - lastAttempt;

    // Trigger fallback conditions
    const conditions = {
      tooManyRetries: resumeAttempts >= 3,
      noAcksTimeout: timeSinceLastAttempt > 60000, // 60s
      senderOfflineTooLong: !isPeerOnlineStore(t.peerEmail.toLowerCase()) && timeSinceLastAttempt > 86400000, // 24h
    };

    if (conditions.tooManyRetries || conditions.noAcksTimeout || conditions.senderOfflineTooLong) {
      console.warn(`[P2P FALLBACK] Triggering server fallback for ${messageId}`, conditions);
      t.status = 'FALLBACK_SERVER';

      window.dispatchEvent(new CustomEvent('p2p-fallback-needed', {
        detail: {
          messageId,
          fileName: t.file.name,
          reason: conditions.tooManyRetries ? 'Too many retries' :
            conditions.noAcksTimeout ? 'No ACKs received' :
              'Sender offline too long'
        }
      }));

      return true;
    }

    return false;
  }

  // 2️⃣ Handshake guard (MANDATORY)
  private ensureSession(peerEmail: string, messageId?: string) {
    const emailLower = peerEmail.toLowerCase();
    const t = messageId ? this.senderTransferRegistry.get(messageId) : null;

    // 🚀 FIX 5: Sender must WAIT, not handshake if recipient is offline
    if (!isPeerOnlineStore(emailLower)) {
      console.log(`[P2P] Peer ${emailLower} is OFFLINE. Cannot handshake.`);
      if (t) {
        t.status = 'WAITING_FOR_PEER';
        window.dispatchEvent(new CustomEvent('p2p-progress', {
          detail: { messageId, progress: 0, status: 'pending' }
        }));
      }
      return;
    }

    const session = this.peerSessions.get(emailLower);

    if (session) {
      if (session.ready) {
        if (messageId) this.tryStartSender(messageId);
        // Also trigger pull if we are receiver
        if (messageId) this.pullMissingChunks(messageId, emailLower);
        return;
      }
      if (session.handshaking) {
        // Silently return to avoid log spam when buffering many chunks
        return;
      }
    }

    console.log(`[P2P] Peer ${emailLower} ONLINE -> Starting PER-PEER HANDSHAKE`);
    if (t) {
      t.status = 'HANDSHAKING';
      window.dispatchEvent(new CustomEvent('p2p-progress', {
        detail: { messageId, progress: 0, status: 'sending' }
      }));
    }

    this.peerSessions.set(emailLower, {
      sessionKey: null,
      ready: false,
      handshaking: true
    });

    this.initiateHandshake(emailLower, messageId);
  }

  private async initiateHandshake(to: string, messageId?: string) {
    // 🚀 FIX 4: HARD GATE handshake on socket OPEN
    await this.waitForSocketOpen();
    const pub = await exportPublicKey(this.keyPair.publicKey);
    this.send({
      type: 'key-exchange-init',
      to,
      from: this.email,
      publicKey: Array.from(new Uint8Array(pub)),
      messageId // Optional, just for tracking
    });
  }

  // 4️⃣ Sender start condition
  private tryStartSender(messageId: string) {
    const t = this.senderTransferRegistry.get(messageId);
    if (!t || t.status === 'COMPLETE') return;

    // Check if we should fallback to server
    if (this.checkAndTriggerFallback(messageId)) {
      return;
    }

    const emailLower = t.peerEmail.toLowerCase();
    const session = this.peerSessions.get(emailLower);

    // 🚀 FIX 5: Recipient must be ONLINE to proced
    if (!this.isPeerOnline(emailLower)) {
      t.status = 'WAITING_FOR_PEER';
      console.log(`[P2P] ${messageId} -> WAITING_FOR_PEER (Recipient offline)`);
      return;
    }

    if (!session?.ready) {
      console.log(`[P2P] Wait: Session not ready for ${emailLower}. Handshaking...`);
      this.ensureSession(emailLower, messageId);
      return;
    }

    if (t.offered) {
      // Already sent offer, waiting for ACK
      return;
    }

    // ALL CONDITIONS MET - SEND OFFER
    console.log(`[P2P SEND] Triggering offer for ${messageId}`);
    t.status = 'TRANSFERRING';
    this.startActualChunkTransfer(t);
  }


  private async startActualChunkTransfer(t: any) {
    const totalChunks = Math.ceil(t.file.size / P2P_LIMITS.CHUNK_SIZE);
    t.totalChunks = totalChunks;
    t.status = 'TRANSFERRING';

    // Store in activeTransfers for tracking
    this.activeTransfers.set(t.messageId, {
      messageId: t.messageId,
      recipientEmail: t.peerEmail,
      files: [t.file],
      totalChunks,
      progress: 0,
      bytesSent: 0,
      paused: false,
      phase: TransferPhase.SENDING,
      currentChunkIndex: 0,
      lastChunkTime: Date.now()
    });

    // Send original offer securely
    this.send({
      type: 'p2p-offer',
      to: t.peerEmail,
      from: this.email,
      messageId: t.messageId,
      data: {
        fileName: t.file.name,
        size: t.file.size,
        mimeType: t.file.type,
        totalChunks
      }
    });

    t.offered = true;
    console.log(`[P2P SERVER] Offer sent for ${t.messageId}. Standing by for chunk requests...`);
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

        // 1. Mandatory registration (IMMEDIATE)
        this.ws?.send(JSON.stringify({
          type: 'register',
          token: authService.getToken(), // ✅ FIX: Missing token caused connection rejection
          email: this.email, // Standard field
          from: this.email,  // Legacy compatibility
          userId: this.userId,
          publicKey: Array.from(new Uint8Array(pub)),
          timestamp: Date.now()
        }));

        // 2. Flush queued signals
        if (this.pendingSignals.length > 0) {
          console.log(`[P2P] Flushing ${this.pendingSignals.length} queued signals`);
          this.pendingSignals.forEach(m => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify(m));
            }
          });
          this.pendingSignals = [];
        }

        // Reset retry count on successful registration-ready state
        this.retryCount = 0;
        if (this.reconnectionTimeout) {
          clearTimeout(this.reconnectionTimeout);
          this.reconnectionTimeout = null;
        }
      };

      this.ws.onmessage = async (e) => {
        try {
          const message = JSON.parse(e.data);
          await this.handle(message);
        } catch (err) {
          console.error('[P2P] Parse error', err);
        }
      };

      this.ws.onclose = (event) => {
        console.warn(`[P2P] WebSocket closed: Code=${event.code}, Reason=${event.reason}`);
        this.connected = false;
        this.isRegistering = false;
        this.notifyConnection(false);

        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }

        // Clear presence data on disconnect
        setOnlinePeers([]);

        if (!authService.getToken()) {
          console.error('[P2P] No auth token available. Stopping reconnection loop.');
          return;
        }

        // Backoff Reconnection Logic
        this.scheduleReconnectWithBackoff(userId, email);
      };

      this.ws.onerror = () => {
        this.isRegistering = false;
      };

    } catch (e) {
      console.error('[P2P] Connection error', e);
      this.isRegistering = false;
      this.scheduleReconnectWithBackoff(userId, email);
    }
  }

  private scheduleReconnectWithBackoff(userId: string | number, email: string) {
    if (this.reconnectionTimeout) clearTimeout(this.reconnectionTimeout);

    // Auth guard - don't reconnect if we lost the token
    if (!authService.getToken()) return;

    const delay = Math.min(30000, 1000 * Math.pow(2, this.retryCount));
    console.log(`[P2P] Scheduling reconnection in ${delay}ms (Attempt ${this.retryCount + 1})`);

    this.reconnectionTimeout = setTimeout(() => {
      this.retryCount++;
      this.connect(userId, email);
    }, delay);
  }

  private async handle(msg: StrictMessage) {
    switch (msg.type) {
      case 'registered':
        this.connected = true;
        this.isRegistering = false;
        console.log('[P2P] Successfully registered as', msg.email);
        this.notifyConnection(true);

        // Start heartbeat
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 15000); // 🚀 15s heartbeats to keep socket alive forever

        // ✅ FIX 2: Load initial peer list from registration response
        if (msg.onlinePeers && Array.isArray(msg.onlinePeers)) {
          console.log('[P2P] Initial online peers:', msg.onlinePeers);
          setOnlinePeers(msg.onlinePeers);
        }

        // Immediately notify with current state (might be empty initially)
        import('./presenceStore').then(({ getOnlinePeersSnapshot }) => {
          this.notifyPresenceListeners(Array.from(getOnlinePeersSnapshot()));
        });

        await this.rehydrateReceiverTransfers();
        await this.rehydrateSenderTransfers();

        // Trigger resumption check
        this.triggerPresenceResumption();
        break;

      case 'key-exchange-init': {
        const { from, publicKey, messageId } = msg;
        if (!from || !publicKey || !messageId) return;

        console.log(`[P2P] Received handshake init from ${from} for ${messageId}`);
        const peerPub = await importPublicKey(new Uint8Array(publicKey).buffer);
        const sharedKey = await deriveSharedKey(this.keyPair.privateKey, peerPub);

        const emailLower = from.toLowerCase();
        this.peerSessions.set(emailLower, {
          sessionKey: sharedKey,
          ready: true,
          handshaking: false
        });

        // Send Ack with our public key
        const myPub = await exportPublicKey(this.keyPair.publicKey);
        this.send({
          type: 'key-exchange-ack',
          to: from,
          from: this.email,
          publicKey: Array.from(new Uint8Array(myPub)),
          messageId
        });

        console.log(`[P2P] Session key established for ${emailLower} (Responder)`);

        // Now trigger logic for ALL transfers involving this peer
        if (messageId) {
          const rt = this.receiverTransfers.get(messageId);
          if (rt) {
            rt.status = 'KEY_READY';
            console.log(`[P2P] Receiver state -> KEY_READY for ${messageId}`);
            // 🚀 ERASE BUFFER to prevent stale-decryption errors. Watchdog will re-fetch.
            this.receiverChunkBuffer.get(messageId)?.clear();
            this.pullMissingChunks(messageId, from);
          }
          this.tryStartSender(messageId);
        }

        // Also check for other transfers with this peer
        this.receiverTransfers.forEach((r, mid) => {
          if (this.transferSenders.get(mid)?.toLowerCase() === emailLower && r.status === 'HANDSHAKING') {
            r.status = 'KEY_READY';
            this.pullMissingChunks(mid, from);
          }
        });

        break;
      }

      case 'key-exchange-ack': {
        const { from, publicKey, messageId } = msg;
        if (!from || !publicKey || !messageId) return;

        console.log(`[P2P] Received handshake ack from ${from} for ${messageId}`);
        const peerPub = await importPublicKey(new Uint8Array(publicKey).buffer);
        const sharedKey = await deriveSharedKey(this.keyPair.privateKey, peerPub);

        const emailLower = from.toLowerCase();
        this.peerSessions.set(emailLower, {
          sessionKey: sharedKey,
          ready: true,
          handshaking: false
        });

        console.log(`[P2P] Session key established for ${emailLower} (Initiator)`);

        // If this ACK was for a specific transfer, trigger it
        if (messageId) {
          const rt = this.receiverTransfers.get(messageId);
          if (rt) {
            rt.status = 'KEY_READY';
            // 🚀 ERASE BUFFER to prevent stale-decryption errors. Watchdog will re-fetch.
            this.receiverChunkBuffer.get(messageId)?.clear();
            this.pullMissingChunks(messageId, from);
          }
          this.tryStartSender(messageId);
        }

        // Broad trigger for any waiting transfers with this peer
        this.receiverTransfers.forEach((r, mid) => {
          if (this.transferSenders.get(mid)?.toLowerCase() === emailLower && (r.status === 'HANDSHAKING' || r.status === 'INIT')) {
            r.status = 'KEY_READY';
            this.pullMissingChunks(mid, from);
          }
        });

        break;
      }

      case 'presence-update':
        // ✅ FIX 1: STRICT SERVER AUTHORITY (MASTER CHECKLIST COMPLIANCE)
        if (Array.isArray(msg.online)) {
          console.log(`[P2P][PRESENCE] Received update with ${msg.online.length} peers:`, JSON.stringify(msg.online));
          setOnlinePeers(msg.online);
          this.notifyPresenceListeners(msg.online);
        }
        break;
      case 'peer-online':
        if (msg.email) {
          updatePeerStatus(msg.email, true);
          console.log("[P2P][PRESENCE] Peer online:", msg.email);
          toast(`${msg.email} is online`, { icon: '🟢', position: 'bottom-right' });

          // 🚀 AUTO-RESUME: Check if we have incomplete transfers from this peer
          const emailLower = msg.email.toLowerCase();
          this.receiverTransfers.forEach((rt, messageId) => {
            const sender = this.transferSenders.get(messageId);
            if (sender?.toLowerCase() === emailLower) {
              if (rt.status === 'PAUSED' || rt.status === 'HANDSHAKING' || rt.status === 'FAILED') {
                console.log(`[P2P] Auto-resuming transfer ${messageId} from ${sender}`);
                rt.status = 'HANDSHAKING';
                this.ensureSession(sender, messageId);
              }
            }
          });
        }
        break;

      case 'peer-offline':
        if (msg.email) {
          const email = normalizeEmail(msg.email);
          updatePeerStatus(email, false);
          console.log("[P2P][PRESENCE] Peer offline:", email);

          // Mark active transfers from this peer as PAUSED
          this.receiverTransfers.forEach((rt, messageId) => {
            const registeredSender = this.transferSenders.get(messageId);
            if (registeredSender?.toLowerCase() === email && rt.status === 'RECEIVING') {
              rt.status = 'PAUSED';
              window.dispatchEvent(new CustomEvent('p2p-receiver-progress', {
                detail: {
                  messageId,
                  percentage: Math.round((rt.receivedChunks.size / rt.totalChunks) * 100),
                  status: 'PAUSED',
                  from: email,
                  fileName: rt.fileName
                }
              }));
            }
          });

          // 🚀 Also mark outgoing transfers to this peer as QUEUED/PENDING
          this.senderTransferRegistry.forEach((t) => {
            if (t.peerEmail.toLowerCase() === email && t.status === 'TRANSFERRING') {
              t.status = 'QUEUED';
              window.dispatchEvent(new CustomEvent('p2p-progress', {
                detail: {
                  messageId: t.messageId,
                  progress: Math.round((t.currentChunkIndex / t.totalChunks) * 100),
                  status: 'pending'
                }
              }));
            }
          });
        }
        break;

      case 'room-joined':
        window.dispatchEvent(new CustomEvent('p2p-room-joined', { detail: msg }));
        break;

      case 'error':
        console.error('[P2P] Server error:', msg.message);
        if (msg.message === 'Invalid auth token') {
          console.error('[P2P] Auth failed. Stopping reconnection loop.');
          this.isRegistering = false;
          this.connected = false;
          toast.error('Session expired. Please log in again.', { id: 'p2p-auth-error' });
          // Force disconnect but DO NOT reconnect
          if (this.ws) {
            this.ws.onclose = null; // Prevent the retry in onclose
            this.ws.close();
            this.ws = null;
          }
          this.notifyConnection(false);
        }
        break;

      case 'transfer-complete': {
        const { messageId } = msg;
        if (messageId) {
          console.log(`[P2P] Received transfer-complete for ${messageId}. Releasing sender resources.`);
          this.cleanupTransfer(messageId); // Senders can wipe the file record too
        }
        break;
      }

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
        if (!from || !messageId || !data) {
          console.error('[P2P] Malformed p2p-offer', msg);
          return;
        }

        this.transferSenders.set(messageId, from);
        localStorage.setItem(`p2p-sender-${messageId}`, from);

        // 🚀 FIX: Don't overwrite if exists
        if (this.completedTransfers.has(messageId) || await this.hasReceivedFile(messageId)) {
          console.log(`[P2P] Already have file for offer ${messageId}. Sending completion ack.`);
          this.completedTransfers.add(messageId);

          // Tell sender to stop
          this.send({
            type: 'transfer-complete',
            to: from,
            from: this.email,
            messageId
          });
          return;
        }

        if (!this.receiverTransfers.has(messageId)) {
          // Initialize state
          const rt: ReceiverTransferState = {
            messageId,
            fileName: data.fileName,
            mimeType: data.mimeType,
            totalChunks: data.totalChunks,
            receivedChunks: new Set(),
            verifiedChunks: new Set(),
            failedChunks: new Set(),
            status: 'INIT',
            reason: null,
            lastUpdated: Date.now(),
            actualSize: data.size,
            startTime: Date.now(),
            chunkSize: data.chunkSize || P2P_LIMITS.CHUNK_SIZE // 🚀 Store chunk size from sender
          };

          this.receiverTransfers.set(messageId, rt);
          this.transferSenders.set(messageId, from);

          // Persistent meta
          await saveMeta(messageId, {
            fileName: data.fileName,
            mimeType: data.mimeType,
            totalChunks: data.totalChunks,
            actualSize: data.size,
            chunkSize: rt.chunkSize, // Ensure persistent
            is_p2p: true,
            timestamp: Date.now()
          }).catch(err => console.error('[P2P] Failed to persist meta:', err));

          // Sync progress from DB in case we refreshed
          await this.syncReceiverStateFromDB(messageId);

          // 🚀 Dispatch only on NEW transfer
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
        } else {
          const rt = this.receiverTransfers.get(messageId)!;
          if (rt.totalChunks !== data.totalChunks) {

            // 🚀 SMART MIGRATION: If we have the FULL file, don't reset. Just update meta.
            if (await this.hasReceivedFile(messageId)) {
              console.log(`[P2P] Migrating metadata for COMPLETED file ${messageId} (Protocol Change)`);
              rt.totalChunks = data.totalChunks;
              rt.chunkSize = data.chunkSize || P2P_LIMITS.CHUNK_SIZE;
              await saveMeta(messageId, {
                fileName: data.fileName,
                mimeType: data.mimeType,
                totalChunks: data.totalChunks, // Update to new count
                actualSize: data.size,
                chunkSize: rt.chunkSize, // Update to new size
                is_p2p: true,
                lastUpdated: Date.now()
              });
              this.completedTransfers.add(messageId);
              rt.status = 'COMPLETED';
              return; // Skip handshake/reset
            }

            console.warn(`[P2P] Metadata mismatch for ${messageId} (Protocol Change?). Resetting DB and state.`);

            // 🚀 CRITICAL: Clear DB chunks because indices are incompatible
            clearChunks(messageId).catch(err => console.error('[P2P] Failed to clear stale chunks:', err));

            this.receiverTransfers.set(messageId, {
              messageId: messageId,
              fileName: data.fileName,
              mimeType: data.mimeType,
              totalChunks: data.totalChunks,
              receivedChunks: new Set(),
              verifiedChunks: new Set(),
              failedChunks: new Set(),
              status: 'INIT',
              reason: null,
              lastUpdated: Date.now(),
              actualSize: data.size,
              startTime: Date.now(),
              chunkSize: data.chunkSize || P2P_LIMITS.CHUNK_SIZE
            });

            // 🚀 Dispatch on RESET transfer
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
          }
        }

        // 🚀 NEW: Rehydrate immediately from IndexedDB to show correct progress
        await this.syncReceiverStateFromDB(messageId);

        // Check if we need handshake
        // 🔒 FIX: Use per-peer ID (email) instead of legacy composite ID
        const emailLower = from.toLowerCase();
        if (!this.peerSessions.has(emailLower) || !this.peerSessions.get(emailLower)?.ready) {
          console.log(`[P2P] Offer requires handshake for ${emailLower}`);
          this.receiverTransfers.get(messageId)!.status = 'HANDSHAKING';
          this.ensureSession(from, messageId);
        } else {
          this.receiverTransfers.get(messageId)!.status = 'KEY_READY';

          // Determine resume index
          let resumeIndex = 0;
          const rt = this.receiverTransfers.get(messageId);
          if (rt) {
            // Find first missing chunk
            for (let i = 0; i < rt.totalChunks; i++) {
              if (!rt.receivedChunks.has(i)) {
                resumeIndex = i;
                break;
              }
              resumeIndex = i + 1; // All caught up
            }
          }

          if (resumeIndex < (rt?.totalChunks || 0)) {
            // Option 1: Legacy Push (Kickstart)
            this.send({
              type: 'p2p-offer-ack',
              to: from,
              from: this.email,
              messageId: messageId,
              resumeIndex
            });

            // Option 2: Active Pull (Robust)
            this.pullMissingChunks(messageId, from);
          }
        }

        // Removed global dispatch to prevent duplicate popups on retry
        break;
      }

      // 🚀 YIELD: Prevent main thread blocking during heavy message processing
      case 'file-chunk': {
        await new Promise(r => setTimeout(r, 0)); // Micro-yield
        const { messageId, chunkIndex, data, from, payload } = msg; // data here is base64 string
        if (!messageId || chunkIndex === undefined || !data || !from) return;

        // 🚀 IGNORE if completed
        if (this.completedTransfers.has(messageId)) {
          // console.log(`[P2P] Ignored chunk ${chunkIndex} for completed ${messageId}`);
          return;
        }

        // Clear from pending if it was requested
        const pending = this.pendingRequests.get(messageId);
        if (pending) pending.delete(chunkIndex);

        try {
          // 🔒 Fix session key lookup (PER-PEER)
          const session = this.peerSessions.get(from.toLowerCase());

          // ✅ FIX 7: Check if chunk already exists (NO DUPLICATES)
          const rt = this.receiverTransfers.get(messageId);
          if (!rt) return;
          if (rt.status === 'COMPLETED') {
            this.completedTransfers.add(messageId);
            return;
          }

          if (!session || !session.sessionKey) {
            console.log(`[P2P RECEIVE] Key not ready, buffering chunk ${chunkIndex} for ${from}`);
            rt.reason = 'Waiting for security handshake...';

            // 🚀 FIX: Proactively trigger handshake if it's missing or dead
            this.ensureSession(from, messageId);

            if (!this.receiverChunkBuffer.has(messageId)) {
              this.receiverChunkBuffer.set(messageId, new Map());
            }
            this.receiverChunkBuffer.get(messageId)!.set(chunkIndex, msg);

            // If not handshaking, trigger it (fail-safe)
            if (!session?.handshaking) {
              this.ensureSession(from, messageId);
            }
            this.notifyReceiverProgress(rt, from);
            return;
          }

          // ✅ FIX: Check if chunk index is within bounds
          if (chunkIndex >= rt.totalChunks) {
            console.warn(`[P2P RECEIVE] Ignoring out-of-bounds chunk ${chunkIndex} (Total: ${rt.totalChunks})`);
            return;
          }

          if (rt.receivedChunks.has(chunkIndex)) {
            console.log(`[P2P RECEIVE] Chunk ${chunkIndex} already received for ${messageId}, skipping`);
            // Still send ACK in case sender didn't receive it
            this.send({
              type: 'chunk-ack',
              to: from,
              from: this.email,
              messageId,
              chunkIndex
            }, true);
            return;
          }

          const buffer = base64ToArrayBuffer(data);

          // Decrypt the chunk
          const decrypted = await decryptChunkAES(session.sessionKey, payload?.iv || [], buffer);

          // 🚀 SPEED OPTIMIZATION: Don't wait for disk I/O before requesting more chunks
          // We mark it as received in memory immediately. Disk persistence happens in background.
          const writePromise = saveChunk(messageId, chunkIndex, decrypted);

          if (!this.pendingDiskWrites.has(messageId)) {
            this.pendingDiskWrites.set(messageId, new Set());
          }
          const writeSet = this.pendingDiskWrites.get(messageId)!;
          writeSet.add(writePromise);

          writePromise.then(() => {
            writeSet.delete(writePromise);
          }).catch(e => {
            console.error('[P2P] Failed to save chunk to disk:', chunkIndex, e);
            rt.receivedChunks.delete(chunkIndex); // Rollback memory state if write fails
            writeSet.delete(writePromise);
          });

          if (rt) {
            rt.receivedChunks.add(chunkIndex);

            // Speed & ETA
            const totalChunks = rt.totalChunks;
            const isDone = rt.receivedChunks.size === totalChunks;
            const cSize = rt.chunkSize || P2P_LIMITS.CHUNK_SIZE;
            this.updateSpeedInfo(rt, rt.receivedChunks.size * cSize, rt.actualSize || (totalChunks * cSize));
            rt.reason = rt.speedBps && rt.speedBps < 50 * 1024
              ? `Low bandwidth detected (${Math.round(rt.speedBps / 1024)} KB/s)...`
              : `Receiving data... (Batch in-flight: ${this.pendingRequests.get(messageId)?.size || 0})`;

            this.notifyReceiverProgress(rt, from);

            this.setupPullWatchdog(messageId, from);

            if (isDone) rt.status = 'COMPLETED';
            else if (rt.status !== 'PAUSED') rt.status = 'RECEIVING';

            if (isDone) {
              // We DO wait for all chunks to be on disk before assembly
              // This happens automatically in assembleFile which calls getChunk() (reading from disk)
              await this.assembleFile(messageId, rt.fileName, rt.mimeType);
            }
          }

          // Ack the chunk (legacy compatibility)
          this.send({
            type: 'chunk-ack',
            to: from,
            from: this.email,
            messageId,
            chunkIndex
          }, true); // Silent

          // 🚀 TRIGGER NEXT BATCH
          this.pullMissingChunks(messageId, from);
        } catch (err) {
          console.error(`[P2P RECEIVE] Decryption failed for chunk ${chunkIndex}`, err);
          // 🚀 CRITICAL FIX: If decryption fails, the key is mismatching.
          // Kill session immediately to force fresh handshake on next attempt.
          this.peerSessions.delete(from.toLowerCase());

          // Re-request immediately
          this.send({
            type: 'chunk-request-batch',
            to: from,
            from: this.email,
            messageId,
            chunkIndices: [chunkIndex]
          }, true);
          return;
        }
        break;
      }

      case 'p2p-offer-ack': {
        const { messageId, from, resumeIndex } = msg;
        if (messageId && from) {
          const startIndex = resumeIndex !== undefined ? resumeIndex : 0;
          console.log(`[P2P SENDER] Offer ACK for ${messageId}. Starting from chunk ${startIndex}.`);
          const t = this.senderTransferRegistry.get(messageId);
          if (t) {
            t.currentChunkIndex = startIndex;
            this.sendSingleChunk(messageId, startIndex, from);
          }
        }
        break;
      }

      case 'resume-request': {
        const { messageId, chunkIndex, requestType, from } = msg;
        if (!messageId || !from) return;

        const t = this.senderTransferRegistry.get(messageId);
        if (!t) return;

        if (requestType === 'metadata') {
          console.log(`[P2P SENDER] Re-sending metadata for ${messageId}`);
          const totalChunks = Math.ceil(t.file.size / P2P_LIMITS.CHUNK_SIZE);
          this.send({
            type: 'p2p-offer',
            to: from,
            from: this.email,
            messageId,
            data: {
              fileName: t.file.name,
              size: t.file.size,
              mimeType: t.file.type,
              totalChunks,
              chunkSize: t.chunkSize // Include chunk size in offer
            }
          });
        } else if (requestType === 'chunk' && chunkIndex !== undefined) {
          this.sendSingleChunk(messageId, chunkIndex, from);
        }
        break;
      }

      case 'chunk-request': {
        const { messageId, chunkIndex, from } = msg;
        if (!messageId || chunkIndex === undefined || !from) return;

        this.sendSingleChunk(messageId, chunkIndex, from);
        break;
      }

      case 'chunk-request-batch': {
        const { messageId, chunkIndices, from } = msg;
        if (!messageId || !chunkIndices || !chunkIndices.length || !from) {
          console.warn('[P2P SERVER] Invalid batch request:', { messageId, chunkIndices, from });
          return;
        }

        console.log(`[P2P SERVER] Received batch request for ${chunkIndices.length} chunks from ${from} for ${messageId}`);

        // Process batch with parallelized preparation to fill network pipe
        (async () => {
          const t = this.senderTransferRegistry.get(messageId);
          if (t) {
            t.status = 'TRANSFERRING';
            t.reason = `Serving ${chunkIndices.length} chunks... (Parallel)`;
          }

          // Parallelize encryption and pushing to socket buffer
          // Up to 8 at a time to avoid CPU starvation, but keep socket full
          const PARALLEL_PREP = 8;
          for (let i = 0; i < chunkIndices.length; i += PARALLEL_PREP) {
            const currentBatch = chunkIndices.slice(i, i + PARALLEL_PREP);
            await Promise.all(currentBatch.map(idx => {
              if (this.ws?.readyState !== WebSocket.OPEN) return Promise.resolve();
              return this.sendSingleChunk(messageId, idx, from);
            }));
          }

          if (t && t.status === 'TRANSFERRING') {
            t.reason = 'Idle (Waiting for next batch request)';
          }
        })();
        break;
      }

      case 'chunk-ack': {
        const { messageId, chunkIndex, from } = msg;
        if (!messageId || chunkIndex === undefined || !from) return;

        const t = this.senderTransferRegistry.get(messageId);
        if (!t) return;

        if (!t.acknowledgedChunks) t.acknowledgedChunks = new Set();
        t.acknowledgedChunks.add(chunkIndex);

        const acked = t.acknowledgedChunks.size;
        const progress = Math.round((acked / t.totalChunks) * 100);
        const bytesSent = Math.min(t.file.size, acked * (t.chunkSize || P2P_LIMITS.CHUNK_SIZE));

        this.updateSpeedInfo(t, bytesSent, t.file.size);

        // Notify UI
        window.dispatchEvent(new CustomEvent('p2p-progress', {
          detail: {
            messageId,
            progress,
            status: acked === t.totalChunks ? 'complete' : 'transferring',
            speedBps: t.speedBps,
            etaSeconds: t.etaSeconds,
            received: bytesSent,
            total: t.file.size,
            startTime: t.startTime,
            totalChunks: t.totalChunks,
            receivedChunks: acked
          }
        }));

        if (acked === t.totalChunks) {
          console.log(`[P2P SENDER] Transfer ${messageId} complete!`);
          t.status = 'COMPLETE';
          t.started = false;
        }
        break;
      }

      case 'progress-sync': {
        const { messageId, progress, data } = msg;
        if (!messageId) return;
        const st = this.senderTransferRegistry.get(messageId);
        if (st && progress !== undefined) {
          console.log(`[P2P SENDER] Progress sync received for ${messageId}: ${progress} chunks`);
          if (!st.acknowledgedChunks) st.acknowledgedChunks = new Set();

          if (Array.isArray(data)) {
            // Full set sync
            data.forEach(idx => st.acknowledgedChunks!.add(idx));
          } else {
            // Rough count sync (backwards compatibility or large file optimization)
            // If we have nothing, at least show the count. 
            // Better to assume they are the first N chunks if we don't have the list.
            if (st.acknowledgedChunks.size < progress) {
              for (let i = 0; i < progress; i++) st.acknowledgedChunks.add(i);
            }
          }

          const currentProgress = Math.round((st.acknowledgedChunks.size / st.totalChunks) * 100);
          window.dispatchEvent(new CustomEvent('p2p-progress', {
            detail: {
              messageId,
              progress: currentProgress,
              status: currentProgress === 100 ? 'complete' : 'transferring',
              reason: 'Synced with receiver',
              speedBps: st.speedBps,
              etaSeconds: st.etaSeconds
            }
          }));
        }
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

    // 🚀 CRITICAL: Wait for all background disk writes to complete
    const pending = this.pendingDiskWrites.get(messageId);
    if (pending && pending.size > 0) {
      console.log(`[P2P] Waiting for ${pending.size} pending disk writes for ${messageId}...`);
      await Promise.all(Array.from(pending));
      // Clear the set after all promises resolve
      this.pendingDiskWrites.delete(messageId);
      console.log(`[P2P] All disk writes completed for ${messageId}`);
    }

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
    this.completedTransfers.add(messageId);

    // Save complete file to DB
    await saveFile(messageId, {
      fileName,
      mimeType,
      blob: fileBlob,
      size: fileBlob.size,
      timestamp: Date.now()
    });

    // Cleanup temporary state but KEEP the file in IndexedDB
    console.log('[P2P] Download complete, cleaning up temporary chunks');
    this.cleanupTransfer(messageId, false); // wipeFile = false

    // Notify sender we are done
    const sender = this.transferSenders.get(messageId);
    if (sender) {
      this.send({
        type: 'transfer-complete',
        to: sender,
        from: this.email,
        messageId
      });
    }

    window.dispatchEvent(new CustomEvent('p2p-file-ready', {
      detail: { messageId, fileName, blob: fileBlob }
    }));
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
    console.log(`[P2P] Registered sender transfer ${messageId} for ${recipientEmail}`);

    // Register the transfer
    const chunkSize = P2P_LIMITS.CHUNK_SIZE;
    this.senderTransferRegistry.set(messageId, {
      fileId: messageId,
      file: file,
      peerEmail: recipientEmail,
      messageId: messageId,
      started: false,
      offered: false,
      currentChunkIndex: 0,
      totalChunks: Math.ceil(file.size / chunkSize),
      status: 'QUEUED',
      acknowledgedChunks: new Set(),
      startTime: Date.now(),
      speedBps: 0,
      etaSeconds: null,
      chunkSize: chunkSize // 🚀 Bind chunk size to this session
    });

    // 🚀 Persist for reliability across refreshes (INCLUDING BLOB)
    try {
      // 1. Save File Blob to IndexedDB so it survives refresh!
      await saveFile(messageId, {
        fileName: file.name,
        mimeType: file.type,
        blob: file,
        size: file.size,
        timestamp: Date.now()
      });

      // 2. Save metadata to IndexedDB
      await saveMeta(messageId, {
        fileName: file.name,
        mimeType: file.type,
        totalChunks: Math.ceil(file.size / chunkSize),
        actualSize: file.size,
        chunkSize: chunkSize,
        is_p2p: true,
        timestamp: Date.now()
      });

      // Register in pending transfers (for UI/status tracking)
      await savePendingTransfer(`sender-info-${messageId}`, {
        type: 'sender-transfer',
        messageId,
        peerEmail: recipientEmail,
        fileId: messageId,
        fileName: file.name
      });
      console.log(`[P2P] Persisted sender metadata for ${messageId} (No blob stored)`);
    } catch (err) {
      console.warn(`[P2P] Could not persist sender metadata:`, err);
    }

    // Attempt to start (will trigger handshake if needed via ensureSession)
    this.tryStartSender(messageId);
  }

  private async rehydrateSenderTransfers() {
    console.log('[P2P] Rehydrating sender transfers...');
    try {
      const allPending = await getAllPendingTransfers();
      let count = 0;

      for (const pending of allPending) {
        if (pending.type === 'sender-transfer') {
          const { messageId, peerEmail } = pending;
          if (this.senderTransferRegistry.has(messageId)) continue;

          const fileData = await getFile(messageId);
          const meta = await getMeta(messageId);

          if (fileData?.blob) {
            console.log(`[P2P] Rehydrated sender transfer ${messageId} for ${peerEmail}`);
            const cSize = meta?.chunkSize || P2P_LIMITS.CHUNK_SIZE;
            this.senderTransferRegistry.set(messageId, {
              fileId: messageId,
              file: fileData.blob,
              peerEmail: peerEmail,
              messageId: messageId,
              started: false,
              offered: false,
              currentChunkIndex: 0,
              totalChunks: meta?.totalChunks || Math.ceil(fileData.blob.size / cSize),
              status: 'QUEUED',
              acknowledgedChunks: new Set(),
              startTime: Date.now(),
              speedBps: 0,
              etaSeconds: null,
              chunkSize: cSize
            });
            count++;

            // If peer is already online, try starting (but handle() 'online-peers' also does this)
            if (isPeerOnlineStore(peerEmail.toLowerCase())) {
              this.tryStartSender(messageId);
            }
          }
        }
      }
      if (count > 0) {
        console.log(`[P2P] Rehydrated ${count} sender transfers`);
        // 🚀 Trigger presence check immediately for these rehydrated transfers
        this.triggerPresenceResumption();
      }
    } catch (err) {
      console.error('[P2P] Failed to rehydrate sender transfers', err);
    }
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





  private async pullMissingChunks(messageId: string, sender: string) {
    const rt = this.receiverTransfers.get(messageId);

    // ✅ FIX: Don't pull if completed or paused
    if (!rt) return;
    if (rt.status === 'COMPLETED' || rt.receivedChunks.size === rt.totalChunks) {
      if (rt.status !== 'COMPLETED') {
        rt.status = 'COMPLETED';
        await this.assembleFile(messageId, rt.fileName, rt.mimeType);
      }
      return;
    }
    if (rt.status === 'FAILED' || rt.status === 'PAUSED') return;

    rt.status = 'RECEIVING';

    const total = rt.totalChunks;
    const received = rt.receivedChunks;

    if (!this.pendingRequests.has(messageId)) {
      this.pendingRequests.set(messageId, new Set());
    }
    const pending = this.pendingRequests.get(messageId)!;

    // Pull strategy: request up to X sequential missing chunks
    // 🚀 MAX THROUGHOUT MODE: 2MB Chunks * 10 = 20MB In-Flight
    // Balanced for 10GB+ files without crashing 
    const CONCURRENCY = 10;
    const BATCH_SIZE = 4;
    let requestedCount = 0;

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    let startFound = -1;
    for (let i = 0; i < total; i++) {
      if (!received.has(i)) {
        startFound = i;
        break;
      }
    }

    if (startFound === -1) return;

    const batch: number[] = [];

    for (let i = startFound; i < total; i++) {
      if (requestedCount >= CONCURRENCY) break;
      if (!received.has(i) && !pending.has(i)) {
        pending.add(i);
        batch.push(i);
        requestedCount++;
      }

      if (batch.length >= BATCH_SIZE) {
        this.send({
          type: 'chunk-request-batch' as any,
          to: sender,
          from: this.email,
          messageId,
          chunkIndices: [...batch]
        }, true);
        batch.length = 0;
      }
    }

    if (batch.length > 0) {
      console.log(`[P2P CLIENT] Requesting ${batch.length} chunks from ${sender} for ${messageId}`);
      this.send({
        type: 'chunk-request-batch' as any,
        to: sender,
        from: this.email,
        messageId,
        chunkIndices: [...batch]
      }, true);
    }

    this.setupPullWatchdog(messageId, sender);
    rt.reason = `Requesting bits... (${pending.size} pending)`;
    this.notifyReceiverProgress(rt, sender);
  }

  private notifyReceiverProgress(rt: ReceiverTransferState, from: string) {
    const totalChunks = rt.totalChunks;
    const receivedChunks = rt.receivedChunks.size;
    const isDone = receivedChunks === totalChunks;
    const cSize = rt.chunkSize || P2P_LIMITS.CHUNK_SIZE;
    const progress = isDone ? 100 : Math.floor((receivedChunks / totalChunks) * 100);
    const totalBytes = rt.actualSize || (totalChunks * cSize);
    const receivedBytes = Math.min(totalBytes, rt.receivedChunks.size * cSize);

    window.dispatchEvent(new CustomEvent('p2p-receiver-progress', {
      detail: {
        messageId: rt.messageId,
        percentage: progress,
        progress,
        received: receivedBytes,
        total: totalBytes,
        status: isDone ? 'complete' : rt.status,
        from,
        fileName: rt.fileName,
        speedBps: rt.speedBps,
        etaSeconds: rt.etaSeconds,
        reason: rt.reason,
        startTime: rt.startTime,
        totalChunks: rt.totalChunks,
        receivedChunks: rt.receivedChunks.size
      }
    }));
  }

  private async sendSingleChunk(messageId: string, chunkIndex: number, recipient: string) {
    const t = this.senderTransferRegistry.get(messageId);
    if (!t) return;

    const emailLower = recipient.toLowerCase();
    const session = this.peerSessions.get(emailLower);
    if (!session || !session.sessionKey) return;

    try {
      const ws = this.ws as any;
      // 🚀 CRITICAL FIX: Drastically lowered buffer limit (128MB -> 4MB)
      // Why? A 128MB buffer takes minutes to clear on slow networks, blocking Pings and causing timeouts.
      // 4MB = ~3 seconds at 10Mbps. Keeps socket responsive.
      if (ws && ws.bufferedAmount > 4 * 1024 * 1024) {
        // console.log(`[P2P SENDER] Backpressure: ${ws.bufferedAmount} bytes buffered. Throttling...`);
        await new Promise(r => setTimeout(r, 10));
        while (ws && ws.bufferedAmount > 1 * 1024 * 1024) { // Wait until it drops to 1MB
          await new Promise(r => setTimeout(r, 50));
        }
      }

      const cSize = t.chunkSize || P2P_LIMITS.CHUNK_SIZE;
      const offset = chunkIndex * cSize;
      const chunkBlob = t.file.slice(offset, offset + cSize);
      const buffer = await chunkBlob.arrayBuffer();
      const encrypted = await encryptChunkAES(session.sessionKey, buffer);
      const base64 = arrayBufferToBase64(encrypted.data);

      this.send({
        type: 'file-chunk',
        to: recipient,
        from: this.email,
        messageId,
        chunkIndex,
        data: base64,
        payload: { iv: encrypted.iv } as any
      }, true); // Silent for speed

      // console.log(`[P2P SERVER] Sent chunk ${chunkIndex} to ${recipient}`);

    } catch (err: any) {
      console.error(`[P2P SERVER] Failed to serve chunk ${chunkIndex}`, err);

      // 🚀 ERROR RECOVERY: Handle lost file permissions / stale file handles
      if (err.name === 'NotReadableError' || err.message?.includes('could not be read')) {
        console.warn(`[P2P] File handle lost for chunk ${chunkIndex}. Attempting rehydration from IndexedDB...`);

        try {
          // Try to get fresh blob from IDB
          const t = this.senderTransferRegistry.get(messageId);
          if (!t) return;

          // Prevent infinite recursion loops
          if ((t as any)._rehydrationAttempts && (t as any)._rehydrationAttempts > 3) {
            this.cancelSenderTransfer(messageId);
            toast.error('File access lost. Please re-select the file.');
            return;
          }
          (t as any)._rehydrationAttempts = ((t as any)._rehydrationAttempts || 0) + 1;

          const fileData = await getFile(messageId);
          if (fileData && fileData.blob) {
            console.log(`[P2P] Successfully refreshed file handle from IDB for ${messageId}`);
            t.file = fileData.blob; // Update handle

            // Retry sending this chunk immediately
            await this.sendSingleChunk(messageId, chunkIndex, recipient);
            return;
          } else {
            throw new Error("File not found in IndexedDB");
          }
        } catch (recoveryErr) {
          console.error('[P2P] Recovery failed:', recoveryErr);
          this.cancelSenderTransfer(messageId);
          this.send({
            type: 'transfer-error',
            to: recipient,
            messageId,
            error: 'SENDER_FILE_ACCESS_LOST'
          });
          toast.error('File transfer failed: Access to file was lost.');
        }
      }
    }
  }

  private async rehydrateReceiverTransfers() {
    console.log('[P2P] Rehydrating transfers from storage...');
    const metas = await getAllMetas();

    for (const meta of metas) {
      const { messageId, fileName, mimeType, totalChunks } = meta;

      // 🚀 FIX: Skip rehydrating as a receiver if we are already the sender for this file
      if (this.senderTransferRegistry.has(messageId)) {
        console.log(`[P2P] Skipping receiver rehydration for sent file: ${fileName}`);
        continue;
      }

      if (this.receiverTransfers.has(messageId)) continue;

      const finished = await this.hasReceivedFile(messageId);
      const receivedIndexes = await getReceivedChunkIndexes(messageId); // Get actual received chunks

      const rt: ReceiverTransferState = {
        messageId,
        fileName,
        mimeType,
        totalChunks,
        receivedChunks: new Set(receivedIndexes),
        verifiedChunks: new Set(receivedIndexes),
        failedChunks: new Set(),
        status: finished ? 'COMPLETED' : 'INIT',
        reason: null,
        lastUpdated: Date.now(),
        actualSize: meta.size,
        startTime: Date.now(),
        speedBps: 0,
        etaSeconds: null
      };

      this.receiverTransfers.set(messageId, rt);

      // 🚀 CRITICAL FIX: Only sync legacy state if NOT completed.
      // If we have the file, we are done. Period.
      if (finished) {
        rt.status = 'COMPLETED';
        this.completedTransfers.add(messageId);
        console.log(`[P2P] Rehydrated COMPLETED transfer: ${fileName}`);
      } else {
        // Only IF not finished, try to recover 'PAUSED'/'RECEIVING' state
        await this.syncReceiverStateFromDB(messageId);
        console.log(`[P2P] Rehydrated ACTIVE transfer: ${fileName} (${rt.status})`);
      }
    }
  }

  // Legacy stubs
  retryTransfer(msgId: string) {
    console.log('[P2P] retryTransfer stub called for', msgId);
  }

  resumeSending(_msgId: string) {
    console.log('[P2P] resumeSending stub called');
  }

  private updateSpeedInfo(state: any, currentBytes: number, totalBytes: number) {
    const now = Date.now();

    // 🚀 CRITICAL: Ensure initialization for accurate speed tracking
    if (!state.startTime) state.startTime = now;
    if (!state.lastTime) state.lastTime = now;
    if (state.lastBytes === undefined) state.lastBytes = currentBytes;

    const elapsed = (now - state.lastTime) / 1000;

    // Update every 1s for more stable readings with large 16MB chunks
    if (elapsed >= 1.0) {
      const bytesDiff = currentBytes - (state.lastBytes || 0);
      const currentSpeed = bytesDiff / elapsed;

      // Exponential Moving Average for smoothness (80% weight to history)
      state.speedBps = state.speedBps && state.speedBps > 0
        ? (state.speedBps * 0.8 + currentSpeed * 0.2)
        : currentSpeed;

      state.lastTime = now;
      state.lastBytes = currentBytes;

      if (state.speedBps > 0) {
        const remainingBytes = Math.max(0, totalBytes - currentBytes);
        state.etaSeconds = Math.ceil(remainingBytes / state.speedBps);
      } else {
        state.etaSeconds = null;
      }
    }
  }

  private setupPullWatchdog(messageId: string, sender: string) {
    if (this.pullWatchdogs.has(messageId)) clearTimeout(this.pullWatchdogs.get(messageId));

    this.pullWatchdogs.set(messageId, setTimeout(() => {
      const rt = this.receiverTransfers.get(messageId);
      if (rt && rt.status === 'RECEIVING' && rt.receivedChunks.size < rt.totalChunks) {
        console.log(`[P2P] Watchdog: No chunks received for 5s. Clearing pending and re-pulling ${messageId}`);
        rt.reason = 'Network is unstable. Retrying connection...';
        this.notifyReceiverProgress(rt, sender);

        // 🚀 CRITICAL: Clear pending requests so pullMissingChunks can re-request stuck chunks
        this.pendingRequests.delete(messageId);
        this.pullMissingChunks(messageId, sender);
      }
    }, 4000)); // 🚀 4s Watchdog (Balanced)
  }
}

export const p2pService = StrictP2PService.getInstance();
