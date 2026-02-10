// P2PAttachmentList.tsx - Display and download P2P attachments
import { useState, useEffect } from 'react';
import { Download, FileIcon, CheckCircle, XCircle, AlertCircle, Pause, Play, Zap } from 'lucide-react';
import { p2pService } from '../lib/p2pService';
import { enhancedP2PService } from '../lib/enhancedP2PService';
import toast from 'react-hot-toast';
import { canDownload, ScanStatus } from '../utils/fileScanner';

interface P2PAttachment {
  filename: string;
  mime_type: string;
  size_bytes: number;
  p2p_message_id: string;
  content_base64: string | null;
  is_p2p: boolean;
  p2p_status?: 'pending' | 'delivered' | 'failed';
  // New Scan Fields
  id?: number; // Needed for keying
  scan_status?: 'pending' | 'scanning' | 'CLEAN' | 'BLOCKED' | 'TIMEOUT' | string;
  scan_message?: string;
}

function ScanStatusBadge({ status, message }: { status: string, message: string }) {
  const s = status?.toUpperCase();

  // Minimalistic Indications
  if (s === 'SCANNING' || s === 'PENDING') {
    return null; // Don't display spinning scanning indicator
  }

  if (s === 'CLEAN') {
    return (
      <span className="text-green-500 flex items-center gap-1" title="Scan complete: Safe">
        <CheckCircle className="w-3 h-3" />
        <span className="text-[10px]">Safe</span>
      </span>
    );
  }

  if (s === 'TIMEOUT') {
    return (
      <span className="text-amber-500 cursor-help flex items-center gap-1" title={`Scan timeout: ${message || 'System busy'}. Access blocked for safety.`}>
        <AlertCircle className="w-3 h-3" />
        <span className="text-[10px]">Timeout</span>
      </span>
    );
  }

  if (s === 'BLOCKED') {
    return (
      <span className="text-red-500 flex items-center gap-1" title={`Blocked: ${message || 'Security Risk'}`}>
        <XCircle className="w-3 h-3" />
        <span className="text-[10px]">Blocked</span>
      </span>
    );
  }

  if (s === 'SKIPPED') {
    return (
      <span className="text-gray-500 flex items-center gap-1" title={`Scan skipped: ${message || 'File too large'}. Proceed with caution.`}>
        <AlertCircle className="w-3 h-3" />
        <span className="text-[10px]">Unscanned</span>
      </span>
    );
  }

  return null;
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
  const [transferDetails, setTransferDetails] = useState<Record<string, { speedBps?: number; etaSeconds?: number | null; received?: number; total?: number; isTurbo?: boolean }>>({});

  // New Scan State
  const [scanStatuses, setScanStatuses] = useState<Record<string, { status: string, message: string }>>({});

  // Track P2P delivery status for each file
  useEffect(() => {
    const handleProgress = (e: CustomEvent) => {
      const { messageId, progress, speedBps, etaSeconds, status, received, total, isTurbo } = e.detail;
      setDownloadProgress(prev => ({ ...prev, [messageId]: progress }));
      setTransferDetails(prev => ({ ...prev, [messageId]: { speedBps, etaSeconds, received, total, isTurbo } }));

      const s = status?.toUpperCase();
      if (s === 'PAUSED' || status === 'paused') {
        setDownloadStatus(prev => ({ ...prev, [messageId]: 'paused' }));
      } else if (s === 'TRANSFERRING' || status === 'transferring' || s === 'SENDING') {
        setDownloadStatus(prev => ({ ...prev, [messageId]: 'downloading' }));
      } else if (s === 'COMPLETED' || status === 'complete' || s === 'DONE') {
        setDownloadStatus(prev => ({ ...prev, [messageId]: 'complete' }));
        setDownloadProgress(prev => ({ ...prev, [messageId]: 100 }));
      } else if (s === 'WAITING_FOR_PEER' || s === 'QUEUED') {
        setDownloadStatus(prev => ({ ...prev, [messageId]: 'waiting' }));
      } else if (s === 'FAILED') {
        setDownloadStatus(prev => ({ ...prev, [messageId]: 'failed' }));
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
      const { messageId, percentage, status, speedBps, etaSeconds, received, total, isTurbo } = e.detail;
      setDownloadProgress(prev => ({ ...prev, [messageId]: percentage }));
      setTransferDetails(prev => ({ ...prev, [messageId]: { speedBps, etaSeconds, received, total, isTurbo } }));

      const s = status?.toUpperCase();
      if (s === 'RECEIVING' || s === 'TRANSFERRING' || status === 'downloading') {
        setDownloadStatus(prev => ({ ...prev, [messageId]: 'downloading' }));
      } else if (s === 'PAUSED') {
        setDownloadStatus(prev => ({ ...prev, [messageId]: 'paused' }));
      } else if (s === 'COMPLETED' || status === 'complete') {
        setDownloadStatus(prev => ({ ...prev, [messageId]: 'complete' }));
      } else if (s === 'WAITING_FOR_PEER') {
        setDownloadStatus(prev => ({ ...prev, [messageId]: 'waiting' }));
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

    // Listen for WebSocket scan updates
    const handleScanUpdate = (e: CustomEvent) => {
      const detail = e.detail;
      const fileId = detail.fileId || detail.messageId; // Support both
      if (fileId) {
        setScanStatuses(prev => ({
          ...prev,
          [fileId]: {
            status: detail.scan_status || detail.status,
            message: detail.scan_reason || detail.message
          }
        }));
      }
    };

    window.addEventListener('p2p-progress', handleProgress as EventListener);
    window.addEventListener('p2p-receiver-progress', handleReceiverProgress as EventListener);
    window.addEventListener('p2p-delivered', handleDelivered as EventListener);
    // Add listener for file-scan-status events (dispatched from generic message handler usually)
    window.addEventListener('file-scan-status', handleScanUpdate as EventListener);
    window.addEventListener('p2p-error', handleError as EventListener);
    window.addEventListener('p2p-message', handleMessage as EventListener);
    p2pService.on('file-scan-status', handleScanUpdate);
    window.addEventListener('p2p-scan-status', handleScanUpdate as EventListener);

    // 🚀 NEW: Listen for presence changes to update UI instantly when sender goes offline
    const unsubscribePresence = p2pService.onPresenceChange(() => {
      // Force re-render by updating a dummy state or just rely on the component re-rendering
      // Actually let's just trigger a setState to force render
      setDownloadStatus(prev => ({ ...prev }));
    });

    return () => {
      window.removeEventListener('p2p-progress', handleProgress as EventListener);
      window.removeEventListener('p2p-receiver-progress', handleReceiverProgress as EventListener);
      window.removeEventListener('p2p-delivered', handleDelivered as EventListener);
      window.removeEventListener('p2p-error', handleError as EventListener);
      window.removeEventListener('p2p-message', handleMessage as EventListener);
      window.removeEventListener('file-scan-status', handleScanUpdate as EventListener);
      p2pService.off('file-scan-status', handleScanUpdate);
      window.removeEventListener('p2p-scan-status', handleScanUpdate as EventListener);
      unsubscribePresence();
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

      // NEW: Hydrate scan status from persistent storage to avoid "Scanning" zombie state
      const scanUpdates: Record<string, { status: string, message: string }> = {};
      await Promise.all(attachments.map(async (attachment) => {
        if (attachment.is_p2p && attachment.p2p_message_id) {
          const meta = await p2pService.getTransferMeta(attachment.p2p_message_id);
          if (meta && meta.scanStatus) {
            scanUpdates[attachment.p2p_message_id] = {
              status: meta.scanStatus,
              message: meta.scanMessage || ''
            };
          }
        }
      }));
      setScanStatuses(prev => ({ ...prev, ...scanUpdates }));

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

  const handleDownload = async (attachment: P2PAttachment) => {
    // 🛡️ SECURITY CHECK
    const currentStatus = (attachment.p2p_message_id ? (scanStatuses[attachment.p2p_message_id]?.status || (attachment as any).scan_status || 'pending') : 'pending');
    // Normalize status to match Strict Uppercase types
    if (!canDownload(currentStatus.toUpperCase() as ScanStatus)) {
      toast.error('File scan pending or blocked. Cannot download.', { icon: '🛡️' });
      return;
    }

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

  const getStatusLabel = (attachment: P2PAttachment) => {
    const status = downloadStatus[attachment.p2p_message_id];
    if (mode === 'sender') {
      if (status === 'complete' || attachment.p2p_status === 'delivered') return 'Seeding Complete';
      if (status === 'failed' || attachment.p2p_status === 'failed') return 'Failed to deliver';
      if (p2pService.hasFileInRegistry(attachment.p2p_message_id)) return 'Seeding...';
      if (attachment.p2p_status === 'pending') return 'Waiting for recipient';
    }
    if (attachment.content_base64) return 'Email attachment';
    const isSenderOnline = mode === 'receiver' ? p2pService.isPeerOnline(senderEmail) : true;

    if (status === 'downloading') {
      if (mode === 'receiver' && !isSenderOnline) return 'Waiting for sender online...';
      return mode === 'sender' ? 'Seeding...' : 'Downloading...';
    }
    if (status === 'paused') return 'Paused';
    if (status === 'complete') return mode === 'sender' ? 'File Received' : 'Downloaded';
    if (status === 'failed') return 'Transfer failed';
    if (status === 'waiting') return 'Waiting for sender online...';
    return 'Available via Direct Transfer';
  };


  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="mt-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
        <FileIcon className="w-3.5 h-3.5" />
        {attachments.length} Attachment{attachments.length !== 1 ? 's' : ''}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {attachments.map((attachment, idx) => {
          const status = downloadStatus[attachment.p2p_message_id] || 'idle';
          const isSenderWithFile = mode === 'sender' && p2pService.hasFileInRegistry(attachment.p2p_message_id);
          const isStandardAttachment = !!attachment.content_base64 || !attachment.is_p2p;
          const isPaused = status === 'paused';
          const isDownloading = status === 'downloading';

          return (
            <div key={idx} className="group relative flex items-start gap-3 p-3 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 hover:shadow-md transition-shadow">
              <div className="flex-shrink-0 mt-1">
                <div className="w-8 h-8 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                  <FileIcon className="w-4 h-4 text-gray-500" />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-gray-900 dark:text-gray-100" title={attachment.filename}>{attachment.filename}</p>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-500">{formatFileSize(attachment.size_bytes)}</span>
                  {!isStandardAttachment && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">Direct Transfer</span>
                      {transferDetails[attachment.p2p_message_id]?.isTurbo && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-[9px] font-bold animate-pulse" title="Adaptive GZIP Compression Active">
                          <Zap className="w-2.5 h-2.5 fill-current" />
                          TURBO
                        </span>
                      )}
                    </div>
                  )}

                  {/* Status Text - Truncated */}
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-500 truncate max-w-[120px]" title={getStatusLabel(attachment)}>
                      {getStatusLabel(attachment)}
                    </span>
                    {(isDownloading || isPaused || status === 'complete') && transferDetails[attachment.p2p_message_id]?.received != null && (
                      <span className="text-[9px] text-gray-400 font-medium">
                        {formatFileSize(transferDetails[attachment.p2p_message_id].received || 0)} / {formatFileSize(transferDetails[attachment.p2p_message_id].total || attachment.size_bytes)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Inline Controls Row */}
                <div className="flex items-center gap-2 mt-2">
                  {/* Scan Badge */}
                  <ScanStatusBadge
                    status={attachment.p2p_message_id ? (scanStatuses[attachment.p2p_message_id]?.status || (attachment as any).scan_status || 'pending') : 'pending'}
                    message={attachment.p2p_message_id ? (scanStatuses[attachment.p2p_message_id]?.message || (attachment as any).scan_reason || '') : ''}
                  />

                  <div className="flex-1"></div>

                  {/* Open File Link */}
                  {(status === 'complete' || (mode === 'receiver' && isSenderWithFile) || (mode === 'sender' && isSenderWithFile)) && (
                    <button
                      onClick={async () => {
                        let blob: Blob | null | undefined = await p2pService.getReceivedBlob(attachment.p2p_message_id);
                        if (!blob && mode === 'sender') blob = p2pService.getSenderFileBlob(attachment.p2p_message_id);
                        if (blob) {
                          const url = URL.createObjectURL(blob);
                          window.open(url, '_blank');
                          setTimeout(() => URL.revokeObjectURL(url), 60000);
                        } else {
                          toast.error('File not found locally');
                        }
                      }}
                      className="text-xs font-medium text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
                    >
                      Open
                    </button>
                  )}

                  {/* Download Action */}
                  <div className="flex-shrink-0">
                    {mode === 'receiver' && (
                      <>
                        {(status === 'idle' || status === 'failed' || status === 'complete' || isStandardAttachment) && !isDownloading && !isPaused && (
                          <button
                            onClick={() => handleDownload(attachment)}
                            className={`p-1.5 rounded-full transition-colors ${(attachment.p2p_message_id && (scanStatuses[attachment.p2p_message_id]?.status === 'blocked' || (attachment as any).scan_status === 'blocked'))
                              ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                              : 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50'
                              }`}
                            title="Download"
                            disabled={!canDownload(((attachment.p2p_message_id && scanStatuses[attachment.p2p_message_id]?.status) || (attachment as any).scan_status || 'pending') as ScanStatus)}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {(isDownloading || isPaused) && (
                          <div className="flex items-center gap-1">
                            {isDownloading ? (
                              <button onClick={() => p2pService.pauseReceive(attachment.p2p_message_id)} className="p-1.5 hover:bg-yellow-100 rounded text-yellow-600"><Pause className="w-3.5 h-3.5" /></button>
                            ) : (
                              <button onClick={() => p2pService.resumeReceive(attachment.p2p_message_id, senderEmail)} className="p-1.5 hover:bg-green-100 rounded text-green-600"><Play className="w-3.5 h-3.5" /></button>
                            )}
                            <button onClick={() => p2pService.cancelTransfer(attachment.p2p_message_id)} className="p-1.5 hover:bg-red-100 rounded text-red-600"><XCircle className="w-3.5 h-3.5" /></button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Progress Bar for downloading/paused */}
                {(isDownloading || isPaused) && (
                  <div className="mt-2 h-1 w-full bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${isPaused ? 'bg-yellow-400' : 'bg-blue-500'}`}
                      style={{ width: `${downloadProgress[attachment.p2p_message_id] || 0}%` }}
                    />
                  </div>
                )}

              </div>
            </div>
          );
        })}
      </div>

      {mode === 'receiver' && attachments.some(a => a.is_p2p && !a.content_base64) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 bg-blue-50/50 border border-blue-100 dark:bg-blue-900/10 dark:border-blue-800 rounded-full text-[10px] text-blue-600 dark:text-blue-400 justify-center">
          <span className="font-semibold flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Direct Transfer Active</span>
          <span className="flex items-center gap-1 text-blue-600/70 dark:text-blue-400/70"> Sender must be online to download</span>
          <span className="hidden sm:inline w-px h-3 bg-blue-200 dark:bg-blue-800"></span>
          <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">🔒 Encrypted</span>
          <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">⚡ Auto-Resume</span>
          <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">🛡️ Scanned</span>
        </div>
      )}
    </div>
  );
}
