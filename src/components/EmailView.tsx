// src/components/EmailView.tsx
import { Star, Reply, ReplyAll, Forward, Trash2, Archive, MoreVertical, Paperclip, X, Flag, Tag, Check, FileText, Download, Eye, Lock, CheckCircle, Smile, HardDrive, Image as ImageIcon, Phone } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { emailService } from '../lib/emailService';
import { authService } from '../lib/authService';
import { Email } from '../types/email';
import { normalizeEmailBody } from '../utils/email';
import { collapseForwarded } from '../lib/collapseForwarded';
import { p2pService } from '../lib/p2pService';
import { callService } from '../lib/callService';
import toast from 'react-hot-toast';


type EmailViewProps = {
  email: Email | null;
  onClose: () => void;
  onRefresh: () => void;
  onCompose?: (data: {
    to?: string;
    cc?: string;
    subject?: string;
    body?: string;
    isReply?: boolean;
    isReplyAll?: boolean;
    isForward?: boolean;
    isDraft?: boolean;
    threadId?: string;
    originalSender?: string;
    originalCc?: string;
  }) => void;
  labels?: { id: number; name: string; color: string }[];
};

interface ConfirmDialogState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  processing: boolean;
  error?: string;
  onConfirm?: () => Promise<void> | void;
}

