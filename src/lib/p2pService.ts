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
  clearChunks
} from './p2pStorage';
import toast from 'react-hot-toast';
import { normalizeEmail } from '../utils/normalizeEmail';
import { setOnlinePeers, updatePeerStatus, isPeerOnline as isPeerOnlineStore, subscribePresence } from './presenceStore';
import { authService } from './authService';

/* ---------------------------------------------------- */
/* -------------------- CONSTANTS --------------------- */
/* ---------------------------------------------------- */

const P2P_LIMITS = {
  BASE_KBPS: 999999,    // Unlimited - no throttling
  MIN_KBPS: 999999,     // Unlimited - no throttling  
  MAX_KBPS: 999999,     // Unlimited - no throttling
  CHUNK_SIZE: 256 * 1024, // 256KB chunks (Balanced for speed/stability)
};

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
  timestamp?: number;
  meetingId?: string;
  userId?: string | number;
  email?: string;
  requestType?: string;
  chunkIndices?: number[];
  resumeIndex?: number;
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
  status: 'INIT' | 'HANDSHAKING' | 'KEY_READY' | 'RECEIVING' | 'COMPLETED' | 'FAILED' | 'PAUSED';
  reason: StopReason;
  lastUpdated: number;
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
  }>();

  private activeTransfers = new Map<string, TransferState>();
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
    console.log("🚀 [P2P SERVICE] V15 LOADED - TRANSFER LOOP FIXED");
    // suppress unused warnings for some members if they were to be used later
    // console.log(this.currentProcessingMessageId); 

    // ✅ FIX 8: Resume trigger when recipient comes online (Store Subscription)
    subscribePresence(() => {
      this.triggerPresenceResumption();
    });
  }

  // --- CORE WEBSOCKET METHODS ---

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

  hasSessionKey(email: string, messageId?: string): boolean {
    const emailLower = email.toLowerCase();
    if (messageId) {
      const compositeId = `${emailLower}:${messageId}`;
      const session = this.peerSessions.get(compositeId);
      return !!(session && session.ready && session.sessionKey);
    }
    // If no messageId, check if ANY session exists for this peer
    for (const [id, session] of this.peerSessions.entries()) {
      if (id.startsWith(`${emailLower}:`) && session.ready && session.sessionKey) {
        return true;
      }
    }
    return false;
  }

  hasReceivedFileSync(messageId: string): boolean {
    return this.receivedFiles.has(messageId);
  }

  onPresenceChange(cb: (peers: Set<string>) => void) {
    return subscribePresence((peers) => {
      cb(peers);
    });
  }

  private notifyPresence() {
    // Deprecated: presenceStore handles notification
  }

  // ✅ FIX 6: TRIGGER RESUME ON PRESENCE CHANGE
  private triggerPresenceResumption() {
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

  getOnlinePeers(): Set<string> {
    return new Set(); // Deprecated, use presenceStore
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
        detail: {
          messageId,
          percentage: 100,
          received: 100,
          total: 100,
          status: 'COMPLETED',
          from: senderEmail || this.transferSenders.get(messageId),
          fileName: 'Downloaded File'
        }
      }));
      window.dispatchEvent(new CustomEvent('p2p-file-ready', { detail: { messageId } }));
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

      window.dispatchEvent(new CustomEvent('p2p-error', {
        detail: {
          messageId,
          error: 'Sender is offline. Transfer will start automatically when they connect.',
          code: 'SENDER_OFFLINE'
        }
      }));

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

    // 🚀 Switch to pull model for resume
    console.log(`[P2P] Resuming pull loop for ${messageId} from ${sender}`);
    const compositeId = `${sender.toLowerCase()}:${messageId}`;
    if (!this.peerSessions.has(compositeId)) {
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

    const approxTotalBytes = total * P2P_LIMITS.CHUNK_SIZE;
    const approxReceivedBytes = count * P2P_LIMITS.CHUNK_SIZE;

    console.log(`[P2P] Synced ${count}/${total} chunks for ${messageId} (${progress}%)`);

    window.dispatchEvent(new CustomEvent('p2p-receiver-progress', {
      detail: {
        messageId,
        percentage: progress,
        progress,
        received: approxReceivedBytes,
        total: approxTotalBytes,
        status: progress === 100 ? 'COMPLETED' : 'RECEIVING',
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
  private ensureSession(peerEmail: string, messageId: string) {
    const emailLower = peerEmail.toLowerCase();
    const compositeId = `${emailLower}:${messageId}`;
    const t = this.senderTransferRegistry.get(messageId);

    // 🚀 FIX 5: Sender must WAIT, not handshake if recipient is offline
    if (!isPeerOnlineStore(emailLower)) {
      console.log(`[P2P] Peer ${emailLower} is OFFLINE. Setting status to WAITING_FOR_PEER for ${messageId}`);
      if (t) {
        t.status = 'WAITING_FOR_PEER';
        window.dispatchEvent(new CustomEvent('p2p-progress', {
          detail: { messageId, progress: 0, status: 'pending' }
        }));
      }
      return;
    }

    const session = this.peerSessions.get(compositeId);

    // 🔥 You must NEVER handshake again once a peer session exists for this transfer
    if (session) {
      if (session.ready) {
        // Session already established, try to start
        this.tryStartSender(messageId);
        return;
      }
      if (session.handshaking) {
        console.log(`[P2P] Handshake already in progress for ${compositeId}`);
        return;
      }
    }

    console.log(`[P2P] Recipient ONLINE -> Starting HANDSHAKE for ${compositeId}`);
    if (t) {
      t.status = 'HANDSHAKING';
      window.dispatchEvent(new CustomEvent('p2p-progress', {
        detail: { messageId, progress: 0, status: 'sending' }
      }));
    }

    this.peerSessions.set(compositeId, {
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
    const compositeId = `${emailLower}:${messageId}`;
    const session = this.peerSessions.get(compositeId);

    // 🚀 FIX 5: Recipient must be ONLINE to proced
    if (!this.isPeerOnline(emailLower)) {
      t.status = 'WAITING_FOR_PEER';
      console.log(`[P2P] ${messageId} -> WAITING_FOR_PEER (Recipient offline)`);
      return;
    }

    if (!session?.ready) {
      console.log(`[P2P] Wait: Session not ready for ${compositeId}. Handshaking...`);
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
        this.notifyConnection(false);
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
        this.isRegistering = false;
        console.log('[P2P] Successfully registered as', msg.email);
        this.notifyConnection(true);

        // Immediately notify with current state (might be empty initially)
        this.notifyPresence();

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

        const compositeId = `${from.toLowerCase()}:${messageId}`;
        this.peerSessions.set(compositeId, {
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

        console.log(`[P2P] Session key established for ${compositeId} (Receiver)`);

        // Update Receiver state if it exists
        const rt = this.receiverTransfers.get(messageId);
        if (rt && rt.status === 'HANDSHAKING') {
          rt.status = 'KEY_READY';
          console.log(`[P2P] Receiver state -> KEY_READY for ${messageId}`);
        }

        // 4️⃣ Drain buffered chunks AFTER key arrives
        await this.flushBufferedChunks(from, messageId);

        // 5️⃣ Start pulling chunks as the 'Client Server'
        this.pullMissingChunks(messageId, from);
        break;
      }

      case 'key-exchange-ack': {
        const { from, publicKey, messageId } = msg;
        if (!from || !publicKey || !messageId) return;

        console.log(`[P2P] Received handshake ack from ${from} for ${messageId}`);
        const peerPub = await importPublicKey(new Uint8Array(publicKey).buffer);
        const sharedKey = await deriveSharedKey(this.keyPair.privateKey, peerPub);

        const compositeId = `${from.toLowerCase()}:${messageId}`;
        this.peerSessions.set(compositeId, {
          sessionKey: sharedKey,
          ready: true,
          handshaking: false
        });

        console.log(`[P2P] Session key established for ${compositeId} (Sender)`);

        // Now we can start sending!
        this.tryStartSender(messageId);

        // Potentially drain if we were also receiving (though unusual for sender)
        await this.flushBufferedChunks(from, messageId);
        break;
      }

      case 'online-peers':
        // ✅ FIX 4: REPLACE, NOT MERGE
        if (Array.isArray(msg.emails)) {
          setOnlinePeers(msg.emails);
          console.log("[P2P][PRESENCE] Global Online Snapshot Updated");
          // this.triggerPresenceResumption(); // Handled by subscription now
        }
        break;
      case 'peer-online':
        if (msg.email) {
          updatePeerStatus(msg.email, true);
          console.log("[P2P][PRESENCE] Peer online:", msg.email);
          toast(`${msg.email} is online`, { icon: '🟢', position: 'bottom-right' });
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

        // 🚀 FIX: Don't overwrite if exists, UNLESS metadata changed (e.g. Chunk Size update)
        if (!this.receiverTransfers.has(messageId)) {
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
            lastUpdated: Date.now()
          });
        } else {
          const rt = this.receiverTransfers.get(messageId)!;
          if (rt.totalChunks !== data.totalChunks) {
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
              lastUpdated: Date.now()
            });
          }
        }

        // 🚀 NEW: Rehydrate immediately from IndexedDB to show correct progress
        this.syncReceiverStateFromDB(messageId);

        // Check if we need handshake
        const compositeId = `${from.toLowerCase()}:${messageId}`;
        if (!this.peerSessions.has(compositeId)) {
          console.log(`[P2P] Offer requires handshake for ${compositeId}`);
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
        const { messageId, chunkIndex, data, from, payload } = msg; // data here is base64 string
        if (!messageId || chunkIndex === undefined || !data || !from) return;

        // Clear from pending if it was requested
        const pending = this.pendingRequests.get(messageId);
        if (pending) pending.delete(chunkIndex);

        try {
          // 🔒 Fix session key lookup
          const sessionKeyId = `${from.toLowerCase()}:${messageId}`;
          const session = this.peerSessions.get(sessionKeyId);

          if (!session || !session.sessionKey) {
            console.log(`[P2P RECEIVE] Key not ready, buffering chunk ${chunkIndex} for ${sessionKeyId}`);
            if (!this.receiverChunkBuffer.has(messageId)) {
              this.receiverChunkBuffer.set(messageId, new Map());
            }
            this.receiverChunkBuffer.get(messageId)!.set(chunkIndex, msg);

            // If not handshaking, trigger it (fail-safe)
            if (!session?.handshaking) {
              this.ensureSession(from, messageId);
            }
            return;
          }

          // ✅ FIX 7: Check if chunk already exists (NO DUPLICATES)
          const rt = this.receiverTransfers.get(messageId);
          if (!rt) return;

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
          await saveChunk(messageId, chunkIndex, decrypted);

          if (rt) {
            rt.receivedChunks.add(chunkIndex);

            // Progress update
            const totalChunks = rt.totalChunks;
            const receivedChunks = rt.receivedChunks.size;
            const isDone = receivedChunks === totalChunks;

            // Only show 100% if actually done. Floor otherwise to avoid 99.5% -> 100%
            const progress = isDone ? 100 : Math.floor((receivedChunks / totalChunks) * 100);

            // Fix: Show bytes for UI instead of chunk count
            const approxTotalBytes = totalChunks * P2P_LIMITS.CHUNK_SIZE;
            const approxReceivedBytes = receivedChunks * P2P_LIMITS.CHUNK_SIZE;

            window.dispatchEvent(new CustomEvent('p2p-receiver-progress', {
              detail: {
                messageId,
                percentage: progress,
                progress, // for compatibility
                received: approxReceivedBytes,
                total: approxTotalBytes,
                status: isDone ? 'COMPLETED' : 'RECEIVING',
                from,
                fileName: rt.fileName
              }
            }));

            if (isDone) rt.status = 'COMPLETED';
            else if (rt.status !== 'PAUSED') rt.status = 'RECEIVING';

            if (isDone) {
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
              totalChunks
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
        if (!messageId || !chunkIndices || !Array.from(chunkIndices).length || !from) return;

        console.log(`[P2P SERVER] Received batch request for ${chunkIndices.length} chunks (${chunkIndices.join(',')}) from ${from}`);

        // Process batch
        (async () => {
          for (const idx of chunkIndices) {
            await this.sendSingleChunk(messageId, idx, from);
          }
        })();
        break;
      }

      case 'chunk-ack': {
        const { messageId, chunkIndex, from } = msg;
        if (!messageId || chunkIndex === undefined || !from) return;

        const t = this.senderTransferRegistry.get(messageId);
        const st = this.activeTransfers.get(messageId);
        if (!t || !st) return;

        if (chunkIndex === t.currentChunkIndex) {
          // Success! Advance to next chunk
          t.currentChunkIndex++;
          st.currentChunkIndex = t.currentChunkIndex;
          st.progress = Math.round((t.currentChunkIndex / t.totalChunks) * 100);
          st.bytesSent = t.currentChunkIndex * P2P_LIMITS.CHUNK_SIZE;

          // Notify UI
          window.dispatchEvent(new CustomEvent('p2p-progress', {
            detail: {
              messageId,
              progress: st.progress,
              status: 'transferring'
            }
          }));

          if (t.currentChunkIndex < t.totalChunks) {
            this.sendSingleChunk(messageId, t.currentChunkIndex, from);
          } else {
            console.log(`[P2P SENDER] Transfer ${messageId} complete!`);
            t.status = 'COMPLETE';
            t.started = false;
            // We keep it in activeTransfers for a bit or cleanup
          }
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
    this.senderTransferRegistry.set(messageId, {
      fileId: messageId,
      file: file,
      peerEmail: recipientEmail,
      messageId: messageId,
      started: false,
      offered: false,
      currentChunkIndex: 0,
      totalChunks: Math.ceil(file.size / P2P_LIMITS.CHUNK_SIZE),
      status: 'QUEUED'
    });

    // 🚀 Persist for reliability across refreshes
    try {
      await saveFile(messageId, {
        fileName: file.name,
        mimeType: file.type,
        blob: file, // File is a Blob
        size: file.size,
        timestamp: Date.now()
      });
      await savePendingTransfer(`sender-info-${messageId}`, {
        type: 'sender-transfer',
        messageId,
        peerEmail: recipientEmail,
        fileId: messageId
      });
      console.log(`[P2P] Persisted sender metadata for ${messageId}`);
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
          if (fileData?.blob) {
            console.log(`[P2P] Rehydrated sender transfer ${messageId} for ${peerEmail}`);
            this.senderTransferRegistry.set(messageId, {
              fileId: messageId,
              file: fileData.blob,
              peerEmail: peerEmail,
              messageId: messageId,
              started: false,
              offered: false,
              currentChunkIndex: 0,
              totalChunks: Math.ceil(fileData.blob.size / P2P_LIMITS.CHUNK_SIZE),
              status: 'QUEUED'
            });
            count++;

            // If peer is already online, try starting (but handle() 'online-peers' also does this)
            if (isPeerOnlineStore(peerEmail.toLowerCase())) {
              this.tryStartSender(messageId);
            }
          }
        }
      }
      if (count > 0) console.log(`[P2P] Rehydrated ${count} sender transfers`);
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

  private async flushBufferedChunks(_from: string, messageId: string) {
    const buffer = this.receiverChunkBuffer.get(messageId);
    if (!buffer) return;

    console.log(`[P2P] Flushing ${buffer.size} buffered chunks for ${messageId}`);
    const sortedIndices = Array.from(buffer.keys()).sort((a, b) => a - b);

    for (const index of sortedIndices) {
      const msg = buffer.get(index);
      if (msg) {
        buffer.delete(index);
        await this.handle(msg);
      }
    }

    if (buffer.size === 0) {
      this.receiverChunkBuffer.delete(messageId);
    }
  }



  private async pullMissingChunks(messageId: string, sender: string) {
    const rt = this.receiverTransfers.get(messageId);
    if (!rt || rt.status === 'COMPLETED' || rt.status === 'FAILED' || rt.status === 'PAUSED') return;
    rt.status = 'RECEIVING';

    const total = rt.totalChunks;
    const received = rt.receivedChunks;

    if (!this.pendingRequests.has(messageId)) {
      this.pendingRequests.set(messageId, new Set());
    }
    const pending = this.pendingRequests.get(messageId)!;

    // Pull strategy: request up to X sequential missing chunks
    const CONCURRENCY = 32;
    let requestedCount = 0;

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Optimization: find first missing chunk starting from the first non-received index
    let startFound = -1;
    for (let i = 0; i < total; i++) {
      if (!received.has(i)) {
        startFound = i;
        break;
      }
    }

    if (startFound === -1) return; // All received

    const BATCH_SIZE = 32;
    const batch: number[] = [];

    for (let i = startFound; i < total; i++) {
      if (requestedCount >= CONCURRENCY) break;
      if (!received.has(i) && !pending.has(i)) {
        pending.add(i);
        batch.push(i);
        requestedCount++;
      }

      if (batch.length >= BATCH_SIZE) {
        console.log(`[P2P] Requesting batch of ${batch.length} chunks: ${batch[0]}-${batch[batch.length - 1]}`);
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
      console.log(`[P2P] Requesting final batch of ${batch.length} chunks: ${batch[0]}-${batch[batch.length - 1]}`);
      this.send({
        type: 'chunk-request-batch' as any,
        to: sender,
        from: this.email,
        messageId,
        chunkIndices: [...batch]
      }, true);
    }

    // Trigger local progress update even if no chunks received yet 
    const progress = Math.round((rt.receivedChunks.size / rt.totalChunks) * 100);
    window.dispatchEvent(new CustomEvent('p2p-receiver-progress', {
      detail: {
        messageId,
        percentage: progress,
        progress,
        received: rt.receivedChunks.size * P2P_LIMITS.CHUNK_SIZE,
        total: rt.totalChunks * P2P_LIMITS.CHUNK_SIZE,
        status: 'RECEIVING',
        from: sender,
        fileName: rt.fileName
      }
    }));
  }

  private async sendSingleChunk(messageId: string, chunkIndex: number, recipient: string) {
    const t = this.senderTransferRegistry.get(messageId);
    if (!t) return;

    const compositeId = `${recipient.toLowerCase()}:${messageId}`;
    const session = this.peerSessions.get(compositeId);
    if (!session || !session.sessionKey) return;

    try {
      // 🚀 BACKPRESSURE: Wait if socket buffer is too full
      const ws = this.ws as any;
      if (ws && ws.bufferedAmount > 16 * 1024 * 1024) { // 16MB threshold (Increased for speed)
        // console.log(`[P2P SERVER] Throttling ${messageId} (buffered: ${ws.bufferedAmount})`);
        await new Promise(r => setTimeout(r, 100));
        while (ws && ws.bufferedAmount > 8 * 1024 * 1024) {
          await new Promise(r => setTimeout(r, 50));
        }
      }

      const offset = chunkIndex * P2P_LIMITS.CHUNK_SIZE;
      const chunkBlob = t.file.slice(offset, offset + P2P_LIMITS.CHUNK_SIZE);
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

    } catch (err) {
      console.error(`[P2P SERVER] Failed to serve chunk ${chunkIndex}`, err);
    }
  }

  private async rehydrateReceiverTransfers() {
    console.log('[P2P] Rehydrating transfers from storage...');
    const metas = await getAllMetas();

    for (const meta of metas) {
      const { messageId, fileName, mimeType, totalChunks } = meta;

      // Skip if already in memory or if already completed (though COMPLETED usually deletes chunks)
      if (this.receiverTransfers.has(messageId)) continue;

      const finished = await this.hasReceivedFile(messageId);
      if (finished) continue;

      // Try to find sender in localStorage
      const sender = localStorage.getItem(`p2p-sender-${messageId}`);
      if (sender) {
        this.transferSenders.set(messageId, sender);
      }

      const rt: ReceiverTransferState = {
        messageId,
        fileName,
        mimeType,
        totalChunks,
        receivedChunks: new Set(),
        verifiedChunks: new Set(),
        failedChunks: new Set(),
        status: 'PAUSED', // Default to paused until we know sender is online
        reason: null,
        lastUpdated: Date.now()
      };

      this.receiverTransfers.set(messageId, rt);
      await this.syncReceiverStateFromDB(messageId);

      console.log(`[P2P] Rehydrated receiver transfer: ${fileName} (${messageId})`);
    }
  }

  // Legacy stubs
  retryTransfer(msgId: string) {
    console.log('[P2P] retryTransfer stub called for', msgId);
  }

  resumeSending(_msgId: string) {
    console.log('[P2P] resumeSending stub called');
  }
}

export const p2pService = StrictP2PService.getInstance();
