import React, { useState, useEffect } from 'react';
import {
  X, Send, Paperclip, Link, Smile, Clock,
  HardDrive, Zap, Trash2, FileText, Image as ImageIcon,
} from 'lucide-react';

import AttachFromDriveModal from '../AttachFromDriveModal';
// import P2PTransferProgress from '../P2PTransferProgress';
import { p2pToast } from '../../utils/p2pToasts';
import { emailService } from '../../lib/emailService';

const AttachmentPreview = ({
  file,
  progress,
  etaSeconds,
  speedBps,
  status,
  onRemove,
  formatSize,
  onContinueInBackground,
  recipientStatus,
  isP2P
}: {
  file: File;
  progress?: number;
  etaSeconds?: number | null;
  speedBps?: number;
  status?: string;
  onRemove: () => void;
  formatSize: (n: number) => string;
  onContinueInBackground: () => void;
  recipientStatus?: 'UNKNOWN' | 'CONNECTING' | 'ONLINE' | 'OFFLINE';
  isP2P?: boolean;
}) => {

  const isImage = file.type.startsWith('image/');
  const [blobUrl, setBlobUrl] = useState<string>("");

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setBlobUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const handlePreview = () => {
    window.open(blobUrl, "_blank", "noopener,noreferrer");
  };

  // Check if P2P transfer is happening
  const isP2PActive = status !== undefined || (progress !== undefined && progress > 0);
  const isComplete = status === 'delivered' || progress === 100;
  const isTransferring = isP2PActive && !isComplete && (status === 'sending' || status === 'pending' || status === 'transferring' || (progress !== undefined && progress > 0 && progress < 100));

  // Determine status text for SENDER
  const getStatusText = () => {
    if (status === 'delivered' || progress === 100) return '✓ Sent via Direct Transfer';
    if (status === 'failed') return '✗ Failed';
    if (status === 'paused') return '⏸ Paused (Auto-resume enabled)';
    if (progress !== undefined && progress > 0) return `${progress}% transferring directly`;
    if (status === 'pending') {
      if (recipientStatus === 'OFFLINE') return 'Queued for Direct Transfer...';
      return 'Starting Direct Transfer...';
    }
    return 'Ready for Direct Transfer';
  };

  const getStatusColor = () => {
    if (status === 'delivered' || progress === 100) return 'text-green-600';
    if (status === 'failed') return 'text-red-600';
    if (status === 'paused') return 'text-yellow-600';
    return 'text-blue-600';
  };

  const formatSpeed = (bps?: number) => {
    if (!bps) return '';
    const kb = bps / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB/s`;
    return `${(kb / 1024).toFixed(1)} MB/s`;
  };

  return (
    <div className={`flex items-center gap-3 border rounded-lg px-3 py-2.5 w-full transition-all ${isComplete
      ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
      : isTransferring
        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
        : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700'
      }`}>

      {/* LEFT: Icon + file info */}
      <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
        {/* ... existing icon logic ... */}
        {isImage ? (
          <img
            src={blobUrl}
            alt={file.name}
            className="w-10 h-10 rounded object-cover border"
          />
        ) : (
          <div className={`w-10 h-10 flex items-center justify-center rounded ${isComplete
            ? 'bg-green-100 dark:bg-green-800/30'
            : isTransferring
              ? 'bg-blue-100 dark:bg-blue-800/30'
              : 'bg-gray-200 dark:bg-slate-700'
            }`}>
            {isTransferring ? (
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <FileText className={`w-5 h-5 ${isComplete ? 'text-green-600' : 'text-gray-500'}`} />
            )}
          </div>
        )}

        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200 max-w-[180px]">
            {file.name}
          </p>
          {isP2P ? (
            <div className="flex flex-col text-[10px]">
              <span className="text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1">
                <Zap className="w-3 h-3" />
                Direct Transfer
              </span>
              <span className={`${recipientStatus === 'ONLINE' ? 'text-green-600 dark:text-green-400' : 'text-gray-500'}`}>
                {recipientStatus === 'ONLINE'
                  ? 'Recipient online · High Speed'
                  : 'Wait for recipient · Auto-Resume'}
              </span>
            </div>
          ) : (
            <p className="text-xs text-gray-400">
              {formatSize(file.size)}
            </p>
          )}
        </div>
      </div>

      {isTransferring && (
        <div className="flex-1 flex flex-col items-center px-2 min-w-[120px]">
          {/* Progress bar */}
          <div className="w-full h-2 bg-gray-200 dark:bg-slate-600 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${progress || 0}%` }}
            />
          </div>

          <div className="flex items-center justify-between w-full mt-1">
            <div className="flex flex-col">
              <span className={`text-xs font-semibold ${getStatusColor()}`}>
                {getStatusText()}
              </span>
              {/* Show transferred amount and total */}
              <span className="text-[10px] text-gray-500">
                {progress !== undefined && formatSize((progress / 100) * file.size)} / {formatSize(file.size)}
                {speedBps ? ` · ${formatSpeed(speedBps)}` : ''}
              </span>
            </div>

            {etaSeconds != null && etaSeconds > 0 && (
              <div className="flex flex-col items-end">
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  ETA: {etaSeconds < 60
                    ? `${etaSeconds}s`
                    : etaSeconds < 3600
                      ? `${Math.floor(etaSeconds / 60)}m ${etaSeconds % 60}s`
                      : `${Math.floor(etaSeconds / 3600)}h ${Math.floor((etaSeconds % 3600) / 60)}m`}
                </span>
              </div>
            )}
          </div>

          <button
            className="mt-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
            onClick={onContinueInBackground}
          >
            Run in background
          </button>
        </div>
      )}

      {/* Status badge for complete/not-transferring */}
      {isComplete && (
        <div className="flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-800/30 rounded-full">
          <span className="text-green-600 font-medium text-xs">✓ Sent Directly</span>
        </div>
      )}

      {/* RIGHT: Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handlePreview();
          }}
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-slate-700"
          title="Preview"
        >
          <ImageIcon className="w-4 h-4" />
        </button>

        {!isComplete && (
          <button
            onClick={onRemove}
            title="Remove"
            className="p-1.5 rounded text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */

export interface ComposeUIProps {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyRef: React.RefObject<HTMLDivElement>;

  setTo: (v: string) => void;
  setCc: (v: string) => void;
  setBcc: (v: string) => void;
  setSubject: (v: string) => void;

  showCc: boolean;
  showBcc: boolean;
  setShowCc: (v: boolean) => void;
  setShowBcc: (v: boolean) => void;

  sending: boolean;
  draftStatus?: 'idle' | 'saving' | 'saved';

  liveRecipientStatus: 'UNKNOWN' | 'CONNECTING' | 'ONLINE' | 'OFFLINE';

  attachments: File[];
  isImageFile?: (f: File) => boolean;
  removeAttachment: (i: number) => void;
  formatFileSize: (n: number) => string;

  onP2PSend: () => void;
  onRegularSend?: () => void;

  onClose: () => void;
  onLocalAttach: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDriveAttach: (files: any[]) => void;

  onInsertEmoji?: (e: string) => void;
  onInsertLink?: (url: string) => void;
  onScheduleSend?: (m: number) => void;
  onBodyInput?: (html: string) => void;
  onBodyKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;

  fileInputRef: React.RefObject<HTMLInputElement>;

  canUseP2P?: boolean | string;
  hasLargeAttachments?: boolean;
  hasSessionKey: (email: string) => boolean;
  normalizeEmailField: (val: string) => string;

  p2pFiles: {
    messageId: string;
    name: string;
    size: number;
    progress: number;
    etaSeconds?: number | null;
    speedBps?: number;
    status: 'pending' | 'receiving' | 'paused' | 'delivered' | 'failed' | 'sending';
  }[];

  showP2PProgress: boolean;
  setShowP2PProgress: (v: boolean) => void;
  recipientEmail: string;
  deliveryMode?: 'P2P' | 'EMAIL';
  fromEmail?: string;
  p2pConnected?: boolean;
  classifications?: { mode: 'P2P' | 'EMAIL'; reason: string }[];
}

/* ------------------------------------------------------------------ */

export default function ComposeUI(props: ComposeUIProps) {
  const {
    to,
    cc,
    bcc,
    subject,
    bodyRef,
    setTo,
    setCc,
    setBcc,
    setSubject,
    showCc,
    showBcc,
    setShowCc,
    setShowBcc,
    sending,
    liveRecipientStatus,
    attachments,
    removeAttachment,
    formatFileSize,
    onP2PSend,
    onClose,
    onLocalAttach,
    onDriveAttach,
    onInsertEmoji,
    onInsertLink,
    onScheduleSend,
    onBodyInput,
    onBodyKeyDown,
    fileInputRef,
    p2pFiles,
    setShowP2PProgress,
    fromEmail,
    deliveryMode // Destructured here to fix lint error
  } = props;

  /* ------------------------------------------------------------------ */
  /* LOCAL UI STATE                                                     */
  /* ------------------------------------------------------------------ */

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showScheduleMenu, setShowScheduleMenu] = useState(false);
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [isThrottled, setIsThrottled] = useState(false);
  const [localP2PFiles, setLocalP2PFiles] = useState(p2pFiles);
  const [pendingIncoming, setPendingIncoming] = useState<{
    messageId: string;
    name: string;
    size: number;
  } | null>(null);

  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSearchField, setActiveSearchField] = useState<'to' | 'cc' | 'bcc' | null>(null);
  const [suggestionPosition, setSuggestionPosition] = useState({ top: 0, left: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);


  useEffect(() => {
    setLocalP2PFiles(p2pFiles);
  }, [p2pFiles]);

  const emojis = ['😊', '😂', '😍', '👍', '🙏', '🎉', '😎', '😢', '🔥', '✨', '💯', '🤔'];

  /* ------------------------------------------------------------------ */
  /* P2P DOWNLOAD EVENT HANDLERS                                        */
  /* ------------------------------------------------------------------ */

  // Listen for SENDER progress (p2p-progress event)
  useEffect(() => {
    const senderHandler = (e: any) => {
      const { messageId, fileName, progress, etaSeconds, speedBps } = e.detail;

      setLocalP2PFiles(prev => {
        // Try to find by messageId first, then by fileName
        const existingIndex = prev.findIndex(f => f.messageId === messageId || f.name === fileName);

        if (existingIndex >= 0) {
          return prev.map((f, i) =>
            i === existingIndex
              ? { ...f, progress, status: progress >= 100 ? 'delivered' : 'sending', etaSeconds, speedBps, messageId }
              : f
          );
        }
        return prev;
      });
    };

    // Listen for receiver progress too
    const receiverHandler = (e: any) => {
      const { messageId, percentage, status, etaSeconds } = e.detail;

      setLocalP2PFiles(prev =>
        prev.map(f =>
          f.messageId === messageId
            ? { ...f, progress: percentage, status: status || 'sending', etaSeconds }
            : f
        )
      );
    };

    window.addEventListener('p2p-progress', senderHandler);
    window.addEventListener('p2p-receiver-progress', receiverHandler);

    return () => {
      window.removeEventListener('p2p-progress', senderHandler);
      window.removeEventListener('p2p-receiver-progress', receiverHandler);
    };
  }, []);

  useEffect(() => {
    // Sender progress handler
    const senderProgress = () => {
      // REMOVED: Progress toasts (too many notifications)
      // Progress is shown in the UI components
    };

    // Sender done handler  
    const senderDone = () => {
      // REMOVED: Toast (shown in ComposeEmail)
    };

    // Receiver handlers
    const receiverProgress = () => {
      // REMOVED: Progress toasts (too many notifications)
    };

    const receiverDone = () => {
      // REMOVED: Toast (shown in other components)
    };

    const failed = (e: any) =>
      p2pToast.failed(e.detail.fileName, e.detail.reason);

    // Sender events
    window.addEventListener('p2p-progress', senderProgress);
    window.addEventListener('p2p-delivered', senderDone);

    // Receiver events
    window.addEventListener('p2p-receiver-progress', receiverProgress);
    window.addEventListener('p2p-file-ready', receiverDone);
    window.addEventListener('p2p-receiver-failed', failed);

    return () => {
      window.removeEventListener('p2p-progress', senderProgress);
      window.removeEventListener('p2p-delivered', senderDone);
      window.removeEventListener('p2p-receiver-progress', receiverProgress);
      window.removeEventListener('p2p-file-ready', receiverDone);
      window.removeEventListener('p2p-receiver-failed', failed);
    };
  }, []);

  useEffect(() => {
    const handler = (e: any) => {
      const { messageId } = e.detail;

      setLocalP2PFiles(prev =>
        prev.map(f =>
          f.messageId === messageId
            ? { ...f, status: 'delivered', progress: 100 }
            : f
        )
      );
    };

    window.addEventListener('p2p-file-ready', handler);
    return () => window.removeEventListener('p2p-file-ready', handler);
  }, []);

  useEffect(() => {
    const handleFileReady = (e: Event) => {
      const { fileName } = (e as CustomEvent).detail;
      console.log('[P2P] File ready for download:', fileName);
      // You can show a toast notification here
    };

    const handleDownloadSuccess = (e: Event) => {
      const { fileName, size } = (e as CustomEvent).detail;
      console.log('[P2P] Download successful:', fileName, size);
      // You can show a success toast here
    };

    const handleDownloadFailed = (e: Event) => {
      const { fileName, error } = (e as CustomEvent).detail;
      console.error('[P2P] Download failed:', fileName, error);
      alert(`Failed to download ${fileName}: ${error}`);
    };

    window.addEventListener('p2p-file-ready', handleFileReady);
    window.addEventListener('p2p-download-success', handleDownloadSuccess);
    window.addEventListener('p2p-download-failed', handleDownloadFailed);

    return () => {
      window.removeEventListener('p2p-file-ready', handleFileReady);
      window.removeEventListener('p2p-download-success', handleDownloadSuccess);
      window.removeEventListener('p2p-download-failed', handleDownloadFailed);
    };
  }, []);

  /* ------------------------------------------------------------------ */
  /* NETWORK THROTTLE DETECTION                                         */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    const conn = (navigator as any).connection;
    if (!conn) return;

    const update = () => {
      setIsThrottled(
        conn.saveData || ['slow-2g', '2g'].includes(conn.effectiveType)
      );
    };

    update();
    conn.addEventListener('change', update);
    return () => conn.removeEventListener('change', update);
  }, []);

  /* ------------------------------------------------------------------ */
  /* HANDLERS                                                           */
  /* ------------------------------------------------------------------ */

  const handleLinkClick = () => {
    const url = prompt("Enter the link URL:", "https://");
    if (url && onInsertLink) {
      onInsertLink(url);
    }
  };

  const handleAutocompleteSearch = async (val: string, field: 'to' | 'cc' | 'bcc') => {
    const parts = val.split(',');
    const currentQuery = parts[parts.length - 1].trim();

    if (currentQuery.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const res = await emailService.searchUsers(currentQuery);
      if (res.data && res.data.length > 0) {
        setSuggestions(res.data);
        setShowSuggestions(true);
        setActiveSearchField(field);
        setSelectedIndex(0);

        // Position logic (approximate)
        const element = document.activeElement as HTMLElement;
        if (element) {
          const rect = element.getBoundingClientRect();
          setSuggestionPosition({ top: rect.bottom + window.scrollY, left: rect.left + window.scrollX });
        }
      } else {
        setShowSuggestions(false);
      }
    } catch (err) {
      console.error("Autocomplete fetch error", err);
    }
  };

  const selectSuggestion = (user: any) => {
    const field = activeSearchField;
    if (!field) return;

    let currentVal = '';
    if (field === 'to') currentVal = to;
    else if (field === 'cc') currentVal = cc;
    else if (field === 'bcc') currentVal = bcc;

    const parts = currentVal.split(',');
    parts[parts.length - 1] = ` ${user.email}`;
    const newVal = parts.join(',').trim();

    if (field === 'to') setTo(newVal);
    else if (field === 'cc') setCc(newVal);
    else if (field === 'bcc') setBcc(newVal);

    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      selectSuggestion(suggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };


  // Emit a single signal when all P2P transfers finish
  useEffect(() => {
    if (
      localP2PFiles.length > 0 &&
      localP2PFiles.every(f => f.status === 'delivered' || f.progress === 100)
    ) {
      window.dispatchEvent(
        new CustomEvent('p2p-all-delivered')
      );
    }
  }, [localP2PFiles]);

  /* ------------------------------------------------------------------ */
  /* DERIVED STATE                                                      */
  /* ------------------------------------------------------------------ */

  const canUseP2P =
    attachments.length > 0 &&
    !!to.trim() &&
    !sending;

  /* ------------------------------------------------------------------ */

  return (
    <div className="fixed inset-0 lg:bottom-4 lg:right-4 lg:inset-auto z-50 w-full lg:w-[520px] max-h-[650px] bg-white dark:bg-slate-900 rounded-none lg:rounded-t-lg lg:rounded-lg shadow-2xl border border-gray-200 dark:border-slate-800 flex flex-col font-sans">

      {/* HEADER */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#F2F6FC] dark:bg-slate-800 rounded-t-lg border-b border-gray-200 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">New Message</h2>
        <button
          onClick={onClose}
          className="text-gray-500 hover:bg-gray-200 dark:hover:bg-slate-700 rounded p-1 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* FORM */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900 flex flex-col">

        {/* FROM */}
        <div className="flex items-center px-4 py-1 border-b border-gray-100 dark:border-slate-800 min-h-[40px] flex-shrink-0">
          <label className="text-sm text-gray-500 w-12 pt-0.5">From:</label>
          <div className="flex-1 flex items-center min-w-0">
            <span className="text-sm text-gray-900 dark:text-gray-100">{fromEmail}</span>
          </div>
        </div>

        {/* TO */}
        <div className="flex items-center px-4 py-1 border-b border-gray-100 dark:border-slate-800 min-h-[40px] flex-shrink-0">
          <label className="text-sm text-gray-500 w-12 pt-0.5">To:</label>
          <div className="flex-1 flex flex-wrap items-center min-w-0 gap-2">
            <input
              type="text"
              className="flex-1 min-w-[120px] bg-transparent outline-none text-gray-900 dark:text-gray-100 text-sm py-1"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                handleAutocompleteSearch(e.target.value, 'to');
              }}
              onKeyDown={handleKeyDown}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            />
            {/* Recipient Status Badge */}
            {to.trim() && liveRecipientStatus !== 'UNKNOWN' && (
              <div className={`
                flex items-center px-2 py-0.5 rounded-full text-xs font-medium mr-2
                ${liveRecipientStatus === 'ONLINE'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : liveRecipientStatus === 'OFFLINE'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-400'}
              `}>
                {liveRecipientStatus === 'ONLINE'
                  ? '🟢 Online'
                  : liveRecipientStatus === 'OFFLINE'
                    ? '🔴 Offline'
                    : 'Checking...'}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 ml-2">
            <button onClick={() => setShowCc(!showCc)} className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-300 hover:underline transition-colors">Cc</button>
            <button onClick={() => setShowBcc(!showBcc)} className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-300 hover:underline transition-colors">Bcc</button>
          </div>
        </div>

        {showCc && (
          <div className="flex items-center px-4 py-1 border-b border-gray-100 dark:border-slate-800 min-h-[40px] flex-shrink-0">
            <label className="text-sm text-gray-500 w-12">Cc</label>
            <input
              className="flex-1 bg-transparent outline-none text-gray-900 dark:text-gray-100 text-sm py-1"
              value={cc}
              onChange={e => {
                setCc(e.target.value);
                handleAutocompleteSearch(e.target.value, 'cc');
              }}
              onKeyDown={handleKeyDown}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            />
          </div>
        )}

        {showBcc && (
          <div className="flex items-center px-4 py-1 border-b border-gray-100 dark:border-slate-800 min-h-[40px] flex-shrink-0">
            <label className="text-sm text-gray-500 w-12">Bcc</label>
            <input
              className="flex-1 bg-transparent outline-none text-gray-900 dark:text-gray-100 text-sm py-1"
              value={bcc}
              onChange={e => {
                setBcc(e.target.value);
                handleAutocompleteSearch(e.target.value, 'bcc');
              }}
              onKeyDown={handleKeyDown}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            />
          </div>
        )}

        {/* SUBJECT */}
        <div className="flex items-center px-4 py-1 border-b border-gray-100 dark:border-slate-800 min-h-[40px] flex-shrink-0">
          <label className="text-sm text-gray-500 w-12 pt-0.5">Sub:</label>
          <input
            className="flex-1 bg-transparent outline-none text-gray-900 dark:text-gray-100 text-sm py-1 placeholder-gray-500"
            placeholder=""
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        {/* TRUST PANEL & DIRECT TRANSFER INDICATOR */}
        {(attachments.some(f => f.size > 5 * 1024 * 1024) || deliveryMode === 'P2P') && (
          <div className="mx-4 mt-2 mb-1 p-2 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-lg flex flex-col gap-1 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                  Direct Transfer Active
                </span>
                <div className="group relative">
                  <div className="w-4 h-4 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center text-[10px] cursor-help">i</div>
                  <div className="absolute left-6 top-0 w-64 p-2 bg-white dark:bg-slate-800 shadow-xl rounded text-xs text-gray-600 dark:text-gray-300 border border-gray-100 hidden group-hover:block z-50">
                    Direct Transfer sends files directly between users, without storing them on a server. This allows faster delivery and larger files.
                  </div>
                </div>
              </div>
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                {attachments.filter(f => f.size > 5 * 1024 * 1024).length > 0 ? 'Large file detected' : 'Optimized for speed'}
              </span>
            </div>

            {/* Trust Flags */}
            <div className="flex items-center gap-4 mt-1 pl-6">
              <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400" title="End-to-end Encrypted">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                Encrypted
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400" title="Resumes automatically if interrupted">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                Auto-Resume
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400" title="Scanned for viruses before download">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                Security Scan
              </div>
            </div>
          </div>
        )}

        {isThrottled && (
          <div className="text-xs bg-yellow-50 text-yellow-700 px-4 py-2 flex items-center gap-2 border-b border-yellow-100 flex-shrink-0">
            <Zap className="w-3 h-3" />
            <span>Low bandwidth mode - Direct Transfer adapts automatically</span>
          </div>
        )}

        {/* BODY */}
        <div className="relative flex-1 min-h-[250px] flex flex-col">
          <div
            ref={bodyRef}
            contentEditable
            onKeyDown={onBodyKeyDown}
            onInput={(e) => onBodyInput?.(e.currentTarget.innerHTML)}
            className="flex-1 w-full p-4 outline-none text-sm text-gray-800 dark:text-gray-200"
            style={{ whiteSpace: 'pre-wrap', overflowY: 'auto' }}
          />
        </div>

        {pendingIncoming && (
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-200 text-sm flex items-center justify-between">
            <div>
              <p className="font-medium">
                Incoming file: {pendingIncoming.name}
              </p>
              <p className="text-xs text-gray-600">
                {formatFileSize(pendingIncoming.size)}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                className="px-3 py-1 text-xs bg-green-600 text-white rounded"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('p2p-accept-file', {
                    detail: { messageId: pendingIncoming.messageId }
                  }));
                  setPendingIncoming(null);
                }}
              >
                Accept
              </button>

              <button
                className="px-3 py-1 text-xs bg-red-500 text-white rounded"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('p2p-reject-file', {
                    detail: { messageId: pendingIncoming.messageId }
                  }));
                  setPendingIncoming(null);
                }}
              >
                Reject
              </button>
            </div>
          </div>
        )}

        {/* ATTACHMENTS */}
        {attachments.length > 0 && (
          <div className="px-4 pb-4 pt-2 space-y-2 flex-shrink-0">

            {attachments.map((f, i) => {
              const p2p = localP2PFiles.find(p => p.name === f.name);
              const cls = props.classifications?.[i];
              const isP2PFile = cls ? cls.mode === 'P2P' : !!canUseP2P;

              return (
                <AttachmentPreview
                  key={i}
                  file={f}
                  progress={p2p?.progress}
                  etaSeconds={p2p?.etaSeconds}
                  speedBps={p2p?.speedBps}
                  status={p2p?.status}
                  formatSize={formatFileSize}
                  onRemove={() => removeAttachment(i)}
                  onContinueInBackground={() => {
                    setShowP2PProgress(true);
                    onClose();
                  }}
                  recipientStatus={liveRecipientStatus}
                  isP2P={isP2PFile}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900 rounded-b-lg border-t border-gray-100 dark:border-slate-800 relative z-40">

        {/* LEFT TOOLS */}
        <div className="flex items-center gap-0 relative">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800 rounded transition-colors"
            title="Attach files"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          <button
            onClick={handleLinkClick}
            className="p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800 rounded transition-colors"
            title="Insert Link"
          >
            <Link className="w-5 h-5" />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={`p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800 rounded transition-colors ${showEmojiPicker ? 'bg-gray-100 dark:bg-slate-800' : ''}`}
              title="Insert Emoji"
            >
              <Smile className="w-5 h-5" />
            </button>
            {/* Emoji Popover */}
            {showEmojiPicker && (
              <div className="absolute bottom-12 left-0 w-64 bg-white dark:bg-slate-800 shadow-xl rounded-lg border border-gray-200 dark:border-slate-700 p-2 grid grid-cols-6 gap-1 z-50">
                {emojis.map(e => (
                  <button
                    key={e}
                    onClick={() => {
                      onInsertEmoji?.(e);
                      setShowEmojiPicker(false);
                    }}
                    className="text-xl p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Drive Button */}
          <button
            onClick={() => setShowDriveModal(true)}
            className="p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800 rounded transition-colors"
            title="Insert from Drive"
          >
            <HardDrive className="w-5 h-5" />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowScheduleMenu(!showScheduleMenu)}
              className={`p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800 rounded transition-colors ${showScheduleMenu ? 'bg-gray-100 dark:bg-slate-800' : ''}`}
              title="Schedule Send"
            >
              <Clock className="w-5 h-5" />
            </button>
            {/* Schedule Popover */}
            {showScheduleMenu && (
              <div className="absolute bottom-12 left-0 w-48 bg-white dark:bg-slate-800 shadow-xl rounded-lg border border-gray-200 dark:border-slate-700 py-1 z-50 flex flex-col">
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-slate-700">Schedule</div>
                {[
                  { label: 'Tomorrow morning', min: 24 * 60 },
                  { label: 'Tomorrow afternoon', min: 30 * 60 },
                  { label: 'Monday morning', min: 72 * 60 }
                ].map(opt => (
                  <button
                    key={opt.label}
                    onClick={() => {
                      onScheduleSend?.(opt.min);
                      setShowScheduleMenu(false);
                    }}
                    className="text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Separator for P2P */}
          <div className="h-6 w-px bg-gray-300 dark:bg-slate-700 mx-1 ml-2"></div>


        </div>

        {/* ACTIONS */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>

          <button
            disabled={sending || !to.trim()}
            onClick={() => {
              // Always try Send (unified handler in ComposeEmail)
              onP2PSend();
            }}
            className="px-6 py-2 rounded-md shadow-sm text-white text-md font-medium bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
          >
            <span>{sending ? 'Sending...' : 'Send'}</span>
            {!sending && <Send className="w-3.5 h-3.5 ml-1" />}
          </button>
        </div>
      </div>

      {/* P2P PROGRESS - Removed as per user request to hide dialog box on sender side */}
      {/* <P2PTransferProgress
        isOpen={showP2PProgress}
        onClose={() => {
          if (p2pFiles.every(f => f.status === 'delivered')) {
            setShowP2PProgress(false);
          }
        }}
        files={p2pFiles.map(f => ({
          name: f.name,
          size: f.size,
          progress: f.progress,
          status: f.status,
          messageId: f.messageId,
          etaSeconds: f.etaSeconds,
          speedBps: (f as any).speedBps,
          isPaused: (f as any).isPaused
        }))}
        mode="sender"
        recipientEmail={recipientEmail}
        recipients={recipientEmail.includes(',') ? recipientEmail.split(',').map(e => e.trim()) : undefined}
      /> */}

      {/* DRIVE MODAL */}
      <AttachFromDriveModal
        isOpen={showDriveModal}
        onClose={() => setShowDriveModal(false)}
        onAttach={(files) => {
          onDriveAttach(files);
          setShowDriveModal(false);
        }}
      />

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={onLocalAttach}
      />
      {/* Autocomplete Suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          className="fixed z-[9999] w-64 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-100 dark:border-slate-700 py-1 overflow-hidden"
          style={{ top: suggestionPosition.top, left: suggestionPosition.left }}
        >
          {suggestions.map((u, i) => (
            <button
              key={u.id || i}
              onClick={() => selectSuggestion(u)}
              className={`w-full text-left px-4 py-2 flex flex-col transition-colors group ${selectedIndex === i ? 'bg-blue-100 dark:bg-blue-900/40' : 'hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}
            >
              <span className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                {u.name}
              </span>
              <span className="text-xs text-gray-500 dark:text-slate-400">
                {u.email}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
