// src/lib/p2pStorage.ts
const DB_NAME = 'jeemail-p2p';
const DB_VERSION = 3; // Bumped to 3 for pending_transfers

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
      if (!d.objectStoreNames.contains('pending_transfers')) {
        d.createObjectStore('pending_transfers', { keyPath: 'compositeId' });
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

  const range = IDBKeyRange.bound([messageId, 0], [messageId, Infinity]);

  return new Promise(res => {
    const request = store.openCursor(range);
    request.onsuccess = (e: any) => {
      const cursor = e.target.result;
      if (cursor) {
        // cursor.key is [messageId, chunkIndex]
        indexes.push(cursor.key[1]);
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

export async function getAllMetas(): Promise<any[]> {
  const d = await openDB();
  const tx = d.transaction('meta', 'readonly');
  const req = tx.objectStore('meta').getAll();
  return new Promise(res => {
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => res([]);
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

export async function deleteTransferData(messageId: string) {
  const d = await openDB();
  const tx = d.transaction(['chunks', 'meta', 'files', 'pending_transfers'], 'readwrite');

  // Delete all chunks for this message
  const chunkStore = tx.objectStore('chunks');
  const chunkRange = IDBKeyRange.bound([messageId, 0], [messageId, Infinity]);
  chunkStore.delete(chunkRange);

  tx.objectStore('meta').delete(messageId);
  tx.objectStore('files').delete(messageId);

  // Also try to delete from pending transfers by iterating (compositeId starts with messageId)
  const pendingStore = tx.objectStore('pending_transfers');
  pendingStore.openCursor().onsuccess = (e: any) => {
    const cursor = e.target.result;
    if (cursor) {
      if (cursor.key.startsWith(messageId)) {
        cursor.delete();
      }
      cursor.continue();
    }
  };

  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Persist transfer state for resume on refresh
export async function savePendingTransfer(compositeId: string, state: any) {
  const d = await openDB();
  const tx = d.transaction('pending_transfers', 'readwrite');
  // Don't save large objects like 'file' if they can't be cloned
  // If it's a sender state, we might need a different strategy or just save the record
  tx.objectStore('pending_transfers').put({ compositeId, ...state, updatedAt: Date.now() });
}

export async function getAllPendingTransfers() {
  const d = await openDB();
  const tx = d.transaction('pending_transfers', 'readonly');
  const req = tx.objectStore('pending_transfers').getAll();
  return new Promise<any[]>(res => {
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => res([]);
  });
}

export async function removePendingTransfer(compositeId: string) {
  const d = await openDB();
  const tx = d.transaction('pending_transfers', 'readwrite');
  tx.objectStore('pending_transfers').delete(compositeId);
}
