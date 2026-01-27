/**
 * useDraft.ts
 * React hook for Gmail-style draft management
 * Provides easy integration with compose components
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { draftService, CreateDraftParams } from '../lib/draftService';
import { DraftData } from '../lib/draftStorage';

interface UseDraftOptions {
    userId: number;
    userEmail: string;
    userName: string;
    threadId?: string | null;
    autoSave?: boolean;
    debounceMs?: number;
}

interface UseDraftReturn {
    draftId: number | null;
    version: number;
    isSaving: boolean;
    lastSaved: Date | null;
    error: string | null;

    // Actions
    createDraft: (params: Partial<CreateDraftParams>) => Promise<void>;
    updateDraft: (changes: Partial<DraftData>) => Promise<void>;
    sendDraft: (p2pEnabled?: boolean) => Promise<any>;
    deleteDraft: () => Promise<void>;
    loadDraft: (draftId: number) => Promise<void>;
}

export function useDraft(options: UseDraftOptions): UseDraftReturn {
    const { userId, userEmail, userName, threadId, debounceMs = 2000 } = options;

    const [draftId, setDraftId] = useState<number | null>(null);
    const [version, setVersion] = useState<number>(1);
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [error, setError] = useState<string | null>(null);

    const updateTimerRef = useRef<NodeJS.Timeout | null>(null);
    const pendingChangesRef = useRef<Partial<DraftData>>({});

    /**
     * Create a new draft
     */
    const createDraft = useCallback(async (params: Partial<CreateDraftParams> = {}) => {
        try {
            setIsSaving(true);
            setError(null);

            const response = await draftService.createDraft({
                user_id: userId,
                from_email: userEmail,
                from_name: userName,
                thread_id: threadId,
                ...params
            });

            setDraftId(response.draft_id);
            setVersion(response.version);
            setLastSaved(new Date());

            console.log('[useDraft] Draft created:', response.draft_id);

        } catch (err: any) {
            setError(err.message || 'Failed to create draft');
            console.error('[useDraft] Create failed:', err);
        } finally {
            setIsSaving(false);
        }
    }, [userId, userEmail, userName, threadId]);

    /**
     * Update draft with debouncing
     */
    const updateDraft = useCallback(async (changes: Partial<DraftData>) => {
        if (!draftId) {
            // Create draft on first update
            await createDraft(changes);
            return;
        }

        // Accumulate changes
        Object.assign(pendingChangesRef.current, changes);

        // Clear existing timer
        if (updateTimerRef.current) {
            clearTimeout(updateTimerRef.current);
        }

        // Set new timer
        updateTimerRef.current = setTimeout(async () => {
            try {
                setIsSaving(true);
                setError(null);

                const changesToSend = { ...pendingChangesRef.current };
                pendingChangesRef.current = {};

                await draftService.updateDraft({
                    draft_id: draftId,
                    version,
                    changes: changesToSend
                });

                setVersion(v => v + 1);
                setLastSaved(new Date());

                console.log('[useDraft] Draft updated:', draftId);

            } catch (err: any) {
                setError(err.message || 'Failed to update draft');
                console.error('[useDraft] Update failed:', err);
            } finally {
                setIsSaving(false);
            }
        }, debounceMs);

    }, [draftId, version, debounceMs, createDraft]);

    /**
     * Send draft
     */
    const sendDraft = useCallback(async (p2pEnabled: boolean = false) => {
        if (!draftId) {
            throw new Error('No draft to send');
        }

        try {
            setIsSaving(true);
            setError(null);

            // Flush any pending changes first
            if (updateTimerRef.current) {
                clearTimeout(updateTimerRef.current);
                updateTimerRef.current = null;
            }

            const result = await draftService.sendDraft(draftId, p2pEnabled);

            // Clear state
            setDraftId(null);
            setVersion(1);
            setLastSaved(null);

            console.log('[useDraft] Draft sent:', result.message_id);
            return result;

        } catch (err: any) {
            setError(err.message || 'Failed to send draft');
            console.error('[useDraft] Send failed:', err);
            throw err;
        } finally {
            setIsSaving(false);
        }
    }, [draftId]);

    /**
     * Delete draft
     */
    const deleteDraft = useCallback(async () => {
        if (!draftId) return;

        try {
            setIsSaving(true);
            setError(null);

            // Clear timer
            if (updateTimerRef.current) {
                clearTimeout(updateTimerRef.current);
                updateTimerRef.current = null;
            }

            await draftService.deleteDraft(draftId);

            // Clear state
            setDraftId(null);
            setVersion(1);
            setLastSaved(null);

            console.log('[useDraft] Draft deleted');

        } catch (err: any) {
            setError(err.message || 'Failed to delete draft');
            console.error('[useDraft] Delete failed:', err);
        } finally {
            setIsSaving(false);
        }
    }, [draftId]);

    /**
     * Load existing draft
     */
    const loadDraft = useCallback(async (id: number) => {
        try {
            setIsSaving(true);
            setError(null);

            const draft = await draftService.getDraft(id);

            if (draft) {
                setDraftId(draft.draft_id);
                setVersion(draft.version);
                setLastSaved(new Date(draft.last_modified));

                console.log('[useDraft] Draft loaded:', id);
            }

        } catch (err: any) {
            setError(err.message || 'Failed to load draft');
            console.error('[useDraft] Load failed:', err);
        } finally {
            setIsSaving(false);
        }
    }, []);

    /**
     * Cleanup on unmount
     */
    useEffect(() => {
        return () => {
            if (updateTimerRef.current) {
                clearTimeout(updateTimerRef.current);
            }
        };
    }, []);

    return {
        draftId,
        version,
        isSaving,
        lastSaved,
        error,
        createDraft,
        updateDraft,
        sendDraft,
        deleteDraft,
        loadDraft
    };
}
