/**
 * draftStorage.ts
 * IndexedDB-based offline storage for drafts
 * Implements Gmail-style draft persistence with sync queue
 */

interface DraftData {
    draft_id: number | null;
    user_id: number;
    thread_id: string | null;
    from_email: string;
    from_name: string;
    to_emails: string[];
    cc_emails: string[];
    bcc_emails: string[];
    subject: string;
    body: string;
    version: number;
    last_modified: number;
    created_at: number;
    attachment_ids: string[];
}

interface DraftChange {
    id?: number;
    draft_id: number;
    user_id: number;
    changes: Partial<DraftData>;
    version: number;
    timestamp: number;
    synced: boolean;
}

interface AttachmentQueueItem {
    id: string;
    draft_id: number;
    file: File;
    progress: number;
    uploaded: boolean;
    attachment_id?: number;
    error?: string;
}

class DraftStorage {
    private db: IDBDatabase | null = null;
    private readonly DB_NAME = 'JeeMailDrafts';
    private readonly DB_VERSION = 1;

    async init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                // Drafts store
                if (!db.objectStoreNames.contains('drafts')) {
                    const draftStore = db.createObjectStore('drafts', { keyPath: 'draft_id' });
                    draftStore.createIndex('user_id', 'user_id', { unique: false });
                    draftStore.createIndex('thread_id', 'thread_id', { unique: false });
                    draftStore.createIndex('last_modified', 'last_modified', { unique: false });
                }

                // Draft changes queue (for offline sync)
                if (!db.objectStoreNames.contains('draft_changes')) {
                    const changesStore = db.createObjectStore('draft_changes', { keyPath: 'id', autoIncrement: true });
                    changesStore.createIndex('draft_id', 'draft_id', { unique: false });
                    changesStore.createIndex('synced', 'synced', { unique: false });
                    changesStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // Attachment upload queue
                if (!db.objectStoreNames.contains('attachment_queue')) {
                    const attachmentStore = db.createObjectStore('attachment_queue', { keyPath: 'id' });
                    attachmentStore.createIndex('draft_id', 'draft_id', { unique: false });
                    attachmentStore.createIndex('uploaded', 'uploaded', { unique: false });
                }
            };
        });
    }

    /**
     * Save or update draft locally
     */
    async saveDraft(draft: DraftData): Promise<void> {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['drafts'], 'readwrite');
            const store = transaction.objectStore('drafts');

            const request = store.put(draft);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get draft by ID
     */
    async getDraft(draftId: number): Promise<DraftData | null> {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['drafts'], 'readonly');
            const store = transaction.objectStore('drafts');

            const request = store.get(draftId);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all drafts for a user
     */
    async getUserDrafts(userId: number): Promise<DraftData[]> {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['drafts'], 'readonly');
            const store = transaction.objectStore('drafts');
            const index = store.index('user_id');

            const request = index.getAll(userId);

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete draft
     */
    async deleteDraft(draftId: number): Promise<void> {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['drafts'], 'readwrite');
            const store = transaction.objectStore('drafts');

            const request = store.delete(draftId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Queue a change for sync (offline support)
     */
    async queueChange(change: Omit<DraftChange, 'id'>): Promise<number> {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['draft_changes'], 'readwrite');
            const store = transaction.objectStore('draft_changes');

            const request = store.add(change);

            request.onsuccess = () => resolve(request.result as number);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get pending changes (not synced)
     */
    async getPendingChanges(): Promise<DraftChange[]> {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['draft_changes'], 'readonly');
            const store = transaction.objectStore('draft_changes');
            const index = store.index('synced');

            // @ts-ignore
            const request = index.getAll(false);

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Mark change as synced
     */
    async markChangeSynced(changeId: number): Promise<void> {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['draft_changes'], 'readwrite');
            const store = transaction.objectStore('draft_changes');

            const getRequest = store.get(changeId);

            getRequest.onsuccess = () => {
                const change = getRequest.result;
                if (change) {
                    change.synced = true;
                    const putRequest = store.put(change);
                    putRequest.onsuccess = () => resolve();
                    putRequest.onerror = () => reject(putRequest.error);
                } else {
                    resolve();
                }
            };

            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    /**
     * Clear old synced changes (cleanup)
     */
    async clearSyncedChanges(olderThan: number): Promise<void> {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['draft_changes'], 'readwrite');
            const store = transaction.objectStore('draft_changes');
            const index = store.index('timestamp');

            const range = IDBKeyRange.upperBound(olderThan);
            const request = index.openCursor(range);

            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest).result;
                if (cursor) {
                    const change = cursor.value;
                    if (change.synced) {
                        cursor.delete();
                    }
                    cursor.continue();
                } else {
                    resolve();
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Queue attachment for upload
     */
    async queueAttachment(item: AttachmentQueueItem): Promise<void> {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['attachment_queue'], 'readwrite');
            const store = transaction.objectStore('attachment_queue');

            const request = store.put(item);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get pending attachments for a draft
     */
    async getPendingAttachments(draftId: number): Promise<AttachmentQueueItem[]> {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['attachment_queue'], 'readonly');
            const store = transaction.objectStore('attachment_queue');
            const index = store.index('draft_id');

            const request = index.getAll(draftId);

            request.onsuccess = () => {
                const items = request.result || [];
                resolve(items.filter(item => !item.uploaded));
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Update attachment upload progress
     */
    async updateAttachmentProgress(id: string, progress: number, uploaded: boolean = false, attachmentId?: number): Promise<void> {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['attachment_queue'], 'readwrite');
            const store = transaction.objectStore('attachment_queue');

            const getRequest = store.get(id);

            getRequest.onsuccess = () => {
                const item = getRequest.result;
                if (item) {
                    item.progress = progress;
                    item.uploaded = uploaded;
                    if (attachmentId) item.attachment_id = attachmentId;

                    const putRequest = store.put(item);
                    putRequest.onsuccess = () => resolve();
                    putRequest.onerror = () => reject(putRequest.error);
                } else {
                    resolve();
                }
            };

            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    /**
     * Clear uploaded attachments
     */
    async clearUploadedAttachments(draftId: number): Promise<void> {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['attachment_queue'], 'readwrite');
            const store = transaction.objectStore('attachment_queue');
            const index = store.index('draft_id');

            const request = index.openCursor(IDBKeyRange.only(draftId));

            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest).result;
                if (cursor) {
                    const item = cursor.value;
                    if (item.uploaded) {
                        cursor.delete();
                    }
                    cursor.continue();
                } else {
                    resolve();
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear all data (for logout)
     */
    async clearAll(): Promise<void> {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['drafts', 'draft_changes', 'attachment_queue'], 'readwrite');

            [
                transaction.objectStore('drafts').clear(),
                transaction.objectStore('draft_changes').clear(),
                transaction.objectStore('attachment_queue').clear()
            ];

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }
}

// Singleton instance
export const draftStorage = new DraftStorage();
export type { DraftData, DraftChange, AttachmentQueueItem };
