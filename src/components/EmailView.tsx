import { Star, Reply, Forward, Trash2, Archive, MoreVertical, Paperclip, X, Flag, Tag, Check, Smile, Printer, ExternalLink, Sparkles, MoreHorizontal, AlertCircle, ChevronDown, Mail, MessageSquare, ArrowLeft, Clock, CheckCircle, FolderOpen, ShieldAlert } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { emailService } from '../lib/emailService';
import { authService } from '../lib/authService';
import { Email } from '../types/email';
import { normalizeEmailBody } from '../utils/email';
import { p2pService } from '../lib/p2pService';
import { createManifest, manifestToBase64 } from '../lib/p2pManifest';
import { normalizeSubject, getRecipients, buildReferences, buildQuoteHeader, formatBody } from '../utils/replyLogic';
import toast from 'react-hot-toast';
import P2PAttachmentList from './P2PAttachmentList';

import { summaryService } from '../lib/summaryService';

const timeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
};
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

  // Email Summary State
  const [summary, setSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // Threading State
  const [threadMessages, setThreadMessages] = useState<Email[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [showDetails, setShowDetails] = useState<Record<number, boolean>>({});
  const [showMsgActions, setShowMsgActions] = useState<Record<number, boolean>>({});

  const attachments = Array.isArray(email?.attachments) ? email?.attachments : [];
  const formattedAttachments = attachments.map(a => ({
    ...a,
    size_bytes: a.size_bytes ?? a.size ?? 0,
    is_p2p: !!(a.delivery_mode === 'P2P' || a.p2p_message_id)
  }));

  const isThreaded = !!email && (threadMessages.length > 1 || 
                     (email.subject || '').toLowerCase().startsWith('re:') || 
                     (email.subject || '').toLowerCase().startsWith('fwd:'));

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
      from_name: currentUser.full_name || currentUser.name || currentUser.email,

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
    const lines = text.replace(/\r/g, "").split("\n");
    return lines.map(line => {
      const trimmed = line.trim();
      // Remove solo '0' or strings of zeros if they look like artifacts
      if (/^0+$/.test(trimmed) && trimmed.length < 5) return "";
      return line; // preserve blank lines and original spacing
    }).join("\n");
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
    // Replace block tags with newlines and others with a space to preserve spacing
    return current.replace(/<\/(div|p|br|tr|li|h[1-6]|blockquote)[^>]*>/gi, "\n")
                  .replace(/<(div|p|br|tr|li|h[1-6]|blockquote)[^>]*>/gi, "\n")
                  .replace(/<\/?[^>]+(>|$)/g, " ").trim();
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
  }, [email?.id, inlineReplyMode, threadMessages.length]);

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

  const handleMarkAsUnread = async () => {
    if (!email) return;
    try {
      await emailService.updateEmail(email.id, { user_id: currentUser.id, is_read: false });
      toast.success("Marked as unread");
      onRefresh?.();
      onClose?.();
    } catch (error) {
      console.error('Error marking email as unread:', error);
      toast.error("Failed to mark as unread");
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

  const [showReactions, setShowReactions] = useState<Record<number, boolean>>({});
  const [emailReactions, setEmailReactions] = useState<Record<number, string[]>>({});

  const addEmailReaction = (emailId: number, emoji: string) => {
    setEmailReactions(prev => {
      const current = prev[emailId] || [];
      if (current.includes(emoji)) return prev;
      return { ...prev, [emailId]: [...current, emoji] };
    });
    toast.success("Reaction added");
  };

  const handleShowOriginal = (msg: Email) => {
    const fromStr = `From: ${msg.from_name || ''} <${msg.from_email || ''}>`;
    const toEmailsText = Array.isArray(msg.to_emails) 
      ? msg.to_emails.map((t: any) => typeof t === 'string' ? t : (t?.email || t?.address || "")).join(', ') 
      : (msg.from_email === currentUser.email ? 'recipient' : 'me');
    const toStr = `To: ${toEmailsText}`;
    const dateStr = `Date: ${new Date(msg.sent_at || msg.created_at || '').toUTCString()}`;
    const subjectStr = `Subject: ${msg.subject || ''}`;
    
    const content = `${fromStr}\n${toStr}\n${dateStr}\n${subjectStr}\nMIME-Version: 1.0\nContent-Type: text/plain; charset=UTF-8\n\n${msg.body || ''}`;
    
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`<html><head><title>Original Message</title><style>body{font-family:monospace;white-space:pre-wrap;padding:20px;background:#f8f9fa;}</style></head><body>${content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</body></html>`);
      win.document.close();
    }
  };

  const handleDownloadEmail = (msg: Email) => {
    const fromStr = `From: ${msg.from_name || ''} <${msg.from_email || ''}>`;
    const toEmailsText = Array.isArray(msg.to_emails) 
      ? msg.to_emails.map((t: any) => typeof t === 'string' ? t : (t?.email || t?.address || "")).join(', ') 
      : (msg.from_email === currentUser.email ? 'recipient' : 'me');
    const toStr = `To: ${toEmailsText}`;
    const dateStr = `Date: ${new Date(msg.sent_at || msg.created_at || '').toUTCString()}`;
    const subjectStr = `Subject: ${msg.subject || ''}`;
    
    const content = `${fromStr}\n${toStr}\n${dateStr}\n${subjectStr}\nMIME-Version: 1.0\nContent-Type: text/plain; charset=UTF-8\n\n${msg.body || ''}`;
    
    const blob = new Blob([content], { type: 'message/rfc822' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(msg.subject || 'message').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.eml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [showReplyEmoji, setShowReplyEmoji] = useState(false);
  const replyEmojiRef = useRef<HTMLDivElement>(null);

  const insertReplyEmoji = (emoji: string) => {
    setReplyBody(prev => prev + emoji);
    setShowReplyEmoji(false);
    replyTextareaRef.current?.focus();
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (replyEmojiRef.current && !replyEmojiRef.current.contains(event.target as Node)) {
        setShowReplyEmoji(false);
      }
    };
    if (showReplyEmoji) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showReplyEmoji]);




  const [replyTarget, setReplyTarget] = useState<Email | null>(null);

  const openInlineReply = (mode: "reply" | "replyAll" | "forward", targetMsg?: Email) => {
    const msg = targetMsg || email;
    if (!msg) return;

    setReplyTarget(msg); // Track which message we are replying to
    setInlineReplyMode(mode);


    if (mode === 'forward') {
      // For forward, include original message content
      const quoteHeader = buildQuoteHeader(msg, mode);
      const plainBody = stripHtmlTags(htmlToNewlines(msg.body || ""));
      const quotedBody = formatBody(sanitizeBody(plainBody) || "", mode);
      const originalContent = quoteHeader + quotedBody;
      
      setReplyBody(originalContent);
      setForwardTo(''); // Reset forward recipient
    } else if (mode === 'reply' || mode === 'replyAll') {
      const quoteHeader = buildQuoteHeader(msg, mode);
      const plainBody = stripHtmlTags(htmlToNewlines(msg.body || ""));
      const quotedBody = formatBody(sanitizeBody(plainBody) || "", mode);
      const originalContent = quoteHeader + quotedBody;
      setReplyBody(originalContent);
    } else {
      setReplyBody(""); // fallback
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

  const getInitials = (name: any) => {
    const str = typeof name === 'string' ? name : (name?.full_name || name?.email || '');
    if (!str || typeof str !== 'string') return '';
    return str.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
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
    <div className="h-full flex flex-col bg-white dark:bg-slate-950 overflow-hidden">
      {/* TOOLBAR HEADER */}
      <div className="sticky top-0 z-[80] bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between px-4 h-14 flex-shrink-0 overflow-visible">
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onClose?.();
            }}
            className="p-2 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors"
            title="Back to inbox"
          >
            <ArrowLeft className="w-[18px] h-[18px]" />
          </button>

          <div className="flex items-center gap-0.5 sm:gap-1">
            <button onClick={handleArchive} className="p-2 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition" title="Archive">
              <Archive className="w-[18px] h-[18px]" />
            </button>
            <button onClick={handleSpam} className="p-2 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition" title="Report spam">
              <ShieldAlert className="w-[18px] h-[18px]" />
            </button>
            <button onClick={handleDelete} className="p-2 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition" title="Delete">
              <Trash2 className="w-[18px] h-[18px]" />
            </button>
          </div>

          <div className="h-4 w-px bg-gray-300 dark:bg-slate-700 mx-1 sm:mx-2"></div>

          <div className="flex items-center gap-0.5 sm:gap-1">
            <button onClick={handleMarkAsUnread} className="p-2 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition" title="Mark as unread">
              <Mail className="w-[18px] h-[18px]" />
            </button>
            <button className="p-2 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition" title="Snooze">
              <Clock className="w-[18px] h-[18px]" />
            </button>
            <button className="p-2 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition" title="Add to tasks">
              <CheckCircle className="w-[18px] h-[18px]" />
            </button>
          </div>

          <div className="h-4 w-px bg-gray-300 dark:bg-slate-700 mx-1 sm:mx-2"></div>

          <button className="p-2 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition" title="Move to">
            <FolderOpen className="w-[18px] h-[18px]" />
          </button>
          {/* LABELS */}
          <div className="relative" ref={labelDropdownRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowActions(false); setShowDetails({}); setShowMsgActions({}); setShowLabelDropdown(!showLabelDropdown); }}
              className="p-2 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition"
              title="Labels"
            >
              <Tag className="w-[18px] h-[18px]" />
            </button>
            {showLabelDropdown && (
              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-2xl py-2 z-[100] min-w-[200px] animate-in fade-in slide-in-from-top-1">
                <div className="px-4 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-widest">Label as:</div>
                <div className="max-h-[300px] overflow-y-auto">
                  {labels.length === 0 ? (
                    <div className="px-4 py-2 text-sm text-gray-500 italic">No labels found</div>
                  ) : (
                    labels.map((label) => {
                      const isApplied = email?.labels?.some((l: any) => l.name === label.name);
                      return (
                        <button
                          key={label.id}
                          onClick={() => { handleToggleLabel(label); setShowLabelDropdown(false); }}
                          className="w-full flex items-center px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 group whitespace-nowrap"
                        >
                          <div className={`w-3.5 h-3.5 rounded border border-gray-300 dark:border-slate-700 flex items-center justify-center transition-colors ${isApplied ? 'bg-blue-600 border-blue-600' : ''}`}>
                            {isApplied && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <span className="text-sm font-medium text-gray-700 dark:text-slate-200">{label.name}</span>
                          <div className="flex-1" />
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: label.color }} />
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* MORE */}
          <div className="relative" ref={dropdownRef}>
            <button onClick={(e) => { e.stopPropagation(); setShowLabelDropdown(false); setShowActions(false); setShowDetails({}); setShowMsgActions({}); setShowActions(!showActions); }} className="p-2 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition" title="More">
              <MoreVertical className="w-[18px] h-[18px]" />
            </button>
            {showActions && (
              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-2xl py-2 z-[100] min-w-[200px] animate-in fade-in slide-in-from-top-1 text-slate-700 dark:text-slate-200 font-sans">
                <button onClick={() => { toggleStar(); setShowActions(false); }} className="w-full flex items-center px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 whitespace-nowrap"><div className="w-4 flex items-center justify-center"><Star className={`w-3.5 h-3.5 opacity-80 ${starred ? 'text-yellow-500 fill-yellow-500' : ''}`} /></div> Add star</button>
                <button onClick={() => { handleMarkAsUnread(); setShowActions(false); }} className="w-full flex items-center px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 whitespace-nowrap"><div className="w-4 flex items-center justify-center"><Mail className="w-3.5 h-3.5 opacity-80" /></div> Mark as unread</button>
                <button onClick={() => { setShowActions(false); }} className="w-full flex items-center px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 whitespace-nowrap"><div className="w-4 flex items-center justify-center"><Flag className="w-3.5 h-3.5 opacity-80" /></div> Mark as important</button>
                <div className="h-px bg-gray-100 dark:bg-slate-800 my-1"></div>
                <button onClick={() => { setShowActions(false); handleDownloadEmail(email); }} className="w-full flex items-center px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 whitespace-nowrap"><div className="w-4 flex items-center justify-center"><Paperclip className="w-3.5 h-3.5 opacity-80" /></div> Download message</button>
                <button onClick={() => { setShowActions(false); handleShowOriginal(email); }} className="w-full flex items-center px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 whitespace-nowrap"><div className="w-4 flex items-center justify-center"><ExternalLink className="w-3.5 h-3.5 opacity-80" /></div> Show original</button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1">
          <button onClick={() => window.print()} className="p-2 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition" title="Print all">
            <Printer className="w-4 h-4" />
          </button>
          <button onClick={() => window.open(window.location.href, '_blank')} className="p-2 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition" title="In new window">
            <ExternalLink className="w-4 h-4" />
          </button>
          <button onClick={toggleStar} className="p-2 text-gray-600 dark:text-slate-400 hover:text-yellow-500 rounded-full transition" title="Star">
            <Star className={`w-4 h-4 ${starred ? 'text-yellow-500 fill-yellow-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* CONTENT SCROLL AREA */}
      <div className="flex-1 overflow-y-auto">
        {/* SUBJECT HEADER */}
        <div className="px-6 pt-6 pb-2">

          {/* Delivery Status Banner */}
          {isSender && email.delivery_status === 'failed' && (
            <div className="mb-6 mx-2 p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl flex items-start gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full text-red-600 dark:text-red-400">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">Message not delivered</h3>
                <p className="text-sm text-red-700 dark:text-red-400 mt-0.5">
                  The email server (Postfix/SMTP) returned an error:
                  <span className="font-mono ml-1 text-red-900 dark:text-red-200 block mt-1 p-2 bg-white/50 dark:bg-black/20 rounded border border-red-100/50 dark:border-red-900/50">
                    {email.smtp_error || "Unknown delivery failure. Please check server logs or contact support."}
                  </span>
                </p>
              </div>
            </div>
          )}          {/* Subject Header Section */}
          <div className="mb-8 px-2 space-y-4">
            <h1 className="text-2xl lg:text-3xl font-normal text-gray-900 dark:text-white leading-tight break-words">
              {(email.subject || "(No subject)").replace(/^(Re|Fwd|re|fwd)(\[\d+\])?:?\s*/i, '')}
            </h1>
            
            <div className="flex flex-wrap items-center gap-3">
              {email.labels?.map(label => (
                <span 
                  key={label.id} 
                  className="px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors shadow-sm"
                  style={{ 
                    backgroundColor: `${label.color}15`, 
                    borderColor: `${label.color}30`,
                    color: label.color 
                  }}
                >
                  {label.name}
                </span>
              ))}
              
              {/* AI Summary Section - Inline if possible */}
              {!summary && (
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
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-bold transition-all border border-blue-100 dark:border-blue-800 disabled:opacity-70 disabled:cursor-wait"
                >
                  {isSummarizing ? (
                    <>
                      <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <span>Summarizing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-blue-600" />
                      <span>Summarize</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {summary && (
              <div className="bg-blue-50/40 dark:bg-slate-800/40 rounded-2xl p-5 border border-blue-100/50 dark:border-slate-700 backdrop-blur-sm animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-widest">AI SUMMARY</span>
                  </div>
                  <button onClick={() => setSummary(null)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
                  {summary}
                </p>
              </div>
            )}
          </div>
          {/* MESSAGE DISPLAY */}
          {!isThreaded ? (
            /* REGULAR VIEW (Single Message) */
            <div className="animate-message-appear bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden p-4 sm:p-6 lg:p-8">
              {/* Header: Sender Info & Actions */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                    {getInitials(isSender ? (currentUser.full_name || currentUser.name || email.from_name) : (email.from_name || email.from_email || ''))}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                       <span className="font-bold text-gray-900 dark:text-white">
                        {getSenderName(isSender ? (currentUser.full_name || currentUser.name || email.from_name) : email.from_name, email.from_email)}
                      </span>
                      <span className="text-xs text-gray-500 font-normal">
                        &lt;{email.from_email}&gt;
                      </span>
                    </div>
                    <div className="relative group/details">
                      <button 
                        onClick={() => setShowDetails(prev => ({ ...prev, [Number(email.id)]: !prev[Number(email.id)] }))}
                        className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-900 transition-colors"
                      >
                        to {isSender ? 'recipient' : 'me'}
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      
                      {showDetails[Number(email.id)] && (
                        <div className="absolute left-0 top-full mt-2 w-[420px] bg-white dark:bg-slate-900 rounded shadow-2xl border border-gray-200 dark:border-slate-800 p-5 z-50 animate-in fade-in slide-in-from-top-1">
                          <div className="grid grid-cols-[90px_1fr] gap-x-4 gap-y-2 text-[11px] text-gray-700 dark:text-slate-300 font-sans leading-relaxed">
                             <span className="text-gray-500 text-right font-normal">from:</span>
                             <div className="flex flex-wrap items-center gap-1.5 overflow-hidden">
                                <span className="font-bold text-gray-900 dark:text-white truncate">{email.from_name}</span>
                                <span className="text-gray-500 truncate">&lt;{email.from_email}&gt;</span>
                             </div>
                             
                             <span className="text-gray-500 text-right font-normal">to:</span>
                             <span className="text-gray-900 dark:text-white break-words">
                               {Array.isArray(email.to_emails) 
                                 ? email.to_emails.map((t: any) => typeof t === 'string' ? t : (t?.email || t?.address || "")).join(', ') 
                                 : (isSender ? 'recipient' : 'me')}
                             </span>
                             
                             <span className="text-gray-500 text-right font-normal">date:</span>
                             <span className="text-gray-900 dark:text-white">{formatFullDate(email.sent_at || email.created_at || '')}</span>
                             
                             <span className="text-gray-500 text-right font-normal">subject:</span>
                             <span className="text-gray-900 dark:text-white font-medium">{email.subject}</span>

                             <span className="text-gray-500 text-right font-normal">mailed-by:</span>
                             <span className="text-gray-900 dark:text-white">{(email.from_email || "").split('@')[1] || "jeemail.in"}</span>

                             <span className="text-gray-500 text-right font-normal">signed-by:</span>
                             <span className="text-gray-900 dark:text-white">{(email.from_email || "").split('@')[1] || "jeemail.in"}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 sm:gap-3">
                  <span className="text-xs text-gray-500 font-medium hidden sm:inline-block">
                    {formatShortDate(email.sent_at || email.created_at || '')}
                    <span className="ml-1 opacity-60 font-normal">({timeAgo(new Date(email.sent_at || email.created_at || ''))})</span>
                  </span>
                  
                  <div className="flex items-center gap-0.5">
                    <button onClick={toggleStar} className="p-2 text-gray-400 hover:text-yellow-500 transition-colors">
                        <Star className={`w-4 h-4 ${starred ? 'text-yellow-500 fill-yellow-500' : ''}`} />
                    </button>
                    <div className="relative">
                      <button onClick={() => setShowReactions(prev => ({ ...prev, [Number(email.id)]: !prev[Number(email.id)] }))} className="p-2 text-gray-400 hover:text-gray-900 transition-colors" title="Add reaction">
                          <Smile className="w-4 h-4" />
                      </button>
                      {showReactions[Number(email.id)] && (
                        <div className="absolute top-full right-0 mt-1 p-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-full shadow-2xl z-[110] flex gap-1 animate-in fade-in zoom-in-75 duration-200">
                          {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
                            <button key={emoji} onClick={() => { addEmailReaction(Number(email.id), emoji); setShowReactions({}); }} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors text-lg">{emoji}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => openInlineReply("reply")} className="p-2 text-gray-400 hover:text-gray-900 transition-colors">
                        <Reply className="w-4 h-4" />
                    </button>

                    <div className="relative">
                        <button onClick={() => setShowMsgActions(prev => ({ ...prev, [Number(email.id)]: !prev[Number(email.id)] }))} className="p-2 text-gray-400 hover:text-gray-900 transition-colors">
                            <MoreVertical className="w-4 h-4" />
                        </button>
                        {showMsgActions[Number(email.id)] && (
                            <div className="absolute right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-2xl py-2 z-[60] min-w-[210px] text-[13px] animate-in fade-in slide-in-from-top-1 text-slate-700 dark:text-slate-200 font-sans">
                                <button onClick={() => { setShowMsgActions({}); openInlineReply("reply"); }} className="w-full flex items-center px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 leading-none whitespace-nowrap"><div className="w-4 flex items-center justify-center"><Reply className="w-3.5 h-3.5 opacity-80" /></div> Reply</button>
                                <button onClick={() => { setShowMsgActions({}); openInlineReply("forward"); }} className="w-full flex items-center px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 leading-none whitespace-nowrap"><div className="w-4 flex items-center justify-center"><Forward className="w-3.5 h-3.5 opacity-80" /></div> Forward</button>
                                <div className="h-px bg-gray-100 dark:bg-slate-800 my-1"></div>
                                <button onClick={() => { setShowMsgActions({}); handleDelete(); }} className="w-full flex items-center px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 leading-none whitespace-nowrap"><div className="w-4 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5 opacity-80" /></div> Delete this message</button>
                                <button onClick={() => { setShowMsgActions({}); handleMarkAsUnread(); }} className="w-full flex items-center px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 leading-none whitespace-nowrap"><div className="w-4 flex items-center justify-center"><Mail className="w-3.5 h-3.5 opacity-80" /></div> Mark as unread</button>
                                <div className="h-px bg-gray-100 dark:bg-slate-800 my-1"></div>
                                <button onClick={() => { setShowMsgActions({}); handleSpam(); }} className="w-full flex items-center px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 leading-none whitespace-nowrap"><div className="w-4 flex items-center justify-center"><ShieldAlert className="w-3.5 h-3.5 opacity-80" /></div> Report spam</button>
                                <div className="h-px bg-gray-100 dark:bg-slate-800 my-1"></div>
                                <button onClick={() => { setShowMsgActions({}); }} className="w-full flex items-center px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 leading-none whitespace-nowrap"><div className="w-4 flex items-center justify-center"><MessageSquare className="w-3.5 h-3.5 opacity-80" /></div> Filter messages like this</button>
                                <button onClick={() => { setShowMsgActions({}); }} className="w-full flex items-center px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 leading-none whitespace-nowrap"><div className="w-4 flex items-center justify-center"><ExternalLink className="w-3.5 h-3.5 opacity-80" /></div> Translate message</button>
                                <button onClick={() => { setShowMsgActions({}); window.print(); }} className="w-full flex items-center px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 leading-none whitespace-nowrap"><div className="w-4 flex items-center justify-center"><Printer className="w-3.5 h-3.5 opacity-80" /></div> Print</button>
                                <button onClick={() => { setShowMsgActions({}); handleDownloadEmail(email); }} className="w-full flex items-center px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 leading-none whitespace-nowrap"><div className="w-4 flex items-center justify-center"><Paperclip className="w-3.5 h-3.5 opacity-80" /></div> Download message</button>
                                <button onClick={() => { setShowMsgActions({}); handleShowOriginal(email); }} className="w-full flex items-center px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 leading-none whitespace-nowrap"><div className="w-4 flex items-center justify-center"><ExternalLink className="w-3.5 h-3.5 opacity-80" /></div> Show original</button>
                            </div>
                        )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Reactions */}
              {emailReactions[Number(email.id)] && emailReactions[Number(email.id)].length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {emailReactions[Number(email.id)].map((emoji, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-3 py-1 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-full text-sm shadow-sm animate-in zoom-in-50 duration-200">
                      <span>{emoji}</span>
                      <span className="text-[10px] font-bold text-gray-500">1</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Body */}
              <div className="prose dark:prose-invert max-w-none break-words text-gray-800 dark:text-slate-200 leading-relaxed font-sans mb-8">
                 <div dangerouslySetInnerHTML={{ __html: bodyToHtml(email.body || email.text_preview || '') }} />
              </div>

              {/* Attachments */}
              {attachments.length > 0 && (
                <div className="mt-8 pt-6 border-t border-gray-100 dark:border-slate-800">
                  <P2PAttachmentList
                    emailId={String(email.id)}
                    senderEmail={(email.from_email || '').toLowerCase().trim()}
                    attachments={formattedAttachments}
                    mode={isSender ? 'sender' : 'receiver'}
                  />
                </div>
              )}

              {/* Action Buttons */}
              {!inlineReplyMode && (
                <div className="mt-8 flex gap-3">
                   <button onClick={() => openInlineReply("reply")} className="flex items-center gap-2 px-8 py-2.5 rounded-full border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors font-medium">
                      <Reply className="w-4 h-4" /> Reply
                    </button>
                    <button onClick={() => openInlineReply("forward")} className="flex items-center gap-2 px-8 py-2.5 rounded-full border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors font-medium">
                      <Forward className="w-4 h-4" /> Forward
                    </button>
                </div>
              )}

              {/* Reply Editor */}
              {inlineReplyMode && (
                <div className="mt-6 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-slate-900">
                    <div className="flex items-center px-4 py-2 border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/50">
                      <Reply className="w-4 h-4 text-gray-400 mr-2" />
                      <span className="text-sm font-medium text-gray-600 dark:text-slate-300">
                        {inlineReplyMode === 'forward' ? 'Forwarding email' : `Replying to ${email.from_name || email.from_email}`}
                      </span>
                    </div>

                    <textarea
                      ref={replyTextareaRef}
                      className="w-full p-4 text-sm focus:outline-none bg-transparent min-h-[150px]"
                      placeholder="Type your message..."
                      value={replyBody}
                      onChange={e => { setReplyBody(e.target.value); autoResizeReply(); }}
                      autoFocus
                    />

                    <div className="flex justify-between items-center px-4 py-3 border-t border-gray-100 dark:border-slate-800">
                      <div className="flex gap-2 relative" ref={replyEmojiRef}>
                        <button onClick={() => setInlineReplyMode(null)} className="p-2 hover:bg-red-50 text-gray-500 hover:text-red-600 rounded" title="Discard"><Trash2 className="w-4 h-4" /></button>
                        <button onClick={() => setShowReplyEmoji(!showReplyEmoji)} className="p-2 hover:bg-gray-100 text-gray-500 hover:text-gray-700 rounded" title="Insert Emoji"><Smile className="w-4 h-4" /></button>
                        
                        {showReplyEmoji && (
                          <div className="absolute bottom-full left-0 mb-2 p-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl z-[110] w-[215px] animate-in fade-in slide-in-from-bottom-2">
                             <div className="grid grid-cols-6 gap-1">
                               {['😊', '😂', '😍', '👍', '🙏', '🎉', '😎', '😢', '🔥', '✨', '💯', '🤔', '❤️', '✔️', '🙌', '👏', '🚀', '⭐'].map(e => (
                                 <button key={e} onClick={() => insertReplyEmoji(e)} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors text-lg">{e}</button>
                               ))}
                             </div>
                          </div>
                        )}
                      </div>
                      <button onClick={sendInlineReply} className="px-8 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-full shadow-lg">Send</button>
                    </div>
                </div>
              )}
            </div>
          ) : (
            /* THREADED VIEW (Conversations) */
            <div className="space-y-4">
              {threadMessages.map((msg) => {
                const isExpanded = expandedIds.has(Number(msg.id));
                const normalizedBody = normalizeEmailBody(msg.body ?? msg.text_preview ?? "");
                const cleanedBody = normalizedBody.split("\n").filter(line => line.trim() !== "0").join("\n");
                const normalizedHtml = bodyToHtml(cleanedBody);
                const { main: mainHtml, quoted: quotedHtml } = splitQuotedHtml(normalizedHtml);
                const showQuoted = quotedExpandedIds.has(Number(msg.id));
                const msgAttachments = Array.isArray(msg.attachments) ? msg.attachments.map((a: any) => ({
                  ...a,
                  size_bytes: a.size || 0,
                  is_p2p: !!(a.delivery_mode === 'P2P' || a.p2p_message_id)
                })) : [];

                if (!isExpanded) {
                  return (
                    <div
                      key={msg.id}
                      onClick={() => toggleMessageExpand(Number(msg.id))}
                      className="group bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-800 rounded-xl flex items-center px-5 py-4 cursor-pointer transition-all hover:shadow-md animate-message-appear"
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-gray-500 dark:text-gray-400 font-bold text-xs mr-4">
                        {getInitials(msg.from_name || msg.from_email || '')}
                      </div>
                      <div className="flex-1 min-w-0 flex items-center gap-4">
                        <span className="font-semibold text-sm text-gray-900 dark:text-white w-48 truncate">
                          {getSenderName(msg.from_name, msg.from_email)}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-slate-400 truncate flex-1 font-normal italic">
                          {sanitizeBody(msg.body ?? msg.text_preview ?? "").substring(0, 80)}...
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {msg.has_attachments && <Paperclip className="w-4 h-4 text-gray-400" />}
                        <div className="text-xs text-gray-500 font-medium whitespace-nowrap bg-gray-50 dark:bg-slate-800 px-2 py-1 rounded">
                          {formatShortDate(msg.sent_at || msg.created_at || '')}
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className="relative group/msg animate-message-appear">
                    {/* Thread link line */}
                    <div className="thread-line" />

                      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden transition-shadow hover:shadow-md relative z-10">
                        {/* Header: Sender Info & Date */}
                        <div className="px-5 py-4 cursor-pointer flex items-center justify-between" onClick={() => toggleMessageExpand(Number(msg.id))}>
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm shadow-sm">
                              {getInitials((msg.from_email || '').toLowerCase() === myEmail.toLowerCase() ? (currentUser.full_name || currentUser.name || msg.from_name) : (msg.from_name || msg.from_email || ''))}
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-sm text-gray-900 dark:text-white leading-none">
                                  {(msg.from_email || '').toLowerCase() === myEmail.toLowerCase() 
                                    ? getSenderName(currentUser.full_name || currentUser.name || msg.from_name, currentUser.email) 
                                    : getSenderName(msg.from_name, msg.from_email)}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-slate-400 font-normal">&lt;{msg.from_email || ''}&gt;</span>
                              </div>
                              <div className="relative group/details">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowDetails(prev => ({ ...prev, [Number(msg.id)]: !prev[Number(msg.id)] }));
                                  }}
                                  className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-900 transition-colors"
                                >
                                  to {(msg.from_email || '').toLowerCase() === myEmail.toLowerCase() ? 'recipient' : 'me'}
                                  <ChevronDown className="w-3 h-3" />
                                </button>
                                                                {showDetails[Number(msg.id)] && (
                                   <div onClick={(e) => e.stopPropagation()} className="absolute left-0 top-full mt-2 w-[420px] bg-white dark:bg-slate-900 rounded shadow-2xl border border-gray-200 dark:border-slate-800 p-5 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                     <div className="grid grid-cols-[90px_1fr] gap-x-4 gap-y-2 text-[11px] text-gray-700 dark:text-slate-300 font-sans leading-relaxed">
                                       <span className="text-gray-500 text-right font-normal">from:</span>
                                       <div className="flex flex-wrap items-center gap-1.5 overflow-hidden">
                                         <span className="font-bold text-gray-900 dark:text-white truncate">{msg.from_name || msg.from_email}</span>
                                         <span className="text-gray-500 truncate">&lt;{msg.from_email || ''}&gt;</span>
                                       </div>
 
                                       <span className="text-gray-500 text-right font-normal">to:</span>
                                       <span className="text-gray-900 dark:text-white break-words font-medium">
                                         {Array.isArray(msg.to_emails) 
                                           ? msg.to_emails.map((t: any) => typeof t === 'string' ? t : (t?.email || t?.address || t?.full_name || "")).join(', ') 
                                           : ((msg.from_email || '').toLowerCase() === myEmail.toLowerCase() ? 'recipient' : 'me')}
                                       </span>
 
                                       <span className="text-gray-500 text-right font-normal">date:</span>
                                       <span className="text-gray-900 dark:text-white">{formatFullDate(msg.sent_at || msg.created_at || '')}</span>

                                       <span className="text-gray-500 text-right font-normal">subject:</span>
                                       <span className="text-gray-900 dark:text-white font-medium">{msg.subject}</span>

                                       <span className="text-gray-500 text-right font-normal">mailed-by:</span>
                                       <span className="text-gray-900 dark:text-white">{(msg.from_email || "").split('@')[1] || "jeemail.in"}</span>

                                       <span className="text-gray-500 text-right font-normal">signed-by:</span>
                                       <span className="text-gray-900 dark:text-white">{(msg.from_email || "").split('@')[1] || "jeemail.in"}</span>
                                     </div>
                                   </div>
                                 )}
                              </div>
                            </div>
                          </div>

                          {/* Right Side Thread Actions */}
                          <div className="flex items-center gap-1 sm:gap-2">
                             <span className="text-[11px] text-gray-500 whitespace-nowrap hidden lg:inline-block">
                                {formatShortDate(msg.sent_at || msg.created_at || '')}
                                <span className="ml-1 opacity-60">({timeAgo(new Date(msg.sent_at || msg.created_at || ''))})</span>
                             </span>

                             <button className="p-1.5 text-gray-400 hover:text-yellow-500 transition-colors">
                                <Star className="w-4 h-4" />
                             </button>
                             <button className="p-1.5 text-gray-400 hover:text-gray-900 transition-colors text-right"><Reply className="w-4 h-4" /></button>

                             <div className="relative">
                                 <button 
                                     onClick={(e) => { 
                                         e.stopPropagation(); 
                                         setShowMsgActions(prev => ({ ...prev, [Number(msg.id)]: !prev[Number(msg.id)] })); 
                                     }} 
                                     className="p-1.5 text-gray-400 hover:text-gray-900 transition-colors"
                                 >
                                     <MoreVertical className="w-4 h-4" />
                                 </button>
                                 {showMsgActions[Number(msg.id)] && (
                                     <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-2xl py-2 z-[60] min-w-[220px] text-[13px] animate-in fade-in slide-in-from-top-1 text-slate-700 dark:text-slate-200 font-sans">
                                         <button onClick={() => { setShowMsgActions({}); openInlineReply("reply", msg); }} className="w-full flex items-center px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 leading-none"><Reply className="w-3 h-3 opacity-70" /> Reply</button>
                                         <button onClick={() => { setShowMsgActions({}); openInlineReply("forward", msg); }} className="w-full flex items-center px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 leading-none"><Forward className="w-3 h-3 opacity-70" /> Forward</button>
                                         <div className="h-px bg-gray-100 dark:bg-slate-800 my-1"></div>
                                         <button onClick={() => { setShowMsgActions({}); handleDelete(); }} className="w-full flex items-center px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 leading-none"><Trash2 className="w-3 h-3 opacity-70" /> Delete this message</button>
                                         <button onClick={() => { setShowMsgActions({}); handleMarkAsUnread(); }} className="w-full flex items-center px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 leading-none"><Mail className="w-3 h-3 opacity-70" /> Mark as unread</button>
                                         <div className="h-px bg-gray-100 dark:bg-slate-800 my-1"></div>
                                         <button onClick={() => { setShowMsgActions({}); handleSpam(); }} className="w-full flex items-center px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 leading-none"><ShieldAlert className="w-3 h-3 opacity-70" /> Report spam</button>
                                         <div className="h-px bg-gray-100 dark:bg-slate-800 my-1"></div>
                                         <button onClick={() => { setShowMsgActions({}); }} className="w-full flex items-center px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 leading-none"><MessageSquare className="w-3 h-3 opacity-70" /> Filter messages like this</button>
                                         <button onClick={() => { setShowMsgActions({}); }} className="w-full flex items-center px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 leading-none"><ExternalLink className="w-3 h-3 opacity-70 px-[1px]" /> Translate message</button>
                                         <button onClick={() => { setShowMsgActions({}); window.print(); }} className="w-full flex items-center px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 leading-none"><Printer className="w-3 h-3 opacity-70" /> Print</button>
                                         <button onClick={() => { setShowMsgActions({}); handleDownloadEmail(msg); }} className="w-full flex items-center px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 leading-none whitespace-nowrap"><div className="w-4 flex items-center justify-center"><Paperclip className="w-3.5 h-3.5 opacity-80" /></div> Download message</button>
                                         <button onClick={() => { setShowMsgActions({}); handleShowOriginal(msg); }} className="w-full flex items-center px-4 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors gap-3 leading-none whitespace-nowrap"><div className="w-4 flex items-center justify-center"><ExternalLink className="w-3.5 h-3.5 opacity-80" /></div> Show original</button>
                                     </div>
                                 )}
                             </div>
                          </div>
                        </div>

                        {/* Reactions */}
                        {emailReactions[Number(msg.id)] && emailReactions[Number(msg.id)].length > 0 && (
                          <div className="px-5 pb-2 flex flex-wrap gap-2">
                             {emailReactions[Number(msg.id)].map((emoji, i) => (
                               <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-full text-xs shadow-sm animate-in zoom-in-50 duration-200">
                                 <span>{emoji}</span>
                                 <span className="text-[9px] font-bold text-gray-400">1</span>
                               </div>
                             ))}
                          </div>
                        )}

                        {/* Content */}
                        <div className="px-5 pb-6 text-sm text-gray-800 dark:text-slate-200 leading-relaxed font-sans">
                          <div className="prose dark:prose-invert max-w-none break-words" dangerouslySetInnerHTML={{ __html: mainHtml }} />
                          {quotedHtml && (
                            <div className="mt-4">
                              {!showQuoted ? (
                                <button onClick={(e) => { e.stopPropagation(); toggleQuoted(Number(msg.id)); }} className="w-8 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded text-gray-500 dark:text-slate-400"><MoreHorizontal className="w-4 h-4" /></button>
                              ) : (
                                <div className="mt-2 text-gray-500 dark:text-slate-400 pl-2 border-l-2 border-gray-200 dark:border-slate-700 text-xs opacity-80" dangerouslySetInnerHTML={{ __html: quotedHtml }} />
                              )}
                            </div>
                          )}
                        </div>

                        {msgAttachments.length > 0 && (
                          <div className="px-5 pb-6 border-t border-gray-100 dark:border-slate-800 pt-4">
                            <P2PAttachmentList
                              emailId={String(msg.id)}
                              senderEmail={(msg.from_email || '').toLowerCase().trim()}
                              attachments={msgAttachments}
                              mode={(msg.from_email || '').toLowerCase() === currentUser.email.toLowerCase() ? 'sender' : 'receiver'}
                            />
                          </div>
                        )}

                        {!inlineReplyMode && (
                          <div className="px-5 pb-4 flex gap-3">
                            <button onClick={() => openInlineReply("reply", msg)} className="flex items-center gap-2 px-6 py-2 rounded-full border border-gray-300 dark:border-slate-600 text-sm font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"><Reply className="w-4 h-4" /> Reply</button>
                          </div>
                        )}

                        {inlineReplyMode && replyTarget?.id === msg.id && (
                          <div className="mx-4 mb-4 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-slate-900">
                            <div className="flex items-center px-4 py-2 border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/50">
                              <Reply className="w-4 h-4 text-gray-400 mr-2" />
                              <span className="text-sm font-medium text-gray-600 dark:text-slate-300">{inlineReplyMode === 'forward' ? 'Forwarding email' : `Replying to ${msg.from_name || msg.from_email || ''}`}</span>
                            </div>
                            <textarea ref={replyTextareaRef} className="w-full p-4 text-sm focus:outline-none bg-transparent min-h-[150px]" placeholder="Type your message..." value={replyBody} onChange={e => { setReplyBody(e.target.value); autoResizeReply(); }} autoFocus />
                            <div className="flex justify-between items-center px-4 py-3 border-t border-gray-100 dark:border-slate-800">
                              <div className="flex gap-2"><button onClick={() => setInlineReplyMode(null)} className="p-2 hover:bg-red-50 text-gray-500 hover:text-red-600 rounded"><Trash2 className="w-4 h-4" /></button></div>
                              <button onClick={sendInlineReply} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-full">Send</button>
                            </div>
                          </div>
                        )}
                      </div>
                  </div>
                );
              })}
            </div>
          )}

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
          
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
