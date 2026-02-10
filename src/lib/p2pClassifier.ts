

export type DeliveryMode = 'EMAIL' | 'P2P';

export interface AttachmentClassification {
    filename: string;
    size: number;
    mode: DeliveryMode;
    reason: string;
}

const P2P_THRESHOLD_BYTES = 25 * 1024 * 1024; // 25MB

/**
 * Classifies attachments based on size and recipient capability
 */
export function classifyAttachments(
    files: File[],
    recipientP2PCapable: boolean
): AttachmentClassification[] {
    return files.map(file => {
        // 1. Force Regular EMAIL for files < 25 MB
        if (file.size < P2P_THRESHOLD_BYTES) {
            return {
                filename: file.name,
                size: file.size,
                mode: 'EMAIL',
                reason: 'Small file (< 25MB) - Regular delivery'
            };
        }

        // 2. Use P2P for files >= 25 MB if recipient is capable
        if (recipientP2PCapable) {
            return {
                filename: file.name,
                size: file.size,
                mode: 'P2P',
                reason: 'Large file (>= 25MB) - P2P optimized'
            };
        }

        // 3. Fallback to EMAIL if not P2P capable (though usually recipientP2PCapable is true)
        return {
            filename: file.name,
            size: file.size,
            mode: 'EMAIL',
            reason: 'Recipient not P2P capable'
        };
    });
}
