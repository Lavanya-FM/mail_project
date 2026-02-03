// P2PAttachmentList.tsx - Display and download P2P attachments
import { useState, useEffect } from 'react';
import { Download, FileIcon, CheckCircle, XCircle, Loader, AlertCircle, Pause, Play } from 'lucide-react';
import { p2pService } from '../lib/p2pService';
import { enhancedP2PService } from '../lib/enhancedP2PService';
import toast from 'react-hot-toast';

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
  emailId,
  senderEmail,
  mode
}: P2PAttachmentListProps) {

  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [downloadStatus, setDownloadStatus] = useState<Record<string, 'idle' | 'downloading' | 'complete' | 'failed' | 'waiting' | 'paused'>>({});
  const [transferDetails, setTransferDetails] = useState<Record<string, { speedBps?: number; etaSeconds?: number | null }>>({});

  // Track P2P delivery status for each file
  useEffect(() => {
    const handleProgress = (e: CustomEvent) => {
      const { messageId, progress, speedBps, etaSeconds, status } = e.detail;
      setDownloadProgress(prev => ({ ...prev, [messageId]: progress }));
      setTransferDetails(prev => ({ ...prev, [messageId]: { speedBps, etaSeconds } }));
      if (status === 'paused') {
        setDownloadStatus(prev => ({ ...prev, [messageId]: 'paused' }));
      } else if (status === 'transferring') {
        setDownloadStatus(prev => ({ ...prev, [messageId]: 'downloading' }));
      }
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
      } else {
        setDownloadStatus(prev => ({ ...prev, [messageId]: 'failed' }));
      }
    };

    const handleReceiverProgress = (e: CustomEvent) => {
      const { messageId, percentage, status, speedBps, etaSeconds } = e.detail;
      setDownloadProgress(prev => ({ ...prev, [messageId]: percentage }));
      setTransferDetails(prev => ({ ...prev, [messageId]: { speedBps, etaSeconds } }));
      if (status === 'RECEIVING' || status === 'downloading') {
        setDownloadStatus(prev => ({ ...prev, [messageId]: 'downloading' }));
      } else if (status === 'PAUSED') {
        setDownloadStatus(prev => ({ ...prev, [messageId]: 'paused' }));
      } else if (status === 'COMPLETED' || status === 'complete') {
        setDownloadStatus(prev => ({ ...prev, [messageId]: 'complete' }));
      }
    };

    const handleMessage = (e: CustomEvent) => {
      const msg = e.detail;
      if (msg.payload?.type === 'file-request-nudge') {
        const { messageId, fileName } = msg.payload;
        toast((t) => (
          <div className="flex flex-col gap-2">
            <p className="text-sm"><b>{msg.from}</b> is requesting the file <b>{fileName}</b> back from you.</p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  toast.dismiss(t.id);
                  const fileData = await p2pService.getReceivedBlob(messageId);
                  if (fileData) {
                    p2pService.registerFile(new File([fileData], fileName, { type: 'application/octet-stream' }), messageId);
                    p2pService.offerTransfer(messageId, msg.from);
                    toast.success(`Sending ${fileName} back to ${msg.from}`);
                  } else {
                    toast.error('File not found in your local storage.');
                  }
                }}
                className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 transition"
              >
                Send back via P2P
              </button>
              <button onClick={() => toast.dismiss(t.id)} className="px-3 py-1 bg-gray-200 rounded text-xs hover:bg-gray-300 transition">Ignore</button>
            </div>
          </div>
        ), { duration: 15000 });
      }
    };

    window.addEventListener('p2p-progress', handleProgress as EventListener);
    window.addEventListener('p2p-receiver-progress', handleReceiverProgress as EventListener);
    window.addEventListener('p2p-delivered', handleDelivered as EventListener);
    window.addEventListener('p2p-error', handleError as EventListener);
    window.addEventListener('p2p-message', handleMessage as EventListener);

    return () => {
      window.removeEventListener('p2p-progress', handleProgress as EventListener);
      window.removeEventListener('p2p-receiver-progress', handleReceiverProgress as EventListener);
      window.removeEventListener('p2p-delivered', handleDelivered as EventListener);
      window.removeEventListener('p2p-error', handleError as EventListener);
      window.removeEventListener('p2p-message', handleMessage as EventListener);
    };
  }, []);

  // Check initial state of P2P attachments
  useEffect(() => {
    const checkInitialState = async () => {
      const statuses: Record<string, any> = {};
      const progress: Record<string, number> = {};

      for (const attachment of attachments) {
        if (attachment.is_p2p && attachment.p2p_message_id) {
          const hasFile = await p2pService.hasReceivedFile(attachment.p2p_message_id);
          if (hasFile) {
            statuses[attachment.p2p_message_id] = 'complete';
            progress[attachment.p2p_message_id] = 100;
          } else {
            const state = p2pService.getTransferState(attachment.p2p_message_id);
            if (state) {
              if (state.status === 'COMPLETED' || (state.progress >= 100)) {
                statuses[attachment.p2p_message_id] = 'complete';
                progress[attachment.p2p_message_id] = 100;
              } else if (state.status === 'PAUSED') {
                statuses[attachment.p2p_message_id] = 'paused';
                progress[attachment.p2p_message_id] = state.progress;
              } else {
                statuses[attachment.p2p_message_id] = 'downloading';
                progress[attachment.p2p_message_id] = state.progress;
              }
            }
          }
        }
      }

      setDownloadStatus(prev => ({ ...prev, ...statuses }));
      setDownloadProgress(prev => ({ ...prev, ...progress }));
      setTransferDetails(prev => {
        const newDetails: any = { ...prev };
        for (const attachment of attachments) {
          const state = p2pService.getTransferState(attachment.p2p_message_id);
          if (state) {
            newDetails[attachment.p2p_message_id] = {
              speedBps: state.speedBps,
              etaSeconds: state.etaSeconds
            };
          }
        }
        return newDetails;
      });
    };

    checkInitialState();
  }, [attachments]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  const formatSpeed = (bps?: number) => {
    if (!bps) return '';
    if (bps < 1024) return `${bps.toFixed(0)} B/s`;
    const kbps = bps / 1024;
    if (kbps < 1024) return `${kbps.toFixed(1)} KB/s`;
    const mbps = kbps / 1024;
    return `${mbps.toFixed(1)} MB/s`;
  };

  const formatETA = (etaSeconds?: number | null) => {
    if (etaSeconds === null || etaSeconds === undefined || etaSeconds <= 0) return '';
    if (etaSeconds < 60) return `${Math.ceil(etaSeconds)}s remaining`;
    const minutes = Math.floor(etaSeconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m left`;
    return `${minutes}m ${Math.floor(etaSeconds % 60)}s left`;
  };

  const handleDownload = async (attachment: P2PAttachment) => {
    if (attachment.content_base64) {
      downloadFileFromBase64(attachment.filename, attachment.content_base64, attachment.mime_type);
      return;
    }

    if (!attachment.is_p2p && emailId) {
      const url = `/api/email/${emailId}/attachment/${attachment.p2p_message_id || ''}?download=1`;
      window.open(url, '_blank');
      return;
    }

    if (!attachment.is_p2p) return;

    try {
      setDownloadStatus(prev => ({ ...prev, [attachment.p2p_message_id]: 'downloading' }));
      const hasFile = await p2pService.hasReceivedFile(attachment.p2p_message_id);
      if (hasFile) {
        await p2pService.downloadReceivedFile(attachment.p2p_message_id, attachment.filename);
        const userId = localStorage.getItem('userId') || 'unknown';
        enhancedP2PService.recordDownload(attachment.p2p_message_id, attachment.filename, userId);
        setDownloadStatus(prev => ({ ...prev, [attachment.p2p_message_id]: 'complete' }));
        toast.success(`✓ Downloaded: ${attachment.filename}`);
      } else {
        await p2pService.resumeReceive(attachment.p2p_message_id, senderEmail);
      }
    } catch (err) {
      console.error('P2P download failed:', err);
      setDownloadStatus(prev => ({ ...prev, [attachment.p2p_message_id]: 'failed' }));
      toast.error('Download failed. Sender may be offline.');
    }
  };

  const downloadFileFromBase64 = (filename: string, base64: string, mimeType: string) => {
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
      if (p2pService.hasFileInRegistry(attachment.p2p_message_id)) {
        return (
          <div title="Hosting file for P2P">
            <CheckCircle className="w-5 h-5 text-green-500" />
          </div>
        );
      }
      if (attachment.p2p_status === 'delivered') return <CheckCircle className="w-5 h-5 text-green-500" />;
      if (attachment.p2p_status === 'failed') return <XCircle className="w-5 h-5 text-red-500" />;
      if (attachment.p2p_status === 'pending') return <Loader className="w-5 h-5 text-gray-400 animate-spin" />;
    }

    switch (status) {
      case 'downloading':
        const details = transferDetails[attachment.p2p_message_id];
        return (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <Loader className="w-5 h-5 text-blue-500 animate-spin" />
              <span className="text-sm font-bold text-blue-600">{progress}%</span>
            </div>
            {details && (details.speedBps || details.etaSeconds != null) && (
              <div className="flex items-center gap-2 text-[10px] text-gray-500 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded leading-none">
                {details.speedBps && <span>{formatSpeed(details.speedBps)}</span>}
                {details.speedBps && details.etaSeconds != null && <span className="opacity-30">|</span>}
                {details.etaSeconds != null && <span>{formatETA(details.etaSeconds)}</span>}
              </div>
            )}
          </div>
        );
      case 'paused':
        return (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <Pause className="w-5 h-5 text-yellow-500" />
              <span className="text-sm font-bold text-yellow-600">{progress}% (Paused)</span>
            </div>
          </div>
        );
      case 'complete': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'waiting':
        return (
          <div className="flex items-center gap-2" title="Waiting for sender to come online">
            <Loader className="w-5 h-5 text-yellow-500 animate-pulse" />
            <span className="text-xs text-yellow-600">Waiting...</span>
          </div>
        );
      default: return null;
    }
  };

  const getStatusLabel = (attachment: P2PAttachment) => {
    const status = downloadStatus[attachment.p2p_message_id];
    if (mode === 'sender') {
      if (p2pService.hasFileInRegistry(attachment.p2p_message_id)) return 'Hosting Locally';
      if (attachment.p2p_status === 'delivered') return 'Delivered';
      if (attachment.p2p_status === 'pending') return 'Waiting for recipient';
      if (attachment.p2p_status === 'failed') return 'Failed to deliver';
    }
    if (attachment.content_base64) return 'Email attachment';
    if (status === 'downloading') return 'Downloading...';
    if (status === 'paused') return 'Paused';
    if (status === 'complete') return mode === 'sender' ? 'File Received' : 'Downloaded';
    if (status === 'failed') return 'Transfer failed';
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
          const isSenderWithFile = mode === 'sender' && p2pService.hasFileInRegistry(attachment.p2p_message_id);
          const isStandardAttachment = !!attachment.content_base64 || !attachment.is_p2p;
          const isPaused = status === 'paused';
          const isDownloading = status === 'downloading';

          return (
            <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
              <div className="flex-shrink-0">
                <FileIcon className="w-8 h-8 text-gray-500" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{attachment.filename}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500">{formatFileSize(attachment.size_bytes)}</span>
                  {isP2P && <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 rounded">P2P Transfer</span>}
                  <span className="text-xs text-gray-500">{getStatusLabel(attachment)}</span>
                </div>
              </div>

              <div className="flex-shrink-0">
                {getStatusIcon(attachment)}
              </div>

              <div className="flex items-center gap-2">
                {/* Download controls for receiver */}
                {mode === 'receiver' && (
                  <>
                    {(status === 'idle' || status === 'failed' || status === 'complete' || isStandardAttachment) && !isDownloading && !isPaused && (
                      <button
                        onClick={() => handleDownload(attachment)}
                        className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                        title={status === 'complete' ? "Save to computer" : "Download"}
                      >
                        <Download className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </button>
                    )}

                    {isDownloading && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => p2pService.pauseReceive(attachment.p2p_message_id)} className="p-1.5 hover:bg-yellow-100 rounded-lg" title="Pause"><Pause className="w-4 h-4 text-yellow-600" /></button>
                        <button onClick={() => p2pService.cancelTransfer(attachment.p2p_message_id)} className="p-1.5 hover:bg-red-100 rounded-lg" title="Cancel"><XCircle className="w-4 h-4 text-red-600" /></button>
                      </div>
                    )}

                    {isPaused && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => p2pService.resumeReceive(attachment.p2p_message_id, senderEmail)} className="p-1.5 hover:bg-green-100 rounded-lg" title="Resume"><Play className="w-4 h-4 text-green-600" /></button>
                        <button onClick={() => p2pService.cancelTransfer(attachment.p2p_message_id)} className="p-1.5 hover:bg-red-100 rounded-lg" title="Cancel"><XCircle className="w-4 h-4 text-red-600" /></button>
                      </div>
                    )}
                  </>
                )}

                {/* Request Back for sender */}
                {mode === 'sender' && isP2P && !isSenderWithFile && (
                  <button
                    onClick={() => {
                      p2pService.sendChat(senderEmail, `I lost the local copy of "${attachment.filename}". Requesting it back.`, {
                        type: 'file-request-nudge',
                        messageId: attachment.p2p_message_id,
                        fileName: attachment.filename
                      });
                      toast.success('File requested back from recipient');
                    }}
                    className="text-[10px] px-2 py-1 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded-lg hover:bg-purple-200"
                  >
                    Request Back
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {mode === 'receiver' && attachments.some(a => a.is_p2p && !a.content_base64) && (
        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-800 dark:text-blue-300">
            <strong>P2P Transfer:</strong> Files will be downloaded directly from sender. Sender must be online.
          </div>
        </div>
      )}
    </div>
  );
}
