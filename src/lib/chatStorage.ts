// src/lib/chatStorage.ts

interface ChatMessage {
    id?: number; // Auto-increment key derived from timestamp or uuid
    threadId: string;
    sender: string;
    content: string;
    timestamp: number;
    synced: boolean;
}

interface StoragePreference {
    enabled: boolean;
    clearOnLogout: boolean;
}

const DB_NAME = 'jeemail-chat-db';
const DB_VERSION = 1;

class ChatStorageService {
    private db: IDBDatabase | null = null;
    private initPromise: Promise<void> | null = null;

    constructor() {
        this.init();
    }

    private init(): Promise<void> {
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onerror = () => reject(req.error);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('messages')) {
                    const store = db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('threadId', 'threadId', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };

            req.onsuccess = () => {
                this.db = req.result;
                resolve();
            };
        });

        return this.initPromise;
    }

    // Preferences
    getPreference(): StoragePreference | null {
        const stored = localStorage.getItem('chat_storage_pref');
        return stored ? JSON.parse(stored) : null;
    }

    setPreference(enabled: boolean, clearOnLogout: boolean) {
        localStorage.setItem('chat_storage_pref', JSON.stringify({ enabled, clearOnLogout }));
    }

    // Checking if we should use storage
    private isEnabled(): boolean {
        const pref = this.getPreference();
        return pref?.enabled === true;
    }

    // Store Message
    async saveMessage(message: Omit<ChatMessage, 'id' | 'synced'>): Promise<void> {
        if (!this.isEnabled()) return;
        await this.init();

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction('messages', 'readwrite');
            const store = tx.objectStore('messages');
            store.add({ ...message, synced: true }); // Assuming saved = synced for now unless offline queue
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // Get Messages for Thread
    async getMessages(threadId: string): Promise<ChatMessage[]> {
        if (!this.isEnabled()) return [];
        await this.init();

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction('messages', 'readonly');
            const store = tx.objectStore('messages');
            const index = store.index('threadId');
            const req = index.getAll(IDBKeyRange.only(threadId));

            req.onsuccess = () => {
                // Sort by timestamp just in case
                const result = (req.result as ChatMessage[]).sort((a, b) => a.timestamp - b.timestamp);
                resolve(result);
            };
            req.onerror = () => reject(req.error);
        });
    }

    // Clear All (for logout)
    async clearAll(): Promise<void> {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction('messages', 'readwrite');
            const store = tx.objectStore('messages');
            store.clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // Check cleanup logic
    async handleLogout() {
        const pref = this.getPreference();
        if (pref && pref.clearOnLogout) {
            console.log('[ChatStorage] Clearing local data on logout...');
            await this.clearAll();
        }
    }
}

export const chatStorage = new ChatStorageService();
