import { useState, useEffect, useRef } from 'react';
import { X, Send, Paperclip, Link, Smile, Clock, Share2, Zap, Info, HardDrive, Upload } from 'lucide-react';
import { emailService } from '../lib/emailService';
import { authService } from '../lib/authService';
import { p2pService } from '../lib/p2pService';
import { DriveFile } from '../lib/driveService';
import AttachFromDriveModal from './AttachFromDriveModal';
import { normalizeEmailBody } from '../utils/email';

const getFolderIdByName = (name: string) => {
  const folders = JSON.parse(localStorage.getItem("folders") || "[]");
  const f = folders.find((x: any) => x.name.toLowerCase() === name.toLowerCase());
  return f ? Number(f.id) : null;
};

interface ComposeEmailProps {
  onClose: () => void;
  onSent: () => void;
  onDraftSaved: () => void;
  prefilledData?: any;
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

export default function ComposeEmail({
  onClose,
  onSent,
  onDraftSaved,
  prefilledData
}: ComposeEmailProps) {

  // -------------------- STATE --------------------
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

  // UI state
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showScheduleMenu, setShowScheduleMenu] = useState(false);
  const [linkDialog, setLinkDialog] = useState<{ open: boolean; url: string; error?: string }>({ open: false, url: '' });
  const [usePeerToPeer, setUsePeerToPeer] = useState(false);
  const [p2pSeeds, setP2pSeeds] = useState(0);
  const [p2pPeers, setP2pPeers] = useState(0);
  const [p2pProgress, setP2pProgress] = useState(0);
  const [showP2pMenu, setShowP2pMenu] = useState(false);
  const [p2pConnected, setP2pConnected] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showDriveModal, setShowDriveModal] = useState(false);
// ===========================
// ATTACHMENT HELPERS
// ===========================
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const [uploadProgress, setUploadProgress] = useState<number>(0);

const isImageFile = (file: File) => {
  return /^image\/(png|jpe?g|gif|webp)$/i.test(file.type);
};

