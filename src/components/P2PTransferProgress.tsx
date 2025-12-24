import { useState } from 'react';
import { X, Download, CheckCircle, AlertCircle, File, Image } from 'lucide-react';

interface P2PTransferProgressProps {
  isOpen: boolean;
  onClose: () => void;
  files: Array<{
    name: string;
    size: number;
    progress: number;
    status: 'pending' | 'sending' | 'delivered' | 'failed';
  }>;
  mode: 'sender' | 'receiver';
  senderEmail?: string;
  recipientEmail?: string;
}

export default function P2PTransferProgress({
  isOpen,
  onClose,
  files,
  mode,
  senderEmail,
  recipientEmail
}: P2PTransferProgressProps) {
  const [downloadedFiles, setDownloadedFiles] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
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
        detail: { fileName: file.name }
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
            <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
              {mode === 'sender' 
                ? `To: ${recipientEmail}`
                : `From: ${senderEmail}`}
            </p>
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
                  Transferring {files.filter(f => f.status === 'sending').length} file(s)...
                </span>
              </div>
            )}
          </div>
        </div>

        {/* File List */}
        <div className="max-h-96 overflow-y-auto">
          {files.map((file, index) => {
            const isDownloaded = downloadedFiles.has(file.name);
            
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
                        {file.status === 'delivered' && (
                          <div className="flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">
                            <CheckCircle className="w-3 h-3" />
                            Delivered
                          </div>
                        )}
                        {file.status === 'sending' && (
                          <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-xs font-medium">
                            <div className="w-3 h-3 border-2 border-blue-700 border-t-transparent rounded-full animate-spin" />
                            {file.progress}%
                          </div>
                        )}
                        {file.status === 'pending' && (
                          <div className="px-2 py-1 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 rounded-full text-xs font-medium">
                            Pending
                          </div>
                        )}
                        {file.status === 'failed' && (
                          <div className="flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-xs font-medium">
                            <AlertCircle className="w-3 h-3" />
                            Failed
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {(file.status === 'sending' || file.status === 'pending') && (
                      <div className="relative w-full h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 bg-blue-500 transition-all duration-300"
                          style={{ width: `${file.progress}%` }}
                        />
                      </div>
                    )}

                    {/* Download Button (Receiver Only) */}
                    {mode === 'receiver' && file.status === 'delivered' && (
                      <button
                        onClick={() => handleDownloadFile(file)}
                        disabled={isDownloaded}
                        className={`mt-2 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                          isDownloaded
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
             className="w-full ..."
             >
             Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
