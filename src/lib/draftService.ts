/**
 * draftService.ts
 * Gmail-style draft management service
 * Handles draft creation, incremental updates, version control, and offline sync
 */

import { draftStorage, DraftData, DraftChange } from './draftStorage';
import toast from 'react-hot-toast';

interface CreateDraftParams {
    user_id: number;
    from_email: string;
    from_name: string;
    thread_id?: string | null;
    subject?: string;
    body?: string;
    to_emails?: string[];
    cc_emails?: string[];
    bcc_emails?: string[];
}

interface UpdateDraftParams {
    draft_id: number;
    version: number;
    changes: Partial<{
        subject: string;
        body: string;
        to_emails: string[];
        cc_emails: string[];
        bcc_emails: string[];
    }>;
}

interface DraftResponse {
    draft_id: number;
    thread_id: string;
    version: number;
    created_at: string;
    last_modified?: string;
}

class DraftService {
    private activeDrafts: Map<number, DraftData> = new Map();
    private saveTimers: Map<number, NodeJS.Timeout> = new Map();
    private readonly DEBOUNCE_MS = 2000; // 2 seconds debounce
    private readonly CLEANUP_INTERVAL_MS = 60000; // 1 minute
    private syncInProgress = false;

    constructor() {
        // Initialize storage
        draftStorage.init().catch(err => {
            console.error('[DraftService] Failed to initialize storage:', err);
        });

        // Start background sync
        this.startBackgroundSync();

        // Cleanup old synced changes periodically
        setInterval(() => {
            const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            draftStorage.clearSyncedChanges(oneWeekAgo).catch(err => {
                console.error('[DraftService] Cleanup failed:', err);
            });
        }, this.CLEANUP_INTERVAL_MS);

        // Listen for online/offline events
        window.addEventListener('online', () => this.syncPendingChanges());
        window.addEventListener('offline', () => {
            console.log('[DraftService] Offline mode - changes will be queued');
        });
    }

    /**
     * Create a new draft (called on first interaction)
     */
    async createDraft(params: CreateDraftParams): Promise<DraftResponse> {
        try {
            const response = await fetch('/api/drafts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: params.user_id,
                    from_email: params.from_email,
                    from_name: params.from_name,
                    thread_id: params.thread_id || null,
                    subject: params.subject || '',
                    body: params.body || '',
                    to_emails: params.to_emails || [],
                    cc_emails: params.cc_emails || [],
                    bcc_emails: params.bcc_emails || []
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to create draft: ${response.statusText}`);
            }

            const data: DraftResponse = await response.json();

            // Store locally
            const draftData: DraftData = {
                draft_id: data.draft_id,
                user_id: params.user_id,
                thread_id: data.thread_id,
                from_email: params.from_email,
                from_name: params.from_name,
                to_emails: params.to_emails || [],
                cc_emails: params.cc_emails || [],
                bcc_emails: params.bcc_emails || [],
                subject: params.subject || '',
                body: params.body || '',
                version: data.version,
                last_modified: Date.now(),
                created_at: new Date(data.created_at).getTime(),
                attachment_ids: []
            };

            await draftStorage.saveDraft(draftData);
            this.activeDrafts.set(data.draft_id, draftData);

            console.log('[DraftService] Draft created:', data.draft_id);
            return data;

        } catch (error) {
            console.error('[DraftService] Create draft failed:', error);

            // Offline fallback - create temporary draft
            if (!navigator.onLine) {
                const tempId = -Date.now(); // Negative ID for offline drafts
                const draftData: DraftData = {
                    draft_id: tempId,
                    user_id: params.user_id,
                    thread_id: params.thread_id || `temp_${Date.now()}`,
                    from_email: params.from_email,
                    from_name: params.from_name,
                    to_emails: params.to_emails || [],
                    cc_emails: params.cc_emails || [],
                    bcc_emails: params.bcc_emails || [],
                    subject: params.subject || '',
                    body: params.body || '',
                    version: 1,
                    last_modified: Date.now(),
                    created_at: Date.now(),
                    attachment_ids: []
                };

                await draftStorage.saveDraft(draftData);
                this.activeDrafts.set(tempId, draftData);

                toast('Draft saved offline - will sync when online', { icon: '📴' });

                return {
                    draft_id: tempId,
                    thread_id: draftData.thread_id!,
                    version: 1,
                    created_at: new Date().toISOString()
                };
            }

            throw error;
        }
    }

    /**
     * Update draft with debouncing (incremental)
     */
    async updateDraft(params: UpdateDraftParams): Promise<void> {
        const { draft_id, version, changes } = params;

        // Get current draft state
        let draft = this.activeDrafts.get(draft_id);
        if (!draft) {
            draft = await draftStorage.getDraft(draft_id);
            if (draft) {
                this.activeDrafts.set(draft_id, draft);
            } else {
                throw new Error(`Draft ${draft_id} not found`);
            }
        }

        // Apply changes locally immediately (optimistic update)
        Object.assign(draft, changes);
        draft.last_modified = Date.now();

        // Save to IndexedDB immediately
        await draftStorage.saveDraft(draft);

        // Clear existing timer
        const existingTimer = this.saveTimers.get(draft_id);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Debounce server update
        const timer = setTimeout(async () => {
            await this.flushDraftToServer(draft_id, version, changes);
            this.saveTimers.delete(draft_id);
        }, this.DEBOUNCE_MS);

        this.saveTimers.set(draft_id, timer);
    }

    /**
     * Flush draft changes to server immediately
     */
    private async flushDraftToServer(draft_id: number, version: number, changes: Partial<DraftData>): Promise<void> {
        try {
            const response = await fetch(`/api/drafts/${draft_id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ version, changes })
            });

