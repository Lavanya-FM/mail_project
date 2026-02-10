export async function generateKeyPair() {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );
}

export async function exportKeyPair(pair: CryptoKeyPair): Promise<string> {
  const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const priv = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return JSON.stringify({ pub, priv });
}

export async function sha256(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function encryptChunkAES(
  key: CryptoKey,
  data: ArrayBuffer
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return {
    iv: Array.from(iv),
    data: encrypted
  };
}

export async function decryptChunkAES(
  key: CryptoKey,
  iv: number[],
  encrypted: ArrayBuffer
) {
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    encrypted
  );
}

export async function importStoredKeyPair(raw: string): Promise<CryptoKeyPair> {
  const { pub, priv } = JSON.parse(raw);

  return {
    publicKey: await crypto.subtle.importKey(
      'jwk',
      pub,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      []
    ),
    privateKey: await crypto.subtle.importKey(
      'jwk',
      priv,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey']
    )
  };
}

export async function exportPublicKey(key: CryptoKey) {
  return crypto.subtle.exportKey("raw", key);
}

export async function importPublicKey(raw: ArrayBuffer) {
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
}

export async function deriveSharedKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey
) {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encrypt(key: CryptoKey, data: any) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));

  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );

  return {
    iv: Array.from(iv),
    cipher: Array.from(new Uint8Array(cipher)),
  };
}

export async function decrypt(key: CryptoKey, payload: any) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(payload.iv) },
    key,
    new Uint8Array(payload.cipher)
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}

/**
 * Compresses data using GZIP
 */
export async function compressData(data: ArrayBuffer): Promise<ArrayBuffer> {
  const stream = new Response(data).body?.pipeThrough(new CompressionStream('gzip'));
  if (!stream) throw new Error('Compression failed');
  return new Response(stream).arrayBuffer();
}

/**
 * Decompresses data using GZIP
 */
export async function decompressData(data: ArrayBuffer): Promise<ArrayBuffer> {
  const stream = new Response(data).body?.pipeThrough(new DecompressionStream('gzip'));
  if (!stream) throw new Error('Decompression failed');
  return new Response(stream).arrayBuffer();
}

