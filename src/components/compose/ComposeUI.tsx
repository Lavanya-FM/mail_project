import React, { useState, useEffect } from 'react';
import {
  X,
  Send,
  Paperclip,
  Link,
  Smile,
  Clock,
  Share2,
  HardDrive,
  Zap,
  Trash2,
  FileText,
  ArrowDown,
  Image as ImageIcon,
} from 'lucide-react';

import AttachFromDriveModal from '../AttachFromDriveModal';
import P2PTransferProgress from '../P2PTransferProgress';

const AttachmentPreview = ({
  file,
  onRemove,
  formatSize
}: {
  file: File;
  onRemove: () => void;
  formatSize: (n: number) => string;
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

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded px-3 py-2 w-full max-w-md">

      {/* LEFT: Icon + file info */}
      <div className="flex items-center gap-3 min-w-0">
        {isImage ? (
          <img
            src={blobUrl}
            alt={file.name}
            className="w-10 h-10 rounded object-cover border"
          />
        ) : (
          <div className="w-10 h-10 flex items-center justify-center bg-gray-200 dark:bg-slate-700 rounded">
            <FileText className="w-5 h-5 text-gray-500" />
          </div>
        )}

        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
            {file.name}
          </p>
          <p className="text-xs text-gray-400">
            {formatSize(file.size)}
          </p>
        </div>
      </div>

      {/* RIGHT: Gmail-style actions */}
      <div className="flex items-center gap-1">

        <button
          onClick={handlePreview}
          title="Preview"
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-slate-700"
        >
          <ImageIcon className="w-4 h-4" />
        </button>

        <button
          onClick={handleDownload}
          title="Download"
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-slate-700"
        >
          <ArrowDown className="w-4 h-4" />
        </button>

        <button
          onClick={onRemove}
          title="Remove"
          className="p-1.5 rounded text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30"
        >
          <X className="w-4 h-4" />
        </button>

      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* PROPS                                                              */
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

  liveRecipientStatus: 'online' | 'offline' | 'unknown';
  deliveryMode: 'EMAIL' | 'P2P';

  attachments: File[];
  isImageFile?: (f: File) => boolean;
  removeAttachment: (i: number) => void;
  formatFileSize: (n: number) => string;

  onRegularSend: () => void;
  onP2PSend: () => void;

  onClose: () => void;
  onLocalAttach: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDriveAttach: (files: any[]) => void;

  onInsertEmoji?: (e: string) => void;
  onInsertLink?: (url: string) => void;
  onScheduleSend?: (m: number) => void;
  onBodyInput?: (html: string) => void;
  onBodyKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;

  fileInputRef: React.RefObject<HTMLInputElement>;

  p2pConnected: boolean;
  canUseP2P?: boolean | string; // Widen type to handle boolean/string from parent logic
  hasLargeAttachments?: boolean;
  hasSessionKey: (email: string) => boolean;
  normalizeEmailField: (val: string) => string;

  p2pFiles: {
    name: string;
    size: number;
    progress: number;
    status: 'pending' | 'sending' | 'delivered' | 'failed';
  }[];

  showP2PProgress: boolean;
  setShowP2PProgress: (v: boolean) => void;
  recipientEmail: string;
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
    deliveryMode,
    attachments,
    removeAttachment,
    formatFileSize,
    onRegularSend,
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
    p2pConnected,
    hasSessionKey,
    normalizeEmailField,
    p2pFiles,
    showP2PProgress,
    setShowP2PProgress,
    recipientEmail,
  } = props;

  /* ------------------------------------------------------------------ */
  /* LOCAL UI STATE                                                     */
  /* ------------------------------------------------------------------ */

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showScheduleMenu, setShowScheduleMenu] = useState(false);
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [isThrottled, setIsThrottled] = useState(false);

  const emojis = ['😊', '😂', '😍', '👍', '🙏', '🎉', '😎', '😢', '🔥', '✨', '💯', '🤔'];

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

  /* ------------------------------------------------------------------ */
  /* DERIVED STATE                                                      */
  /* ------------------------------------------------------------------ */

  const primaryRecipient =
    normalizeEmailField(to).split(',')[0]?.trim();

  const canUseP2P =
    attachments.length > 0 &&
    liveRecipientStatus === 'online' &&
    p2pConnected &&
    hasSessionKey(primaryRecipient) &&
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

        {/* TO */}
        <div className="flex items-center px-4 py-1 border-b border-gray-100 dark:border-slate-800 min-h-[40px] flex-shrink-0">
          <label className="text-sm text-gray-500 w-12 pt-0.5">To:</label>
          <div className="flex-1 flex flex-wrap items-center min-w-0 gap-2">
            <input
              type="text"
              className="flex-1 min-w-[120px] bg-transparent outline-none text-gray-900 dark:text-gray-100 text-sm py-1"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            {/* Recipient Status Badge */}
            {to.trim() && liveRecipientStatus !== 'unknown' && (
              <div className={`
                flex items-center px-2 py-0.5 rounded-full text-xs font-medium mr-2
                ${liveRecipientStatus === 'online'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}
              `}>
                {liveRecipientStatus === 'online' ? 'Online' : 'Offline'}
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
            <input className="flex-1 bg-transparent outline-none text-gray-900 dark:text-gray-100 text-sm py-1" value={cc} onChange={e => setCc(e.target.value)} />
          </div>
        )}

        {showBcc && (
          <div className="flex items-center px-4 py-1 border-b border-gray-100 dark:border-slate-800 min-h-[40px] flex-shrink-0">
            <label className="text-sm text-gray-500 w-12">Bcc</label>
            <input className="flex-1 bg-transparent outline-none text-gray-900 dark:text-gray-100 text-sm py-1" value={bcc} onChange={e => setBcc(e.target.value)} />
          </div>
        )}

        {/* SUBJECT */}
        <div className="flex items-center px-4 py-1 border-b border-gray-100 dark:border-slate-800 min-h-[40px] flex-shrink-0">
          <input
            className="w-full bg-transparent outline-none text-gray-900 dark:text-gray-100 text-sm py-1 placeholder-gray-500"
            placeholder="Sub:"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        {isThrottled && (
          <div className="text-xs bg-yellow-50 text-yellow-700 px-4 py-2 flex items-center gap-2 border-b border-yellow-100 flex-shrink-0">
            <Zap className="w-3 h-3" />
            <span>Low bandwidth mode</span>
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

        {/* ATTACHMENTS */}
        {attachments.length > 0 && (
          <div className="px-4 pb-4 pt-2 space-y-2 flex-shrink-0">
            {attachments.map((f, i) => (
              <AttachmentPreview
                key={i}
                file={f}
                onRemove={() => removeAttachment(i)}
                formatSize={formatFileSize}
              />
            ))}
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

          {/* P2P Toggle */}
          <button
            disabled={!canUseP2P}
            onClick={onP2PSend}
            className={`ml-1 p-2 rounded transition-colors ${canUseP2P
              ? 'text-green-600 hover:bg-green-50 dark:text-green-500 dark:hover:bg-slate-800'
              : 'text-gray-400 cursor-not-allowed opacity-50'
              }`}
            title="P2P Transfer"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>

        {/* ACTIONS */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>

          {canUseP2P && (
            <button
              disabled={sending}
              onClick={onP2PSend}
              className="px-4 py-2 rounded-md shadow-sm text-white text-md font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              <span>Via P2P</span>
              {!sending && <Share2 className="w-3.5 h-3.5 ml-1" />}
            </button>
          )}

          <button
            disabled={sending || !to.trim()}
            onClick={onRegularSend}
            className="px-6 py-2 rounded-md shadow-sm text-white text-md font-medium bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
          >
            <span>{sending ? 'Sending...' : 'Send'}</span>
            {!sending && <Send className="w-3.5 h-3.5 ml-1" />}
          </button>
        </div>
      </div>

      {/* P2P PROGRESS */}
      <P2PTransferProgress
        isOpen={showP2PProgress}
        onClose={() => {
          if (p2pFiles.every(f => f.status === 'delivered')) {
            setShowP2PProgress(false);
          }
        }}
        files={p2pFiles}
        mode="sender"
        recipientEmail={recipientEmail}
      />

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
    </div>
  );
}
