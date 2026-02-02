

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

        // Default to P2P if capable, regardless of size (User preference/Green Mail policy)
        return {
            filename: file.name,
            size: file.size,
            mode: 'P2P',
            reason: 'P2P Preferred'
        };
    });
}
