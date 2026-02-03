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
    reason?: string | null;
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
    reason?: string | null;
    startTime?: number;
    totalChunks?: number;
    receivedChunks?: number;
    avgSpeedBps?: number;
  }>>(new Map());
  const safeFiles = Array.isArray(files) ? files : (Object.values(files || {}) as any[]);

  useEffect(() => {
    const newStates = new Map();
    safeFiles.forEach((file: any) => {
      if (file.messageId) {
        newStates.set(file.messageId, {
          progress: file.progress,
          status: file.status,
          etaSeconds: file.etaSeconds,
          speedBps: file.speedBps,
          isPaused: file.isPaused || false,
          reason: file.reason,
          startTime: file.startTime,
          totalChunks: file.totalChunks,
          receivedChunks: file.receivedChunks
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

        // Calculate Avg Speed
        const elapsed = e.detail.startTime ? (Date.now() - e.detail.startTime) / 1000 : 0;
        const avgSpeed = elapsed > 0 ? e.detail.received / elapsed : 0;

        updated.set(messageId, {
          ...current,
          progress,
          etaSeconds,
          speedBps,
          status: progress >= 100 ? 'delivered' : 'sending',
          reason: e.detail.reason,
          startTime: e.detail.startTime,
          totalChunks: e.detail.totalChunks,
          receivedChunks: e.detail.receivedChunks,
          avgSpeedBps: avgSpeed
        });
        return updated;
      });
    };

    const receiverProgressHandler = (e: CustomEvent) => {
      const { messageId, percentage, etaSeconds, speedBps } = e.detail;
      setFileStates(prev => {
        const updated = new Map(prev);
        const current = updated.get(messageId) || { progress: 0, status: 'pending' as const };

        // Calculate Avg Speed
        const elapsed = e.detail.startTime ? (Date.now() - e.detail.startTime) / 1000 : 0;
        const avgSpeed = elapsed > 0 ? e.detail.received / elapsed : 0;

        updated.set(messageId, {
          ...current,
          progress: percentage,
          etaSeconds,
          speedBps,
          status: percentage >= 100 ? 'delivered' : 'receiving',
          reason: e.detail.reason,
          startTime: e.detail.startTime,
          totalChunks: e.detail.totalChunks,
          receivedChunks: e.detail.receivedChunks,
          avgSpeedBps: avgSpeed
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
    if (etaSeconds === null || etaSeconds === undefined || etaSeconds <= 0) return '∞';
    if (etaSeconds < 60) return `${Math.ceil(etaSeconds)}s`;
    const minutes = Math.floor(etaSeconds / 60);
    if (minutes < 60) return `${minutes}m ${Math.ceil(etaSeconds % 60)}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  const formatElapsed = (startTime: number | undefined): string => {
    if (!startTime) return '0s';
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  const handlePause = (messageId: string) => {
    if (mode === 'sender') {
      p2pService.pauseTransfer(messageId);
    } else {
      p2pService.pauseReceive(messageId);
    }

    setFileStates(prev => {
      const updated = new Map(prev);
      const current = updated.get(messageId);
      if (current) {
        updated.set(messageId, { ...current, isPaused: true, status: 'paused' });
      }
      return updated;
    });

    const fileName = safeFiles.find(f => f.messageId === messageId)?.name || 'file';
    p2pToast.paused(fileName);
  };

  const handleResume = (messageId: string) => {
    if (mode === 'sender') {
      p2pService.resumeTransfer(messageId);
    } else {
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

    const fileName = safeFiles.find(f => f.messageId === messageId)?.name || 'file';
    p2pToast.resumed(fileName);
  };

  const handleCancel = (messageId: string) => {
    if (mode === 'sender') {
      p2pService.cancelSenderTransfer?.(messageId);
    } else {
      p2pService.cancelTransfer(messageId);
    }

    setFileStates(prev => {
      const updated = new Map(prev);
      const current = updated.get(messageId);
      if (current) {
        updated.set(messageId, { ...current, status: 'failed' });
      }
      return updated;
    });

    const fileName = safeFiles.find(f => f.messageId === messageId)?.name || 'file';
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

  const totalProgress = safeFiles.length > 0
    ? safeFiles.reduce((sum, f) => sum + f.progress, 0) / safeFiles.length
    : 0;

  const maxETA = safeFiles.reduce((max, f) => {
    const state = fileStates.get(f.messageId || '');
    if (state?.etaSeconds && state.etaSeconds > max) return state.etaSeconds;
    return max;
  }, 0);

  const allDelivered = safeFiles.every(f => f.status === 'delivered');
  const anyFailed = safeFiles.some(f => f.status === 'failed');

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
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
                Overall Progress
              </span>
              {maxETA > 0 && !allDelivered && (
                <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 animate-pulse">
                  ⏱️ {mode === 'sender' ? 'Estimated delivery in' : 'Estimated'} {formatETA(maxETA)} {mode === 'receiver' ? 'remaining' : ''}
                </span>
              )}
            </div>
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
                  {mode === 'sender'
                    ? 'Recipient has received all files! 🎉'
                    : 'All files received successfully!'}
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
                  {mode === 'sender'
                    ? `Recipient is downloading ${safeFiles.filter(f => f.status === 'sending' || f.status === 'transferring' || f.status === 'receiving' || f.status === 'pending').length} file(s)...`
                    : `Transferring ${safeFiles.filter(f => f.status === 'sending' || f.status === 'transferring' || f.status === 'receiving' || f.status === 'pending').length} file(s)...`}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* File List */}
        <div className="max-h-96 overflow-y-auto">
          {safeFiles.map((file, index) => {
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
                            {mode === 'sender' ? 'File Received' : 'Downloaded'}
                          </div>
                        )}
                        {(currentState.status === 'sending' || currentState.status === 'transferring' || currentState.status === 'receiving') && (
                          <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-xs font-medium">
                            <div className="w-3 h-3 border-2 border-blue-700 border-t-transparent rounded-full animate-spin" />
                            {mode === 'sender' ? 'Downloading...' : `${currentState.progress}%`}
                          </div>
                        )}
                        {currentState.status === 'pending' && (
                          <div className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-full text-xs font-medium">
                            {mode === 'sender' ? 'Waiting for Recipient' : 'Waiting for Sender'}
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
                    {(currentState.status === 'sending' || currentState.status === 'transferring' || currentState.status === 'receiving' || currentState.status === 'pending' || currentState.status === 'paused' || currentState.status === 'delivered') && (
                      <div className="space-y-2">
                        <div className="relative w-full h-2.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`absolute inset-y-0 left-0 transition-all duration-300 ${currentState.status === 'paused' ? 'bg-yellow-500' :
                              (currentState.status === 'delivered' || currentState.progress >= 100) ? 'bg-green-500' :
                                'bg-gradient-to-r from-blue-500 to-purple-500'
                              }`}
                            style={{ width: `${currentState.progress}%` }}
                          />
                        </div>

                        {/* Status Reason */}
                        {currentState.reason && (
                          <p className="text-[10px] font-medium text-blue-600 dark:text-blue-400 animate-pulse truncate" title={currentState.reason}>
                            ⚡ {currentState.reason}
                          </p>
                        )}

                        {/* ETA and Speed Info */}
                        <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                          <div className="flex items-center gap-3">
                            {currentState.etaSeconds !== null && currentState.etaSeconds !== undefined && currentState.etaSeconds > 0 && (
                              <span className="font-semibold">{mode === 'sender' ? 'Delivering' : 'ETA'}: {formatETA(currentState.etaSeconds)}</span>
                            )}
                            {currentState.speedBps !== undefined && currentState.speedBps > 0 && (
                              <div className="flex items-center gap-1 font-medium">
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

                    {/* Control Buttons (Receiver Only) */}
                    {mode === 'receiver' && (
                      <div className="flex items-center gap-2 mt-4">
                        {/* Pause/Resume Button */}
                        {(currentState.status === 'sending' || currentState.status === 'transferring' || currentState.status === 'receiving' || currentState.status === 'paused') && (
                          <button
                            onClick={() => currentState.isPaused ? handleResume(file.messageId || '') : handlePause(file.messageId || '')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                          >
                            {currentState.isPaused ? (
                              <>
                                <Play className="w-3.5 h-3.5 fill-current" />
                                Resume
                              </>
                            ) : (
                              <>
                                <Pause className="w-3.5 h-3.5 fill-current" />
                                Pause
                              </>
                            )}
                          </button>
                        )}

                        {/* Cancel Button */}
                        {(currentState.status === 'sending' || currentState.status === 'transferring' || currentState.status === 'receiving' || currentState.status === 'pending' || currentState.status === 'paused') && (
                          <button
                            onClick={() => handleCancel(file.messageId || '')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Cancel
                          </button>
                        )}

                        {/* Download Button (Receiver Only) */}
                        {mode === 'receiver' && (currentState.status === 'delivered' || currentState.progress === 100) && (
                          <button
                            onClick={() => handleDownloadFile(file)}
                            disabled={isDownloaded}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition shadow-sm ${isDownloaded
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 cursor-not-allowed border border-green-200 dark:border-green-900/50'
                              : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 ring-2 ring-blue-500/20'
                              }`}
                          >
                            {isDownloaded ? (
                              <>
                                <CheckCircle className="w-4 h-4" />
                                Saved to Disk
                              </>
                            ) : (
                              <>
                                <Download className="w-4 h-4 animate-bounce" />
                                Finalize & Save
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    )}

                    {/* BitTorrent Style Stats Grid */}
                    <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/50 grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Time Elapsed</p>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{formatElapsed(currentState.startTime)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Remaining</p>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{formatETA(currentState.etaSeconds)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</p>
                        <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                          {currentState.status === 'delivered' ? 'Completed' :
                            currentState.isPaused ? 'Paused' :
                              currentState.status === 'receiving' || currentState.status === 'sending' ? 'Transferring' : 'Ready'}
                          {currentState.status === 'receiving' && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping" />}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {mode === 'sender' ? 'Uploaded' : 'Downloaded'}
                        </p>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {formatFileSize((currentState.progress / 100) * file.size)} <span className="text-[10px] font-medium text-slate-400">/ {formatFileSize(file.size)}</span>
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {mode === 'sender' ? 'Upload Speed' : 'Download Speed'}
                        </p>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-baseline gap-1">
                          {formatSpeed(currentState.speedBps)}
                          {currentState.avgSpeedBps && (
                            <span className="text-[10px] font-medium text-slate-400">(avg {formatSpeed(currentState.avgSpeedBps)})</span>
                          )}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pieces</p>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {currentState.receivedChunks || 0} <span className="text-[10px] font-medium text-slate-400">of {currentState.totalChunks || '?'}</span>
                        </p>
                      </div>
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
