// src/components/EmailView.tsx
import { Star, Reply, ReplyAll, Forward, Trash2, Archive, MoreVertical, Paperclip, X, Flag, Tag, Check, Smile, Phone, ShieldAlert, Printer, ExternalLink, Sparkles, MoreHorizontal } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { emailService } from '../lib/emailService';
import { authService } from '../lib/authService';
import { Email } from '../types/email';
import { normalizeEmailBody } from '../utils/email';
import { p2pService } from '../lib/p2pService';
import { createManifest, manifestToBase64 } from '../lib/p2pManifest';
import { normalizeSubject, getRecipients, buildReferences, buildQuoteHeader, formatBody } from '../utils/replyLogic';
import { callService } from '../lib/callService';
import toast from 'react-hot-toast';
import P2PAttachmentList from './P2PAttachmentList';

import { summaryService } from '../lib/summaryService';
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
  hideClose?: boolean;
  hideToolbar?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
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

// Local attachment items handled by P2PAttachmentList.

// Local P2P attachment items removed.

export default function EmailView({ email, onClose, onRefresh, onCompose: _onCompose, labels = [], collapsed = false, onToggleCollapse }: EmailViewProps) {
  // console.log("EMAIL JSON >>>", email);

  const [starred, setStarred] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentUser = authService.getCurrentUser();
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);


  const myEmail = currentUser.email.toLowerCase();
  const senderEmail = (email?.from_email || '').toLowerCase();
  const isSender = myEmail === senderEmail;

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
  // p2pProgressMap removed (delegated to components)

  const [videoBlobUrls] = useState<Record<string, string>>({});

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(initialConfirmState);
  const [showLabelDropdown, setShowLabelDropdown] = useState(false);
  const labelDropdownRef = useRef<HTMLDivElement>(null);

  // Reply editor state
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const [showReplyEmojiPicker, setShowReplyEmojiPicker] = useState(false);

  // Email Summary State
  const [summary, setSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // Threading State
  const [threadMessages, setThreadMessages] = useState<Email[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const loadThread = async () => {
    if (!email?.thread_id) return;
    try {
      const { data } = await emailService.getThread(email.thread_id, currentUser.id);
      if (data && data.length > 0) {
        setThreadMessages(data);

        // Expand the last message (newest) by default if it's the first load or if explicitly requested?
        // For now, let's keep expanding the last one as it's confusing otherwise
        const lastMsg = data[data.length - 1];
        setExpandedIds(prev => {
          const next = new Set(prev);
          next.add(Number(lastMsg.id));
          return next;
        });
      }
    } catch (err) {
      console.error("Failed to fetch thread", err);
    }
  };

  useEffect(() => {
    if (email) {
      // Optimistic initial state
      setThreadMessages([email]);

      const initialExpanded = new Set<number>();
      // Always expand the selected email initially
      initialExpanded.add(Number(email.id));
      setExpandedIds(initialExpanded);

      // Fetch full thread if thread_id exists
      if (email.thread_id) {
        loadThread();
      }
    }
  }, [email?.id]);

  // ... (toggleMessageExpand, toggleQuoted logic remains same)

  // ... (handleReplyAttach, insertReplyEmoji, insertReplyLink logic remains same)

  // ... (sanitizeBody, htmlToNewlines, etc.)

  // Updated sendInlineReply to refresh thread
  const sendInlineReply = async () => {
    const targetEmail = replyTarget || email;
    if (!targetEmail) return;

    const me = currentUser.email;
    let toEmails: string[] = [];
    let ccEmails: string[] = [];
    let emailSubject = '';
    let emailBody = '';
    let attachments: any[] = [];
    let p2pEnabled = false;

    // 1. Get Recipients & Subject using helper utils
    if (inlineReplyMode === 'forward') {
      if (!forwardTo.trim()) {
        toast.error('Please enter a recipient email address');
        return;
      }
      toEmails = [forwardTo.trim()];
      emailSubject = normalizeSubject(targetEmail.subject || '', 'Fwd:');
      emailBody = replyBody; // Forward body is already set in openInlineReply
    } else {
      // Reply or Reply All
      if (!replyBody.trim()) {
        toast.error('Please enter a message');
        return;
      }

      const recipients = getRecipients(inlineReplyMode as any, targetEmail, me);
      toEmails = recipients.to;
      ccEmails = recipients.cc;

      emailSubject = normalizeSubject(targetEmail.subject || '', 'Re:');

      // Construct Body with Quoted Text (Gmail Style)
      // Current replyBody + Quote Header + Quoted Text
      const quoteHeader = buildQuoteHeader(targetEmail, inlineReplyMode as any);
      const quotedBody = formatBody(sanitizeBody(targetEmail.body) || "", inlineReplyMode as any);

      emailBody = replyBody + "\n" + quoteHeader + quotedBody;
    }

    // 2. Validate recipients
    if (toEmails.length === 0) {
      toast.error("No valid recipient");
      return;
    }

    // 3. Handle P2P Forwarding Logic
    if (inlineReplyMode === 'forward' && targetEmail.attachments && targetEmail.attachments.length > 0) {
      const p2pAttachments = targetEmail.attachments.filter((a: any) => a.p2p_message_id);

      for (const att of p2pAttachments) {
        // Only forward if we have the file locally (downloaded)
        if (await p2pService.hasReceivedFile(att.p2p_message_id)) {
          try {
            const file = await p2pService.getFile(att.p2p_message_id);
            if (file) {
              // Create NEW Manifest (New Transfer Session)
              // Ensure we have a File object with name from metadata
              const p2pFile = new File([file], att.filename, { type: att.mime_type || file.type });

              const newManifest = await createManifest(p2pFile, me);
              const manifestBase64Str = manifestToBase64(newManifest);

              attachments.push({
                filename: `${att.filename}.p2p`, // Use att.filename
                mime_type: 'application/x-jeemail-manifest+json',
                size: manifestBase64Str.length,
                content_base64: manifestBase64Str,
                p2p_message_id: newManifest.attachmentId,
                scan_status: 'clean', // Currently trusting local file re-send
                safe: true
              });

              // Start seeding in background
              p2pService.startTransfer(toEmails, [p2pFile], [newManifest.attachmentId])
                .catch(err => console.error("Failed to start forwarded P2P seeding", err));

              p2pEnabled = true;
              toast.success(`Forwarding P2P file: ${att.filename}`);
            }
          } catch (e) {
            console.warn("Failed to prepare forwarded P2P file", e);
          }
        }
      }
    }

    // 4. Headers (Threading)
    const headers = buildReferences(targetEmail, inlineReplyMode as any);

    await emailService.createEmail({
      user_id: currentUser.id,

      from_email: currentUser.email,
      from_name: currentUser.name || currentUser.email,

      to_emails: toEmails,
      cc_emails: ccEmails,

      subject: emailSubject,
      body: emailBody,

      in_reply_to: headers.inReplyTo,
      references: headers.references,
      thread_id: inlineReplyMode === 'forward' ? undefined : (targetEmail.thread_id ?? targetEmail.id),

      attachments: attachments, // Include processed P2P attachments
      p2p_enabled: p2pEnabled,
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
    setShowReplyEmojiPicker(false);

    // Refresh parent AND current thread view
    onRefresh?.();
    loadThread(); // <--- Refresh messages in view immediately
  };

  const toggleMessageExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [quotedExpandedIds, setQuotedExpandedIds] = useState<Set<number>>(new Set());
  const toggleQuoted = (id: number) => {
    setQuotedExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

  /* 
    Iteratively strip HTML tags and decode entities.
    Handles cases like "&lt;div&gt;" -> "<div>" -> "" (stripped).
    Max 3 passes to prevent infinite loops.
  */
  const stripHtmlTags = (s: string) => {
    if (!s) return s;
    let current = s;

    for (let i = 0; i < 3; i++) {
      // If it looks clean, stop
      if (!/<\/?[a-z][\s\S]*>|&[a-z#0-9]+;/i.test(current)) {
        break;
      }

      try {
        const tmp = document.createElement("DIV");
        tmp.innerHTML = current;

        // prefer innerText to preserve structure/newlines
        const next = tmp.innerText || tmp.textContent || "";

        if (next === current) break;
        current = next;
      } catch (e) {
        break;
      }
    }

    // Final safety net: explicit regex strip for any lingering tags
    return current.replace(/<\/?[^>]+(>|$)/g, " ");
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

  useEffect(() => {

    setSummary(null);
    setIsSummarizing(false);
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



  // P2P Listeners removed (delegated to P2PAttachmentList component)

  useEffect(() => {
    if (!isSender) return;

    const handler = () => {
      onRefresh?.();
    };

    window.addEventListener('p2p-delivered', handler);
    return () => window.removeEventListener('p2p-delivered', handler);
  }, [isSender, onRefresh]);


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
    if (!email?.attachments || email.is_read || isSender) return;

    email.attachments.forEach((a: any) => {
      if (a.p2p_message_id && !p2pService.hasReceivedFileSync(a.p2p_message_id)) {
        console.log('[UI] Explicit Intent (Unread): Starting P2P receive for', a.filename);
        p2pService.resumeReceive(a.p2p_message_id, senderEmail);
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
      p2p_completed: a.p2p_completed,
      content_base64: a.content_base64 || null,
      p2p_status: a.p2p_status
    }))
    : [];



  const [replyTarget, setReplyTarget] = useState<Email | null>(null);

  const openInlineReply = (mode: "reply" | "replyAll" | "forward", targetMsg?: Email) => {
    const msg = targetMsg || email;
    if (!msg) return;

    setReplyTarget(msg); // Track which message we are replying to
    setInlineReplyMode(mode);


    if (mode === 'forward') {
      // For forward, include original message content
      const quoteHeader = buildQuoteHeader(msg, mode);
      const quotedBody = formatBody(sanitizeBody(msg.body) || "", mode);
      const originalContent = quoteHeader + quotedBody;

      setReplyBody(originalContent);
      setForwardTo(''); // Reset forward recipient
    } else {
      setReplyBody(""); // reply starts clean
    }
  };

  // State for forward recipient
  const [forwardTo, setForwardTo] = useState('');



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

  const getSenderName = (name?: string, email?: string) => {
    const safeEmail = email || "";
    if (name && !name.includes('@')) return name;
    return safeEmail.split('@')[0];
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









  // COLLAPSED VIEW RENDER
  if (collapsed) {
    return (
      <div
        onClick={onToggleCollapse}
        className="flex items-center px-4 py-3 bg-gray-50 dark:bg-slate-900/50 border-b border-gray-200 dark:border-slate-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 dark:bg-slate-700 flex items-center justify-center text-gray-600 dark:text-gray-300 font-semibold text-xs mr-4">
          {getInitials(email.from_name || email.from_email || '')}
        </div>

        <div className="flex-1 min-w-0 flex items-center gap-4">
          <span className="font-semibold text-sm text-gray-900 dark:text-white w-48 truncate">
            {getSenderName(email.from_name, email.from_email)}
          </span>
          <span className="text-sm text-gray-500 dark:text-slate-400 truncate flex-1">
            {stripHtmlTags(email.text_preview || htmlToNewlines(email.body || "")).substring(0, 100)}...
          </span>
        </div>

        <div className="flex items-center gap-4 ml-4">
          {attachments.length > 0 && <Paperclip className="w-4 h-4 text-gray-400" />}
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {formatShortDate(email.sent_at || email.created_at || '')}
          </span>
        </div>
      </div >
    );
  }

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

          <div className="h-4 w-px bg-gray-300 dark:bg-slate-700 mx-1"></div>

          <button onClick={() => window.print()} className="p-2 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition" title="Print">
            <Printer className="w-4 h-4" />
          </button>

          <button onClick={() => window.open(window.location.href, '_blank')} className="p-2 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition" title="Open in new window">
            <ExternalLink className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-gray-300 dark:bg-slate-700 mx-1"></div>

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

          {/* Subject Line - Clean Thread Title */}
          <div className="mb-6 ml-2">
            <div className="flex items-center gap-3 mb-4">
              <h1 className="text-xl lg:text-2xl font-normal text-gray-900 dark:text-white leading-tight">
                {(email.subject || "(No subject)").replace(/^(Re|Fwd|re|fwd)(\[\d+\])?:?\s*/i, '')}
              </h1>
              {email.labels?.map(label => (
                <span key={label.id} className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-700">
                  {label.name}
                </span>
              ))}
            </div>

            {/* AI Summary Section */}
            <div className="mb-4">
              {!summary ? (
                <button
                  onClick={async () => {
                    if (!email) return;
                    setIsSummarizing(true);
                    try {
                      const text = email.body || email.text_preview || "(No content)";
                      const result = await summaryService.generateSummary(text);
                      setSummary(result);
                    } catch (err) {
                      toast.error("Failed to generate summary");
                    } finally {
                      setIsSummarizing(false);
                    }
                  }}
                  disabled={isSummarizing}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-medium transition-colors border border-blue-100 dark:border-blue-800 disabled:opacity-70 disabled:cursor-wait"
                >
                  {isSummarizing ? (
                    <>
                      <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <span>Summarizing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-blue-600" />
                      <span>Summarize this email</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="bg-blue-50/50 dark:bg-slate-800/50 rounded-xl p-4 border border-blue-100 dark:border-slate-700 animate-fadeIn">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">Summary</span>
                    </div>
                    <button onClick={() => setSummary(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    {summary}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* MESSAGE LIST */}
          <div className="space-y-4">
            {threadMessages.map((msg) => {
              const isExpanded = expandedIds.has(Number(msg.id));


              // Computed Logic per message
              const normalizedBody = normalizeEmailBody(msg.body ?? msg.text_preview ?? "");
              const cleanedBody = normalizedBody.split("\n").filter(line => line.trim() !== "0").join("\n");
              const normalizedHtml = bodyToHtml(cleanedBody);
              const { main: mainHtml, quoted: quotedHtml } = splitQuotedHtml(normalizedHtml);
              const showQuoted = quotedExpandedIds.has(Number(msg.id));

              const msgAttachments = Array.isArray(msg.attachments) ? msg.attachments : [];

              // COLLAPSED VIEW
              if (!isExpanded) {
                return (
                  <div
                    key={msg.id}
                    onClick={() => toggleMessageExpand(Number(msg.id))}
                    className="group bg-gray-50 dark:bg-slate-900 border border-transparent border-b-gray-200 dark:border-b-slate-800 hover:border-gray-200 dark:hover:border-slate-700 rounded-lg flex items-center px-4 py-3 cursor-pointer transition-all"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 dark:bg-slate-700 flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-xs mr-4">
                      {getInitials(msg.from_name || msg.from_email || '')}
                    </div>
                    <div className="flex-1 min-w-0 flex items-center gap-4">
                      <span className="font-semibold text-sm text-gray-900 dark:text-white w-48 truncate">
                        {getSenderName(msg.from_name, msg.from_email)}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-slate-400 truncate flex-1 group-hover:text-gray-700 dark:group-hover:text-slate-300 transition-colors">
                        {sanitizeBody(msg.body ?? msg.text_preview ?? "").substring(0, 80)}...
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {msg.has_attachments && <Paperclip className="w-4 h-4 text-gray-400" />}
                      <div className="text-xs text-gray-500 font-medium whitespace-nowrap">
                        {formatShortDate(msg.sent_at || msg.created_at || '')}
                      </div>
                    </div>
                  </div>
                );
              }

              // EXPANDED VIEW
              return (
                <div key={msg.id} className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden transition-shadow hover:shadow-md">

                  {/* Header: Sender Info & Date */}
                  <div
                    className="px-5 py-4 cursor-pointer"
                    onClick={() => toggleMessageExpand(Number(msg.id))}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm shadow-sm">
                          {getInitials(msg.from_name || msg.from_email || '')}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-gray-900 dark:text-white">
                              {getSenderName(msg.from_name, msg.from_email)}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-slate-400 font-normal">
                              &lt;{msg.from_email}&gt;
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                            to {msg.to_emails?.length ? 'me, ' + (msg.to_emails.length > 1 ? 'others' : '') : 'me'}
                            <span className="ml-1 cursor-pointer hover:text-gray-700 dark:hover:text-slate-200">
                              ▼
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-xs text-gray-500 dark:text-slate-400">
                          {formatShortDate(msg.sent_at || msg.created_at || '')}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); openInlineReply("reply", msg); }} className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full">
                          <Reply className="w-4 h-4" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setShowActions(!showActions); }} className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Security Banner */}
                  {((msg as any).phishing || (msg as any).malware || (msg as any).spam_score > 50) && (
                    <div className="px-5 pb-4">
                      <div className={`p-3 rounded-lg flex items-start gap-3 ${(msg as any).phishing || (msg as any).malware
                        ? "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200"
                        : "bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200"
                        }`}>
                        <ShieldAlert className="w-5 h-5 shrink-0" />
                        <div>
                          <h4 className="text-sm font-bold">Suspicious Message</h4>
                          <p className="text-xs mt-1 opacity-90">
                            {(msg as any).scan_warnings || "This message was flagged by security filters."}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Email Body */}
                  <div className="px-5 pb-6 text-sm text-gray-800 dark:text-slate-200 leading-relaxed font-sans">
                    <div
                      className="prose dark:prose-invert max-w-none break-words"
                      dangerouslySetInnerHTML={{ __html: mainHtml }}
                    />

                    {quotedHtml && (
                      <div className="mt-4">
                        {!showQuoted ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleQuoted(Number(msg.id)); }}
                            className="w-8 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded text-gray-500 dark:text-slate-400 transition-colors"
                            title="Show quoted text"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        ) : (
                          <div className="mt-2 text-gray-500 dark:text-slate-400 pl-2 border-l-2 border-gray-200 dark:border-slate-700">
                            <div
                              className="opacity-80 text-xs"
                              dangerouslySetInnerHTML={{ __html: quotedHtml }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Attachments */}
                  {msgAttachments.length > 0 && (
                    <div className="px-5 pb-6 border-t border-gray-100 dark:border-slate-800 pt-4">
                      <P2PAttachmentList
                        emailId={String(msg.id)}
                        senderEmail={(msg.from_email || '').toLowerCase().trim()}
                        attachments={msgAttachments.map((a: any) => ({
                          ...a,
                          is_p2p: !!(a.delivery_mode === 'P2P' || a.p2p_message_id)
                        }))}
                        mode={(msg.from_email || '').toLowerCase() === currentUser.email.toLowerCase() ? 'sender' : 'receiver'}
                      />
                    </div>
                  )}

                  {/* Footer Buttons (Pill Shaped) */}
                  {!inlineReplyMode && (
                    <div className="px-5 pb-4 flex gap-3">
                      <button
                        onClick={() => openInlineReply("reply", msg)}
                        className="flex items-center gap-2 px-6 py-2 rounded-full border border-gray-300 dark:border-slate-600 text-sm font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Reply className="w-4 h-4 text-gray-500" />
                        Reply
                      </button>
                      <button
                        onClick={() => openInlineReply("replyAll", msg)}
                        className="flex items-center gap-2 px-6 py-2 rounded-full border border-gray-300 dark:border-slate-600 text-sm font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <ReplyAll className="w-4 h-4 text-gray-500" />
                        Reply all
                      </button>
                      <button
                        onClick={() => openInlineReply("forward", msg)}
                        className="flex items-center gap-2 px-6 py-2 rounded-full border border-gray-300 dark:border-slate-600 text-sm font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Forward className="w-4 h-4 text-gray-500" />
                        Forward
                      </button>
                    </div>
                  )}

                  {/* Inline Reply Editor */}
                  {inlineReplyMode && replyTarget?.id === msg.id && (
                    <div className="mx-4 mb-4 border border-gray-200 dark:border-slate-700 rounded-lg shadow-sm bg-white dark:bg-slate-900 overflow-hidden">
                      {/* ... Reuse the Reply Editor Logic (simplified for viewing) ... */}
                      <div className="flex items-center px-4 py-2 border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/50">
                        <Reply className="w-4 h-4 text-gray-400 mr-2" />
                        <span className="text-sm font-medium text-gray-600 dark:text-slate-300">
                          {inlineReplyMode === 'forward' ? `Forward to:` : `Reply to ${msg.from_name || msg.from_email}`}
                        </span>
                        {inlineReplyMode === 'forward' && (
                          <input
                            className="ml-2 flex-1 bg-transparent focus:outline-none text-sm"
                            placeholder="Recipient email"
                            value={forwardTo}
                            onChange={e => setForwardTo(e.target.value)}
                            autoFocus
                          />
                        )}
                      </div>

                      <textarea
                        ref={replyTextareaRef}
                        className="w-full p-4 text-sm focus:outline-none bg-transparent min-h-[150px]"
                        placeholder="Type your message..."
                        value={replyBody}
                        onChange={e => {
                          setReplyBody(e.target.value);
                          autoResizeReply();
                        }}
                      />

                      <div className="flex justify-between items-center px-4 py-3 border-t border-gray-100 dark:border-slate-800">
                        <div className="flex gap-2">
                          <button onClick={() => replyFileInputRef.current?.click()} className="p-2 hover:bg-gray-100 rounded text-gray-500"><Paperclip className="w-4 h-4" /></button>
                          <button onClick={() => setShowReplyEmojiPicker(!showReplyEmojiPicker)} className="p-2 hover:bg-gray-100 rounded text-gray-500"><Smile className="w-4 h-4" /></button>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setInlineReplyMode(null)} className="p-2 hover:bg-red-50 text-gray-500 hover:text-red-600 rounded"><Trash2 className="w-4 h-4" /></button>
                          <button onClick={sendInlineReply} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full">Send</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
    </div>
  );
}
