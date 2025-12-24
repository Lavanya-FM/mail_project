import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Send,
  Paperclip,
  Link,
  Smile,
  Clock,
  Share2,
  Upload,
  HardDrive,
  Zap,
} from 'lucide-react';

import AttachFromDriveModal from '../AttachFromDriveModal';
import P2PTransferProgress from '../P2PTransferProgress';

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

  liveRecipientStatus: 'online' | 'offline' | 'unknown';
  deliveryMode: 'EMAIL' | 'P2P';

  attachments: File[];
  isImageFile: (f: File) => boolean;
  removeAttachment: (i: number) => void;
  formatFileSize: (n: number) => string;

  onRegularSend: () => void;
  onP2PSend: () => void;

  onClose: () => void;
  onLocalAttach: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDriveAttach: (files: any[]) => void;

  onInsertEmoji: (e: string) => void;
  onScheduleSend: (m: number) => void;
  onBodyKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;

  fileInputRef: React.RefObject<HTMLInputElement>;

  p2pConnected: boolean;
  hasLargeAttachments: boolean;
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
    isImageFile,
    removeAttachment,
    formatFileSize,
    onRegularSend,
    onP2PSend,
    onClose,
    onLocalAttach,
    onDriveAttach,
    onInsertEmoji,
    onScheduleSend,
    onBodyKeyDown,
    fileInputRef,
    p2pConnected,
    hasLargeAttachments,
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

  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showScheduleMenu, setShowScheduleMenu] = useState(false);
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [isThrottled, setIsThrottled] = useState(false);

  const emojis = ['😊', '😂', '😍', '👍', '🙏', '🎉', '😎', '😢'];

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
    <div className="fixed inset-0 lg:bottom-4 lg:right-4 lg:inset-auto z-50 w-full lg:w-[520px] max-h-[650px] bg-white dark:bg-slate-900 rounded-none lg:rounded-xl shadow-2xl border flex flex-col">

      {/* HEADER */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold">New Message</h2>
        <button onClick={onClose}>
          <X />
        </button>
      </div>

      {/* FORM */}
      <div className="flex-1 overflow-y-auto">

        {/* TO */}
        <div className="flex items-center border-b px-4 py-2 gap-2">
          <label className="w-12 text-sm">To:</label>
          <input
            type="email"
            className="flex-1 bg-transparent outline-none"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />

          {to.trim() && (
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                liveRecipientStatus === 'online'
                  ? 'bg-green-100 text-green-700'
                  : liveRecipientStatus === 'offline'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {liveRecipientStatus}
            </span>
          )}

          <button onClick={() => setShowCc(!showCc)} className="text-xs">Cc</button>
          <button onClick={() => setShowBcc(!showBcc)} className="text-xs">Bcc</button>
        </div>

        {showCc && (
          <input className="w-full px-4 py-2 border-b" value={cc} onChange={e => setCc(e.target.value)} />
        )}

        {showBcc && (
          <input className="w-full px-4 py-2 border-b" value={bcc} onChange={e => setBcc(e.target.value)} />
        )}

        {isThrottled && (
          <div className="text-xs text-yellow-600 px-4 py-1">
            Transfer throttled due to network / battery conditions
          </div>
        )}

        {/* SUBJECT */}
        <input
          className="w-full px-4 py-2 border-b"
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />

        {/* BODY */}
        <div
          ref={bodyRef}
          contentEditable
          onKeyDown={onBodyKeyDown}
          className="p-4 min-h-[200px] outline-none"
        />

        {/* ATTACHMENTS */}
        {attachments.length > 0 && (
          <div className="border-t p-3 space-y-2">
            {attachments.map((f, i) => (
              <div key={i} className="flex items-center gap-3 bg-gray-100 rounded p-2">
                <span className="flex-1 truncate">{f.name}</span>
                <span className="text-xs">{formatFileSize(f.size)}</span>
                <span className="text-xs text-gray-500">
                  {deliveryMode === 'P2P' ? 'P2P' : 'Email'}
                </span>
                <button onClick={() => removeAttachment(i)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="flex items-center justify-between p-4 border-t">

        {/* LEFT */}
        <div className="flex items-center gap-2">
          <button onClick={() => fileInputRef.current?.click()}>
            <Paperclip />
          </button>
          <button onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
            <Smile />
          </button>
          <button onClick={() => setShowScheduleMenu(!showScheduleMenu)}>
            <Clock />
          </button>
        </div>

        {/* ACTIONS */}
        <div className="flex gap-2">
          <button
            disabled={sending || !to.trim()}
            onClick={onRegularSend}
            className="px-5 py-2 bg-blue-500 text-white rounded disabled:opacity-50 flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            Send
          </button>

          {attachments.length > 0 && (
            <button
              disabled={!canUseP2P}
              onClick={onP2PSend}
              className={`px-5 py-2 rounded flex items-center gap-2 ${
                canUseP2P
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              <Share2 className="w-4 h-4" />
              Send via P2P
            </button>
          )}
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
