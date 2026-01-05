// src/components/P2PTransferProgress.tsx
import React from 'react';
import { X, CheckCircle, AlertCircle, Loader, RotateCcw, Pause, Play } from 'lucide-react';
import { p2pService } from '../lib/p2pService';

interface P2PFile {
  name: string;
  size: number;
  progress: number;
  status: 'pending' | 'sending' | 'transferring' | 'receiving' | 'paused' | 'delivered' | 'completed' | 'failed';
  messageId?: string;
  verified?: number;
  failed?: number;
  totalChunks?: number;
  reason?: string;
}

interface P2PTransferProgressProps {
  isOpen: boolean;
  onClose: () => void;
  files: P2PFile[];
  mode?: 'sender' | 'receiver';
  recipientEmail?: string;
}

const P2PTransferProgress: React.FC<P2PTransferProgressProps> = ({
  isOpen,
  onClose,
  files,
  mode = 'sender',
  recipientEmail
}) => {
  if (!isOpen) return null;

useEffect(() => {
  if (mode !== 'receiver') return;

  const handler = (e: any) => {
    const { messageId, percent, status } = e.detail;

    setFiles(prev =>
      prev.map(f =>
        f.messageId === messageId
          ? { ...f, progress: percent, status: status ?? 'receiving' }
          : f
      )
    );
  };

  window.addEventListener('p2p-receiver-progress', handler);
  return () => window.removeEventListener('p2p-receiver-progress', handler);
}, [mode]);

useEffect(() => {
  const handler = (e: any) => {
    const { messageId, verified, failed, total } = e.detail;
    setFiles(prev =>
      prev.map(f =>
        f.messageId === messageId
          ? { ...f, verified, failed, totalChunks: total }
          : f
      )
    );
  };

  window.addEventListener('p2p-receiver-integrity', handler);
  return () =>
    window.removeEventListener('p2p-receiver-integrity', handler);
}, []);

<div className="flex gap-3 text-xs mt-2">
  <span className="text-green-600">✔ {file.verified || 0}</span>
  <span className="text-red-600">✖ {file.failed || 0}</span>
</div>

{file.reason && (
  <span
    title={file.reason}
    className="text-xs text-yellow-600 cursor-help"
  >
    ⓘ {file.reason.replace('_', ' ')}
  </span>
)}

useEffect(() => {
  const handler = (e: any) => {
    const { messageId, reason } = e.detail;

    setFiles(prev =>
      prev.map(f =>
        f.messageId === messageId
          ? { ...f, status: 'paused', reason }
          : f
      )
    );
  };

  window.addEventListener('p2p-receiver-paused', handler);
  return () => window.removeEventListener('p2p-receiver-paused', handler);
}, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered':
      case 'completed':
        return 'text-green-600 dark:text-green-400';
      case 'sending':
      case 'transferring':
      case 'receiving':
        return 'text-blue-600 dark:text-blue-400';
      case 'paused':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'failed':
        return 'text-red-600 dark:text-red-400';
      case 'pending':
        return 'text-gray-600 dark:text-gray-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered':
      case 'completed':
        return <CheckCircle className="w-5 h-5" />;
      case 'sending':
      case 'transferring':
      case 'receiving':
        return <Loader className="w-5 h-5 animate-spin" />;
      case 'paused':
        return <Pause className="w-5 h-5" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5" />;
      default:
        return <Loader className="w-5 h-5" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'delivered':
      case 'completed':
        return 'Delivered';
      case 'sending':
      case 'transferring':
        return 'Transferring';
      case 'receiving':
        return 'Receiving';
      case 'paused':
        return 'Paused';
      case 'failed':
        return 'Failed';
      case 'pending':
        return 'Pending';
      default:
        return 'Unknown';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handlePause = (messageId?: string) => {
    if (messageId) {
      p2pService.pauseTransfer(messageId);
    }
  };

  const handleResume = (messageId?: string) => {
    if (messageId) {
      p2pService.resumeTransfer(messageId);
    }
  };

  const handleRetry = (messageId?: string) => {
    if (messageId) {
      // Retry logic - resume the transfer
      p2pService.resumeTransfer(messageId);
    }
  };

  const allCompleted = files.every(f => f.status === 'delivered' || f.status === 'completed');
  const hasFailures = files.some(f => f.status === 'failed');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 lg:p-6 border-b border-gray-200 dark:border-slate-700">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              P2P Transfer Progress
            </h2>
            {recipientEmail && (
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                {mode === 'sender' ? 'Sending to' : 'Receiving from'}: {recipientEmail}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={!allCompleted}
            className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
            title={allCompleted ? 'Close' : 'Wait for transfers to complete'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Files List */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
          {files.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-slate-400">No active transfers</p>
            </div>
          ) : (
            files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="bg-gray-50 dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700"
              >
                {/* File Info */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0 mr-4">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {file.name}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                  
                  {/* Status Badge */}
                  <div className={`flex items-center gap-2 ${getStatusColor(file.status)}`}>
                    {getStatusIcon(file.status)}
                    <span className="text-sm font-medium">
                      {getStatusText(file.status)}
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                {file.status !== 'delivered' && file.status !== 'completed' && (
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-600 dark:text-slate-400 mb-2">
                      <span>{file.progress || 0}%</span>
                      {file.status === 'transferring' || file.status === 'sending' ? (
                        <span className="text-blue-600 dark:text-blue-400">
                          Transferring...
                        </span>
                      ) : file.status === 'paused' ? (
                        <span className="text-yellow-600 dark:text-yellow-400">
                          Transfer paused
                        </span>
                      ) : file.status === 'failed' ? (
                        <span className="text-red-600 dark:text-red-400">
                          Transfer failed
                        </span>
                      ) : null}
                    </div>
                    
                    <div className="w-full h-2.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          file.status === 'failed'
                            ? 'bg-red-500'
                            : file.status === 'paused'
                            ? 'bg-yellow-500'
                            : 'bg-blue-500'
                        }`}
                        style={{ width: `${file.progress || 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Success Message */}
                {(file.status === 'delivered' || file.status === 'completed') && (
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg">
                    <CheckCircle className="w-4 h-4" />
                    <span>Transfer completed successfully</span>
                  </div>
                )}

                {/* Action Buttons */}
                {file.status !== 'delivered' && file.status !== 'completed' && (
                  <div className="flex gap-2 mt-3">
                    {file.status === 'paused' && (
                      <button
                        onClick={() => handleResume(file.messageId)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition"
                      >
                        <Play className="w-4 h-4" />
                        Resume
                      </button>
                    )}

                    {(file.status === 'transferring' || file.status === 'sending') && (
                      <button
                        onClick={() => handlePause(file.messageId)}
                        className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 transition"
                      >
                        <Pause className="w-4 h-4" />
                        Pause
                      </button>
                    )}

                    {file.status === 'failed' && (
                      <button
                        onClick={() => handleRetry(file.messageId)}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Retry
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer Summary */}
        <div className="border-t border-gray-200 dark:border-slate-700 p-4 lg:p-6">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="text-gray-600 dark:text-slate-400">
                {files.filter(f => f.status === 'delivered' || f.status === 'completed').length} of {files.length} files completed
              </span>
            </div>
            
            {allCompleted && (
              <button
                onClick={onClose}
                className="px-5 py-2 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition"
              >
                Done
              </button>
            )}
            
            {hasFailures && !allCompleted && (
              <button
                onClick={() => {
                  files.forEach(f => {
                    if (f.status === 'failed' && f.messageId) {
                      handleRetry(f.messageId);
                    }
                  });
                }}
                className="px-5 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition"
              >
                Retry All Failed
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default P2PTransferProgress;
