import { X, Reply, ReplyAll, ChevronDown, ChevronUp, Forward } from 'lucide-react';
import { useState, useEffect } from 'react';
import { emailService } from '../lib/emailService';
import { threadingService } from '../lib/threadingService';
import { authService } from '../lib/authService';

interface ThreadEmail {
  id: string;
  thread_id?: string;
  subject?: string;
  from_email: string;
  from_name?: string;
  to_emails: any[];
  cc_emails: any[];
  bcc_emails: any[];
  body?: string;
  created_at?: string;
  sent_at?: string;
  is_read: boolean;
  is_starred: boolean;
  is_draft: boolean;
}

interface ThreadViewProps {
  threadId: string;
  userId: string;
  onClose: () => void;
  onCompose?: (data: {
    to?: string;
    cc?: string;
    subject?: string;
    body?: string;
    threadId?: string;
    isReply?: boolean;
    isForward?: boolean;
  }) => void;
}

export default function ThreadView({ threadId, userId, onClose, onCompose }: ThreadViewProps) {
  const [emails, setEmails] = useState<ThreadEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentEmailIndex, setCurrentEmailIndex] = useState(0);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const user = authService.getCurrentUser();
    setCurrentUser(user);
    loadThread();
  }, [threadId]);

  const loadThread = async () => {
    setLoading(true);
    try {
      const { data: allEmails } = await emailService.getEmails(userId);
      if (allEmails) {
        // Filter emails in this thread and sort by date descending (newest first)
        const threadEmails = allEmails
          .filter((email: any) => email.thread_id === threadId)
          .sort((a: any, b: any) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        
        setEmails(threadEmails);
        setCurrentEmailIndex(0); // Show newest email first
      }
    } catch (error) {
      console.error('Error loading thread:', error);
    } finally {
      setLoading(false);
    }
  };

  const currentEmail = emails[currentEmailIndex];
  const hasNextEmail = currentEmailIndex < emails.length - 1;
  const hasPrevEmail = currentEmailIndex > 0;

  const goToNextEmail = () => {
    if (hasNextEmail) setCurrentEmailIndex(currentEmailIndex + 1);
  };

  const goToPrevEmail = () => {
    if (hasPrevEmail) setCurrentEmailIndex(currentEmailIndex - 1);
  };

  const handleReply = (email: ThreadEmail) => {
    if (!currentUser || !onCompose) return;
    
    const replySubject = email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || '(No subject)'}`;
    const replyBody = `\n\n--- Original Message ---\nFrom: ${email.from_name || email.from_email}\nTo: ${email.to_emails?.map(to => to.email).join(', ') || 'me'}\nSubject: ${email.subject || '(No subject)'}\n\n${email.body || ''}`;
    
    onCompose({ 
      to: email.from_email, 
      subject: replySubject, 
      body: replyBody,
      threadId: threadId,
      isReply: true
    });
  };

  const handleReplyAll = (email: ThreadEmail) => {
    if (!currentUser || !onCompose) return;
    
    const allRecipients = [email.from_email, ...(email.to_emails?.map(to => to.email) || []), ...(email.cc_emails?.map(cc => cc.email) || [])]
      .filter(emailAddr => emailAddr !== currentUser.email);
    
    const replySubject = email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || '(No subject)'}`;
    const replyBody = `\n\n--- Original Message ---\nFrom: ${email.from_name || email.from_email}\nTo: ${email.to_emails?.map(to => to.email).join(', ') || 'me'}\nSubject: ${email.subject || '(No subject)'}\n\n${email.body || ''}`;
    
    onCompose({ 
      to: allRecipients.join(', '), 
      subject: replySubject, 
      body: replyBody,
      threadId: threadId,
      isReply: true
    });
  };

  const formatDate = (dateString: string) => {
    // Parse the date string properly
    let date;
    if (dateString.includes('T')) {
      // ISO format
      date = new Date(dateString);
    } else {
      // SQLite format (YYYY-MM-DD HH:MM:SS)
      date = new Date(dateString.replace(' ', 'T'));
    }
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Compare dates (ignoring time)
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());

    if (dateOnly.getTime() === todayOnly.getTime()) {
      // Today: show time in 12-hour format with AM/PM
      const hours = date.getHours();
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      return `${displayHours}:${minutes} ${ampm}`;
    } else if (dateOnly.getTime() === yesterdayOnly.getTime()) {
      return 'Yesterday';
    } else if (date.getFullYear() === today.getFullYear()) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading thread...</div>
      </div>
    );
  }

  if (emails.length === 0 || !currentEmail) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">No emails in this thread</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Header with Navigation */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {threadingService.getBaseSubject(currentEmail?.subject || '')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Message {currentEmailIndex + 1} of {emails.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevEmail}
            disabled={!hasPrevEmail}
            className={`p-2 rounded-lg transition-colors ${
              hasPrevEmail
                ? 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
            }`}
          >
            <ChevronUp size={20} />
          </button>
          <button
            onClick={goToNextEmail}
            disabled={!hasNextEmail}
            className={`p-2 rounded-lg transition-colors ${
              hasNextEmail
                ? 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
            }`}
          >
            <ChevronDown size={20} />
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      </div>

      {/* Email Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Sender Info */}
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-lg font-semibold flex-shrink-0">
            {(currentEmail.from_name || currentEmail.from_email).charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900 dark:text-white">
              {currentEmail.from_name || currentEmail.from_email}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              &lt;{currentEmail.from_email}&gt;
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              to {currentEmail.to_emails?.map((t: any) => t.email).join(', ') || 'me'}
            </p>
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
            {formatDate(currentEmail.created_at || currentEmail.sent_at || '')}
          </span>
        </div>

        {/* Subject */}
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
          {currentEmail.subject}
        </h3>

        {/* Email Body */}
        <div className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words leading-relaxed mb-6">
          {currentEmail.body || '(No content)'}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => handleReply(currentEmail)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <Reply size={16} />
            Reply
          </button>
          <button
            onClick={() => handleReplyAll(currentEmail)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <ReplyAll size={16} />
            Reply All
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <Forward size={16} />
            Forward
          </button>
        </div>
      </div>
    </div>
  );
}
