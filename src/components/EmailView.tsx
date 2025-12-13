// src/components/EmailView.tsx
import { Star, Reply, ReplyAll, Forward, Trash2, Archive, MoreVertical, Paperclip, X, Flag, FileEdit, Tag, Check } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { emailService } from '../lib/emailService';
import { authService } from '../lib/authService';
import { Email } from '../types/email';
import { normalizeEmailBody } from '../utils/email';
import { collapseForwarded } from '../lib/collapseForwarded';

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

export default function EmailView({ email, onClose, onRefresh, onCompose, labels = [] }: EmailViewProps) {
  console.log("EMAIL JSON >>>", email);

  const [starred, setStarred] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showQuoted, setShowQuoted] = useState(false);
  const currentUser = authService.getCurrentUser();
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(initialConfirmState);
  const [showLabelDropdown, setShowLabelDropdown] = useState(false);
  const labelDropdownRef = useRef<HTMLDivElement>(null);

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
  const blockTags = ['div','p','li','blockquote','tr','table','thead','tbody','tfoot','section','article','header','footer','aside','figure','figcaption','h1','h2','h3','h4','h5','h6'];
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

useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: "smooth" });
}, [email?.id, inlineReplyMode]);

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
    setConfirmDialog(prev => ({ ...initialConfirmState, ...opts, open: true }));
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

  const handleDelete = () => {
    if (!email || !currentUser) return;

    openConfirmDialog({
      title: "Delete this email?",
      message: "This email will be moved to Trash.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",

      onConfirm: async () => {
        try {
          const { data: folders } = await emailService.getFolders(currentUser.id);

          // Find Trash folder
          const trashFolder = folders?.find(
            (f: any) => (f.name || '').toString().toLowerCase() === "trash" || f.system_box === "trash"
          );

          if (!trashFolder) {
            alert("Trash folder not found. Please create a Trash folder.");
            return;
          }

          const { error } = await emailService.moveEmail(
            Number(email.id),
            currentUser.id,
            Number(trashFolder.id)
          );

          if (error) throw error;

          onRefresh?.();
          onClose?.();
        } catch (err) {
          console.error("Delete error:", err);
          alert("Failed to delete email.");
        }
      }
    });
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

const openInlineReply = (mode: "reply" | "replyAll" | "forward") => {
  if (!email) return;
  setInlineReplyMode(mode);
  setReplyBody(""); // forward & reply start clean
};

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
  if (!replyBody.trim() || !email) return;

  const me = currentUser.email;
  let toEmails: string[] = [];

  // Gmail-style recipient logic
  if (inlineReplyMode === "replyAll") {
    toEmails = Array.from(
      new Set([
        email.from_email,
        ...(email.to_emails || []),
        ...(email.cc_emails || [])
      ])
    ).filter(e => e && e !== me);
  } else {
    if (email.from_email !== me) {
      toEmails = [email.from_email];
    } else {
      toEmails = (email.to_emails || []).filter(e => e !== me);
    }
  }

  // 🚨 THIS FIXES YOUR CRASH
  if (toEmails.length === 0) {
    alert("No valid recipient to reply to");
    return;
  }

  const references = buildReferencesHeader(email);

await emailService.createEmail({
  user_id: currentUser.id,

  from_email: currentUser.email,
  from_name: currentUser.name || currentUser.email,

  to_emails: toEmails
    .map(e => typeof e === "string" ? e : e?.email)
    .filter(Boolean),

  cc_emails: [],

  subject: email.subject?.startsWith("Re:")
    ? email.subject
    : `Re: ${email.subject || ""}`,

  body: replyBody + buildQuotedHtml(email),

  in_reply_to: email.message_id || email.id,
  references: buildReferencesHeader(email),
  thread_id: email.thread_id ?? email.id,

  is_draft: false,
});

  setInlineReplyMode(null);
  setReplyBody("");
  onRefresh?.();
};

  const handleEditDraft = async () => {
    if (!email || !onCompose || !currentUser) return;
    const toEmails = email.to_emails?.map((to: any) => (typeof to === 'string' ? to : (to?.email || ""))).join(', ') || '';
    const ccEmails = email.cc_emails?.map((cc: any) => (typeof cc === 'string' ? cc : (cc?.email || ""))).join(', ') || '';
    try {
      // delete the draft so compose opens a fresh draft (your previous logic did this)
      await emailService.deleteEmail(Number(email.id), currentUser.id);
      onRefresh?.();
    } catch (error) {
      console.error('Error deleting draft:', error);
    }

    onCompose({
      to: toEmails,
      cc: ccEmails,
      subject: email.subject || '',
      body: normalizeEmailBody(email.body ?? email.text_preview ?? '') || ''
    });
    onClose?.();
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

const resolvedThreadId = email.thread_id ?? String(email.id);

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
    <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
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

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-none mx-auto p-4 lg:p-6 lg:p-8">
          {/* Subject Line - Gmail Style */}
          <div className="mb-6">
            <h1 className="text-xl lg:text-2xl font-normal text-gray-900 dark:text-white mb-3 lg:mb-4 leading-tight">
              {email.subject || '(No subject)'}
            </h1>
            {email.labels && email.labels.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {email.labels.map((label, idx) => (
                  <span key={idx} className="text-xs px-3 py-1 rounded-full font-medium" style={{ backgroundColor: label.color + '20', color: label.color }}>
                    {label.name}
                  </span>
                ))}
              </div>
            )}
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
                  </div>
                </div>
              </div>
            </div>

