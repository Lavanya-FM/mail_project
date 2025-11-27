import { useState, useEffect, useRef } from 'react';
import { X, Send, Paperclip, Link, Smile, Clock, Share2, Zap, Info } from 'lucide-react';
import { emailService } from '../lib/emailService';
import { authService } from '../lib/authService';
import { p2pService } from '../lib/p2pService';

const getFolderIdByName = (name: string) => {
  const folders = JSON.parse(localStorage.getItem("folders") || "[]");
  const f = folders.find((x: any) => x.name.toLowerCase() === name.toLowerCase());
  return f ? Number(f.id) : null;
};


interface ComposeEmailProps {
  onClose: () => void;
  onSent: () => void;
  onDraftSaved: () => void;
  prefilledData?: {
    to?: string;
    cc?: string;
    subject?: string;
    body?: string;
    threadId?: string;
    isReply?: boolean;
    isForward?: boolean;
  };
}

const normalizeEmailField = (val: any): string => {
  if (!val) return "";
  if (typeof val === "string") return val;

  if (Array.isArray(val))
    return val
      .map(v => typeof v === "string" ? v : (v.email || v.address || ""))
      .filter(Boolean)
      .join(", ");

  if (typeof val === "object")
    return val.email || val.address || "";

  return "";
};

export default function ComposeEmail({ onClose, onSent, onDraftSaved, prefilledData }: ComposeEmailProps) {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [sending, setSending] = useState(false);
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showScheduleMenu, setShowScheduleMenu] = useState(false);
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; url: string; error?: string }>({ open: false, url: '' });
  const [usePeerToPeer, setUsePeerToPeer] = useState(false);
  const [p2pSeeds, setP2pSeeds] = useState(0);
  const [p2pPeers, setP2pPeers] = useState(0);
  const [p2pProgress, setP2pProgress] = useState(0);
  const [showP2pMenu, setShowP2pMenu] = useState(false);
  const [p2pConnected, setP2pConnected] = useState(false);
  
  // Threading state
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  
  const textareaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);

  const emojis = ['😊', '😂', '😍', '👍', '🙏', '🎉', '😎', '😢'];

  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    setProfile(currentUser);
  }, []);

  // Initialize with pre-filled data
  useEffect(() => {
 if (prefilledData) {
   setTo(normalizeEmailField(prefilledData.to));
   setCc(normalizeEmailField(prefilledData.cc));
   setBcc(normalizeEmailField((prefilledData as any).bcc));
 
   setSubject(prefilledData.subject || '');
   setBody(prefilledData.body || '');
      
      // Set threading info
      if (prefilledData.threadId) {
        setThreadId(prefilledData.threadId);
      }
      
      // Show CC field if there's CC data
      if (prefilledData.cc) {
        setShowCc(true);
      }

      // Initialize editor content without making it a controlled component
      if (textareaRef.current) {
        textareaRef.current.innerHTML = prefilledData.body || '';
      }
    }
  }, [prefilledData]);

  // Auto-save draft every 3 seconds
  useEffect(() => {
    if (!to && !subject && !body) return;

    const timer = setTimeout(() => {
      saveDraft();
    }, 3000);

    return () => clearTimeout(timer);
  }, [to, cc, bcc, subject, body]);

  const saveDraft = async () => {
    if (!profile || (!to.trim() && !subject.trim() && !body.trim())) return;

    setDraftStatus('saving');
    try {
      const toList = normalizeEmailField(to);
      const ccList = normalizeEmailField(cc);
      const bccList = normalizeEmailField(bcc);

const toEmails = toList.split(',').map(email => ({
  email: email.trim(),
  name: email.trim()
})).filter(x => x.email);

const ccEmails = ccList.split(',').map(email => ({
  email: email.trim(),
  name: email.trim()
})).filter(x => x.email);

const bccEmails = bccList.split(',').map(email => ({
  email: email.trim(),
  name: email.trim()
})).filter(x => x.email);

      const draftsFolderId = getFolderIdByName("drafts");

      // Get plain text version for preview
      const plainTextBody = (() => {
        const div = document.createElement('div');
        div.innerHTML = body;
        return div.textContent || div.innerText || '';
      })();

      await emailService.createEmail({
        user_id: profile.id,
        from_email: profile.email,
        from_name: profile.full_name || profile.email,
        to_emails: toEmails,
        cc_emails: ccEmails,
        bcc_emails: bccEmails,
        subject: subject || '(no subject)',
        body: plainTextBody,
        is_draft: true,
        folder_id: draftsFolderId,
        thread_id: threadId
      });

      setDraftStatus('saved');
      onDraftSaved();
      
      setTimeout(() => setDraftStatus('idle'), 2000);
    } catch (error) {
      console.error('Error saving draft:', error);
      setDraftStatus('idle');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') {
        e.preventDefault();
        handleBold();
      } else if (e.key === 'i') {
        e.preventDefault();
        handleItalic();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSend();
      }
    }
  };

  const handleBold = () => {
    const editor = textareaRef.current;
    if (!editor) return;

    editor.focus();
    document.execCommand('bold', false);
  };

  const handleItalic = () => {
    const editor = textareaRef.current;
    if (!editor) return;

    editor.focus();
    document.execCommand('italic', false);
  };

  const normalizeUrl = (value: string) => (value.match(/^https?:\/\//i) ? value : `https://${value}`);

  const handleInsertLink = () => {
    const editor = textareaRef.current;
    if (!editor) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      editor.focus();
      return;
    }

    savedSelectionRef.current = selection.getRangeAt(0);
    setLinkDialog({ open: true, url: '', error: undefined });
  };

  const closeLinkDialog = () => {
    savedSelectionRef.current = null;
    setLinkDialog({ open: false, url: '', error: undefined });
  };

  const handleLinkConfirm = () => {
    const editor = textareaRef.current;
    if (!editor) return;

    const trimmedUrl = linkDialog.url.trim();
    if (!trimmedUrl) {
      setLinkDialog(prev => ({ ...prev, error: 'Please enter a valid URL.' }));
      return;
    }

    const finalUrl = normalizeUrl(trimmedUrl);
    editor.focus();

    const selection = window.getSelection();
    selection?.removeAllRanges();
    if (savedSelectionRef.current) {
      selection?.addRange(savedSelectionRef.current);
    }

    const hasSelection = savedSelectionRef.current && !savedSelectionRef.current.collapsed;

    if (hasSelection) {
      document.execCommand('createLink', false, finalUrl);
    } else {
      document.execCommand('insertHTML', false, `<a href="${finalUrl}" target="_blank" rel="noopener noreferrer">${finalUrl}</a>`);
    }

    setBody(editor.innerHTML);
    closeLinkDialog();
  };

  const handleInsertEmoji = () => {
    setShowScheduleMenu(false);
    setShowEmojiPicker((prev) => !prev);
  };

  const insertEmoji = (emoji: string) => {
    const editor = textareaRef.current;
    if (!editor) return;

    editor.focus();
    document.execCommand('insertText', false, emoji);
    setBody(editor.innerHTML);
    setShowEmojiPicker(false);
  };

  const handleScheduleSend = () => {
    setShowEmojiPicker(false);
    setShowScheduleMenu((prev) => !prev);
  };

  const scheduleSendAfter = (minutes: number) => {
    if (!profile || !to.trim()) return;

    const delay = minutes * 60 * 1000;
    alert(`Your email will be sent in ${minutes} minute(s).`);
    setShowScheduleMenu(false);
    setTimeout(() => {
      handleSend();
    }, delay);
  };

  const handleP2pSend = () => {
    setShowEmojiPicker(false);
    setShowScheduleMenu(false);
    setShowP2pMenu((prev) => !prev);
  };

  const initiatePeerToPeer = async () => {
    if (!profile || !to.trim()) return;

    setUsePeerToPeer(true);
    setShowP2pMenu(false);
    
    try {
      // Connect to P2P network if not already connected
      if (!p2pConnected) {
        await p2pService.connect(profile.id, profile.email);
        setP2pConnected(true);
      }

      // Check if recipient is online
const toList = normalizeEmailField(to);
const recipientEmail = toList.split(',')[0]?.trim() || "";
      const isRecipientOnline = p2pService.isPeerOnline(recipientEmail);
      
      if (!isRecipientOnline) {
        alert(`⚠️ Recipient (${recipientEmail}) is not online.\n\nFor P2P mode to work:\n1. Recipient must be logged in\n2. Both systems must be connected to the P2P network\n\nWaiting for recipient to come online...`);
      }

      // Send P2P email with attachments
      await p2pService.sendP2PEmail(
        recipientEmail,
        subject || '(no subject)',
        body,
        attachments,
        (progress) => {
          setP2pProgress(progress);
          setP2pSeeds(Math.floor(1 + Math.random() * 5));
          setP2pPeers(Math.floor(Math.random() * 10));
        }
      );

      setP2pProgress(100);
      handleSend();
      setUsePeerToPeer(false);
    } catch (error) {
      console.error('P2P error:', error);
      alert(`P2P Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setUsePeerToPeer(false);
    }
  };

  const handleSend = async () => {
    if (!profile || !to.trim()) return;

    setSending(true);
    try {
const toList = normalizeEmailField(to);
const ccList = normalizeEmailField(cc);
const bccList = normalizeEmailField(bcc);

const toEmails = toList.split(',').map(email => ({
  email: email.trim(),
  name: email.trim()
})).filter(x => x.email);

const ccEmails = ccList.split(',').map(email => ({
  email: email.trim(),
  name: email.trim()
})).filter(x => x.email);

const bccEmails = bccList.split(',').map(email => ({
  email: email.trim(),
  name: email.trim()
})).filter(x => x.email);

      const sentFolderId = getFolderIdByName("sent");

      // Get plain text version for preview
      const plainTextBody = (() => {
        const div = document.createElement('div');
        div.innerHTML = body;
        return div.textContent || div.innerText || '';
      })();

      await emailService.createEmail({
        user_id: profile.id,
        from_email: profile.email,
        from_name: profile.full_name || profile.email,
        to_emails: toEmails,
        cc_emails: ccEmails,
        bcc_emails: bccEmails,
        subject: subject || '(no subject)',
        body: plainTextBody,
        is_draft: false,
        folder_id: sentFolderId,
        thread_id: threadId
      });

      onSent();
    } catch (error) {
      console.error('Error sending email:', error);
    } finally {
      setSending(false);
    }
  };

  const handleAttachment = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments(prev => [...prev, ...files]);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    const kb = size / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(1)} GB`;
  };

  return (
    <div className="fixed inset-0 lg:inset-auto lg:bottom-4 lg:right-4 z-50 w-full lg:w-[500px] max-h-[600px] bg-white dark:bg-slate-900 rounded-none lg:rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 lg:p-4 border-b border-gray-200 dark:border-slate-700">
        <h2 className="text-base lg:text-lg font-medium text-gray-900 dark:text-white">New Message</h2>
        <div className="flex items-center gap-2">
          {draftStatus === 'saving' && (
            <span className="text-sm text-gray-500 dark:text-slate-400">Saving...</span>
          )}
          {draftStatus === 'saved' && (
            <span className="text-sm text-green-600 dark:text-green-400">Draft saved</span>
          )}
          <button
            onClick={onClose}
            className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto">
        {/* To Field */}
        <div className="flex items-center border-b border-gray-200 dark:border-slate-700 px-3 lg:px-4 py-2 lg:py-3">
          <label className="text-sm text-gray-600 dark:text-slate-400 w-8 lg:w-12 flex-shrink-0">To:</label>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder=""
            className="flex-1 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none text-sm"
          />
          <div className="flex items-center gap-2 ml-2">
            <button 
              onClick={() => setShowCc(!showCc)}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Cc
            </button>
            <button 
              onClick={() => setShowBcc(!showBcc)}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Bcc
            </button>
          </div>
        </div>

        {/* CC Field */}
        {showCc && (
          <div className="flex items-center border-b border-gray-200 dark:border-slate-700 px-3 lg:px-4 py-2 lg:py-3">
            <label className="text-sm text-gray-600 dark:text-slate-400 w-8 lg:w-12 flex-shrink-0">Cc:</label>
            <input
              type="email"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder=""
              className="flex-1 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none text-sm"
            />
          </div>
        )}

        {/* BCC Field */}
        {showBcc && (
          <div className="flex items-center border-b border-gray-200 dark:border-slate-700 px-3 lg:px-4 py-2 lg:py-3">
            <label className="text-sm text-gray-600 dark:text-slate-400 w-8 lg:w-12 flex-shrink-0">Bcc:</label>
            <input
              type="email"
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
              placeholder=""
              className="flex-1 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none text-sm"
            />
          </div>
        )}

        {/* Subject Field */}
        <div className="flex items-center border-b border-gray-200 dark:border-slate-700 px-3 lg:px-4 py-2 lg:py-3">
          <label className="text-sm text-gray-600 dark:text-slate-400 w-8 lg:w-12 flex-shrink-0">Subject:</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder=""
            className="flex-1 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none text-sm"
          />
        </div>

        {/* P2P Status */}
        {usePeerToPeer && (
          <div className="border-b border-gray-200 dark:border-slate-700 p-4 bg-orange-50 dark:bg-orange-900/20">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-medium text-orange-900 dark:text-orange-300">P2P Distribution Active</span>
              </div>
              <span className="text-xs text-orange-700 dark:text-orange-400">{Math.round(p2pProgress)}%</span>
            </div>
            <div className="w-full bg-orange-200 dark:bg-orange-900/50 rounded-full h-2 mb-2">
              <div 
                className="bg-gradient-to-r from-orange-500 to-orange-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${p2pProgress}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-xs text-orange-700 dark:text-orange-400">
              <span>Seeds: {p2pSeeds}</span>
              <span>Peers: {p2pPeers}</span>
            </div>
          </div>
        )}

        {/* Body Field */}
        <div className="flex-1 p-3 lg:p-4">
          <div
            ref={textareaRef}
            contentEditable
            onInput={(e) => setBody(e.currentTarget.innerHTML || '')}
            onKeyDown={handleKeyDown}
            className="w-full h-48 lg:h-64 bg-transparent text-gray-900 dark:text-white focus:outline-none text-sm leading-relaxed"
            style={{ 
              fontSize: '14px',
              lineHeight: '1.6',
              minHeight: '192px'
            }}
          />
        </div>

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="border-t border-gray-200 dark:border-slate-700 p-3 lg:p-4">
            <h4 className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Attachments</h4>
            <div className="space-y-2">
              {attachments.map((file, index) => (
                <div key={index} className="flex items-center justify-between bg-gray-100 dark:bg-slate-800 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <Paperclip className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                    <span className="text-sm text-gray-900 dark:text-white">
                      {file.name}
                      <span className="text-xs text-gray-500 dark:text-slate-400 ml-2">
                        {formatFileSize(file.size)}
                      </span>
                    </span>
                  </div>
                  <button
                    onClick={() => removeAttachment(index)}
                    className="p-1 text-gray-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 rounded transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-3 lg:p-4 border-t border-gray-200 dark:border-slate-700 flex-wrap gap-2">
        <div className="relative flex items-center gap-1 lg:gap-2 order-2 lg:order-1">
          <button
            onClick={handleAttachment}
            className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg transition"
            title="Attach file"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={handleInsertLink}
            className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg transition"
            title="Insert link"
          >
            <Link className="w-4 h-4" />
          </button>
          <button
            onClick={handleInsertEmoji}
            className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg transition"
            title="Insert emoji"
          >
            <Smile className="w-4 h-4" />
          </button>
          <button
            onClick={handleScheduleSend}
            className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg transition"
            title="Schedule send"
          >
            <Clock className="w-4 h-4" />
          </button>
          <button
            onClick={handleP2pSend}
            className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg transition"
            title="Peer-to-Peer send"
          >
            <Share2 className="w-4 h-4" />
          </button>

          {showEmojiPicker && (
            <div className="absolute bottom-12 left-12 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg p-2 flex flex-wrap gap-1 max-w-[200px] z-50">
              {emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="text-lg hover:bg-gray-100 dark:hover:bg-slate-700 rounded px-1"
                  onClick={() => insertEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {showScheduleMenu && (
            <div className="absolute bottom-12 left-32 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg py-2 w-40 z-50 text-sm">
              <button
                type="button"
                className="block w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-700"
                onClick={() => scheduleSendAfter(5)}
              >
                In 5 minutes
              </button>
              <button
                type="button"
                className="block w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-700"
                onClick={() => scheduleSendAfter(30)}
              >
                In 30 minutes
              </button>
              <button
                type="button"
                className="block w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-700"
                onClick={() => scheduleSendAfter(120)}
              >
                In 2 hours
              </button>
            </div>
          )}

          {showP2pMenu && (
            <div className="absolute bottom-12 left-56 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg py-2 w-56 z-50 text-sm">
              <div className="px-3 py-2 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-xs">Peer-to-Peer Distribution</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Send using torrent-like seeding</p>
                </div>
                <div className="relative group">
                  <Info className="w-4 h-4 text-blue-500 cursor-help flex-shrink-0" />
                  <div className="absolute right-0 top-6 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg p-3 w-48 opacity-0 group-hover:opacity-100 transition pointer-events-none group-hover:pointer-events-auto z-10 shadow-lg">
                    <p className="font-semibold mb-2">How P2P Works:</p>
                    <ul className="space-y-1 text-left">
                      <li>✓ Both sender & receiver must be logged in</li>
                      <li>✓ Files transfer directly peer-to-peer</li>
                      <li>✓ No server storage needed</li>
                      <li>✓ Faster for large files</li>
                      <li>✓ Real-time connection required</li>
                    </ul>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-2"
                onClick={initiatePeerToPeer}
                disabled={usePeerToPeer}
              >
                <Zap className={`w-4 h-4 ${usePeerToPeer ? 'text-gray-400' : 'text-orange-500'}`} />
                <span className={usePeerToPeer ? 'text-gray-400' : ''}>
                  {usePeerToPeer ? 'Connecting...' : 'Activate P2P Mode'}
                </span>
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 order-1 lg:order-2 w-full lg:w-auto justify-between">
          <button
            onClick={onClose}
            className="px-3 lg:px-4 py-2 text-gray-600 dark:text-slate-400 hover:text-gray-800 dark:hover:text-white transition text-sm lg:text-base"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !to.trim()}
            className="px-4 lg:px-6 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2 text-sm lg:text-base"
          >
            {sending ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send
              </>
            )}
          </button>
        </div>
      </div>

      {linkDialog.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Insert link</h3>
              <button
                onClick={closeLinkDialog}
                className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">Paste the URL you want to link to.</p>
            <input
              type="text"
              value={linkDialog.url}
              onChange={(e) => setLinkDialog(prev => ({ ...prev, url: e.target.value, error: undefined }))}
              placeholder="https://example.com"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {linkDialog.error && <p className="text-sm text-red-500 mt-2">{linkDialog.error}</p>}
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={closeLinkDialog}
                className="px-4 py-2 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={handleLinkConfirm}
                className="px-5 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition"
              >
                Insert link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
