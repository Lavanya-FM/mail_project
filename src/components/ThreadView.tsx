import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { emailService } from "../lib/emailService";
import EmailView from "./EmailView";

interface ThreadEmail {
  id: number;
  thread_id?: number;
  subject?: string;
  from_email: string;
  from_name?: string;
  to_emails: any[];
  cc_emails: any[];
  bcc_emails: any[];
  body?: string;
  created_at?: string;
  is_read: boolean;
  is_starred: boolean;
  is_draft: boolean;
  attachments?: any[];
}

interface ThreadViewProps {
  threadId: string;
  userId: string;
  onClose: () => void;
  onCompose?: (data: any) => void;
}

export default function ThreadView({
  threadId,
  userId,
  onClose,
  onCompose,
}: ThreadViewProps) {
  const [emails, setEmails] = useState<ThreadEmail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchThread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  async function fetchThread() {
    try {
      setLoading(true);
      const res = await emailService.getThread(threadId, userId);
      setEmails(res?.data || []);
    } catch (err) {
      console.error("Thread fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  // ✅ SAFE compose wrapper (prevents 400 error)
  function handleCompose(email: ThreadEmail, data: any) {
    if (!onCompose) return;

    onCompose({
      ...data,
      to: data?.to || email.from_email,
      threadId,
    });
  }

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-600 dark:text-slate-300">
        Loading conversation…
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700">

      {/* HEADER */}
      <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-slate-700">
        <h2 className="text-lg font-semibold">Conversation</h2>

        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* THREAD EMAILS */}
      <div className="space-y-4 p-4">
        {emails.map((email) => (
          <EmailView
            key={email.id}
            email={email}
            hideClose
            hideToolbar
            onCompose={(data: any) => handleCompose(email, data)}
          />
        ))}
      </div>

    </div>
  );
}
