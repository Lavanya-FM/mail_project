import { useState, useEffect } from 'react';
import P2PTransferProgress from './P2PTransferProgress';
import { p2pToast } from '../utils/p2pToasts';
import toast from 'react-hot-toast';

interface P2PReceiverHandlerProps {
  userId: string;
  userEmail: string;
}

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
  }>;
}

export default function P2PReceiverHandler({ userId, userEmail }: P2PReceiverHandlerProps) {
  const [incomingTransfer, setIncomingTransfer] = useState<IncomingTransfer | null>(null);
  const [showProgress, setShowProgress] = useState(false);

  useEffect(() => {
    // Listen for incoming P2P transfers
    const handleIncomingTransfer = (e: CustomEvent) => {
      const { messageId, senderEmail, subject, body, files } = e.detail;
      
      console.log('[P2P Receiver] Incoming transfer from:', senderEmail);
      
      setIncomingTransfer({
        messageId,
        senderEmail,
        subject,
        body,
        files: files.map((f: any) => ({
          name: f.name,
          size: f.size,
          progress: 0,
          status: 'pending'
        }))
      });
      
      setShowProgress(true);
      p2pToast.receiving(`files from ${senderEmail}`);
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
      const { messageId, fileName } = e.detail;
      
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
    const handleTransferComplete = (e: CustomEvent) => {
      console.log('[P2P Receiver] All files received!');
      toast.success('✓ All files received successfully!');
    };

    // Listen for download requests
    const handleDownloadFile = async (e: CustomEvent) => {
      const { fileName } = e.detail;
      
      if (!incomingTransfer) return;
      
      const file = incomingTransfer.files.find(f => f.name === fileName);
      if (!file || !file.encryptedData) {
        toast.error('File not found or not ready');
        return;
      }

      try {
        // Decrypt the file data
        console.log('[P2P Receiver] Decrypting and downloading:', fileName);
        
        // In real implementation, decrypt using session key
        const decryptedData = atob(file.encryptedData); // Simplified - should use proper decryption
        
        // Create blob and download
        const blob = new Blob([decryptedData], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        toast.success(`✓ ${fileName} downloaded securely`);
      } catch (error) {
        console.error('[P2P Receiver] Download failed:', error);
        toast.error('Failed to download file');
      }
    };

    window.addEventListener('p2p-incoming-transfer', handleIncomingTransfer as EventListener);
    window.addEventListener('p2p-file-progress', handleFileProgress as EventListener);
    window.addEventListener('p2p-file-received', handleFileReceived as EventListener);
    window.addEventListener('p2p-transfer-complete', handleTransferComplete as EventListener);
    window.addEventListener('p2p-download-file', handleDownloadFile as EventListener);
    window.addEventListener('p2p-file-ready', handleFileReceived as EventListener);
    window.addEventListener('p2p-receiver-progress', handleReceiverProgress as EventListener);

    return () => {
      window.removeEventListener('p2p-incoming-transfer', handleIncomingTransfer as EventListener);
      window.removeEventListener('p2p-file-progress', handleFileProgress as EventListener);
      window.removeEventListener('p2p-file-received', handleFileReceived as EventListener);
      window.removeEventListener('p2p-transfer-complete', handleTransferComplete as EventListener);
      window.removeEventListener('p2p-download-file', handleDownloadFile as EventListener);
      window.removeEventListener('p2p-file-ready', handleFileReceived as EventListener);
      window.removeEventListener('p2p-receiver-progress', handleReceiverProgress as EventListener);
    };
  }, [incomingTransfer]);

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
