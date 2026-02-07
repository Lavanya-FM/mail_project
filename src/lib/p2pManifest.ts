
export interface P2PChunk {
    index: number;
    hash: string;
    size: number;
}

export interface P2PManifest {
    version: number;
    attachmentId: string; // Random ID for P2P coordination
    fileName: string;
    mimeType: string;
    totalSize: number;
    chunkSize: number;
    totalChunks: number;
    hashes: string[]; // Ordered list of SHA-256 hashes
    createdAt: number;
    sender: string; // Email of sender
}

const CHUNK_SIZE = 1024 * 1024; // 1MB

export async function createManifest(file: File, senderEmail: string): Promise<P2PManifest> {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const hashes: string[] = [];

    // 🚀 OPTIMIZATION: Read file in chunks to save memory & yield to UI
    for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);

        // Only read the slice we need
        const fileSlice = file.slice(start, end);
        const chunkBuffer = await fileSlice.arrayBuffer();

        const hashBuffer = await crypto.subtle.digest('SHA-256', chunkBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        hashes.push(hashHex);

        // Yield to main thread every 5 chunks to keep UI responsive
        if (i % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    return {
        version: 1,
        attachmentId: crypto.randomUUID(),
        fileName: file.name,
        mimeType: file.type,
        totalSize: file.size,
        chunkSize: CHUNK_SIZE,
        totalChunks,
        hashes,
        createdAt: Date.now(),
        sender: senderEmail
    };
}

export function manifestToBase64(manifest: P2PManifest): string {
    const json = JSON.stringify(manifest);
    return btoa(json);
}

export function parseManifest(base64: string): P2PManifest | null {
    try {
        const json = atob(base64);
        return JSON.parse(json);
    } catch (e) {
        console.error("Failed to parse P2P manifest", e);
        return null;
    }
}
