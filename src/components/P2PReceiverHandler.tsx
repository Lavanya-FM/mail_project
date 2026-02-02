import { useState, useEffect } from 'react';
import P2PTransferProgress from './P2PTransferProgress';
import { p2pToast } from '../utils/p2pToasts';
import { p2pService } from '../lib/p2pService';
import toast from 'react-hot-toast';



interface IncomingTransfer {
  messageId: string;
  senderEmail: string;
  subject: string;
  body: string;
  files: Array<{
    name: string;
    size: number;
    progress: number;
    status: 'pending' | 'sending' | 'delivered' | 'failed';
    encryptedData?: string;
    messageId?: string;
  }>;
}

export default function P2PReceiverHandler() {
  const [incomingTransfer, setIncomingTransfer] = useState<IncomingTransfer | null>(null);
  const [showProgress, setShowProgress] = useState(false);

  useEffect(() => {
    // Listen for incoming P2P transfers
    const handleIncomingTransfer = (e: CustomEvent) => {
      // Adapted to match p2pService emission: { messageId, from, fileName, size }
      const { messageId, from, fileName, size } = e.detail;

      console.log('[P2P Receiver] Incoming transfer from:', from);

      setIncomingTransfer({
        messageId,
        senderEmail: from,
        subject: 'File Transfer',
        body: '',
        files: [{
          name: fileName,
          size: size,
          progress: 0,
          status: 'pending' as const,
          messageId: messageId
        } as any]
      });

      setShowProgress(true);
      p2pToast.receiving(`file from ${from}`);
    };

    // Listen for file progress updates
    const handleFileProgress = (e: CustomEvent) => {
      const { fileName, progress } = e.detail;

      setIncomingTransfer(prev => {
        if (!prev) return prev;

        return {
          ...prev,
          files: prev.files.map(f =>
            f.name === fileName
              ? { ...f, progress, status: 'sending' as const }
              : f
          )
        };
      });
    };

    // Listen for file completion
    const handleFileReceived = (e: CustomEvent) => {
      const { fileName } = e.detail;

      console.log('[P2P Receiver] File received:', fileName);

      // Show toast notification
      p2pToast.delivered(fileName);

      setIncomingTransfer(prev => {
        if (!prev) return prev;

        return {
          ...prev,
          files: prev.files.map(f =>
            f.name === fileName
              ? { ...f, progress: 100, status: 'delivered' as const }
              : f
          )
        };
      });
    };

    // Listen for receiver progress updates
    const handleReceiverProgress = (e: CustomEvent) => {
      const { messageId, percentage, fileName, etaSeconds, speedBps } = e.detail;

      setIncomingTransfer(prev => {
        if (!prev) return prev;

        return {
          ...prev,
          files: prev.files.map(f =>
            f.name === fileName || f.messageId === messageId
              ? {
                ...f,
                progress: percentage,
                status: percentage >= 100 ? 'delivered' as const : 'sending' as const,
                etaSeconds,
                speedBps
              }
              : f
          )
        };
      });
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
        // 1. Try Memory (Fastest)
        let blob = p2pService.getDownloadedFile?.(messageId);

        // 2. Try Storage (Persistence)
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

        // 3. Trigger Download
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
    window.addEventListener('p2p-file-progress', handleFileProgress as EventListener);
    window.addEventListener('p2p-file-received', handleFileReceived as EventListener);
    window.addEventListener('p2p-transfer-complete', handleTransferComplete as EventListener);
    window.addEventListener('p2p-download-file', handleDownloadFile as EventListener);
    window.addEventListener('p2p-file-ready', handleFileReceived as EventListener);
    window.addEventListener('p2p-receiver-progress', handleReceiverProgress as EventListener);

    // 🚀 NEW: Check for existing/rehydrated transfers on mount
    const existingTransfers = (p2pService as any).receiverTransfers as Map<string, any>;
    if (existingTransfers && existingTransfers.size > 0) {
      // Pick the first incomplete one to show
      for (const [messageId, rt] of existingTransfers.entries()) {
        if (rt.status !== 'COMPLETED') {
          setIncomingTransfer({
            messageId,
            senderEmail: (p2pService as any).transferSenders.get(messageId) || 'Unknown Sender',
            subject: 'File Transfer',
            body: '',
            files: [{
              name: rt.fileName,
              size: rt.size || (rt.totalChunks * 1024 * 1024), // Approx if unknown
              progress: Math.round((rt.receivedChunks.size / rt.totalChunks) * 100),
              status: 'pending' as const,
              messageId: messageId
            }]
          });
          setShowProgress(true);
          break;
        }
      }
    }

    return () => {
      window.removeEventListener('p2p-incoming-file', handleIncomingTransfer as EventListener);
      window.removeEventListener('p2p-file-progress', handleFileProgress as EventListener);
      window.removeEventListener('p2p-file-received', handleFileReceived as EventListener);
      window.removeEventListener('p2p-transfer-complete', handleTransferComplete as EventListener);
      window.removeEventListener('p2p-download-file', handleDownloadFile as EventListener);
      window.removeEventListener('p2p-file-ready', handleFileReceived as EventListener);
      window.removeEventListener('p2p-receiver-progress', handleReceiverProgress as EventListener);
    };
  }, []);

  if (!incomingTransfer) return null;

  return (
    <P2PTransferProgress
      isOpen={showProgress}
      onClose={() => setShowProgress(false)}
      files={incomingTransfer.files}
      mode="receiver"
      senderEmail={incomingTransfer.senderEmail}
    />
  );
}
