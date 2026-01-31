import { MAX_EMAIL_ATTACHMENT_BYTES } from '../constants/attachmentLimits';

export type DeliveryMode = 'EMAIL' | 'P2P';

export interface AttachmentClassification {
    filename: string;
    size: number;
    mode: DeliveryMode;
    reason: string;
}

/**
 * Classifies attachments based on size and recipient capability
 */
export function classifyAttachments(
    files: File[],
    recipientP2PCapable: boolean
): AttachmentClassification[] {
    return files.map(file => {
        // If recipient is not P2P capable, we MUST use EMAIL or fail if too large
        if (!recipientP2PCapable) {
            return {
                filename: file.name,
                size: file.size,
                mode: 'EMAIL',
                reason: 'Recipient not P2P capable'
            };
        }

        // If file is larger than threshold, use P2P
        if (file.size > MAX_EMAIL_ATTACHMENT_BYTES) {
            return {
                filename: file.name,
                size: file.size,
                mode: 'P2P',
                reason: 'File size exceeds SMTP limit'
            };
        }

        // Default to P2P if capable, to save server resources (Green Mail policy)
        // Alternatively, user could chose. But following "Decide: EMAIL vs P2P" requirement.
        return {
            filename: file.name,
            size: file.size,
            mode: 'P2P',
            reason: 'Recipient capable and preferred for efficiency'
        };
    });
}
