
import { Email } from '../types/email';

export interface ScanResult {
    status: 'clean' | 'suspicious' | 'danger';
    flags: string[];
    timestamp: number;
}

export const inboxScanner = {
    scanEmails: (emails: Email[]): Email[] => {
        return emails.map(email => {
            if (!email) return email;
            const flags: string[] = [];
            let status: 'clean' | 'suspicious' | 'danger' = 'clean';

            // 1. Content Scanning
            const content = ((email.subject || '') + ' ' + (email.body || '')).toLowerCase();

            // Phishing Keywords
            const phishingKeywords = ['verify your account', 'update your password', 'urgent action required', 'bank account suspended', 'click here to login'];
            if (phishingKeywords.some(kw => content.includes(kw))) {
                flags.push('Phishing detected: Suspicious urgency or request');
                status = 'danger';
            }

            // Spam Keywords
            const spamKeywords = ['winner', 'lottery', 'inheritance', 'guaranteed return', 'click here to claim', 'offer expired'];
            if (spamKeywords.some(kw => content.includes(kw))) {
                flags.push('Spam detected: High-risk promotional content');
                if (status !== 'danger') status = 'suspicious';
            }

            // 2. Sender Verification
            const fromEmail = (email.from_email || '').toLowerCase();

            if (fromEmail.includes('admin') || fromEmail.includes('support') || fromEmail.includes('security')) {
                // Strict check for official domains
                const officialDomains = ['jeemail.in', 'google.com', 'microsoft.com']; // Example trusted
                const domain = fromEmail.split('@')[1];

                if (!officialDomains.includes(domain)) {
                    flags.push('Impersonation Risk: Claims to be admin/support from external domain');
                    status = 'danger';
                }
            }

            // 3. Attachment Scanning (Metadata only)
            // Note: email.attachments might vary in structure depending on API response
            const attachments = email.attachments || [];
            if (Array.isArray(attachments) && attachments.length > 0) {
                const dangerousExtensions = ['.exe', '.scr', '.bat', '.sh', '.js', '.vbs', '.jar'];
                attachments.forEach((att: any) => {
                    const name = (att.filename || att.name || '').toLowerCase();
                    if (dangerousExtensions.some(ext => name.endsWith(ext))) {
                        flags.push(`Dangerous Attachment detected: ${name}`);
                        status = 'danger';
                    }
                });
            }

            // Only add scan_result if there are findings, or always?
            // Let's always add it so we know it was scanned.

            if (status !== 'clean') {
                console.warn(`[InboxScanner] Threat detected in email ${email.id}:`, { status, flags });
            }

            return {
                ...email,
                scan_result: {
                    status,
                    flags,
                    timestamp: Date.now()
                }
            };
        });
    }
};
