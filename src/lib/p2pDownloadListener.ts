// src/lib/p2pDownloadListener.ts
import { assembleAndDownload } from "./p2pIndexedDB";

export function initP2PDownloadListener() {
  window.addEventListener("p2p-download-file", (e: any) => {
    const { messageId } = e.detail;
    assembleAndDownload(messageId);
  });
}