export default function EmailView({ email, onClose, onRefresh, onCompose: _onCompose, labels = [] }: EmailViewProps) {
  console.log("EMAIL JSON >>>", email);

  const [starred, setStarred] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showQuoted, setShowQuoted] = useState(false);
  const currentUser = authService.getCurrentUser();
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);


  const myEmail = currentUser.email.toLowerCase();
  const senderEmail = (email?.from_email || '').toLowerCase();
  const isSender = myEmail === senderEmail;
  const isReceiver = !isSender;

  const autoResizeReply = () => {
    const el = replyTextareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 240) + 'px';
  };

  const initialConfirmState: ConfirmDialogState = {
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    processing: false,
    error: undefined,
    onConfirm: undefined,
  };

  const [inlineReplyMode, setInlineReplyMode] = useState<
    null | "reply" | "replyAll" | "forward"
  >(null);

  const [replyBody, setReplyBody] = useState("");
  const [p2pProgressMap, setP2pProgressMap] = useState<
    Record<string, {
      percentage: number;
      etaSeconds?: number | null;
      received?: number;
      total?: number;
      speedBps?: number;
    }>
  >({});

  // Track video blob URLs for inline playback
  const [videoBlobUrls, setVideoBlobUrls] = useState<Record<string, string>>({});

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(initialConfirmState);
  const [showLabelDropdown, setShowLabelDropdown] = useState(false);
  const labelDropdownRef = useRef<HTMLDivElement>(null);

  // Reply editor state
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [showReplyEmojiPicker, setShowReplyEmojiPicker] = useState(false);

  const emojis = ['😀', '😂', '😊', '❤️', '👍', '👎', '🎉', '🔥', '✨', '💯', '🙏', '👏'];

  const handleReplyAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setReplyAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
    }
    e.target.value = '';
  };

  const insertReplyEmoji = (emoji: string) => {
    setReplyBody(prev => prev + emoji);
    setShowReplyEmojiPicker(false);
    replyTextareaRef.current?.focus();
  };

  const insertReplyLink = () => {
    const url = prompt('Enter URL:');
    if (url) {
      setReplyBody(prev => prev + ` ${url} `);
      replyTextareaRef.current?.focus();
    }
  };

  // -----------------------
  // Sanitizer: remove lines that are empty or only zeros
  // -----------------------
  const sanitizeBody = (text?: string) => {
    if (!text) return "";
    // normalize CRLF -> LF
    const normalized = text.replace(/\r/g, "");
    // Split into lines, replace non-breaking spaces, trim, and remove lines that are empty or only zeros
    const lines = normalized.split("\n").map(l => l.replace(/\u00A0/g, " ").trim());
    const filtered = lines.filter(line => {
      if (!line) return false;
      // If line is only zeros like "0", "000", or whitespace+zeros -> remove
      if (/^0+$/.test(line)) return false;
      return true;
    });
    return filtered.join("\n");
  };

  // -----------------------
  // Strip HTML tags and render safe plain text
  // -----------------------
  // Convert HTML block tags to newline markers robustly
  const htmlToNewlines = (s: string) => {
    if (!s) return s;

    // Normalize CRLF -> LF
    s = s.replace(/\r\n?/g, "\n");

    // Convert <br> to newline
    s = s.replace(/<br\s*\/?>/gi, "\n");

    // Insert newline before/after block tags so adjacent text is separated.
    const blockTags = ['div', 'p', 'li', 'blockquote', 'tr', 'table', 'thead', 'tbody', 'tfoot', 'section', 'article', 'header', 'footer', 'aside', 'figure', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    for (const tag of blockTags) {
      const openRegex = new RegExp(`<${tag}[^>]*>`, 'gi');
      const closeRegex = new RegExp(`</${tag}>`, 'gi');
      s = s.replace(openRegex, '\n');   // opening -> newline
      s = s.replace(closeRegex, '\n');  // closing -> newline
    }

    return s;
  };

  const stripHtmlTags = (s: string) => {
    if (!s) return s;
    // remove comments and any remaining tags
    s = s.replace(/<!--[\s\S]*?-->/g, '');
    s = s.replace(/<\/?[^>]+(>|$)/g, '');
    return s;
  };

  const bodyToHtml = (text?: string) => {
    if (!text) return '';

    // 1) Basic sanitizer — keep this but if you previously removed empty lines change that
    let cleaned = sanitizeBody(text); // your function; consider not removing intentional blank lines

    // 2) Convert HTML to newlines (opening & closing handled)
    cleaned = htmlToNewlines(cleaned);

    // 3) Strip tags
    cleaned = stripHtmlTags(cleaned);

    // 4) Collapse multiple newlines into a single newline
    //    If you prefer to preserve paragraph spacing (i.e., turn 2+ newlines into exactly 2)
    //    replace '\n' with '\n\n' in the replacement below.
    cleaned = cleaned.replace(/\n{2,}/g, '\n');

    // 5) Trim leading/trailing whitespace/newlines so no extra blank line at top/bottom
    cleaned = cleaned.replace(/^\s+|\s+$/g, '');

    // 6) Escape HTML entities and convert newline -> <br> for rendering
    const escaped = cleaned
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return escaped.replace(/\n/g, '<br>');
  };
  useEffect(() => {
    setShowQuoted(false);
  }, [email?.id]);

  // Clean up video blob URLs when component unmounts or email changes
  useEffect(() => {
    return () => {
      Object.values(videoBlobUrls).forEach(url => URL.revokeObjectURL(url));
    };
  }, [email?.id, videoBlobUrls]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [email?.id, inlineReplyMode]);

  useEffect(() => {
    const handler = (e: any) => {
      const { messageId, from, fileName, size } = e.detail;

      alert(
        `${from} is sending you a file via P2P:\n${fileName} (${(size / 1024 / 1024).toFixed(1)} MB)`
      );

      // Optional: auto-accept
      window.dispatchEvent(
        new CustomEvent('p2p-accept-file', {
          detail: { messageId }
        })
      );
    };

    window.addEventListener('p2p-incoming-file', handler);
    return () => window.removeEventListener('p2p-incoming-file', handler);
  }, []);



  useEffect(() => {
    if (!email?.attachments) return;

    email.attachments.forEach(async (a: any) => {
      if (a.delivery_mode === 'P2P' && a.p2p_message_id) {
        console.log('[EmailView] Checking P2P file:', a.filename, 'messageId:', a.p2p_message_id);

        // First check if file is already complete
        const hasFile = await p2pService.hasReceivedFile(a.p2p_message_id);
        if (hasFile) {
          console.log('[EmailView] File already received:', a.filename);
          // Emit progress event to update UI
          window.dispatchEvent(new CustomEvent('p2p-receiver-progress', {
            detail: {
              messageId: a.p2p_message_id,
              received: 100,
              total: 100,
              percentage: 100,
              status: 'complete'
            }
          }));

          // Load video blob if it's a video file
          const isVideo = typeof a.mime_type === 'string' && a.mime_type.startsWith('video/');
          if (isVideo) {
            try {
              const blob = await p2pService.getReceivedBlob(a.p2p_message_id);
              if (blob) {
                const url = URL.createObjectURL(blob);
                setVideoBlobUrls(prev => ({ ...prev, [a.p2p_message_id]: url }));
              }
            } catch (err) {
              console.error('[EmailView] Failed to load video blob on email open:', err);
            }
          }
          return;
        }

        // File not complete, try to resume
        // ✅ FIX: Pass sender email from email's from_email field
        const senderEmail = email?.from_email ? email.from_email.toLowerCase() : undefined;
        console.log('[EmailView] Resuming P2P receive for', a.filename, 'sender:', senderEmail);
        p2pService.resumeReceive(a.p2p_message_id, senderEmail);

        // Also check if sender is online and request chunks if needed
        const storedSender = localStorage.getItem(`p2p-sender-${a.p2p_message_id}`) || senderEmail;
        if (storedSender && p2pService.isPeerOnline(storedSender)) {
          console.log('[EmailView] Sender is online, requesting missing chunks');
          p2pService.resumeReceive(a.p2p_message_id, storedSender);
        } else if (storedSender) {
          console.log('[EmailView] Sender is offline:', storedSender);
        }
      }
    });
  }, [email?.id]);

  // Listen for receiver-side P2P progress
  useEffect(() => {
    if (!isReceiver) return;

    const handler = (e: any) => {
      const { messageId, percentage, etaSeconds, received, total, speedBps } = e.detail;

      setP2pProgressMap((prev: any) => ({
        ...prev,
        [messageId]: { percentage, etaSeconds, received, total, speedBps }
      }));
    };

    window.addEventListener('p2p-receiver-progress', handler);
    return () => window.removeEventListener('p2p-receiver-progress', handler);
  }, [isReceiver]);

  // Listen for file-ready (complete) events to force 100% on receiver and load video blobs
  useEffect(() => {
    if (!isReceiver) return;

    const completeHandler = async (e: any) => {
      const { messageId, fileName } = e.detail;
      setP2pProgressMap((prev: any) => ({
        ...prev,
        [messageId]: { ...(prev?.[messageId] || {}), percentage: 100 }
      }));

      // Load video blob for inline playback
      if (fileName && (fileName.endsWith('.mp4') || fileName.endsWith('.webm') || fileName.endsWith('.mov'))) {
        try {
          const blob = await p2pService.getReceivedBlob(messageId);
          if (blob) {
            const url = URL.createObjectURL(blob);
            setVideoBlobUrls(prev => ({ ...prev, [messageId]: url }));
          }
        } catch (err) {
          console.error('[EmailView] Failed to load video blob:', err);
        }
      }
    };

    window.addEventListener('p2p-file-ready', completeHandler);
    return () => window.removeEventListener('p2p-file-ready', completeHandler);
  }, [isReceiver]);

  useEffect(() => {
    if (!isSender) return;

    const handler = (e: any) => {
      setDeliveredP2P(prev => {
        const next = new Set(prev);
        next.add(e.detail.messageId);
        return next;
      });
      onRefresh?.();
    };

    window.addEventListener('p2p-delivered', handler);
    return () => window.removeEventListener('p2p-delivered', handler);
  }, [isSender]);


  useEffect(() => {
    if (email) {
      setStarred(Boolean(email.is_starred));
      if (!email.is_read) {
        markAsRead(String(email.id));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  useEffect(() => {
    if (!email?.attachments) return;

    email.attachments.forEach((a: any) => {
      if (a.p2p_message_id) {
        console.log('[UI] Auto resume receive:', a.p2p_message_id);
        p2pService.resumeReceive(a.p2p_message_id);
      }
    });
  }, [email?.id]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowActions(false);
      }
      if (labelDropdownRef.current && !labelDropdownRef.current.contains(event.target as Node)) {
        setShowLabelDropdown(false);
      }
    };

    if (showActions || showLabelDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showActions, showLabelDropdown]);

  const openConfirmDialog = (opts: Partial<ConfirmDialogState>) => {
    setConfirmDialog(() => ({ ...initialConfirmState, ...opts, open: true }));
  };

  const closeConfirmDialog = () => setConfirmDialog(initialConfirmState);

  const executeConfirmAction = async () => {
    if (!confirmDialog.onConfirm) return;
    try {
      setConfirmDialog(prev => ({ ...prev, processing: true }));
      await confirmDialog.onConfirm();
      setConfirmDialog(initialConfirmState);
    } catch (err: any) {
      setConfirmDialog(prev => ({ ...prev, processing: false, error: err?.message || String(err) }));
    }
  };

  const handleDelete = async () => {
    if (!email || !currentUser) return;

    try {
      const { data: folders } = await emailService.getFolders(currentUser.id);

      // Find Trash folder
      const trashFolder = folders?.find(
        (f: any) => (f.name || '').toString().toLowerCase() === "trash" || f.system_box === "trash"
      );

      // Check if email is already in Trash
      const isInTrash = trashFolder && (
        email.folder_id === trashFolder.id ||
        String(email.folder_id) === String(trashFolder.id)
      );

      if (isInTrash) {
        // Email is in Trash - ask for permanent deletion
        openConfirmDialog({
          title: "Permanently delete this email?",
          message: "This email will be permanently deleted and cannot be recovered.",
          confirmLabel: "Delete Forever",
          cancelLabel: "Cancel",

          onConfirm: async () => {
            try {
              const { error } = await emailService.deleteEmail(
                Number(email.id),
                currentUser.id
              );

              if (error) throw error;

              toast.success("Email permanently deleted");
              onClose?.(); // Close the tab
              onRefresh?.();
            } catch (err) {
              console.error("Permanent delete error:", err);
              toast.error("Failed to delete email permanently.");
            }
          }
        });
      } else {
        // Email is not in Trash - move to Trash
        if (!trashFolder) {
          toast.error("Trash folder not found. Please create a Trash folder.");
          return;
        }

        openConfirmDialog({
          title: "Delete this email?",
          message: "This email will be moved to Trash.",
          confirmLabel: "Move to Trash",
          cancelLabel: "Cancel",

          onConfirm: async () => {
            try {
              const { error } = await emailService.moveEmail(
                Number(email.id),
                currentUser.id,
                Number(trashFolder.id)
              );

              if (error) throw error;

              toast.success("Email moved to Trash");
              onClose?.(); // Close the tab
              onRefresh?.();
            } catch (err) {
              console.error("Delete error:", err);
              toast.error("Failed to move email to Trash.");
            }
          }
        });
      }
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Failed to delete email.");
    }
  };

  const buildReferencesHeader = (email: any) => {
    const refs: string[] = [];

    if (email.references_header) {
      refs.push(
        ...email.references_header.split(/\s+/).filter(Boolean)
      );
    }

    if (email.message_id && !refs.includes(email.message_id)) {
      refs.push(email.message_id);
    }

    return refs.join(" ");
  };


  const markAsRead = async (emailId: string) => {
    try {
      await emailService.updateEmail(emailId, { user_id: currentUser.id, is_read: true });
      onRefresh?.();
    } catch (error) {
      console.error('Error marking email as read:', error);
    }
  };

  const toggleStar = async () => {
    if (!email) return;
    try {
      await emailService.updateEmail(email.id, { user_id: currentUser.id, is_starred: !starred });
      setStarred(!starred);
      onRefresh?.();
    } catch (error) {
      console.error('Error toggling star:', error);
    }
  };

  const attachments = Array.isArray(email?.attachments)
    ? email.attachments.map(a => ({
      id: a.id,
      filename: a.filename,
      mime_type: a.mime_type,
      size: a.size_bytes ?? 0,
      delivery_mode: a.delivery_mode,
      p2p_message_id: a.p2p_message_id,
      p2p_completed: a.p2p_completed
    }))
    : [];

  const [deliveredP2P, setDeliveredP2P] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handler = (e: any) => {
      setDeliveredP2P(prev => {
        const next = new Set(prev);
        next.add(e.detail.messageId);
        return next;
      });
    };

    window.addEventListener('p2p-delivered', handler);
    return () => window.removeEventListener('p2p-delivered', handler);
  }, []);


  const openInlineReply = (mode: "reply" | "replyAll" | "forward") => {
    if (!email) return;
    setInlineReplyMode(mode);
    setReplyAttachments([]);
    setShowReplyEmojiPicker(false);

    if (mode === 'forward') {
      // For forward, include original message content
      const originalContent = `

---------- Forwarded message ---------
From: ${email.from_name || email.from_email} <${email.from_email}>
Date: ${email.created_at ? new Date(email.created_at).toLocaleString() : ''}
Subject: ${email.subject || '(No subject)'}
To: ${email.to_emails?.join(', ') || ''}

${sanitizeBody(email.body) || ''}
`;
      setReplyBody(originalContent);
      setForwardTo(''); // Reset forward recipient
    } else {
      setReplyBody(""); // reply starts clean
    }
  };

  // State for forward recipient
  const [forwardTo, setForwardTo] = useState('');

  // Check if there are multiple recipients (for Reply All)
  const hasMultipleRecipients = (() => {
    if (!email) return false;
    const allRecipients = [
      ...(email.to_emails || []),
      ...(email.cc_emails || [])
    ].filter(e => e && e !== currentUser?.email);
    return allRecipients.length > 0;
  })();

  const handleArchive = async () => {
    if (!email || !currentUser) return;
    try {
      const { data: folders, error } = await emailService.getFolders(currentUser.id);
      if (error) throw error;

      const archiveFolder = folders?.find((f: any) => (f.name || '').toString().toLowerCase() === 'archive');

      if (!archiveFolder) {
        const systemFolder = folders?.find((f: any) => f.system_box === 'archive' || f.system_box === 'all');
        if (systemFolder) {
          const { error: moveError } = await emailService.moveEmail(
            Number(email.id),
            currentUser.id,
            Number(systemFolder.id)
          );
          if (moveError) throw moveError;
        } else {
          alert('Archive folder not found. Please create an Archive folder first.');
          return;
        }
      } else {
        const { error: moveError } = await emailService.moveEmail(
          Number(email.id),
          currentUser.id,
          Number(archiveFolder.id)
        );
        if (moveError) throw moveError;
      }

      onRefresh?.();
      onClose?.();
    } catch (error) {
      console.error('Error archiving email:', error);
      alert('Failed to archive email. Please try again.');
    }
  };

  const handleSpam = () => {
    if (!email || !currentUser) return;
    openConfirmDialog({
      title: 'Report spam?',
      message: 'This email will be moved to your Spam folder.',
      confirmLabel: 'Move to Spam',
      cancelLabel: 'Cancel',
      onConfirm: async () => {
        try {
          const { data: folders, error } = await emailService.getFolders(currentUser.id);
          if (error) throw error;

          const spamFolder = folders?.find((f: any) => (f.name || '').toString().toLowerCase() === 'spam');

          if (!spamFolder) {
            const systemFolder = folders?.find((f: any) => f.system_box === 'spam' || f.system_box === 'junk');
            if (systemFolder) {
              const { error: moveError } = await emailService.moveEmail(
                Number(email.id),
                currentUser.id,
                Number(systemFolder.id)
              );
              if (moveError) throw moveError;
            } else {
              alert('Spam folder not found. Please create a Spam folder first.');
              return;
            }
          } else {
            const { error: moveError } = await emailService.moveEmail(
              Number(email.id),
              currentUser.id,
              Number(spamFolder.id)
            );
            if (moveError) throw moveError;
          }

          onRefresh?.();
          onClose?.();
        } catch (error) {
          console.error('Error moving to spam:', error);
          alert('Failed to move email to Spam. Please try again.');
        }
      }
    });
  };

  const buildQuotedHtml = (email: any) => `
<br><br>
<div style="border-left:2px solid #dadce0;padding-left:8px;color:#5f6368">
On ${formatFullDate(email.sent_at || email.created_at)},
<b>${email.from_name || email.from_email}</b> wrote:<br>
${normalizeEmailBody(email.body ?? email.text_preview ?? '')}
</div>
`.trim();

  const sendInlineReply = async () => {
    if (!email) return;

    const me = currentUser.email;
    let toEmails: any[] = [];
    let emailSubject = '';
    let emailBody = '';

    // Handle different modes
    if (inlineReplyMode === 'forward') {
      // Forward mode - use forwardTo email
      if (!forwardTo.trim()) {
        toast.error('Please enter a recipient email address');
        return;
      }
      toEmails = [forwardTo.trim()];
      emailSubject = email.subject?.startsWith("Fwd:")
        ? email.subject
        : `Fwd: ${email.subject || ""}`;
      emailBody = replyBody;
    } else if (inlineReplyMode === "replyAll") {
      // Reply All - include all recipients
      toEmails = Array.from(
        new Set([
          email.from_email,
          ...(email.to_emails || []),
          ...(email.cc_emails || [])
        ])
      ).filter(e => e && e !== me);
      emailSubject = email.subject?.startsWith("Re:")
        ? email.subject
        : `Re: ${email.subject || ""}`;
      emailBody = replyBody + buildQuotedHtml(email);
    } else {
      // Regular reply
      if (!replyBody.trim()) {
        toast.error('Please enter a message');
        return;
      }
      if (email.from_email !== me) {
        toEmails = [email.from_email || ''];
      } else {
        toEmails = (email.to_emails || []).filter(e => e !== me);
      }
      emailSubject = email.subject?.startsWith("Re:")
        ? email.subject
        : `Re: ${email.subject || ""}`;
      emailBody = replyBody + buildQuotedHtml(email);
    }

    // Validate recipients
    if (toEmails.length === 0) {
      toast.error("No valid recipient");
      return;
    }



    await emailService.createEmail({
      user_id: currentUser.id,

      from_email: currentUser.email,
      from_name: currentUser.name || currentUser.email,

      to_emails: toEmails
        .map(e => typeof e === "string" ? e : e?.email)
        .filter(Boolean),

      cc_emails: [],

      subject: emailSubject,

      body: emailBody,

      in_reply_to: inlineReplyMode === 'forward' ? undefined : (email.message_id || email.id),
      references: inlineReplyMode === 'forward' ? undefined : buildReferencesHeader(email),
      thread_id: inlineReplyMode === 'forward' ? undefined : (email.thread_id ?? email.id),

      is_draft: false,
    });

    // Show success message
    if (inlineReplyMode === 'forward') {
      toast.success(`Email forwarded to ${forwardTo}`);
    } else {
      toast.success('Reply sent');
    }

    // Reset all states
    setInlineReplyMode(null);
    setReplyBody("");
    setForwardTo("");
    setReplyAttachments([]);
    setShowReplyEmojiPicker(false);
    onRefresh?.();
  };



  const handleToggleLabel = async (label: { id: number; name: string; color: string }) => {
    if (!email || !currentUser) return;

    const currentLabels = email.labels || [];
    const hasLabel = currentLabels.some((l: any) => l.name === label.name);

    let newLabels;
    if (hasLabel) {
      newLabels = currentLabels.filter((l: any) => l.name !== label.name);
    } else {
      newLabels = [...currentLabels, label];
    }

    try {
      await emailService.updateEmail(email.id, { user_id: currentUser.id, labels: newLabels });
      onRefresh?.();
    } catch (error) {
      console.error('Error updating labels:', error);
    }
  };

  const formatFullDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatShortDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (diffInHours < 168) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (!email) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="text-center">
          <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center">
            <svg className="w-12 h-12 text-blue-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium mb-1 text-gray-900 dark:text-white">Select an email</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400">Choose an email from the list to view its content</p>
        </div>
      </div>
    );
  }



  // prepare HTML safely
  const normalizedBody = normalizeEmailBody(email.body ?? email.text_preview ?? "");

  // REMOVE lines that contain only "0"
  const cleanedBody = normalizedBody
    .split("\n")
    .filter(line => line.trim() !== "0")   // <- this removes the 0
    .join("\n");

  const normalizedHtml = bodyToHtml(cleanedBody);
  const collapsedHtml = collapseForwarded(normalizedHtml);
  const splitQuotedHtml = (html: string) => {
    const match = html.match(
      /(.*?)(<blockquote[\s\S]*$|<div class="gmail_quote"[\s\S]*$|On .* wrote:[\s\S]*$)/i
    );

    if (!match) {
      return { main: html, quoted: '' };
    }

    return {
      main: match[1],
      quoted: match[2],
    };
  };

  const { main: mainHtml, quoted: quotedHtml } = splitQuotedHtml(collapsedHtml);





  return (
    <div className="flex-1 flex flex-col h-full bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" style={{ minHeight: 0 }}>
      {/* Top toolbar */}
      <div className="h-14 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-slate-800/50 flex items-center px-4 gap-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onClose?.();
          }}
          className="p-2 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition"
          title="Back to inbox"
          aria-label="Close email"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1">
          {!isSender && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const targetEmail = email.from_email || '';
                if (!targetEmail) {
                  toast.error("Cannot call: No email address");
                  return;
                }
                callService.initiateCall(targetEmail, 'audio');
                toast.success(`Calling ${email.from_name || targetEmail}...`);
              }}
              className="p-2 text-gray-600 dark:text-slate-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-full transition"
              title="Voice Call"
            >
              <Phone className="w-4 h-4" />
            </button>
          )}


          <button onClick={handleArchive} className="p-2 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition" title="Archive">
            <Archive className="w-4 h-4" />
          </button>
          <button onClick={handleSpam} className="p-2 text-gray-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition" title="Report spam">
            <Flag className="w-4 h-4" />
          </button>
          <button onClick={handleDelete} className="p-2 text-gray-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition" title="Delete">
            <Trash2 className="w-4 h-4" />
          </button>

          <div className="relative" ref={labelDropdownRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowLabelDropdown(!showLabelDropdown); }}
              className="p-2 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition"
              title="Labels"
            >
              <Tag className="w-4 h-4" />
            </button>

            {showLabelDropdown && (
              <div className="absolute left-0 top-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl py-2 z-50 min-w-[240px]">
                <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-700">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Label as:</h3>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {labels.map((label) => {
                    const isApplied = email.labels?.some(l => l.name === label.name);

                    return (
                      <div
                        key={label.id}
                        className="flex items-center px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer"
                        onClick={() => handleToggleLabel(label)}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center mr-3 ${isApplied ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-slate-600'}`}>
                          {isApplied && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <span className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: label.color }}></span>
                        <span className="text-sm text-gray-700 dark:text-slate-200 flex-1">{label.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="relative" ref={dropdownRef}>
            <button onClick={(e) => { e.stopPropagation(); setShowActions(!showActions); }} className="p-2 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition" title="More actions">
              <MoreVertical className="w-4 h-4" />
            </button>

            {showActions && (
              <div className="absolute left-0 top-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl py-2 z-50 min-w-[280px] text-sm">
                <div className="px-3 py-2 space-y-2">
                  <div className="flex items-start gap-2 text-xs">
                    <span className="w-16 font-semibold text-gray-500 dark:text-slate-400 shrink-0">from:</span>
                    <span className="text-gray-900 dark:text-slate-200 break-all">{email.from_name || email.from_email} &lt;{email.from_email}&gt;</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs">
                    <span className="w-16 font-semibold text-gray-500 dark:text-slate-400 shrink-0">to:</span>
                    <span className="text-gray-900 dark:text-slate-200 break-all">
                      {email.to_emails?.length
                        ? email.to_emails.map(t => (typeof t === 'string' ? t : (t?.email || ""))).join(', ')
                        : currentUser.email}
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-xs">
                    <span className="w-16 font-semibold text-gray-500 dark:text-slate-400 shrink-0">date:</span>
                    <span className="text-gray-900 dark:text-slate-200">{formatFullDate(email.sent_at || email.created_at || '')}</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs">
                    <span className="w-16 font-semibold text-gray-500 dark:text-slate-400 shrink-0">subject:</span>
                    <span className="text-gray-900 dark:text-slate-200 break-all">{email.subject || '(No subject)'}</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs">
                    <span className="w-16 font-semibold text-gray-500 dark:text-slate-400 shrink-0">mailed-by:</span>
                    <span className="text-gray-900 dark:text-slate-200">{email.from_email?.split('@')[1] || ''}</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs">
                    <span className="w-16 font-semibold text-gray-500 dark:text-slate-400 shrink-0">signed-by:</span>
                    <span className="text-gray-900 dark:text-slate-200">{email.from_email?.split('@')[1] || ''}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1" />

        <button onClick={toggleStar} className="p-2 text-gray-600 dark:text-slate-400 hover:text-yellow-500 dark:hover:text-yellow-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition" title="Star">
          <Star className={`w-4 h-4 ${starred ? 'text-yellow-500 fill-yellow-500' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        <div className="max-w-none mx-auto p-4 lg:p-6">

          {/* Subject Line - Gmail Style */}
          <div className="mb-6">
            <h1 className="text-xl lg:text-2xl font-normal text-gray-900 dark:text-white mb-3 lg:mb-4 leading-tight">
              {email.subject || "(No subject)"}
            </h1>

            {/* ATTACHMENTS - Professional Style with P2P Differentiation */}
            {attachments.length > 0 && (() => {
              // Determine if this is a P2P email
              const isP2PEmail = !!(email.p2p_enabled || (email as any).p2p_delivered ||
                attachments.some((a: any) => a.delivery_mode === 'P2P' || a.is_p2p || a.p2p_message_id));

              // Check if current user is the sender (case-insensitive comparison)
              const senderEmail = (email.from_email || '').toLowerCase().trim();
              const myEmail = (currentUser?.email || '').toLowerCase().trim();
              const isSender = senderEmail === myEmail;

              const formatSize = (bytes: number) => {
                if (!bytes) return '';
                if (bytes < 1024) return `${bytes} B`;
                const kb = bytes / 1024;
                if (kb < 1024) return `${kb.toFixed(0)} KB`;
                return `${(kb / 1024).toFixed(1)} MB`;
              };

              return (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                  {/* Header - Clean Gmail Style */}
                  <div className="flex items-center gap-2 mb-3">
                    <Paperclip className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {attachments.length} attachment{attachments.length > 1 ? 's' : ''}
                    </span>
                    {isP2PEmail && (
                      <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Secure
                      </span>
                    )}
                  </div>

                  {/* Attachment Cards - Clean Gmail-like Design */}
                  <div className="space-y-2">
                    {attachments.map((a: any) => {
                      const isP2PAttachment = !!(a.delivery_mode === 'P2P' || a.is_p2p || a.p2p_message_id || isP2PEmail);
                      const hasP2PId = !!a.p2p_message_id;



                      const downloadUrl = `/api/email/${email.id}/attachment/${a.id}?download=1&user_id=${currentUser.id}`;
                      const previewUrl = `/api/email/${email.id}/attachment/${a.id}?inline=1&user_id=${currentUser.id}`;

                      const isVideo =
                        typeof a.mime_type === 'string' &&
                        a.mime_type.startsWith('video/');

                      // Get P2P transfer progress for receiver
                      const p2pProgress = hasP2PId ? p2pProgressMap[a.p2p_message_id] : null;

                      // Fast in-memory check for local P2P blob (may be false after refresh)
                      const hasLocalP2PFile = hasP2PId && p2pService.hasReceivedFileSync(a.p2p_message_id);

                      const isTransferComplete =
                        isSender ||
                        a.delivered || // ✅ Check database 'delivered' field (set when P2P completes)
                        a.p2p_completed ||
                        (a.p2p_message_id && deliveredP2P.has(a.p2p_message_id)) ||
                        (p2pProgress?.percentage === 100) ||
                        hasLocalP2PFile ||
                        (a.id && a.delivery_mode === 'P2P'); // ✅ If attachment has DB id and is P2P, content_base64 is available as fallback

                      const isTransferInProgress = hasP2PId && p2pProgress && p2pProgress.percentage > 0 && p2pProgress.percentage < 100;
                      const transferPercentage = p2pProgress?.percentage || 0;


                      return (
                        <div
                          key={a.id || a.p2p_message_id || a.filename}
                          className={`p-3 bg-gray-50 dark:bg-slate-800 border rounded-lg transition-colors ${isTransferInProgress
                            ? 'border-blue-300 dark:border-blue-700'
                            : 'border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-700'
                            }`}
                        >
                          <div className="flex items-center gap-3">
                            {/* File Icon */}
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isTransferComplete
                              ? 'bg-green-100 dark:bg-green-900/30'
                              : isTransferInProgress
                                ? 'bg-blue-100 dark:bg-blue-900/30'
                                : isP2PAttachment
                                  ? 'bg-yellow-100 dark:bg-yellow-900/30'
                                  : 'bg-blue-100 dark:bg-blue-900/30'
                              }`}>
                              {isTransferInProgress ? (
                                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <FileText className={`w-5 h-5 ${isTransferComplete
                                  ? 'text-green-600 dark:text-green-400'
                                  : isP2PAttachment
                                    ? 'text-yellow-600 dark:text-yellow-400'
                                    : 'text-blue-600 dark:text-blue-400'
                                  }`} />
                              )}
                            </div>

                            {/* File Details */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {a.filename}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {formatSize(a.size || a.size_bytes || 0)}
                                {isVideo && (
                                  <span className="ml-2 text-purple-600 dark:text-purple-400">
                                    • Video
                                  </span>
                                )}
                                {isP2PAttachment && !isSender && (
                                  <span className={`ml-2 ${isTransferComplete
                                    ? 'text-green-600 dark:text-green-400'
                                    : isTransferInProgress
                                      ? 'text-blue-600 dark:text-blue-400'
                                      : 'text-yellow-600 dark:text-yellow-400'
                                    }`}>
                                    • {isTransferComplete
                                      ? '✓ Received'
                                      : isTransferInProgress
                                        ? `Receiving... ${p2pProgress?.received || 0}/${p2pProgress?.total || 0} chunks`
                                        : 'Awaiting transfer'}
                                  </span>
                                )}

                                {isP2PAttachment && isSender && (
                                  <span className="ml-2 text-green-600 dark:text-green-400">
                                    • Secure
                                  </span>
                                )}
                              </p>
                            </div>

                            {/* Action Buttons / Status */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {isSender ? (
                                // SENDER view - just show checkmark
                                <span className="text-green-600 dark:text-green-400">
                                  <CheckCircle className="w-5 h-5" />
                                </span>
                              ) : (
                                <>
                                  {/* RECEIVER - Always allow download/preview when attachment row exists */}
                                  <button
                                    onClick={() => {
                                      // Prefer local P2P blob when available, otherwise HTTP fallback
                                      if (a.p2p_message_id && p2pService.hasReceivedFileSync(a.p2p_message_id)) {
                                        window.dispatchEvent(
                                          new CustomEvent('p2p-download-file', {
                                            detail: {
                                              messageId: a.p2p_message_id,
                                              fileName: a.filename
                                            }
                                          })
                                        );
                                      } else if (a.id) {
                                        // Fallback to server-stored attachment (content_base64)
                                        window.open(downloadUrl, '_blank');
                                      } else {
                                        toast.error('File not available yet');
                                      }
                                    }}
                                    className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200
             dark:text-gray-400 dark:hover:text-white dark:hover:bg-slate-600
             rounded-lg transition-colors"
                                    title="Download"
                                  >
                                    <Download className="w-5 h-5" />
                                  </button>
                                  <button
                                    onClick={async () => {
                                      // Prefer local P2P blob for preview; if missing, use HTTP preview
                                      if (a.p2p_message_id && p2pService.hasReceivedFileSync(a.p2p_message_id)) {
                                        const blob = await p2pService.getReceivedBlob(a.p2p_message_id);
                                        if (!blob) {
                                          toast.error('File not available for preview');
                                          return;
                                        }

                                        const url = URL.createObjectURL(blob);
                                        window.open(url, '_blank');
                                        setTimeout(() => URL.revokeObjectURL(url), 60_000);
                                      } else if (a.id) {
                                        // ✅ Use previewUrl with inline parameter for preview, not download
                                        window.open(previewUrl, '_blank');
                                      } else {
                                        toast.error('File not available yet');
                                      }
                                    }}
                                    className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200
             dark:text-gray-400 dark:hover:text-white dark:hover:bg-slate-600
             rounded-lg transition-colors"
                                    title="Preview"
                                  >
                                    <Eye className="w-5 h-5" />
                                  </button>
                                  {/* Optional small status text to the right when P2P not finished */}
                                  {!isTransferComplete && isP2PAttachment && (
                                    <span className="text-xs text-yellow-600 dark:text-yellow-400 px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 rounded-full">
                                      {isTransferInProgress ? 'Receiving…' : 'Awaiting transfer'}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>

                          {/* Inline video preview when transfer is complete */}
                          {!isSender && isVideo && isTransferComplete && (
                            <div className="mt-3">
                              <video
                                data-message-id={a.p2p_message_id || a.id}
                                src={a.p2p_message_id ? videoBlobUrls[a.p2p_message_id] : downloadUrl}
                                controls
                                className="w-full max-h-64 rounded-lg border border-gray-200 dark:border-slate-700"
                                preload="metadata"
                              >
                                Your browser does not support the video tag.
                              </video>
                            </div>
                          )}

                          {/* Progress Bar for P2P transfers (receiver view) */}
                          {!isSender && isP2PAttachment && !isTransferComplete && (
                            <div className="mt-3">
                              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                                <span>
                                  {isTransferInProgress
                                    ? (
                                      <>
                                        <span className="font-semibold text-blue-600 dark:text-blue-400">{transferPercentage}%</span>
                                        {' '}•{' '}
                                        <span className="font-medium text-gray-700 dark:text-gray-300">
                                          Chunks: {p2pProgress?.received || 0} / {p2pProgress?.total || 0}
                                        </span>
                                        {p2pProgress?.etaSeconds && p2pProgress.etaSeconds > 0 && (
                                          <>
                                            {' '}•{' '}
                                            <span className="font-medium text-purple-600 dark:text-purple-400">
                                              ETA: {p2pProgress.etaSeconds < 60
                                                ? `${p2pProgress.etaSeconds}s`
                                                : p2pProgress.etaSeconds < 3600
                                                  ? `${Math.floor(p2pProgress.etaSeconds / 60)}m ${p2pProgress.etaSeconds % 60}s`
                                                  : `${Math.floor(p2pProgress.etaSeconds / 3600)}h ${Math.floor((p2pProgress.etaSeconds % 3600) / 60)}m`}
                                            </span>
                                          </>
                                        )}
                                      </>
                                    )
                                    : 'Waiting for sender to be online...'}
                                </span>
                                <span className="flex items-center gap-2">
                                  {p2pProgress?.speedBps && p2pProgress.speedBps > 0 && (
                                    <span className="text-green-600 dark:text-green-400 font-medium">
                                      {(p2pProgress.speedBps / 1024).toFixed(0)} KB/s
                                    </span>
                                  )}
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
                                <div
                                  className={`h-2.5 rounded-full transition-all duration-300 ${isTransferInProgress
                                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500'
                                    : 'bg-yellow-400 dark:bg-yellow-600 animate-pulse'
                                    }`}
                                  style={{ width: `${isTransferInProgress ? transferPercentage : 5}%` }}
                                />
                              </div>
                              {/* Additional info row */}
                              {isTransferInProgress && p2pProgress?.received !== undefined && (
                                <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                                  {p2pProgress.total && p2pProgress.total - p2pProgress.received > 0
                                    ? `${p2pProgress.total - p2pProgress.received} chunks remaining`
                                    : 'Finalizing...'}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Completion indicator for receiver */}
                          {!isSender && isP2PAttachment && isTransferComplete && (
                            <div className="mt-2 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                              <CheckCircle className="w-3 h-3" />
                              <span>File received completely - Ready to download</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* P2P indicator - simple text */}
                  {isP2PEmail && (
                    <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Sent securely via P2P encryption
                    </p>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Email Card - Gmail Style */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden mb-6">
            {/* Sender Info Section */}
            <div className="p-4 lg:p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 flex items-center justify-center text-white font-semibold text-xs lg:text-sm shadow-md">
                  {getInitials(email.from_name || email.from_email || '')}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 lg:gap-4 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs lg:text-sm font-medium text-gray-900 dark:text-white">
                          {email.from_name || email.from_email}
                        </h3>
                        <span className="text-xs lg:text-sm text-gray-500 dark:text-slate-400">
                          &lt;{email.from_email}&gt;
                        </span>
                      </div>
                      <div className="text-xs lg:text-sm text-gray-600 dark:text-slate-400 mt-1">
                        to {email.to_emails?.length
                          ? email.to_emails.map(t => (typeof t === 'string' ? t : (t?.email || ""))).join(', ')
                          : currentUser.email
                        }
                        {email.cc_emails && email.cc_emails.length > 0 && (
                          <span>, cc {email.cc_emails.map((cc: any) => (typeof cc === 'string' ? cc : cc?.email)).join(', ')}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs lg:text-sm text-gray-500 dark:text-slate-400 whitespace-nowrap">
                      {formatShortDate(email.sent_at || email.created_at || '')}
                    </span>
                    {!isSender && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const targetEmail = email.from_email || '';
                          if (!targetEmail) {
                            toast.error("Cannot call: No email address");
                            return;
                          }
                          callService.initiateCall(targetEmail, 'audio');
                          toast.success(`Calling ${email.from_name || targetEmail}...`);
                        }}
                        className="ml-2 p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 dark:text-slate-400 dark:hover:text-green-400 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                        title="Voice Call"
                      >
                        <Phone className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Email Body */}
            <div className="px-4 lg:px-6 pb-4 lg:pb-6 pt-3 lg:pt-4 border-t border-gray-100 dark:border-slate-800">
              <div className="prose dark:prose-invert max-w-none" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                <div className="text-xs lg:text-sm text-gray-800 dark:text-slate-200 leading-relaxed">
                  <div dangerouslySetInnerHTML={{ __html: mainHtml }} />

                  {quotedHtml && !showQuoted && (
                    <button
                      onClick={() => setShowQuoted(true)}
                      className="mt-2 text-xs text-blue-600 hover:underline"
                    >
                      ⋯ Show quoted text
                    </button>
                  )}

                  {quotedHtml && showQuoted && (
                    <div className="mt-3 border-l-2 border-gray-300 dark:border-slate-600 pl-3">
                      <div dangerouslySetInnerHTML={{ __html: quotedHtml }} />
                      <button
                        onClick={() => setShowQuoted(false)}
                        className="mt-2 text-xs text-blue-600 hover:underline"
                      >
                        Hide quoted text
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons - Gmail Style */}
            {!email.is_draft && !inlineReplyMode && (
              <div className="px-4 lg:px-6 pb-6">
                <div className="flex items-center gap-3">
                  {/* Reply Button - Gmail Style */}
                  <button
                    onClick={() => openInlineReply("reply")}
                    className="group inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-2xl hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-700 hover:text-blue-700 dark:hover:text-blue-400 shadow-sm hover:shadow transition-all duration-200"
                  >
                    <Reply className="w-4 h-4 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
                    <span>Reply</span>
                  </button>

                  {/* Reply All Button - Only show when multiple recipients */}
                  {hasMultipleRecipients && (
                    <button
                      onClick={() => openInlineReply("replyAll")}
                      className="group inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-2xl hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-700 hover:text-blue-700 dark:hover:text-blue-400 shadow-sm hover:shadow transition-all duration-200"
                    >
                      <ReplyAll className="w-4 h-4 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
                      <span>Reply all</span>
                    </button>
                  )}

                  {/* Forward Button - Gmail Style */}
                  <button
                    onClick={() => openInlineReply("forward")}
                    className="group inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-2xl hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-700 hover:text-blue-700 dark:hover:text-blue-400 shadow-sm hover:shadow transition-all duration-200"
                  >
                    <Forward className="w-4 h-4 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
                    <span>Forward</span>
                  </button>
                </div>
              </div>
            )}

            {/* INLINE REPLY EDITOR — Matches Compose Box Style */}
            {inlineReplyMode && (
              <div className="mx-4 mb-4 border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
                {/* Header - To field for forward, recipient for reply */}
                <div className="flex items-center px-4 py-2 border-b border-gray-100 dark:border-slate-800">
                  {inlineReplyMode === 'forward' ? (
                    <>
                      <Forward className="w-4 h-4 text-gray-400 mr-2" />
                      <span className="text-sm text-gray-500 mr-2">To:</span>
                      <input
                        type="email"
                        value={forwardTo}
                        onChange={(e) => setForwardTo(e.target.value)}
                        placeholder="Enter recipient email"
                        className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 focus:outline-none placeholder-gray-400"
                      />
                    </>
                  ) : (
                    <>
                      <Reply className="w-4 h-4 text-gray-400 mr-2" />
                      <span className="text-sm text-gray-500 mr-2">To:</span>
                      <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
                        {email?.from_name || email?.from_email}
                      </span>
                    </>
                  )}
                </div>

                {/* Text area - matches compose body */}
                <div className="min-h-[120px] max-h-[300px] overflow-y-auto">
                  <textarea
                    ref={replyTextareaRef}
                    className="w-full h-full resize-none bg-transparent text-sm text-gray-800 dark:text-gray-200 focus:outline-none placeholder-gray-400 dark:placeholder-slate-500 p-4"
                    rows={4}
                    value={replyBody}
                    onChange={(e) => {
                      setReplyBody(e.target.value);
                      autoResizeReply();
                    }}
                    placeholder={inlineReplyMode === 'forward' ? 'Add a message above the forwarded content...' : 'Write your reply...'}
                  />
                </div>

                {/* Reply attachments preview - more visible */}
                {replyAttachments.length > 0 && (
                  <div className="px-4 py-3 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800">
                    <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                      <Paperclip className="w-3 h-3" />
                      {replyAttachments.length} attachment{replyAttachments.length > 1 ? 's' : ''}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {replyAttachments.map((file, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 px-3 py-2 rounded-lg text-sm shadow-sm">
                          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded flex items-center justify-center">
                            <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="flex flex-col">
                            <span className="truncate max-w-[150px] font-medium text-gray-700 dark:text-gray-300">{file.name}</span>
                            <span className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</span>
                          </div>
                          <button
                            onClick={() => setReplyAttachments(prev => prev.filter((_, i) => i !== idx))}
                            className="ml-2 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quoted text toggle */}
                <div className="px-4 pb-2">
                  <button className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400">
                    <MoreVertical className="w-4 h-4 rotate-90" />
                  </button>
                </div>

                {/* Footer toolbar - Exactly like Compose Box */}
                <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800 relative">
                  {/* LEFT: Tool icons */}
                  <div className="flex items-center gap-0">
                    {/* Attach files */}
                    <button
                      onClick={() => replyFileInputRef.current?.click()}
                      className="p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800 rounded transition-colors"
                      title="Attach files"
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>

                    {/* Insert link */}
                    <button
                      onClick={insertReplyLink}
                      className="p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800 rounded transition-colors"
                      title="Insert link"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </button>

                    {/* Emoji picker */}
                    <div className="relative">
                      <button
                        onClick={() => setShowReplyEmojiPicker(!showReplyEmojiPicker)}
                        className={`p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800 rounded transition-colors ${showReplyEmojiPicker ? 'bg-gray-100 dark:bg-slate-800' : ''}`}
                        title="Insert emoji"
                      >
                        <Smile className="w-5 h-5" />
                      </button>
                      {showReplyEmojiPicker && (
                        <div className="absolute bottom-12 left-0 w-64 bg-white dark:bg-slate-800 shadow-xl rounded-lg border border-gray-200 dark:border-slate-700 p-2 grid grid-cols-6 gap-1 z-50">
                          {emojis.map(e => (
                            <button
                              key={e}
                              onClick={() => insertReplyEmoji(e)}
                              className="text-xl p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
                            >
                              {e}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Drive - placeholder */}
                    <button
                      onClick={() => toast('Drive integration coming soon')}
                      className="p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800 rounded transition-colors"
                      title="Insert from Drive"
                    >
                      <HardDrive className="w-5 h-5" />
                    </button>

                    {/* Image - uses same file picker */}
                    <button
                      onClick={() => replyFileInputRef.current?.click()}
                      className="p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800 rounded transition-colors"
                      title="Insert photo"
                    >
                      <ImageIcon className="w-5 h-5" />
                    </button>

                    {/* Separator */}
                    <div className="h-6 w-px bg-gray-300 dark:bg-slate-700 mx-2"></div>

                    {/* Discard */}
                    <button
                      onClick={() => {
                        setInlineReplyMode(null);
                        setReplyBody('');
                        setReplyAttachments([]);
                        setShowReplyEmojiPicker(false);
                        if (replyTextareaRef.current) {
                          replyTextareaRef.current.style.height = 'auto';
                        }
                      }}
                      className="p-2 text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded transition-colors"
                      title="Discard draft"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>

                  {/* RIGHT: Send button */}
                  <button
                    onClick={sendInlineReply}
                    className="px-6 py-2 rounded-md shadow-sm text-white text-sm font-medium bg-[#1a73e8] hover:bg-[#1557b0] flex items-center gap-2 transition-colors"
                  >
                    <span>Send</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>

                {/* Hidden file input */}
                <input
                  ref={replyFileInputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={handleReplyAttach}
                />
              </div>
            )}

            {/* Extra padding at bottom for scroll space */}
            <div className="h-16" />
          </div>

          {/* Confirm Dialog */}
          {confirmDialog.open && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
              <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-800 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{confirmDialog.title}</h3>
                  <button
                    onClick={confirmDialog.processing ? undefined : closeConfirmDialog}
                    className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-40"
                    disabled={confirmDialog.processing}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm text-gray-600 dark:text-slate-400">{confirmDialog.message}</p>
                {confirmDialog.error && (
                  <p className="text-sm text-red-500 mt-3">{confirmDialog.error}</p>
                )}
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={confirmDialog.processing ? undefined : closeConfirmDialog}
                    className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
                    disabled={confirmDialog.processing}
                  >
                    {confirmDialog.cancelLabel}
                  </button>
                  <button
                    onClick={executeConfirmAction}
                    className="px-5 py-2 text-sm font-semibold rounded-lg text-white bg-red-500 hover:bg-red-600 disabled:opacity-60"
                    disabled={confirmDialog.processing}
                  >
                    {confirmDialog.processing ? 'Working...' : confirmDialog.confirmLabel}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div >
  );
}
