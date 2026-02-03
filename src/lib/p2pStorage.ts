// src/lib/p2pStorage.ts
const DB_NAME = 'jeemail-p2p';
const DB_VERSION = 4; // Bumped to 4 to fix version conflict

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

export async function clearChunks(messageId: string) {
  const d = await openDB();
  const tx = d.transaction('chunks', 'readwrite');
  const store = tx.objectStore('chunks');
  const range = IDBKeyRange.bound([messageId, 0], [messageId, Infinity]);
  store.delete(range);
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
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
  // Specifically delete the sender info if it exists
  pendingStore.delete(`sender-info-${messageId}`);

  // Also iterate for others (receiver metadata using compositeId)
  pendingStore.openCursor().onsuccess = (e: any) => {
    const cursor = e.target.result;
    if (cursor) {
      if (cursor.key.includes(messageId)) {
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

// 🚀 Migration from p2pIndexedDB.ts to fix VersionError
export async function assembleAndDownload(messageId: string) {
  const d = await openDB();

  // 1. Get Metadata
  const fileMeta = await new Promise<any>((resolve) => {
    const tx = d.transaction('files', 'readonly');
    const req = tx.objectStore('files').get(messageId);
    req.onsuccess = () => resolve(req.result);
  });

  // Fallback: Check 'meta' store if not in 'files'
  let meta = fileMeta;
  if (!meta) {
    meta = await new Promise<any>((resolve) => {
      const tx = d.transaction('meta', 'readonly');
      const req = tx.objectStore('meta').get(messageId);
      req.onsuccess = () => resolve(req.result);
    });
  }

  if (!meta) {
    window.dispatchEvent(new CustomEvent('p2p-download-error', {
      detail: { messageId, error: 'File not available. P2P transfer may be in progress.' }
    }));
    return;
  }

  // 2. Get Chunks (using Cursor or GetAll)
  const chunks: ArrayBuffer[] = [];

  await new Promise<void>((resolve) => {
    const tx = d.transaction('chunks', 'readonly');
    const store = tx.objectStore('chunks');
    // We iterate entire store? No, use GetAll if possible or Cursor
    // p2pStorage.ts didn't create an index 'byMessage' on chunks?
    // Let's check schema in openDB...
    // Line 16: keyPath: ['messageId', 'chunkIndex'].
    // No index created explicitly.
    // But we can use IDBKeyRange on the compound key?
    // IDB 2.0 supports getAll(IDBKeyRange.bound([messageId, 0], [messageId, Infinity]))
    // Safe approach: Cursor

    // Actually, 'chunks' uses compound key. key is array.
    // We can iterate matches.
    const range = IDBKeyRange.bound([messageId, 0], [messageId, Infinity]);
    const req = store.openCursor(range);

    req.onsuccess = (e: any) => {
      const cursor = e.target.result;
      if (cursor) {
        // cursor.key is [messageId, chunkIndex]
        const idx = cursor.value.chunkIndex;
        chunks[idx] = cursor.value.data; // 'data' is the property name in saveChunk
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => resolve(); // Resolve even on error to not block, though ideally reject
  });

  // Verify
  // meta.totalChunks might be in meta.totalChunks or meta.size?
  // p2pService saves: { fileName, mimeType, totalChunks ... } 

  if (meta.totalChunks && chunks.length !== meta.totalChunks) {
    // Check if we have holes
    let count = 0;
    chunks.forEach(() => count++);
    if (count !== meta.totalChunks) {
      console.warn('[P2P] Assembly incomplete', count, '/', meta.totalChunks);
      // Dispatch error? Or try to DL anyway?
    }
  }

  const blob = new Blob(chunks, { type: meta.mimeType });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = meta.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function removePendingTransfer(compositeId: string) {
  const d = await openDB();
  const tx = d.transaction('pending_transfers', 'readwrite');
  tx.objectStore('pending_transfers').delete(compositeId);
}
