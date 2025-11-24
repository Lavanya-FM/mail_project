import { Star, Paperclip, Circle } from 'lucide-react';

interface Email {
  id: string;
  user_id: string;
  folder_id?: string;
  from_email: string;
  from_name?: string;
  to_emails: any[];
  cc_emails: any[];
  bcc_emails: any[];
  subject?: string;
  body?: string;
  is_read: boolean;
  is_starred: boolean;
  is_draft: boolean;
  has_attachments: boolean;
  created_at: string;
  sent_at?: string;
  labels?: any[];
}

type EmailListProps = {
  emails: Email[];
  selectedEmail: Email | null;
  onSelectEmail: (email: Email) => void;
  onRefresh: () => void;
};

export default function EmailList({
  emails,
  selectedEmail,
  onSelectEmail,
}: EmailListProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 24) {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    }
  };

  const stripHtmlTags = (html: string): string => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  return (
    <div className="w-96 border-r border-gray-200 dark:border-slate-800 flex flex-col bg-white dark:bg-slate-900">
      <div className="flex-1 overflow-y-auto">
        {emails.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-slate-500">
            <div className="text-center">
              <Circle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No emails found</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-slate-800">
            {emails.map((email) => {
              const isSelected = selectedEmail?.id === email.id;
	      const getInitials = (name?: string) => {
		  if (!name) return "U";

		  const safe = String(name).trim();
		  if (!safe) return "U";
	
		  return safe
		    .split(" ")
		    .filter(Boolean)
		    .map((n) => n.charAt(0))
		    .join("")
		    .toUpperCase()
		    .slice(0, 2);
		};

              return (
                <button
                  key={email.id}
                  onClick={() => onSelectEmail(email)}
                  className={`w-full text-left p-4 transition hover:bg-gray-100 dark:hover:bg-slate-800/50 ${
                    isSelected ? 'bg-gray-100 dark:bg-slate-800' : ''
                  } ${!email.is_read ? 'border-l-2 border-blue-500' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-sm font-semibold">
			{getInitials(email.from_name || email.from_email || 'User')}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-sm truncate ${
                            !email.is_read
                              ? 'font-semibold text-gray-900 dark:text-white'
                              : 'font-medium text-gray-600 dark:text-slate-300'
                          }`}
                        >
                          {email.from_name || email.from_email}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-slate-500 flex-shrink-0">
                          {formatDate(email.sent_at || email.created_at)}
                        </span>
                      </div>

                      <div className="mb-1">
                        <h3
                          className={`text-sm truncate ${
                            !email.is_read
                              ? 'font-semibold text-gray-900 dark:text-white'
                              : 'text-gray-600 dark:text-slate-400'
                          }`}
                        >
                          {email.subject || '(No subject)'}
                        </h3>
                      </div>

                      <p className="text-xs text-gray-500 dark:text-slate-500 line-clamp-2">
                        {truncateText(stripHtmlTags(email.body || ''), 100)}
                      </p>

                      <div className="flex items-center gap-2 mt-2">
                        {email.has_attachments && (
                          <div className="flex items-center gap-1 text-gray-500 dark:text-slate-500">
                            <Paperclip className="w-3 h-3" />
                          </div>
                        )}
                        {email.is_starred && (
                          <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                        )}
                        {email.labels && email.labels.length > 0 && (
                          <div className="flex gap-1">
                            {email.labels.slice(0, 2).map((label, idx) => (
                              <span
                                key={idx}
                                className="text-xs px-2 py-0.5 rounded-full"
                                style={{
                                  backgroundColor: label.color + '20',
                                  color: label.color,
                                }}
                              >
                                {label.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
