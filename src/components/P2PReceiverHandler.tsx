import { useEffect } from 'react';
import { p2pToast } from '../utils/p2pToasts';
import { p2pService } from '../lib/p2pService';
import toast from 'react-hot-toast';

/**
 * P2PReceiverHandler
 * Headless component that handles global P2P events like downloads and toasts.
 * The visual status of transfers is now handled by TransfersView in the sidebar.
 */
export default function P2PReceiverHandler() {
  useEffect(() => {
    // Listen for incoming P2P transfers
    const handleIncomingTransfer = (e: CustomEvent) => {
      const { from } = e.detail;
      console.log('[P2P Receiver] Incoming transfer from:', from);
      p2pToast.receiving(`file from ${from}`);
    };

    const downloadBlob = (blob: Blob, fileName: string) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    // Listen for file completion - AUTO DOWNLOAD
    const handleFileReady = (e: CustomEvent) => {
      const { fileName, blob, scanStatus } = e.detail;
      console.log('[P2P Receiver] File ready:', fileName, scanStatus);

      if (scanStatus === 'CLEAN' || scanStatus === 'safe' || !scanStatus) {
        if (blob) {
          downloadBlob(blob, fileName);
          p2pToast.delivered(fileName); // "File Received" toast
          toast.success(`✓ ${fileName} downloaded automatically`);
        }
      } else {
        console.warn('[P2P] Auto-download blocked due to scan status:', scanStatus);
      }
    };

    // Listen for download requests (Manual)
    const handleDownloadFile = async (e: Event) => {
      const { fileName, messageId } = (e as CustomEvent).detail;
      console.log('[P2P Receiver] Manual download requested for:', fileName, messageId);

      try {
        let blob = p2pService.getDownloadedFile?.(messageId);
        if (!blob) {
          // Lazy load from DB if not in memory
          const fileData = await import('../lib/p2pStorage').then(m => m.getFile(messageId));
          if (fileData && fileData.blob) {
            blob = fileData.blob;
          }
        }

        if (blob) {
          downloadBlob(blob, fileName);
          toast.success(`✓ ${fileName} saved`);
        } else {
          toast.error('File not found or pending assembly.');
        }
      } catch (error) {
        console.error('[P2P Receiver] Download failed:', error);
        toast.error('Failed to download file');
      }
    };

    window.addEventListener('p2p-incoming-file', handleIncomingTransfer as EventListener);
    window.addEventListener('p2p-download-file', handleDownloadFile as EventListener);
    window.addEventListener('p2p-file-ready', handleFileReady as EventListener);

    return () => {
      window.removeEventListener('p2p-incoming-file', handleIncomingTransfer as EventListener);
      window.removeEventListener('p2p-download-file', handleDownloadFile as EventListener);
      window.removeEventListener('p2p-file-ready', handleFileReady as EventListener);
    };
  }, []);

  return null;
}
