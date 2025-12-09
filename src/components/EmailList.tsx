// src/components/EmailList.tsx
import { Star, Paperclip, Circle, Inbox, Tag, Users, Check, CheckCheck } from 'lucide-react';
import { Email } from '../types/email';
import { useState, useEffect } from 'react';

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
  const [lastActivity, setLastActivity] = useState<Date>(new Date());
  const [activityText, setActivityText] = useState<string>('Just now');

  // Update last activity timestamp whenever user interacts
  useEffect(() => {
    const updateActivity = () => {
      setLastActivity(new Date());
    };

    window.addEventListener('click', updateActivity);
    window.addEventListener('keypress', updateActivity);
    window.addEventListener('scroll', updateActivity);

    return () => {
      window.removeEventListener('click', updateActivity);
      window.removeEventListener('keypress', updateActivity);
      window.removeEventListener('scroll', updateActivity);
    };
  }, []);

  // Update activity text periodically
  useEffect(() => {
    const updateActivityText = () => {
      const now = new Date();
      const diffMs = now.getTime() - lastActivity.getTime();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));

      if (diffMinutes < 1) {
        setActivityText('Just now');
      } else if (diffMinutes === 1) {
        setActivityText('1 minute ago');
      } else {
        setActivityText(`${diffMinutes} minutes ago`);
      }
    };

    updateActivityText();
    const interval = setInterval(updateActivityText, 10000);
    return () => clearInterval(interval);
  }, [lastActivity]);

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
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
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || div.innerText || "";
  };

  const truncateText = (text: string, maxLength: number) => {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
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

  // Thread grouping
  const groupEmailsByThread = (emails: Email[]) => {
    const map: Record<number, Email[]> = {};
    for (const email of emails) {
      const threadId = email.thread_id || email.id;
      if (!map[threadId]) map[threadId] = [];
      map[threadId].push(email);
    }

    for (const t in map) {
      map[t].sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
      );
    }

    return map;
  };

  const threads = groupEmailsByThread(emails);

  const threadList = Object.entries(threads)
    .map(([threadId, list]) => ({
      threadId,
      latestEmail: list[0],
      unreadCount: list.filter(e => !e.is_read).length,
      allEmails: list
    }))
    .sort(
      (a, b) =>
        new Date(b.latestEmail.created_at).getTime() -
        new Date(a.latestEmail.created_at).getTime()
    );

  return (
    <div className="w-full lg:w-96 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-900 h-full">

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex">
          <button
            onClick={() => setActiveTab("primary")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-medium transition-all ${
              activeTab === "primary"
                ? "text-blue-600 dark:text-blue-500 border-b-2 border-blue-600 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-900/10"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            <Inbox className="w-4 h-4" />
            <span>Primary</span>
          </button>

          <button
            onClick={() => setActiveTab("social")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-medium transition-all ${
              activeTab === "social"
                ? "text-blue-600 dark:text-blue-500 border-b-2 border-blue-600 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-900/10"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Social</span>
          </button>

          <button
            onClick={() => setActiveTab("promotions")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-medium transition-all ${
              activeTab === "promotions"
                ? "text-blue-600 dark:text-blue-500 border-b-2 border-blue-600 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-900/10"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            <Tag className="w-4 h-4" />
            <span>Promotions</span>
          </button>
        </div>
      </div>

      {/* Email Thread List */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        <div className="flex-1">
          {threadList.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 py-16">
              <div className="text-center">
                <Inbox className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">No emails in {activeTab}</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                  Your inbox is empty
                </p>
              </div>
            </div>
          ) : (
            <div>
              {threadList.map(
                ({ threadId, latestEmail, unreadCount, allEmails }) => {
                  const isSelected = selectedEmail?.id === latestEmail.id;

const normalize = (value: any): string => {
  if (value === null || value === undefined) return "";
  const s = String(value).trim().replace(/\r/g, "");
  if (s === "") return "";
  if (/^0+$/.test(s)) return "";     // handles "0", "00", "0\n", " 0 "
  return s;
};

const cleanBody = stripHtmlTags(normalize(latestEmail.body));

                  return (
                    <button
                      key={threadId}
                      onClick={() => onSelectEmail(latestEmail)}
                      className={`w-full text-left px-4 py-3.5 transition-all border-b border-gray-100 dark:border-gray-800 ${
                        isSelected
                          ? "bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-600 dark:border-l-blue-500"
                          : "hover:bg-gray-50 dark:hover:bg-gray-800/50 border-l-4 border-l-transparent"
                      } ${
                        unreadCount > 0
                          ? "bg-white dark:bg-gray-900"
                          : "bg-gray-50/30 dark:bg-gray-900/50"
                      }`}
                    >
                      <div className="flex items-start gap-3">

                        {/* Avatar */}
                        <div className="flex-shrink-0 mt-0.5">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 dark:from-blue-600 dark:to-indigo-700 flex items-center justify-center text-white text-sm font-semibold shadow-sm">
                            {getInitials(
                              latestEmail.from_name ||
                                latestEmail.from_email
                            )}
                          </div>
                        </div>

                        {/* Email Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span
                              className={`text-sm truncate ${
                                unreadCount > 0
                                  ? "font-semibold text-gray-900 dark:text-white"
                                  : "font-normal text-gray-700 dark:text-gray-300"
                              }`}
                            >
                              {latestEmail.from_name ||
                                latestEmail.from_email}
                            </span>

                            {/* Date */}
                            <span className={`text-xs flex-shrink-0 ${
                              unreadCount > 0 
                                ? "text-gray-700 dark:text-gray-300 font-medium" 
                                : "text-gray-500 dark:text-gray-400"
                            }`}>
                              {formatDate(
                                latestEmail.sent_at ||
                                  latestEmail.created_at ||
                                  ""
                              )}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 mb-1">
                            <h3
                              className={`text-sm truncate flex-1 ${
                                unreadCount > 0
                                  ? "font-semibold text-gray-900 dark:text-white"
                                  : "font-normal text-gray-700 dark:text-gray-300"
                              }`}
                            >
                              {latestEmail.subject || "(No subject)"}
                            </h3>
                            
                            {/* Unread Count Badge */}
                            {unreadCount > 0 && (
                              <span className="text-xs bg-blue-600 dark:bg-blue-500 text-white px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                                {unreadCount}
                              </span>
                            )}
                          </div>

                          {/* Preview */}
                          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1">
                            {truncateText(cleanBody, 90)}
                          </p>

                          {/* Thread size */}
                          {allEmails.length > 1 && (
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1.5 flex items-center gap-1">
                              <span className="inline-block w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500"></span>
                              {allEmails.length} messages
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50">
          <div className="flex justify-between items-center mb-2.5">
            <span className="text-xs text-gray-600 dark:text-gray-400">
              Last account activity: {activityText}
            </span>
            <button
              onClick={onViewActivity}
              className="text-xs text-blue-600 dark:text-blue-500 hover:text-blue-700 dark:hover:text-blue-400 font-medium transition-colors"
            >
              Details
            </button>
          </div>
          <div className="flex justify-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <button 
              className="hover:text-blue-600 dark:hover:text-blue-500 transition-colors" 
              onClick={onViewPrivacy}
            >
              Privacy
            </button>
            <span className="text-gray-300 dark:text-gray-600">•</span>
            <button 
              className="hover:text-blue-600 dark:hover:text-blue-500 transition-colors" 
              onClick={onViewTerms}
            >
              Terms
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
