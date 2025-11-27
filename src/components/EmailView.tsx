import { Star, Reply, ReplyAll, Forward, Trash2, Archive, MoreVertical, Paperclip, X, Flag, FileEdit } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { emailService } from '../lib/emailService';
import { authService } from '../lib/authService';
import { Email } from '../types/email';

type EmailViewProps = {
  email: Email | null;
  onClose: () => void;
  onRefresh: () => void;
  onCompose?: (data: {
    to?: string;
    cc?: string;
    subject?: string;
    body?: string;
  }) => void;
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

export default function EmailView({ email, onClose, onRefresh, onCompose }: EmailViewProps) {
  const [starred, setStarred] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentUser = authService.getCurrentUser();
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
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(initialConfirmState);

  useEffect(() => {
    if (email) {
      setStarred(email.is_starred || false);
      if (!email.is_read) {
        markAsRead(String(email.id));
      }
    }
  }, [email]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowActions(false);
      }
    };

    if (showActions) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showActions]);

  const markAsRead = async (emailId: string) => {
    try {
      await emailService.updateEmail(emailId, { user_id: currentUser.id, is_read: true });
      onRefresh();
    } catch (error) {
      console.error('Error marking email as read:', error);
    }
  };

  const toggleStar = async () => {
    if (!email) return;
    try {
      await emailService.updateEmail(email.id, { user_id: currentUser.id, is_starred: !starred });
      setStarred(!starred);
      onRefresh();
    } catch (error) {
      console.error('Error toggling star:', error);
    }
  };

  const handleReply = () => {
    if (!email || !currentUser || !onCompose) return;
    const replySubject = email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || '(No subject)'}`;
    
    const replyTo = email.from_email;
    
    const replyBody = `\n\n--- Original Message ---\nFrom: ${email.from_name || email.from_email}\nTo: ${email.to_emails?.map(to => to.email).join(', ') || currentUser.email}\nSubject: ${email.subject || '(No subject)'}\n\n${email.body || ''}`;
    
    onCompose({ to: replyTo, subject: replySubject, body: replyBody });
  };

  const handleReplyAll = () => {
    if (!email || !currentUser || !onCompose) return;

    const allRecipients = [
      email.from_email,
      ...(email.to_emails?.map(t => t.email) || []),
      ...(email.cc_emails?.map(cc => cc.email) || [])
    ].filter(addr => addr && addr !== currentUser.email);

    const uniqueRecipients = Array.from(new Set(allRecipients));

    const replySubject = email.subject?.startsWith("Re:")
      ? email.subject
      : `Re: ${email.subject || "(No subject)"}`;

    const replyBody = `\n\n--- Original Message ---\nFrom: ${
      email.from_name || email.from_email
    }\nTo: ${email.to_emails?.map(t => t.email).join(", ") || currentUser.email}\nSubject: ${
      email.subject || "(No subject)"
    }\n\n${email.body || ""}`;

    onCompose({
      to: uniqueRecipients.join(", "),
      subject: replySubject,
      body: replyBody,
    });
  };

  const handleForward = () => {
    if (!email || !onCompose) return;
    const forwardSubject = email.subject?.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject || '(No subject)'}`;
    const forwardBody = `\n\n--- Forwarded Message ---\nFrom: ${email.from_name || email.from_email || ''}\nTo: ${email.to_emails?.map(to => to.email).join(', ') || currentUser.email}\nSubject: ${email.subject || '(No subject)'}\nDate: ${formatFullDate(email.sent_at || email.created_at || '')}\n\n${email.body || ''}`;
    onCompose({ subject: forwardSubject, body: forwardBody });
  };

  const openConfirmDialog = (config: Omit<ConfirmDialogState, 'open' | 'processing'>) => {
    setConfirmDialog({
      ...initialConfirmState,
      open: true,
      ...config,
    });
  };

  const closeConfirmDialog = () => setConfirmDialog(initialConfirmState);

  const executeConfirmAction = async () => {
    if (!confirmDialog.onConfirm) return;
    setConfirmDialog(prev => ({ ...prev, processing: true, error: undefined }));
    try {
      await confirmDialog.onConfirm();
      closeConfirmDialog();
    } catch (error) {
      console.error('Confirm dialog action failed:', error);
      setConfirmDialog(prev => ({ ...prev, processing: false, error: 'Something went wrong. Please try again.' }));
    }
  };

  const handleDelete = () => {
    if (!email || !currentUser) return;
    openConfirmDialog({
      title: 'Delete email?',
      message: 'Are you sure you want to delete this email? It will be moved to your Trash folder.',
      confirmLabel: 'Move to Trash',
      cancelLabel: 'Cancel',
      onConfirm: async () => {
        const { data: folders, error } = await emailService.getFolders(currentUser.id);
        if (error) throw error;
        const trashFolder = folders?.find(f => f.name.toLowerCase() === 'trash');

        if (trashFolder) {
          const { error: updateError } = await emailService.updateEmail(email.id, {
            user_id: currentUser.id,
            folder_id: trashFolder.id
          });

          if (updateError) throw updateError;
        } else {
          const { error: deleteError } = await emailService.deleteEmail(Number(email.id), currentUser.id);
          if (deleteError) throw deleteError;
        }

        onRefresh();
        onClose();
      }
    });
  };

  const handleArchive = async () => {
    if (!email || !currentUser) return;
    try {
      const { data: folders, error } = await emailService.getFolders(currentUser.id);
      if (error) throw error;
      
      const archiveFolder = folders?.find(f => f.name.toLowerCase() === 'archive');
      
      if (!archiveFolder) {
        // If archive folder doesn't exist, try to move to a default system folder
        const systemFolder = folders?.find(f => f.system_box === 'archive' || f.system_box === 'all');
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
        // Move to existing archive folder
        const { error: moveError } = await emailService.moveEmail(
          Number(email.id), 
          currentUser.id, 
          Number(archiveFolder.id)
        );
        if (moveError) throw moveError;
      }
      
      onRefresh();
      onClose();
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
          
          const spamFolder = folders?.find(f => f.name.toLowerCase() === 'spam');
          
          if (!spamFolder) {
            // If spam folder doesn't exist, try to move to a default system folder
            const systemFolder = folders?.find(f => f.system_box === 'spam' || f.system_box === 'junk');
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
            // Move to existing spam folder
            const { error: moveError } = await emailService.moveEmail(
              Number(email.id), 
              currentUser.id, 
              Number(spamFolder.id)
            );
            if (moveError) throw moveError;
          }

          onRefresh();
          onClose();
        } catch (error) {
          console.error('Error moving to spam:', error);
          alert('Failed to move email to Spam. Please try again.');
        }
      }
    });
  };

  const handleEditDraft = async () => {
    if (!email || !onCompose) return;
    const toEmails = email.to_emails?.map(to => to.email).join(', ') || '';
    const ccEmails = email.cc_emails?.map(cc => cc.email).join(', ') || '';
    try {
      await emailService.deleteEmail(Number(email.id), currentUser.id);
      onRefresh();
    } catch (error) {
      console.error('Error deleting draft:', error);
    }
    onCompose({ to: toEmails, cc: ccEmails, subject: email.subject || '', body: email.body || '' });
    onClose();
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

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Top toolbar */}
      <div className="h-14 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-slate-800/50 flex items-center px-4 gap-3">
        <button onClick={onClose} className="p-2 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition" title="Back to inbox">
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
                        ? email.to_emails.map(t => t.email).join(', ')
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

      <div className="flex-1 overflow-y-auto">
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
                          ? email.to_emails.map(t => t.email).join(', ')
                          : currentUser.email
                        }
                        {email.cc_emails && email.cc_emails.length > 0 && (
                          <span>, cc {email.cc_emails.map((cc) => cc.email).join(', ')}</span>
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
              <div className="prose dark:prose-invert max-w-none" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                <div className="text-xs lg:text-sm text-gray-800 dark:text-slate-200 leading-relaxed" dangerouslySetInnerHTML={{ __html: email.body?.replace(/\n/g, '<br>') || '' }} />
              </div>

              {email.has_attachments && (
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-slate-800">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Paperclip className="w-4 h-4" />
                    Attachments
                  </h4>
                  <div className="grid grid-cols-1 gap-2 lg:gap-3">
                    <div className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-4 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-slate-800 transition cursor-pointer border border-gray-200 dark:border-slate-700">
                      <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center">
                        <Paperclip className="w-6 h-6 text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs lg:text-sm text-gray-900 dark:text-white font-medium truncate">document.pdf</p>
                        <p className="text-xs text-gray-600 dark:text-slate-400">2.4 MB</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row flex-wrap gap-2">
            {!email.is_draft ? (
              <>
                <button onClick={handleReply} className="px-3 lg:px-4 py-2 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border border-gray-300 dark:border-slate-700 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition flex items-center gap-2 text-sm lg:text-base">
                  <Reply className="w-4 h-4" />
                  Reply
                </button>
                <button onClick={handleReplyAll} className="px-3 lg:px-4 py-2 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border border-gray-300 dark:border-slate-700 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition flex items-center gap-2 text-sm lg:text-base">
                  <ReplyAll className="w-4 h-4" />
                  Reply All
                </button>
                <button onClick={handleForward} className="px-3 lg:px-4 py-2 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border border-gray-300 dark:border-slate-700 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition flex items-center gap-2 text-sm lg:text-base">
                  <Forward className="w-4 h-4" />
                  Forward
                </button>
              </>
            ) : (
              <button onClick={handleEditDraft} className="px-3 lg:px-4 py-2 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition flex items-center gap-2 text-sm lg:text-base">
                <FileEdit className="w-4 h-4" />
                Continue Editing
              </button>
            )}
          </div>
        </div>
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
  );
}