            if (!response.ok) {
                const error = await response.json();

                // Version conflict
                if (response.status === 409) {
                    console.warn('[DraftService] Version conflict:', error);
                    await this.handleVersionConflict(draft_id, error.server_version);
                    return;
                }

                throw new Error(error.message || 'Update failed');
            }

            const data = await response.json();

            // Update local version
            const draft = this.activeDrafts.get(draft_id);
            if (draft) {
                draft.version = data.version;
                draft.last_modified = new Date(data.last_modified).getTime();
                await draftStorage.saveDraft(draft);
            }

            console.log('[DraftService] Draft updated:', draft_id, 'v' + data.version);

        } catch (error) {
            console.error('[DraftService] Update failed:', error);

            // Queue for offline sync
            if (!navigator.onLine) {
                await draftStorage.queueChange({
                    draft_id,
                    user_id: this.activeDrafts.get(draft_id)?.user_id || 0,
                    changes,
                    version,
                    timestamp: Date.now(),
                    synced: false
                });

                console.log('[DraftService] Change queued for sync');
            } else {
                toast.error('Failed to save draft');
            }
        }
    }

    /**
     * Handle version conflict (merge strategy)
     */
    private async handleVersionConflict(draft_id: number, serverVersion: number): Promise<void> {
        try {
            // Fetch latest from server
            const response = await fetch(`/api/drafts/${draft_id}`);
            if (!response.ok) throw new Error('Failed to fetch draft');

            const serverDraft = await response.json();

            // Update local version
            const localDraft = this.activeDrafts.get(draft_id);
            if (localDraft) {
                // Simple merge: server wins, but preserve unsaved local changes
                const unsavedChanges: Partial<DraftData> = {};

                if (localDraft.subject !== serverDraft.subject) {
                    unsavedChanges.subject = localDraft.subject;
                }
                if (localDraft.body !== serverDraft.body) {
                    unsavedChanges.body = localDraft.body;
                }

                // Update to server version
                Object.assign(localDraft, serverDraft);
                localDraft.version = serverVersion;
                await draftStorage.saveDraft(localDraft);

                // Retry with unsaved changes if any
                if (Object.keys(unsavedChanges).length > 0) {
                    toast('Draft updated from another tab - merging changes', { icon: '🔄' });
                    await this.updateDraft({
                        draft_id,
                        version: serverVersion,
                        changes: unsavedChanges
                    });
                }
            }
        } catch (error) {
            console.error('[DraftService] Conflict resolution failed:', error);
            toast.error('Draft conflict - please refresh');
        }
    }

    /**
     * Send draft (transition to sent message)
     */
    async sendDraft(draft_id: number, p2p_enabled: boolean = false): Promise<any> {
        // Flush any pending changes immediately
        const timer = this.saveTimers.get(draft_id);
        if (timer) {
            clearTimeout(timer);
            this.saveTimers.delete(draft_id);
        }

        const draft = this.activeDrafts.get(draft_id) || await draftStorage.getDraft(draft_id);
        if (!draft) {
            throw new Error('Draft not found');
        }

        try {
            const response = await fetch(`/api/drafts/${draft_id}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    version: draft.version,
                    p2p_enabled
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Send failed');
            }

            const result = await response.json();

            // Clean up
            await this.deleteDraft(draft_id);

            console.log('[DraftService] Draft sent:', result.message_id);
            return result;

        } catch (error) {
            console.error('[DraftService] Send failed:', error);
            throw error;
        }
    }

    /**
     * Delete draft
     */
    async deleteDraft(draft_id: number): Promise<void> {
        try {
            // Clear timer
            const timer = this.saveTimers.get(draft_id);
            if (timer) {
                clearTimeout(timer);
                this.saveTimers.delete(draft_id);
            }

            // Delete from server
            if (draft_id > 0) { // Only for server-created drafts
                await fetch(`/api/drafts/${draft_id}`, { method: 'DELETE' });
            }

            // Delete locally
            await draftStorage.deleteDraft(draft_id);
            this.activeDrafts.delete(draft_id);

            console.log('[DraftService] Draft deleted:', draft_id);

        } catch (error) {
            console.error('[DraftService] Delete failed:', error);
        }
    }

    /**
     * Get draft by ID
     */
    async getDraft(draft_id: number): Promise<DraftData | null> {
        // Check memory first
        let draft = this.activeDrafts.get(draft_id);
        if (draft) return draft;

        // Check IndexedDB
        draft = await draftStorage.getDraft(draft_id);
        if (draft) {
            this.activeDrafts.set(draft_id, draft);
            return draft;
        }

        // Fetch from server
        try {
            const response = await fetch(`/api/drafts/${draft_id}`);
            if (!response.ok) return null;

            const serverDraft = await response.json();
            const draftData: DraftData = {
                ...serverDraft,
                last_modified: new Date(serverDraft.last_modified).getTime(),
                created_at: new Date(serverDraft.created_at).getTime()
            };

            await draftStorage.saveDraft(draftData);
            this.activeDrafts.set(draft_id, draftData);

            return draftData;
        } catch (error) {
            console.error('[DraftService] Fetch draft failed:', error);
            return null;
        }
    }

    /**
     * Background sync for offline changes
     */
    private async syncPendingChanges(): Promise<void> {
        if (this.syncInProgress || !navigator.onLine) return;

        this.syncInProgress = true;

        try {
            const pending = await draftStorage.getPendingChanges();

            if (pending.length === 0) {
                this.syncInProgress = false;
                return;
            }

            console.log(`[DraftService] Syncing ${pending.length} pending changes`);

            for (const change of pending) {
                try {
                    await this.flushDraftToServer(change.draft_id, change.version, change.changes);
                    await draftStorage.markChangeSynced(change.id!);
                } catch (error) {
                    console.error('[DraftService] Sync failed for change:', change.id, error);
                }
            }

            toast.success('Drafts synced');

        } catch (error) {
            console.error('[DraftService] Sync failed:', error);
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * Start background sync interval
     */
    private startBackgroundSync(): void {
        setInterval(() => {
            if (navigator.onLine) {
                this.syncPendingChanges();
            }
        }, 30000); // Every 30 seconds
    }

    /**
     * Force flush all pending changes
     */
    async flushAll(): Promise<void> {
        const timers = Array.from(this.saveTimers.entries());

        for (const [draft_id, timer] of timers) {
            clearTimeout(timer);
            this.saveTimers.delete(draft_id);

            const draft = this.activeDrafts.get(draft_id);
            if (draft) {
                await this.flushDraftToServer(draft_id, draft.version, {
                    subject: draft.subject,
                    body: draft.body,
                    to_emails: draft.to_emails,
                    cc_emails: draft.cc_emails,
                    bcc_emails: draft.bcc_emails
                });
            }
        }

        await this.syncPendingChanges();
    }

    /**
     * Clear all drafts (for logout)
     */
    async clearAll(): Promise<void> {
        // Clear timers
        for (const timer of this.saveTimers.values()) {
            clearTimeout(timer);
        }
        this.saveTimers.clear();
        this.activeDrafts.clear();

        // Clear storage
        await draftStorage.clearAll();
    }
}

// Singleton instance
export const draftService = new DraftService();
export type { CreateDraftParams, UpdateDraftParams, DraftResponse };
