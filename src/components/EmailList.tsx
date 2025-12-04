import { Star, Paperclip, Circle, Inbox, Tag, Users, Check, CheckCheck } from 'lucide-react';
import { Email } from '../types/email';
import { useState } from 'react';

type EmailListProps = {
  emails: Email[];
  selectedEmail: Email | null;
  onSelectEmail: (email: Email) => void;
  onViewActivity?: () => void;
  onViewPrivacy?: () => void;
  onViewTerms?: () => void;
  onRefresh?: () => void;
};

export default function EmailList({
  emails,
  selectedEmail,
  onSelectEmail,
  onViewActivity,
  onViewPrivacy,
  onViewTerms
}: EmailListProps) {
  const [activeTab, setActiveTab] = useState<'primary' | 'social' | 'promotions'>('primary');

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

  // Filter emails by tab (for now, show all in primary)
  const filteredEmails = emails;

  return (
    <div className="w-full lg:w-96 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-900 h-full">
      {/* Tabs */}
      {/* ... existing tabs ... */}
      <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex">
          <button
            onClick={() => setActiveTab('primary')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${activeTab === 'primary'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-900/20'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
          >
            <Inbox className="w-4 h-4" />
            <span className="hidden sm:inline">Primary</span>
          </button>
          <button
            onClick={() => setActiveTab('social')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${activeTab === 'social'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-900/20'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
          >
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Social</span>
          </button>
          <button
            onClick={() => setActiveTab('promotions')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${activeTab === 'promotions'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-900/20'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
          >
            <Tag className="w-4 h-4" />
            <span className="hidden sm:inline">Promotions</span>
          </button>
        </div>
      </div>

      {/* Email List */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        <div className="flex-1">
          {filteredEmails.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 py-10">
              <div className="text-center">
                <Circle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No emails found</p>
              </div>
            </div>
          ) : (
            <div>
              {filteredEmails.map((email) => {
                const isSelected = selectedEmail?.id === email.id;

                return (
                  <button
                    key={email.id}
                    onClick={() => onSelectEmail(email)}
                    className={`w-full text-left px-4 py-2 transition-all border-b border-gray-100 dark:border-gray-800 hover:shadow-md dark:hover:shadow-gray-900/50 ${isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-600 dark:border-l-blue-400'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      } ${!email.is_read ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/30'}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox placeholder (for Gmail-like selection) */}
                      <div className="flex-shrink-0 pt-1">
                        <div className="w-5 h-5 rounded border-2 border-gray-300 dark:border-gray-600"></div>
                      </div>

                      {/* Star */}
                      <div className="flex-shrink-0 pt-1">
                        {email.is_starred ? (
                          <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                        ) : (
                          <Star className="w-5 h-5 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400" />
                        )}
                      </div>

                      {/* Avatar */}
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-semibold shadow-md">
                          {getInitials(email.from_name || email.from_email || 'User')}
                        </div>
                      </div>

                      {/* Email Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span
                            className={`text-sm truncate ${!email.is_read
                              ? 'font-bold text-gray-900 dark:text-white'
                              : 'font-medium text-gray-700 dark:text-gray-300'
                              }`}
                          >
                            {email.from_name || email.from_email}
                          </span>
                          {!email.is_read && (
                            <span className="flex-shrink-0 w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full"></span>
                          )}
                        </div>

                        <div className="flex items-baseline gap-2">
                          <h3
                            className={`text-sm flex-1 truncate ${!email.is_read
                              ? 'font-semibold text-gray-900 dark:text-white'
                              : 'text-gray-600 dark:text-gray-400'
                              }`}
                          >
                            {email.subject || '(No subject)'}
                          </h3>
                        </div>

                        <p className="text-sm text-gray-500 dark:text-gray-500 line-clamp-1 mt-0.5">
                          {truncateText(stripHtmlTags(email.body || ''), 80)}
                        </p>

                        {/* Labels and Attachments */}
                        <div className="flex items-center gap-2 mt-1">
                          {email.has_attachments && (
                            <div className="flex items-center gap-1 text-gray-500 dark:text-gray-500">
                              <Paperclip className="w-3 h-3" />
                            </div>
                          )}
                          {email.labels && email.labels.length > 0 && (
                            <div className="flex gap-1">
                              {email.labels.slice(0, 2).map((label, idx) => (
                                <span
                                  key={idx}
                                  className="text-xs px-2 py-0.5 rounded-full font-medium"
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

                      {/* Date and Status */}
                      <div className="flex-shrink-0 flex flex-col items-end gap-1 pt-1">
                        <span className="text-xs text-gray-500 dark:text-gray-500">
                          {formatDate(email.sent_at || email.created_at || '')}
                        </span>
                        {email.status && (
                          <div title={email.status.charAt(0).toUpperCase() + email.status.slice(1)}>
                            {email.status === 'sent' && <Check className="w-4 h-4 text-gray-400" />}
                            {email.status === 'delivered' && <CheckCheck className="w-4 h-4 text-gray-400" />}
                            {email.status === 'read' && <CheckCheck className="w-4 h-4 text-blue-500" />}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Activity Footer */}
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50">
          <div className="flex justify-between items-center mb-2">
            <span>Last account activity: 0 minutes ago</span>
            <button
              onClick={onViewActivity}
              className="text-gray-700 dark:text-gray-300 hover:underline font-medium"
            >
              Details
            </button>
          </div>
          <div className="flex justify-center gap-2 text-gray-400">
            <button onClick={onViewPrivacy} className="hover:underline hover:text-gray-600 dark:hover:text-gray-300">Privacy Policy</button>
            <span>•</span>
            <button onClick={onViewTerms} className="hover:underline hover:text-gray-600 dark:hover:text-gray-300">Terms of Service</button>
          </div>
        </div>
      </div>
    </div>
  );
}
