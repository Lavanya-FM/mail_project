// P2P Service for peer-to-peer email and file transfer
// Uses WebSocket for real-time communication between peers

interface P2PPeer {
  id: string;
  email: string;
  connected: boolean;
  lastSeen: Date;
}

interface P2PMessage {
  type: 'offer' | 'answer' | 'candidate' | 'email' | 'file-chunk' | 'file-complete';
  from: string;
  to: string;
  data?: any;
  timestamp: number;
}

interface P2PEmailData {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  attachments: Array<{
    name: string;
    size: number;
    type: string;
    chunks: number;
  }>;
  timestamp: number;
}

class P2PService {
  private ws: WebSocket | null = null;
  private peers: Map<string, P2PPeer> = new Map();
  private messageHandlers: Map<string, Function[]> = new Map();
  private fileTransfers: Map<string, any> = new Map();
  private userId: string = ''; // Used for P2P identification
  private userEmail: string = '';
  private isConnected: boolean = false;

  constructor() {
    this.initializeMessageHandlers();
  }

  private initializeMessageHandlers() {
    this.messageHandlers.set('peer-online', []);
    this.messageHandlers.set('peer-offline', []);
    this.messageHandlers.set('email-received', []);
    this.messageHandlers.set('file-progress', []);
    this.messageHandlers.set('connection-error', []);
  }

  /**
   * Connect to P2P network
   */
  public connect(userId: string, userEmail: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.userId = userId;
      this.userEmail = userEmail;

      try {
        // Use same origin WebSocket (backend should provide P2P endpoint)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/p2p`;
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this.isConnected = true;
          // Register with P2P network
          this.sendMessage({
            type: 'register',
            userId,
            userEmail,
            timestamp: Date.now()
          });
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(JSON.parse(event.data));
        };

        this.ws.onerror = (error) => {
          this.isConnected = false;
          this.emit('connection-error', { error: 'WebSocket connection failed' });
          reject(error);
        };

        this.ws.onclose = () => {
          this.isConnected = false;
          console.log('P2P connection closed');
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from P2P network
   */
  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.peers.clear();
  }

  /**
   * Send P2P email with file attachments
   */
  public async sendP2PEmail(
    recipientEmail: string,
    subject: string,
    body: string,
    attachments: File[] = [],
    onProgress?: (progress: number) => void
  ): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to P2P network');
    }

    const emailId = `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Prepare email data
    const emailData: P2PEmailData = {
      id: emailId,
      from: this.userEmail,
      to: recipientEmail,
      subject,
      body,
      attachments: attachments.map(file => ({
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        chunks: Math.ceil(file.size / (64 * 1024)) // 64KB chunks
      })),
      timestamp: Date.now()
    };

    // Send email metadata first
    this.sendMessage({
      type: 'email',
      from: this.userEmail,
      to: recipientEmail,
      data: emailData
    });

    // Send file chunks
    let totalProgress = 0;
    const totalSize = attachments.reduce((sum, f) => sum + f.size, 0);

    for (let i = 0; i < attachments.length; i++) {
      const file = attachments[i];
      const chunkSize = 64 * 1024; // 64KB chunks
      
      for (let offset = 0; offset < file.size; offset += chunkSize) {
        const chunk = file.slice(offset, offset + chunkSize);
        const arrayBuffer = await chunk.arrayBuffer();
        
        this.sendMessage({
          type: 'file-chunk',
          from: this.userEmail,
          to: recipientEmail,
          data: {
            emailId,
            fileName: file.name,
            chunkIndex: Math.floor(offset / chunkSize),
            totalChunks: Math.ceil(file.size / chunkSize),
            chunk: Array.from(new Uint8Array(arrayBuffer))
          }
        });

        totalProgress += chunk.size;
        if (onProgress) {
          onProgress(Math.round((totalProgress / totalSize) * 100));
        }
      }
    }

    // Signal file transfer complete
    this.sendMessage({
      type: 'file-complete',
      from: this.userEmail,
      to: recipientEmail,
      data: { emailId }
    });
  }

  /**
   * Listen for incoming P2P emails
   */
  public onEmailReceived(callback: (email: P2PEmailData) => void): void {
    const handlers = this.messageHandlers.get('email-received') || [];
    handlers.push(callback);
    this.messageHandlers.set('email-received', handlers);
  }

  /**
   * Get list of online peers
   */
  public getOnlinePeers(): P2PPeer[] {
    return Array.from(this.peers.values()).filter(p => p.connected);
  }

  /**
   * Check if specific peer is online
   */
  public isPeerOnline(email: string): boolean {
    const peer = this.peers.get(email);
    return peer ? peer.connected : false;
  }

  /**
   * Get connection status
   */
  public isConnectedToNetwork(): boolean {
    return this.isConnected;
  }

  // Private methods

  private sendMessage(message: any): void {
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleMessage(message: any): void {
    switch (message.type) {
      case 'peer-online':
        this.handlePeerOnline(message);
        break;
      case 'peer-offline':
        this.handlePeerOffline(message);
        break;
      case 'email':
        this.handleEmailReceived(message);
        break;
      case 'file-chunk':
        this.handleFileChunk(message);
        break;
      case 'file-complete':
        this.handleFileComplete(message);
        break;
    }
  }

  private handlePeerOnline(message: any): void {
    this.peers.set(message.email, {
      id: message.userId,
      email: message.email,
      connected: true,
      lastSeen: new Date()
    });
    this.emit('peer-online', { email: message.email });
  }

  private handlePeerOffline(message: any): void {
    const peer = this.peers.get(message.email);
    if (peer) {
      peer.connected = false;
      peer.lastSeen = new Date();
    }
    this.emit('peer-offline', { email: message.email });
  }

  private handleEmailReceived(message: P2PMessage): void {
    this.emit('email-received', message.data);
  }

  private handleFileChunk(message: any): void {
    const { emailId, fileName, chunkIndex, totalChunks, chunk } = message.data;
    const key = `${emailId}-${fileName}`;
    
    if (!this.fileTransfers.has(key)) {
      this.fileTransfers.set(key, {
        chunks: new Array(totalChunks),
        totalChunks,
        fileName,
        emailId
      });
    }

    const transfer = this.fileTransfers.get(key);
    transfer.chunks[chunkIndex] = new Uint8Array(chunk);

    const progress = Math.round((transfer.chunks.filter(c => c).length / totalChunks) * 100);
    this.emit('file-progress', { emailId, fileName, progress });
  }

  private handleFileComplete(message: any): void {
    const { emailId } = message.data;
    // Cleanup completed transfers
    for (const [key, transfer] of this.fileTransfers.entries()) {
      if (transfer.emailId === emailId) {
        this.fileTransfers.delete(key);
      }
    }
  }

  private emit(event: string, data: any): void {
    const handlers = this.messageHandlers.get(event) || [];
    handlers.forEach((handler: Function) => handler(data));
  }
}

export const p2pService = new P2PService();
