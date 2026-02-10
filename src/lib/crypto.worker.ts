/// <reference lib="webworker" />

self.onmessage = async (e: MessageEvent) => {
    const { id, type, payload } = e.data;

    try {
        let result;

        switch (type) {
            case 'encrypt': {
                const { key, data, iv } = payload;
                // Key must be imported first if passed as JWK/raw, or we assume it's a CryptoKey (but structured clone limits)
                // Actually, we'll pass the key as a CryptoKey which IS clonable in modern browsers.

                result = await encryptChunk(key, data, iv);
                break;
            }
            case 'decrypt': {
                const { key, encrypted, iv } = payload;
                result = await decryptChunk(key, encrypted, iv);
                break;
            }
            case 'compress': {
                result = await compressData(payload);
                break;
            }
            case 'decompress': {
                result = await decompressData(payload);
                break;
            }
            default:
                throw new Error(`Unknown operation: ${type}`);
        }

        const transferList: Transferable[] = [];
        if (result instanceof ArrayBuffer) {
            transferList.push(result);
        } else if (result && result.data instanceof ArrayBuffer) {
            transferList.push(result.data);
        }

        self.postMessage({ id, result }, { transfer: transferList });
    } catch (error) {
        self.postMessage({ id, error: (error as Error).message });
    }
};

async function encryptChunk(key: CryptoKey, data: ArrayBuffer, iv?: Uint8Array) {
    const finalIv = iv || crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: finalIv },
        key,
        data as any
    );

    // Return transferable structure
    return {
        iv: finalIv,
        data: encrypted
    };
}

async function decryptChunk(key: CryptoKey, encrypted: ArrayBuffer, iv: Uint8Array) {
    return crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted as any
    );
}

async function compressData(data: ArrayBuffer): Promise<ArrayBuffer> {
    const stream = new Response(data as any).body?.pipeThrough(new CompressionStream('gzip'));
    if (!stream) throw new Error('Compression failed');
    return new Response(stream).arrayBuffer();
}

async function decompressData(data: ArrayBuffer): Promise<ArrayBuffer> {
    const stream = new Response(data as any).body?.pipeThrough(new DecompressionStream('gzip'));
    if (!stream) throw new Error('Decompression failed');
    return new Response(stream).arrayBuffer();
}