{/* Email Body */}
            <div className="px-4 lg:px-6 pb-4 lg:pb-6 pt-3 lg:pt-4 border-t border-gray-100 dark:border-slate-800">
              <div className="prose dark:prose-invert max-w-none" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowwrap: 'anywhere' }}>
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

              {email.attachments && email.attachments.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-slate-800">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Paperclip className="w-4 h-4" />
                    Attachments ({email.attachments.length})
                  </h4>
                  <div className="grid grid-cols-1 gap-2 lg:gap-3">
                    {email.attachments.map((attachment: any, index: number) => {
                      const isImage = /^image\//i.test(attachment.mime_type || '');
                      const sizeKB = attachment.size_bytes 
                        ? (attachment.size_bytes / 1024).toFixed(1) 
                        : '0';
                      const sizeMB = attachment.size_bytes && attachment.size_bytes > 1024 * 1024
                        ? (attachment.size_bytes / 1024 / 1024).toFixed(1) + ' MB'
                        : sizeKB + ' KB';

                      return (
                        <div 
                          key={index}
                          className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-4 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-slate-800 transition cursor-pointer border border-gray-200 dark:border-slate-700"
                          onClick={async () => {
                            // Download attachment
                            try {
                              const response = await fetch(
                                `${import.meta.env.VITE_API_BASE || ''}/api/email/${email.id}/attachment/${attachment.id}`,
                                {
                                  headers: {
                                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                                  },
                                  credentials: 'include',
                                }
                              );
                              
                              if (!response.ok) throw new Error('Failed to fetch attachment');
                              
                              const data = await response.json();
                              
                              // Convert base64 to blob and download
                              const byteCharacters = atob(data.content_base64);
                              const byteNumbers = new Array(byteCharacters.length);
                              for (let i = 0; i < byteCharacters.length; i++) {
                                byteNumbers[i] = byteCharacters.charCodeAt(i);
                              }
                              const byteArray = new Uint8Array(byteNumbers);
                              const blob = new Blob([byteArray], { type: attachment.mime_type || 'application/octet-stream' });
                              
                              // Create download link
                              const url = window.URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = attachment.filename || 'attachment';
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              window.URL.revokeObjectURL(url);
                            } catch (error) {
                              console.error('Error downloading attachment:', error);
                              alert('Failed to download attachment');
                            }
                          }}
                        >
                          {isImage && attachment.content_base64 ? (
                            <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                              <img 
                                src={`data:${attachment.mime_type};base64,${attachment.content_base64}`}
                                alt={attachment.filename}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                              <Paperclip className="w-6 h-6 text-blue-500" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs lg:text-sm text-gray-900 dark:text-white font-medium truncate">
                              {attachment.filename || 'attachment'}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-slate-400">
                              {sizeMB}
                              {isImage && ' • Image'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row flex-wrap gap-2">
{!email.is_draft && (
  <>
    <button
      onClick={() => openInlineReply("reply")}
      className="px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg flex items-center gap-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700"
    >
      <Reply className="w-4 h-4" /> Reply
    </button>

    <button
      onClick={() => openInlineReply("replyAll")}
      className="px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg flex items-center gap-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700"
    >
      <ReplyAll className="w-4 h-4" /> Reply All
    </button>

    <button
      onClick={() => openInlineReply("forward")}
      className="px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg flex items-center gap-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700"
    >
      <Forward className="w-4 h-4" /> Forward
    </button>
  </>
)}
</div> 

 {/* INLINE REPLY EDITOR — Gmail style */}
      {inlineReplyMode && (
        <div className="border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
<textarea
  ref={replyTextareaRef}
  className="w-full resize-none rounded-lg border border-gray-300 dark:border-slate-600 p-3 text-sm dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 overflow-hidden"
  rows={2}
  value={replyBody}
  onChange={(e) => {
    setReplyBody(e.target.value);
    autoResizeReply();
  }}
  placeholder="Write your reply…"
/>

          <div className="flex justify-end gap-3 mt-3">
            <button
onClick={() => {
  setInlineReplyMode(null);
  setReplyBody('');
  if (replyTextareaRef.current) {
    replyTextareaRef.current.style.height = 'auto';
  }
}}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Discard
            </button>

            <button
              onClick={sendInlineReply}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
            >
              Send
            </button>
          </div>
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
</div>
</div>
</div>
);
}
