// src/lib/p2pStorage.ts
const DB_NAME = 'jeemail-p2p';
const DB_VERSION = 1;

let db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (db) return Promise.resolve(db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('chunks')) {
        d.createObjectStore('chunks', { keyPath: ['messageId', 'chunkIndex'] });
      }
      if (!d.objectStoreNames.contains('meta')) {
        d.createObjectStore('meta', { keyPath: 'messageId' });
      }
    };

    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };

    req.onerror = () => reject(req.error);
  });
}

export async function saveChunk(
  messageId: string,
  chunkIndex: number,
  data: ArrayBuffer
) {
  const d = await openDB();
  const tx = d.transaction('chunks', 'readwrite');
  tx.objectStore('chunks').put({
    messageId,
    chunkIndex,
    iv,
    encryptedData
  });
  return tx.complete;
}

export async function getChunk(
  messageId: string,
  chunkIndex: number
): Promise<ArrayBuffer | null> {
  const d = await openDB();
  const tx = d.transaction('chunks', 'readonly');
  const req = tx.objectStore('chunks').get([messageId, chunkIndex]);
  return new Promise(res => {
    req.onsuccess = () => res(req.result ?? null);
  });
}

export async function getReceivedChunkIndexes(messageId: string): Promise<number[]> {
  const d = await openDB();
  const tx = d.transaction('chunks', 'readonly');
  const store = tx.objectStore('chunks');
  const indexes: number[] = [];

  store.openCursor().onsuccess = e => {
    const cursor = (e.target as IDBRequest).result;
    if (!cursor) return;
    if (cursor.key[0] === messageId) {
      indexes.push(cursor.key[1]);
    }
    cursor.continue();
  };

  return new Promise(res => (tx.oncomplete = () => res(indexes)));
}

export async function saveMeta(
  messageId: string,
  meta: { totalChunks: number; checksum?: string }
) {
  const d = await openDB();
  const tx = d.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({ messageId, ...meta });
  return tx.complete;
}

export async function getMeta(messageId: string) {
  const d = await openDB();
  const tx = d.transaction('meta', 'readonly');
  const req = tx.objectStore('meta').get(messageId);
  return new Promise<any>(res => {
    req.onsuccess = () => res(req.result ?? null);
  });
}
