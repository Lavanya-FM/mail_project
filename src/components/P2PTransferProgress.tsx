import { useState, useEffect } from 'react';
import { X, Download, CheckCircle, AlertCircle, File, Image, Pause, Play, Wifi, XCircle } from 'lucide-react';
import { p2pService } from '../lib/p2pService';
import { p2pToast } from '../utils/p2pToasts';

interface P2PTransferProgressProps {
  isOpen: boolean;
  onClose: () => void;
  files: Array<{
    name: string;
    size: number;
    progress: number;
    status: 'pending' | 'sending' | 'delivered' | 'failed' | 'paused' | 'transferring' | 'receiving';
    messageId?: string;
    etaSeconds?: number | null;
    speedBps?: number;
    isPaused?: boolean;
  }>;
  mode: 'sender' | 'receiver';
  senderEmail?: string;
  recipientEmail?: string;
  recipients?: string[]; // For multi-recipient support
  recipientStatus?: 'online' | 'offline' | 'unknown';
}

export default function P2PTransferProgress({
  isOpen,
  onClose,
  files,
  mode,
  senderEmail,
  recipientEmail,
  recipients = [],
  recipientStatus
}: P2PTransferProgressProps) {
  const [downloadedFiles, setDownloadedFiles] = useState<Set<string>>(new Set());
  const [fileStates, setFileStates] = useState<Map<string, {
    progress: number;
    status: 'pending' | 'sending' | 'delivered' | 'failed' | 'paused' | 'transferring' | 'receiving';
    etaSeconds?: number | null;
    speedBps?: number;
    isPaused?: boolean;
  }>>(new Map());

  // Update file states from props
  useEffect(() => {
    const newStates = new Map();
    files.forEach(file => {
      if (file.messageId) {
        newStates.set(file.messageId, {
          progress: file.progress,
          status: file.status,
          etaSeconds: file.etaSeconds,
          speedBps: file.speedBps,
          isPaused: file.isPaused || false
        });
      }
    });
    setFileStates(newStates);
  }, [files]);

  // Listen for progress updates
  useEffect(() => {
    const progressHandler = (e: CustomEvent) => {
      const { messageId, progress, etaSeconds, speedBps } = e.detail;
      setFileStates(prev => {
        const updated = new Map(prev);
        const current = updated.get(messageId) || { progress: 0, status: 'pending' as const };
        updated.set(messageId, {
          ...current,
          progress,
          etaSeconds,
          speedBps,
          status: progress >= 100 ? 'delivered' : 'sending'
        });
        return updated;
      });
    };

    const receiverProgressHandler = (e: CustomEvent) => {
      const { messageId, percentage, etaSeconds } = e.detail;
      setFileStates(prev => {
        const updated = new Map(prev);
        const current = updated.get(messageId) || { progress: 0, status: 'pending' as const };
        updated.set(messageId, {
          ...current,
          progress: percentage,
          etaSeconds,
          status: percentage >= 100 ? 'delivered' : 'sending'
        });
        return updated;
      });
    };

    window.addEventListener('p2p-progress', progressHandler as EventListener);
    window.addEventListener('p2p-receiver-progress', receiverProgressHandler as EventListener);

    return () => {
      window.removeEventListener('p2p-progress', progressHandler as EventListener);
      window.removeEventListener('p2p-receiver-progress', receiverProgressHandler as EventListener);
    };
  }, []);

  if (!isOpen) return null;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  const formatSpeed = (bytesPerSecond: number | undefined): string => {
    if (!bytesPerSecond || bytesPerSecond === 0) return '0 KB/s';
    const kb = bytesPerSecond / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB/s`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB/s`;
  };

  const formatETA = (etaSeconds: number | null | undefined): string => {
    if (etaSeconds === null || etaSeconds === undefined || etaSeconds <= 0) return 'Calculating...';
    if (etaSeconds < 60) return `${Math.ceil(etaSeconds)}s`;
    const minutes = Math.floor(etaSeconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  const handlePause = (messageId: string) => {
    if (mode === 'sender') {
      p2pService.pauseTransfer(messageId);
    } else {
      // Receiver pause logic
      const rt = (p2pService as any).receiverTransfers?.get(messageId);
      if (rt) {
        rt.status = 'paused';
        // (p2pService as any).markReceiverPaused(messageId, 'USER_PAUSED');
      }
    }

    setFileStates(prev => {
      const updated = new Map(prev);
      const current = updated.get(messageId);
      if (current) {
        updated.set(messageId, { ...current, isPaused: true, status: 'paused' });
      }
      return updated;
    });

    const fileName = files.find(f => f.messageId === messageId)?.name || 'file';
    p2pToast.paused(fileName);
  };

  const handleResume = (messageId: string) => {
    if (mode === 'sender') {
      p2pService.resumeTransfer(messageId);
    } else {
      // Receiver resume logic
      p2pService.resumeReceive(messageId);
    }

    setFileStates(prev => {
      const updated = new Map(prev);
      const current = updated.get(messageId);
      if (current) {
        updated.set(messageId, { ...current, isPaused: false, status: 'sending' });
      }
      return updated;
    });

    const fileName = files.find(f => f.messageId === messageId)?.name || 'file';
    p2pToast.resumed(fileName);
  };

  const handleCancel = (messageId: string) => {
    // Cancel transfer logic
    if (mode === 'sender') {
      const transfer = (p2pService as any).activeTransfers?.get(messageId);
      if (transfer) {
        (p2pService as any).activeTransfers.delete(messageId);
      }
    } else {
      const rt = (p2pService as any).receiverTransfers?.get(messageId);
      if (rt) {
        rt.status = 'failed';
      }
    }

    setFileStates(prev => {
      const updated = new Map(prev);
      const current = updated.get(messageId);
      if (current) {
        updated.set(messageId, { ...current, status: 'failed' });
      }
      return updated;
    });

    const fileName = files.find(f => f.messageId === messageId)?.name || 'file';
    p2pToast.cancelled(fileName);
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];

    if (imageExts.includes(ext || '')) {
      return <Image className="w-5 h-5 text-blue-500" />;
    }
    return <File className="w-5 h-5 text-gray-500" />;
  };

  const totalProgress = files.length > 0
    ? files.reduce((sum, f) => sum + f.progress, 0) / files.length
    : 0;

  const allDelivered = files.every(f => f.status === 'delivered');
  const anyFailed = files.some(f => f.status === 'failed');

  const handleDownloadFile = async (file: any) => {
    try {
      console.log(`[P2P] Securely downloading: ${file.name}`);
      setDownloadedFiles(prev => new Set([...prev, file.name]));

      window.dispatchEvent(new CustomEvent('p2p-download-file', {
        detail: {
          messageId: file.messageId,
          fileName: file.name
        }
      }));
    } catch (error) {
      console.error('[P2P] Download failed:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-slate-800 dark:to-slate-800">
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              {mode === 'sender' ? (
                <>
                  📤 Sending Files via P2P
                </>
              ) : (
                <>
                  📥 Receiving Files via P2P
                </>
              )}
            </h3>
            <div className="flex flex-col mt-1">
              <p className="text-sm text-gray-600 dark:text-slate-400">
                {mode === 'sender'
                  ? recipients.length > 0
                    ? `To: ${recipients.join(', ')}`
                    : `To: ${recipientEmail}`
                  : `From: ${senderEmail}`}
              </p>
              {mode === 'sender' && recipientStatus && (
                <div className={`text-xs flex items-center gap-1.5 mt-0.5 font-medium ${recipientStatus === 'online' ? 'text-green-600 dark:text-green-400' : 'text-gray-500'
                  }`}>
                  <div className={`w-2 h-2 rounded-full ${recipientStatus === 'online' ? 'bg-green-500' : 'bg-gray-400'
                    }`} />
                  {recipientStatus === 'online' ? 'Recipient Online' : 'Recipient Offline'}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => {
              window.dispatchEvent(new Event('p2p-modal-closed'));
              onClose();
            }}
            disabled={mode === 'sender' && !allDelivered && !anyFailed}
            className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-800 rounded-lg transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Overall Progress */}
        <div className="p-6 bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
              Overall Progress
            </span>
            <span className="text-sm font-bold text-gray-900 dark:text-white">
              {totalProgress.toFixed(0)}%
            </span>
          </div>

          <div className="relative w-full h-4 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300 flex items-center justify-end pr-2"
              style={{ width: `${totalProgress}%` }}
            >
              {totalProgress > 10 && (
                <span className="text-xs font-bold text-white drop-shadow-lg">
                  {totalProgress.toFixed(0)}%
                </span>
              )}
            </div>
          </div>

          {/* Status Message */}
          <div className="mt-3 flex items-center gap-2">
            {allDelivered && (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {mode === 'sender' ? 'All files delivered successfully!' : 'All files received successfully!'}
                </span>
              </div>
            )}
            {anyFailed && (
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm font-medium">Some files failed to transfer</span>
              </div>
            )}
            {!allDelivered && !anyFailed && (
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">
                  Transferring {files.filter(f => f.status === 'sending' || f.status === 'transferring' || f.status === 'receiving').length} file(s)...
                </span>
              </div>
            )}
          </div>
        </div>

        {/* File List */}
        <div className="max-h-96 overflow-y-auto">
          {files.map((file, index) => {
            const isDownloaded = downloadedFiles.has(file.name);
            const currentState = fileStates.get(file.messageId || '') || file;

            return (
              <div
                key={index}
                className="p-4 border-b border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition"
              >
                <div className="flex items-start gap-3">
                  {/* File Icon */}
                  <div className="flex-shrink-0 mt-1">
                    {getFileIcon(file.name)}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">
                          {formatFileSize(file.size)}
                        </p>
                      </div>

                      {/* Status Badge */}
                      <div className="flex-shrink-0">
                        {currentState.status === 'delivered' && (
                          <div className="flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">
                            <CheckCircle className="w-3 h-3" />
                            Delivered
                          </div>
                        )}
                        {(currentState.status === 'sending' || currentState.status === 'transferring' || currentState.status === 'receiving') && (
                          <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-xs font-medium">
                            <div className="w-3 h-3 border-2 border-blue-700 border-t-transparent rounded-full animate-spin" />
                            {currentState.progress}%
                          </div>
                        )}
                        {currentState.status === 'pending' && (
                          <div className="px-2 py-1 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 rounded-full text-xs font-medium">
                            Pending
                          </div>
                        )}
                        {currentState.status === 'failed' && (
                          <div className="flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-xs font-medium">
                            <AlertCircle className="w-3 h-3" />
                            Failed
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar with ETA and Speed */}
                    {(currentState.status === 'sending' || currentState.status === 'transferring' || currentState.status === 'receiving' || currentState.status === 'pending' || currentState.status === 'paused') && (
                      <div className="space-y-2">
                        <div className="relative w-full h-2.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`absolute inset-y-0 left-0 transition-all duration-300 ${currentState.status === 'paused' ? 'bg-yellow-500' : 'bg-gradient-to-r from-blue-500 to-purple-500'
                              }`}
                            style={{ width: `${currentState.progress}%` }}
                          />
                        </div>

                        {/* ETA and Speed Info */}
                        <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                          <div className="flex items-center gap-3">
                            {currentState.etaSeconds !== null && currentState.etaSeconds !== undefined && (
                              <span>ETA: {formatETA(currentState.etaSeconds)}</span>
                            )}
                            {currentState.speedBps !== undefined && currentState.speedBps > 0 && (
                              <div className="flex items-center gap-1">
                                <Wifi className="w-3 h-3" />
                                <span>{formatSpeed(currentState.speedBps)}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {formatFileSize((currentState.progress / 100) * file.size)} of {formatFileSize(file.size)}
                            </span>
                            <span className="font-medium bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded text-blue-700 dark:text-blue-300 text-xs text-center min-w-[3rem]">
                              {currentState.progress}%
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Control Buttons */}
                    <div className="flex items-center gap-2 mt-2">
                      {/* Pause/Resume Button */}
                      {(currentState.status === 'sending' || currentState.status === 'transferring' || currentState.status === 'receiving' || currentState.status === 'paused') && (
                        <button
                          onClick={() => currentState.isPaused ? handleResume(file.messageId || '') : handlePause(file.messageId || '')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600"
                        >
                          {currentState.isPaused ? (
                            <>
                              <Play className="w-3.5 h-3.5" />
                              Resume
                            </>
                          ) : (
                            <>
                              <Pause className="w-3.5 h-3.5" />
                              Pause
                            </>
                          )}
                        </button>
                      )}

                      {/* Cancel Button */}
                      {(currentState.status === 'sending' || currentState.status === 'transferring' || currentState.status === 'receiving' || currentState.status === 'pending' || currentState.status === 'paused') && (
                        <button
                          onClick={() => handleCancel(file.messageId || '')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                      )}

                      {/* Download Button (Receiver Only) */}
                      {mode === 'receiver' && currentState.status === 'delivered' && (
                        <button
                          onClick={() => handleDownloadFile(file)}
                          disabled={isDownloaded}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${isDownloaded
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 cursor-not-allowed'
                            : 'bg-blue-500 text-white hover:bg-blue-600'
                            }`}
                        >
                          {isDownloaded ? (
                            <>
                              <CheckCircle className="w-4 h-4" />
                              Downloaded
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4" />
                              Download Securely
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer with Security Info */}
        <div className="p-4 bg-blue-50 dark:bg-slate-800 border-t border-blue-200 dark:border-slate-700">
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 mt-0.5">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            </div>
            <div className="text-xs text-gray-600 dark:text-slate-400">
              <strong className="text-blue-600 dark:text-blue-400">🔒 End-to-End Encrypted:</strong> Files are
              transferred directly between peers using AES-256 encryption. No server has access to your file contents.
            </div>
          </div>
        </div>

        {/* Close Button */}
        {(allDelivered || anyFailed) && (
          <div className="p-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700">
            <button
              onClick={() => {
                window.dispatchEvent(new Event('p2p-modal-closed'));
                onClose();
              }}
              className="w-full py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-lg text-sm font-medium text-gray-700 dark:text-white transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
