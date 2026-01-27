// src/lib/p2pStorage.ts
const DB_NAME = 'jeemail-p2p';
const DB_VERSION = 2; // Incremented version to add 'files' store

let db: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
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
      if (!d.objectStoreNames.contains('files')) {
        d.createObjectStore('files', { keyPath: 'messageId' });
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
    data
  });
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getChunk(
  messageId: string,
  chunkIndex: number
): Promise<ArrayBuffer | null> {
  const d = await openDB();
  const tx = d.transaction('chunks', 'readonly');
  const req = tx.objectStore('chunks').get([messageId, chunkIndex]);
  return new Promise(res => {
    req.onsuccess = () => {
      const result = req.result;
      res(result ? result.data : null);
    };
    req.onerror = () => res(null);
  });
}

export async function getReceivedChunkIndexes(messageId: string): Promise<number[]> {
  const d = await openDB();
  const tx = d.transaction('chunks', 'readonly');
  const store = tx.objectStore('chunks');
  const indexes: number[] = [];

  return new Promise(res => {
    const request = store.openCursor();
    request.onsuccess = (e: any) => {
      const cursor = e.target.result;
      if (cursor) {
        if (cursor.key[0] === messageId) {
          indexes.push(cursor.key[1]);
        }
        cursor.continue();
      } else {
        res(indexes);
      }
    };
    request.onerror = () => res(indexes);
  });
}

export async function saveMeta(
  messageId: string,
  meta: any
) {
  const d = await openDB();
  const tx = d.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({ messageId, ...meta });
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMeta(messageId: string) {
  const d = await openDB();
  const tx = d.transaction('meta', 'readonly');
  const req = tx.objectStore('meta').get(messageId);
  return new Promise<any>(res => {
    req.onsuccess = () => res(req.result ?? null);
    req.onerror = () => res(null);
  });
}

export async function saveFile(messageId: string, fileData: any) {
  const d = await openDB();
  const tx = d.transaction('files', 'readwrite');
  tx.objectStore('files').put({ messageId, ...fileData });
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getFile(messageId: string) {
  const d = await openDB();
  const tx = d.transaction('files', 'readonly');
  const req = tx.objectStore('files').get(messageId);
  return new Promise<any>(res => {
    req.onsuccess = () => res(req.result ?? null);
    req.onerror = () => res(null);
  });
}
