/**
 * src/utils/replyLogic.ts
 * Implements Gmail-like logic for Reply, Reply All, and Forward.
 */

import { Email } from '../types/email';



export function normalizeSubject(subject: string, prefix: 'Re:' | 'Fwd:'): string {
    if (!subject) return `${prefix} (no subject)`;

    // Remove existing prefixes (case insensitive) to avoid stacking
    // e.g. "Re: Fwd: Re: Subject" -> "Subject"
    const cleanSubject = subject.replace(/^((re|fwd):\s*)+/gi, '');

    return `${prefix} ${cleanSubject}`;
}

export function getRecipients(
    mode: 'reply' | 'replyAll' | 'forward',
    email: Email,
    currentUserEmail: string
): { to: string[], cc: string[] } {
    const me = currentUserEmail.toLowerCase();
    const from = (email.from_email || '').toLowerCase();

    // Parse existing recipients (To, CC)
    const originalTo = (email.to_emails || []).map((t: any) =>
        (typeof t === 'string' ? t : t.email || '').toLowerCase()
    ).filter(e => e);

    const originalCc = (email.cc_emails || []).map((t: any) =>
        (typeof t === 'string' ? t : t.email || '').toLowerCase()
    ).filter(e => e);

    // Set for unique checking
    const toSet = new Set<string>();
    const ccSet = new Set<string>();

    if (mode === 'forward') {
        // Forward: Empty recipients
        return { to: [], cc: [] };
    }

    // Reply / Reply All Logic

    // 1. Add Original Sender to TO (unless it's me)
    if (from && from !== me) {
        toSet.add(from);
    } else {
        // If I am replying to my own email, reply to the original recipients? 
        // Gmail behavior: If I sent it, reply to the recipients.
        originalTo.forEach(t => {
            if (t !== me) toSet.add(t);
        });
    }

    if (mode === 'replyAll') {
        // 2. Add Original TOs to CC (excluding me and those already in TO)
        originalTo.forEach(t => {
            if (t !== me && !toSet.has(t)) {
                ccSet.add(t);
            }
        });

        // 3. Add Original CCs to CC (excluding me and those already in TO)
        originalCc.forEach(c => {
            if (c !== me && !toSet.has(c)) {
                ccSet.add(c);
            }
        });
    }

    return {
        to: Array.from(toSet),
        cc: Array.from(ccSet)
    };
}

export function buildReferences(email: Email, mode: 'reply' | 'replyAll' | 'forward'): { inReplyTo?: string, references?: string } {
    if (mode === 'forward') {
        // Forward breaks the thread
        return {};
    }

    // Use Message-ID or fallback to ID
    const originalMessageId = email.message_id || String(email.id);

    // Append to existing references
    const existingRefs = email.references_header
        ? email.references_header.split(/\s+/).filter(Boolean)
        : [];

    // Avoid duplicates in chain
    const newRefs = [...existingRefs];
    if (!newRefs.includes(originalMessageId)) {
        newRefs.push(originalMessageId);
    }

    return {
        inReplyTo: originalMessageId,
        references: newRefs.join(' ')
    };
}

export function buildQuoteHeader(email: Email, mode: 'reply' | 'replyAll' | 'forward'): string {
    const dateStr = email.created_at ? new Date(email.created_at).toLocaleString() : 'Unknown Date';
    const sender = email.from_name || email.from_email || 'Unknown Sender';

    if (mode === 'forward') {
        return `
---------- Forwarded message ----------
From: ${sender} <${email.from_email}>
Date: ${dateStr}
Subject: ${email.subject || '(no subject)'}
To: ${(email.to_emails || []).map((t: any) => typeof t === 'string' ? t : t.email).join(', ')}
Cc: ${(email.cc_emails || []).map((t: any) => typeof t === 'string' ? t : t.email).join(', ')}

`.trim() + '\n\n';
    }

    // Reply Quote Header
    return `\n\nOn ${dateStr}, ${sender} wrote:\n`;
}

export function formatBody(originalBody: string, mode: 'reply' | 'replyAll' | 'forward'): string {
    if (!originalBody) return '';

    const lines = originalBody.split('\n');

    if (mode === 'forward') {
        // Forward: Just return body as is (no > quoting)
        return originalBody;
    }

    // Reply: Add > quoting
    return lines.map(line => `> ${line}`).join('\n');
}
