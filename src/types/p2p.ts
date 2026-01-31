export interface EncryptionMeta {
    algorithm: string;
    iv: string;
    key_hash?: string;
    [key: string]: any;
}

export interface TransferPolicy {
    retries: number;
    timeout: number;
    [key: string]: any;
}

export interface AttachmentManifest {
    attachment_id: string;
    message_id: string;
    total_size: number;
    chunk_size: number;
    total_chunks: number;
    chunk_hashes: string[];
    encryption_meta: EncryptionMeta;
    transfer_policy: TransferPolicy;
    delivery_mode: 'P2P';
}

export interface ChunkMessage {
    message_id: string;
    attachment_id: string;
    chunk_index: number;
    encrypted_payload: string; // Base64 encoded encrypted chunk data
    checksum: string;
}

export interface AckResumeMessage {
    message_id: string;
    attachment_id: string;
    received_chunks: number[];
    missing_chunks: number[];
}
