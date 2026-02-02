// P2PAttachmentList.tsx - Display and download P2P attachments
import { useState, useEffect } from 'react';
import { Download, FileIcon, CheckCircle, XCircle, Loader, AlertCircle, Eye } from 'lucide-react';
import { p2pService } from '../lib/p2pService';
import { enhancedP2PService } from '../lib/enhancedP2PService';
import toast from 'react-hot-toast';
import InlinePreviewModal from './compose/InlinePreviewModal';

interface P2PAttachment {
  filename: string;
  mime_type: string;
  size_bytes: number;
  p2p_message_id: string;
  content_base64: string | null;
  is_p2p: boolean;
  p2p_status?: 'pending' | 'delivered' | 'failed';
}

interface P2PAttachmentListProps {
  attachments: P2PAttachment[];
  senderEmail: string;
  emailId: string;
  mode: 'sender' | 'receiver';
}

export default function P2PAttachmentList({
  attachments,
  mode
}: P2PAttachmentListProps) {

  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [downloadStatus, setDownloadStatus] = useState<Record<string, 'idle' | 'downloading' | 'complete' | 'failed' | 'waiting'>>({});
  const [previewFile, setPreviewFile] = useState<{ blob: Blob; name: string; mimeType: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Track P2P delivery status for each file
  useEffect(() => {
    const handleProgress = (e: CustomEvent) => {
      const { messageId, progress } = e.detail;
      setDownloadProgress(prev => ({ ...prev, [messageId]: progress }));
    };

    const handleDelivered = (e: CustomEvent) => {
      const { messageId } = e.detail;
      setDownloadStatus(prev => ({ ...prev, [messageId]: 'complete' }));
      setDownloadProgress(prev => ({ ...prev, [messageId]: 100 }));
    };

    const handleError = (e: CustomEvent) => {
      const { messageId, code } = e.detail;
      if (code === 'SENDER_OFFLINE') {
        setDownloadStatus(prev => ({ ...prev, [messageId]: 'waiting' }));
        // toast.success('Added to queue. Will start when sender is online.');
      } else {
        setDownloadStatus(prev => ({ ...prev, [messageId]: 'failed' }));
      }
    };

    const handleReceiverProgress = (e: CustomEvent) => {
      const { messageId, percentage, status } = e.detail;
      setDownloadProgress(prev => ({ ...prev, [messageId]: percentage }));
      if (status === 'RECEIVING' || status === 'downloading') {
        setDownloadStatus(prev => ({ ...prev, [messageId]: 'downloading' }));
      } else if (status === 'COMPLETED' || status === 'complete') {
        setDownloadStatus(prev => ({ ...prev, [messageId]: 'complete' }));
      }
    };

    window.addEventListener('p2p-progress', handleProgress as EventListener);
    window.addEventListener('p2p-receiver-progress', handleReceiverProgress as EventListener);
    window.addEventListener('p2p-delivered', handleDelivered as EventListener);
    window.addEventListener('p2p-error', handleError as EventListener);

    return () => {
      window.removeEventListener('p2p-progress', handleProgress as EventListener);
      window.removeEventListener('p2p-receiver-progress', handleReceiverProgress as EventListener);
      window.removeEventListener('p2p-delivered', handleDelivered as EventListener);
      window.removeEventListener('p2p-error', handleError as EventListener);
    };
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  const handleDownload = async (attachment: P2PAttachment) => {
    // Check if already downloaded (single-download policy)
    if (attachment.is_p2p && attachment.p2p_message_id) {
      if (enhancedP2PService.hasBeenDownloaded(attachment.p2p_message_id)) {
        toast.error('This file can only be downloaded once for security reasons.');
        return;
      }
    }

    // If already has content (regular attachment), download immediately
    if (attachment.content_base64) {
      downloadFile(attachment.filename, attachment.content_base64, attachment.mime_type);
      return;
    }

    // For P2P attachments, request from sender
    if (!attachment.is_p2p) return;

    try {
      setDownloadStatus(prev => ({ ...prev, [attachment.p2p_message_id]: 'downloading' }));
      setDownloadProgress(prev => ({ ...prev, [attachment.p2p_message_id]: 0 }));

      // Check if file is already received
      const hasFile = await p2pService.hasReceivedFile(attachment.p2p_message_id);

      if (hasFile) {
        // File is ready, download it
        await p2pService.downloadReceivedFile(attachment.p2p_message_id, attachment.filename);

        // Record the download
        const userId = localStorage.getItem('userId') || 'unknown';
        enhancedP2PService.recordDownload(attachment.p2p_message_id, attachment.filename, userId);

        setDownloadStatus(prev => ({ ...prev, [attachment.p2p_message_id]: 'complete' }));
        toast.success(`✓ Downloaded: ${attachment.filename}`);
      } else {
        toast.error('File not ready. Please wait for transfer to complete.');
        setDownloadStatus(prev => ({ ...prev, [attachment.p2p_message_id]: 'failed' }));
      }

    } catch (err) {
      console.error('P2P download failed:', err);
      setDownloadStatus(prev => ({ ...prev, [attachment.p2p_message_id]: 'failed' }));
      toast.error('Download failed. Sender may be offline.');
    }
  };

  const handlePreview = async (attachment: P2PAttachment) => {
    // Check if file is already received
    const hasFile = await p2pService.hasReceivedFile(attachment.p2p_message_id);

    if (!hasFile) {
      toast.error('File not ready. Please wait for transfer to complete.');
      return;
    }

    try {
      // Get file blob
      let blob: Blob | null = null;

      // Try to get from memory first
      const db = await (p2pService as any).openDB();
      const tx = db.transaction('files', 'readonly');
      const store = tx.objectStore('files');
      const record = await new Promise<any>((resolve, reject) => {
        const req = store.get(attachment.p2p_message_id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      if (record?.blob) {
        blob = record.blob;
      }

      if (!blob) {
        toast.error('File not found.');
        return;
      }

      setPreviewFile({
        blob,
        name: attachment.filename,
        mimeType: attachment.mime_type
      });
      setShowPreview(true);
    } catch (error) {
      console.error('Preview failed:', error);
      toast.error('Failed to preview file.');
    }
  };

  const downloadFile = (filename: string, base64: string, mimeType: string) => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = (attachment: P2PAttachment) => {
    const status = downloadStatus[attachment.p2p_message_id] || 'idle';
    const progress = downloadProgress[attachment.p2p_message_id] || 0;

    if (mode === 'sender') {
      // For sender: show delivery status
      if (attachment.p2p_status === 'delivered') {
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      }
      if (attachment.p2p_status === 'failed') {
        return <XCircle className="w-5 h-5 text-red-500" />;
      }
      if (attachment.p2p_status === 'pending') {
        return <Loader className="w-5 h-5 text-gray-400 animate-spin" />;
      }
    }

    // For receiver: show download status
    switch (status) {
      case 'downloading':
        return (
          <div className="flex items-center gap-2">
            <Loader className="w-5 h-5 text-blue-500 animate-spin" />
            <span className="text-xs text-gray-600">{progress}%</span>
          </div>
        );
      case 'complete':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'waiting':
        return (
          <div className="flex items-center gap-2" title="Waiting for sender to come online">
            <Loader className="w-5 h-5 text-yellow-500 animate-pulse" />
            <span className="text-xs text-yellow-600">Waiting...</span>
          </div>
        );
      default:
        return null;
    }
  };

  const getStatusLabel = (attachment: P2PAttachment) => {
    if (mode === 'sender') {
      if (attachment.p2p_status === 'delivered') return 'Delivered';
      if (attachment.p2p_status === 'pending') return 'Waiting for recipient';
      if (attachment.p2p_status === 'failed') return 'Failed to deliver';
    }

    if (attachment.content_base64) {
      return 'Email attachment';
    }

    const status = downloadStatus[attachment.p2p_message_id];
    if (status === 'downloading') return 'Downloading...';
    if (status === 'complete') return 'Downloaded';
    if (status === 'failed') return 'Download failed';
    if (status === 'waiting') return 'Waiting for sender online...';

    return 'Available via P2P';
  };

  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="mt-4 border-t pt-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <FileIcon className="w-4 h-4" />
        Attachments ({attachments.length})
      </h3>

      <div className="space-y-2">
        {attachments.map((attachment, idx) => {
          const isP2P = attachment.is_p2p && !attachment.content_base64;
          const status = downloadStatus[attachment.p2p_message_id] || 'idle';
          const canDownload = mode === 'receiver' && status !== 'downloading';

          return (
            <div
              key={idx}
              className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700"
            >
              {/* Icon */}
              <div className="flex-shrink-0">
                <FileIcon className="w-8 h-8 text-gray-500" />
              </div>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{attachment.filename}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500">
                    {formatFileSize(attachment.size_bytes)}
                  </span>
                  {isP2P && (
                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 rounded">
                      P2P Transfer
                    </span>
                  )}
                  <span className="text-xs text-gray-500">
                    {getStatusLabel(attachment)}
                  </span>
                </div>
              </div>

              {/* Status icon */}
              <div className="flex-shrink-0">
                {getStatusIcon(attachment)}
              </div>

              {/* Preview and Download buttons */}
              {mode === 'receiver' && (
                <div className="flex items-center gap-2">
                  {/* Preview button */}
                  {attachment.is_p2p && (
                    <button
                      onClick={() => handlePreview(attachment)}
                      className="flex-shrink-0 p-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      title="Preview file"
                    >
                      <Eye className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                  )}

                  {/* Download button */}
                  {canDownload && (
                    <button
                      onClick={() => handleDownload(attachment)}
                      disabled={attachment.is_p2p && !!attachment.p2p_message_id && enhancedP2PService.hasBeenDownloaded(attachment.p2p_message_id)}
                      className="flex-shrink-0 p-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={
                        attachment.is_p2p && attachment.p2p_message_id && enhancedP2PService.hasBeenDownloaded(attachment.p2p_message_id)
                          ? "Already downloaded (single-download policy)"
                          : isP2P ? "Request file from sender" : "Download attachment"
                      }
                    >
                      <Download className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                  )}

                  {/* Single-download indicator */}
                  {attachment.is_p2p && attachment.p2p_message_id && enhancedP2PService.hasBeenDownloaded(attachment.p2p_message_id) && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded">
                      Downloaded
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* P2P Warning for receiver */}
      {mode === 'receiver' && attachments.some(a => a.is_p2p && !a.content_base64) && (
        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-800 dark:text-blue-300">
            <strong>P2P Transfer:</strong> Files will be downloaded directly from sender when you click download.
            Sender must be online for transfer to work.
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && previewFile && (
        <InlinePreviewModal
          isOpen={showPreview}
          file={new File([previewFile.blob], previewFile.name, { type: previewFile.mimeType })}
          onClose={() => {
            setShowPreview(false);
            setPreviewFile(null);
          }}
        />
      )}
    </div>
  );
}
