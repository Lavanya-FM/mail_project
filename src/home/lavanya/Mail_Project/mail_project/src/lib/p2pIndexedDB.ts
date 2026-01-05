// src/lib/p2pIndexedDB.ts
const DB_NAME = "jeemail-p2p";
const DB_VERSION = 1;

const STORE_FILES = "files";
const STORE_CHUNKS = "chunks";

let db: IDBDatabase | null = null;

/* ---------------- OPEN DB ---------------- */

export function openP2PDB(): Promise<IDBDatabase> {
  if (db) return Promise.resolve(db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES, { keyPath: "messageId" });
      }

      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        const store = db.createObjectStore(STORE_CHUNKS, {
          keyPath: ["messageId", "chunkIndex"]
        });
        store.createIndex("byMessage", "messageId");
      }
    };

    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };

    req.onerror = () => reject(req.error);
  });
}

/* ---------------- SAVE CHUNK ---------------- */

export async function saveChunk(
  messageId: string,
  chunkIndex: number,
  data: ArrayBuffer
) {
  const db = await openP2PDB();
  const tx = db.transaction(STORE_CHUNKS, "readwrite");
  tx.objectStore(STORE_CHUNKS).put({ messageId, chunkIndex, data });
  await tx.complete;
}

/* ---------------- SAVE FILE META ---------------- */

export async function saveFileMeta(meta: {
  messageId: string;
  fileName: string;
  mimeType: string;
  totalChunks: number;
}) {
  const db = await openP2PDB();
  const tx = db.transaction(STORE_FILES, "readwrite");
  tx.objectStore(STORE_FILES).put(meta);
  await tx.complete;
}

/* ---------------- LOAD + REASSEMBLE FILE ---------------- */

export async function assembleAndDownload(messageId: string) {
  const db = await openP2PDB();

  const fileMeta = await new Promise<any>((resolve) => {
    const tx = db.transaction(STORE_FILES, "readonly");
    const req = tx.objectStore(STORE_FILES).get(messageId);
    req.onsuccess = () => resolve(req.result);
  });

  if (!fileMeta) {
    window.dispatchEvent(new CustomEvent('p2p-download-error', {
      detail: { messageId, error: 'File not available. P2P transfer may be in progress.' }
    }));
    return;
  }

  const chunks: ArrayBuffer[] = [];

  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_CHUNKS, "readonly");
    const store = tx.objectStore(STORE_CHUNKS);
    const index = store.index("byMessage");

    index.openCursor(IDBKeyRange.only(messageId)).onsuccess = (e: any) => {
      const cursor = e.target.result;
      if (cursor) {
        chunks[cursor.value.chunkIndex] = cursor.value.data;
        cursor.continue();
      } else {
        resolve();
      }
    };
  });

  if (chunks.length !== fileMeta.totalChunks) {
    window.dispatchEvent(new CustomEvent('p2p-download-error', {
      detail: { messageId, error: 'File incomplete. Transfer still in progress.' }
    }));
    return;
  }

  const blob = new Blob(chunks, { type: fileMeta.mimeType });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = fileMeta.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}
