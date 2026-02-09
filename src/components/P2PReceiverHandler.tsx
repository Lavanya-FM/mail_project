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

    // Listen for file completion
    const handleFileReceived = (e: CustomEvent) => {
      const { fileName } = e.detail;
      console.log('[P2P Receiver] File received:', fileName);
      p2pToast.delivered(fileName);
    };

    // Listen for transfer completion
    const handleTransferComplete = () => {
      console.log('[P2P Receiver] All files received!');
      toast.success('✓ All files received successfully!');
    };

    // Listen for download requests
    const handleDownloadFile = async (e: Event) => {
      const { fileName, messageId } = (e as CustomEvent).detail;
      console.log('[P2P Receiver] Download requested for:', fileName, messageId);

      try {
        let blob = p2pService.getDownloadedFile?.(messageId);
        if (!blob) {
          const stored = await import('../lib/p2pStorage').then(m => m.getFile(messageId));
          if (stored && stored.blob) {
            blob = stored.blob;
          }
        }

        if (!blob) {
          toast.error('File pending assembly or not found. Please wait.');
          return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(`✓ ${fileName} saved to device`);
      } catch (error) {
        console.error('[P2P Receiver] Download failed:', error);
        toast.error('Failed to download file');
      }
    };

    window.addEventListener('p2p-incoming-file', handleIncomingTransfer as EventListener);
    window.addEventListener('p2p-file-received', handleFileReceived as EventListener);
    window.addEventListener('p2p-transfer-complete', handleTransferComplete as EventListener);
    window.addEventListener('p2p-download-file', handleDownloadFile as EventListener);
    window.addEventListener('p2p-file-ready', handleFileReceived as EventListener);

    return () => {
      window.removeEventListener('p2p-incoming-file', handleIncomingTransfer as EventListener);
      window.removeEventListener('p2p-file-received', handleFileReceived as EventListener);
      window.removeEventListener('p2p-transfer-complete', handleTransferComplete as EventListener);
      window.removeEventListener('p2p-download-file', handleDownloadFile as EventListener);
      window.removeEventListener('p2p-file-ready', handleFileReceived as EventListener);
    };
  }, []);

  return null;
}