async function fileToBase64WithProgress(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onprogress = (evt) => {
      if (evt.lengthComputable) {
        setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    };

    reader.onloadend = () => {
      setUploadProgress(0);
      resolve(reader.result!.toString().replace(/^data:.+;base64,/, ""));
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const [threadId, setThreadId] = useState<string | null>(null);
// -------------------- THREAD HANDLING (Gmail rules) --------------------
useEffect(() => {
  if (prefilledData?.threadId) {
    setThreadId(prefilledData.threadId);
  }
}, [prefilledData]);

  const textareaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);

  const emojis = ['😊', '😂', '😍', '👍', '🙏', '🎉', '😎', '😢'];

  // -------------------- LOAD USER --------------------
  useEffect(() => {
    setProfile(authService.getCurrentUser());
  }, []);

  // -------------------- PREFILL --------------------
  useEffect(() => {
    if (!prefilledData) return;

    setTo(normalizeEmailField(prefilledData.to));
    setCc(normalizeEmailField(prefilledData.cc));
    setBcc(normalizeEmailField(prefilledData.bcc));
    setSubject(prefilledData.subject || "");

    // normalize prefilled body to prevent stray '0' or weird values
    const normalizedPrefillBody = normalizeEmailBody(prefilledData.body) || "";
    setBody(normalizedPrefillBody);

    //if (prefilledData.threadId) setThreadId(prefilledData.threadId);
    if (prefilledData.cc) setShowCc(true);

    if (textareaRef.current) textareaRef.current.innerHTML = normalizedPrefillBody;
  }, [prefilledData]);

async function prepareAttachments() {
  const out: any[] = [];

  console.log("📎 Preparing attachments. Total files:", attachments.length);

  // Iterate over each file in the attachments array
  for (const file of attachments) {
    console.log("Processing file:", file.name, "Size:", file.size, "Type:", file.type);
    
    // If the file exceeds the max allowed size, alert the user and skip
    if (file.size > MAX_ATTACHMENT_BYTES) {
      alert(
        `Attachment "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max allowed is 25MB.`
      );
      continue;
    }

    try {
      // Convert the file to base64 format
      const base64 = await fileToBase64WithProgress(file);

      // Determine MIME type - important for images
      const mimeType = file.type || "application/octet-stream";
      const isImage = isImageFile(file);

      // Add the processed file to the output array
      const attachment = {
        filename: file.name,
        content: base64,
        encoding: "base64",
        size: file.size,
        mime_type: mimeType,
        is_image: isImage,
      };

      console.log("✓ Added attachment:", attachment.filename, "Is Image:", isImage, "MIME:", mimeType);
      out.push(attachment);
    } catch (error) {
      console.error("Error processing file:", file.name, error);
      alert(`Failed to process file: ${file.name}`);
    }
  }

  console.log("📦 Final attachments array:", out.length, "files");
  return out;
}

  // -------------------- AUTO SAVE DRAFT --------------------
  useEffect(() => {
    if (!to && !subject && !body) return;

    const t = setTimeout(() => saveDraft(), 3000);
    return () => clearTimeout(t);
  }, [to, cc, bcc, subject, body]);

const saveDraft = async () => {
  if (!profile) return;
  if (!to.trim() && !subject.trim() && !body.trim()) return;

  setDraftStatus("saving");

  const draftsFolderId = getFolderIdByName("drafts");

  try {
    // Prepare attachments before saving the draft
    const finalAttachments = await prepareAttachments(); // Ensure attachments are prepared here

    await emailService.createEmail({
      user_id: profile.id,
      from_email: profile.email,
      from_name: profile.full_name || profile.email,

      to_emails: to.split(",").map(e => ({ email: e.trim() })).filter(e => e.email),
      cc_emails: cc.split(",").map(e => ({ email: e.trim() })).filter(e => e.email),
      bcc_emails: bcc.split(",").map(e => ({ email: e.trim() })).filter(e => e.email),

      subject: subject || "(no subject)",
      body: normalizeEmailBody(textareaRef.current?.innerHTML || body) || "",

      is_draft: true,
      folder_id: draftsFolderId,
      thread_id: threadId,

      attachments: finalAttachments, // Include attachments here
    });

    setDraftStatus("saved");
    onDraftSaved();
    setTimeout(() => setDraftStatus("idle"), 2000);
  } catch (error) {
    console.error("Draft error:", error);
    setDraftStatus("idle");
  }
};

  // -------------------- FORMATTING --------------------
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

    // normalize and set body state
    setBody(normalizeEmailBody(editor.innerHTML));
    closeLinkDialog();
  };

  const handleInsertEmoji = () => {
    setShowScheduleMenu(false);
    setShowP2pMenu(false);
    setShowEmojiPicker((prev) => !prev);
  };

  const insertEmoji = (emoji: string) => {
    const editor = textareaRef.current;
    if (!editor) return;

    editor.focus();
    document.execCommand('insertText', false, emoji);
    setBody(normalizeEmailBody(editor.innerHTML));
    setShowEmojiPicker(false);
  };

  const handleScheduleSend = () => {
    setShowEmojiPicker(false);
    setShowP2pMenu(false);
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
      if (!p2pConnected) {
        await p2pService.connect(profile.id, profile.email);
        setP2pConnected(true);
      }

      const toList = normalizeEmailField(to);
      const recipientEmail = toList.split(',')[0]?.trim() || "";
      const isRecipientOnline = p2pService.isPeerOnline(recipientEmail);

      if (!isRecipientOnline) {
        alert(`⚠️ Recipient (${recipientEmail}) is not online.\n\nFor P2P mode to work:\n1. Recipient must be logged in\n2. Both systems must be connected to the P2P network\n\nWaiting for recipient to come online...`);
      }

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

  // -------------------- ATTACHMENTS --------------------
  const handleAttachment = () => {
    setShowAttachMenu(!showAttachMenu);
  };

  const handleLocalAttach = () => {
    fileInputRef.current?.click();
    setShowAttachMenu(false);
  };

  const handleDriveAttach = (files: DriveFile[]) => {
    const newAttachments = files.map(file => {
      const mockFile = new File([""], file.name, { type: file.mime_type || 'application/octet-stream' });
      Object.defineProperty(mockFile, 'size', { value: file.size_bytes });
      return mockFile;
    });
    setAttachments(prev => [...prev, ...newAttachments]);
    setShowDriveModal(false);
    setShowAttachMenu(false);
  };

const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = Array.from(e.target.files || []);
  const validFiles = files.filter((f) => {
    if (f.size > MAX_ATTACHMENT_BYTES) {
      alert(
        `File "${f.name}" is too large (${(f.size / 1024 / 1024).toFixed(
          1
        )} MB). Max allowed is 25MB.`
      );
      return false;
    }
    return true;
  });

  // Update the attachments state to include valid files
  setAttachments((prev) => [...prev, ...validFiles]);
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

  // -------------------- SEND EMAIL --------------------
const handleSend = async () => {
  if (!profile || !to.trim()) return;

  setSending(true);

  const sentFolderId = getFolderIdByName("sent");
  
  try {
    // Prepare attachments dynamically
    const finalAttachments = await prepareAttachments();
    
    console.log("🚀 Sending email with attachments:", finalAttachments.length);

    const emailPayload = {
      user_id: profile.id,
      from_email: profile.email,
      from_name: profile.full_name || profile.email,
      to_emails: to.split(",").map(e => ({ email: e.trim() })).filter(e => e.email),
      cc_emails: cc.split(",").map(e => ({ email: e.trim() })).filter(e => e.email),
      bcc_emails: bcc.split(",").map(e => ({ email: e.trim() })).filter(e => e.email),
      subject: subject || "(no subject)",
      body: normalizeEmailBody(textareaRef.current?.innerHTML || body) || "",
      is_draft: false,
      folder_id: sentFolderId,
      thread_id: threadId,
      attachments: finalAttachments,
    };

    console.log("📧 Email payload with", emailPayload.attachments.length, "attachments");

    await emailService.createEmail(emailPayload);

    onSent?.();
  } catch (err) {
    console.error("SEND ERROR:", err);
    alert("Failed to send email. Please try again.");
  } finally {
    setSending(false);
  }
};

  // -------------------- UI --------------------
  return (
    <div className="fixed inset-0 lg:inset-auto lg:bottom-4 lg:right-4 z-50 w-full lg:w-[500px] max-h-[600px] bg-white dark:bg-slate-900 rounded-none lg:rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 flex flex-col">

      {/* HEADER */}
      <div className="flex items-center justify-between p-3 lg:p-4 border-b border-gray-200 dark:border-slate-700">
        <h2 className="text-base lg:text-lg font-medium text-gray-900 dark:text-white">New Message</h2>

        <div className="flex items-center gap-2">
          {draftStatus === "saving" && <span className="text-sm text-gray-500 dark:text-slate-400">Saving...</span>}
          {draftStatus === "saved" && <span className="text-sm text-green-600 dark:text-green-400">Draft saved</span>}

          <button 
            onClick={onClose} 
            className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* FORM */}
      <div className="flex-1 overflow-y-auto">

        {/* TO */}
        <div className="flex items-center border-b border-gray-200 dark:border-slate-700 px-3 lg:px-4 py-2 lg:py-3">
          <label className="text-sm text-gray-600 dark:text-slate-400 w-8 lg:w-12 flex-shrink-0">To:</label>
          <input
            type="email"
            className="flex-1 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none text-sm"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <div className="flex items-center gap-2 ml-2">
            <button onClick={() => setShowCc(!showCc)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
              Cc
            </button>
            <button onClick={() => setShowBcc(!showBcc)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
              Bcc
            </button>
          </div>
        </div>

        {/* CC */}
        {showCc && (
          <div className="flex items-center border-b border-gray-200 dark:border-slate-700 px-3 lg:px-4 py-2 lg:py-3">
            <label className="text-sm text-gray-600 dark:text-slate-400 w-8 lg:w-12 flex-shrink-0">Cc:</label>
            <input
              type="email"
              className="flex-1 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none text-sm"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
            />
          </div>
        )}

        {/* BCC */}
        {showBcc && (
          <div className="flex items-center border-b border-gray-200 dark:border-slate-700 px-3 lg:px-4 py-2 lg:py-3">
            <label className="text-sm text-gray-600 dark:text-slate-400 w-8 lg:w-12 flex-shrink-0">Bcc:</label>
            <input
              type="email"
              className="flex-1 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none text-sm"
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
            />
          </div>
        )}

        {/* SUBJECT */}
        <div className="flex items-center border-b border-gray-200 dark:border-slate-700 px-3 lg:px-4 py-2 lg:py-3">
          <label className="text-sm text-gray-600 dark:text-slate-400 w-8 lg:w-12 flex-shrink-0">Sub:</label>
          <input
            type="text"
            className="flex-1 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none text-sm"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        {/* P2P STATUS */}
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

        {/* BODY */}
        <div className="flex-1 p-3 lg:p-4">
          <div
            ref={textareaRef}
            contentEditable
            onInput={(e) => setBody(e.currentTarget.innerHTML ? normalizeEmailBody(e.currentTarget.innerHTML) : '')}
            onKeyDown={handleKeyDown}
            className="w-full h-48 lg:h-64 bg-transparent text-gray-900 dark:text-white focus:outline-none text-sm leading-relaxed"
            style={{
              fontSize: '14px',
              lineHeight: '1.6',
              minHeight: '192px'
            }}
          />
{/* DRAG & DROP ATTACHMENTS */}
<div
  onDragOver={(e) => {
    e.preventDefault();
    e.currentTarget.classList.add("bg-blue-50", "dark:bg-blue-900/20");
  }}
  onDragLeave={(e) => {
    e.preventDefault();
    e.currentTarget.classList.remove("bg-blue-50", "dark:bg-blue-900/20");
  }}
  onDrop={(e) => {
    e.preventDefault();
    e.currentTarget.classList.remove("bg-blue-50", "dark:bg-blue-900/20");
    const dropped = Array.from(e.dataTransfer.files || []);
    setAttachments((prev) => [...prev, ...dropped]);
  }}
  className="border border-dashed border-gray-300 dark:border-slate-600 rounded-lg p-4 mb-3 text-center text-sm text-gray-600 dark:text-slate-400 cursor-pointer"
>
  Drag & Drop files here (up to 25MB each)
</div>

        </div>

</div>

{/* ATTACHMENTS */}
{attachments.length > 0 && (
  <div className="border-t border-gray-200 dark:border-slate-700 p-3 lg:p-4">
    <h4 className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
      Attachments
    </h4>

    {attachments.map((file, index) => {
      const isImg = isImageFile(file);  // Dynamically check for images

      return (
        <div key={index} className="flex items-start justify-between bg-gray-100 dark:bg-slate-800 rounded-lg p-3 border border-gray-200 dark:border-slate-700">
          <div className="flex items-start gap-3 w-full">
            {/* Show image preview if file is an image */}
            {isImg ? (
              <img
                src={URL.createObjectURL(file)}  // Create a URL for image preview
                className="w-20 h-20 object-cover rounded border border-gray-300 dark:border-slate-600"
                alt={file.name}
              />
            ) : (
              <span className="text-sm">{file.name}</span>
            )}
          </div>
          <button onClick={() => removeAttachment(index)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      );
    })}
  </div>
)}

      {/* FOOTER */}
      <div className="flex items-center justify-between p-3 lg:p-4 border-t border-gray-200 dark:border-slate-700 flex-wrap gap-2">
        <div className="relative flex items-center gap-1 lg:gap-2 order-2 lg:order-1">
          {/* ATTACH */}
          <div className="relative">
            <button
              onClick={handleAttachment}
              className={`p-2 rounded-lg transition ${showAttachMenu
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-800'
                }`}
              title="Attach file"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {showAttachMenu && (
              <div className="absolute bottom-full left-0 mb-2 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 overflow-hidden z-50">
                <button
                  onClick={handleLocalAttach}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition text-left"
                >
                  <Upload className="w-4 h-4" />
                  Local System
                </button>
                <button
                  onClick={() => {
                    setShowDriveModal(true);
                    setShowAttachMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition text-left"
                >
                  <HardDrive className="w-4 h-4" />
                  JeeDrive
                </button>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* LINK */}
          <button
            onClick={handleInsertLink}
            className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg transition"
            title="Insert link"
          >
            <Link className="w-4 h-4" />
          </button>

          {/* EMOJI */}
          <button
            onClick={handleInsertEmoji}
            className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg transition"
            title="Insert emoji"
          >
            <Smile className="w-4 h-4" />
          </button>

          {/* SCHEDULE */}
          <button
            onClick={handleScheduleSend}
            className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg transition"
            title="Schedule send"
          >
            <Clock className="w-4 h-4" />
          </button>

          {/* P2P */}
          <button
            onClick={handleP2pSend}
            className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg transition"
            title="Peer-to-Peer send"
          >
            <Share2 className="w-4 h-4" />
          </button>

          {/* EMOJI PICKER */}
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

          {/* SCHEDULE MENU */}
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

          {/* P2P MENU */}
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

        {/* ACTION BUTTONS */}
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

      {/* LINK DIALOG */}
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

      {/* DRIVE MODAL */}
      <AttachFromDriveModal
        isOpen={showDriveModal}
        onClose={() => setShowDriveModal(false)}
        onAttach={handleDriveAttach}
      />
    </div>
  );
}
