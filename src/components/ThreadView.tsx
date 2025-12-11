import { useEffect, useState } from "react";
import { X, Reply, ReplyAll, Forward, ChevronDown, ChevronUp, Paperclip } from "lucide-react";
import { emailService } from "../lib/emailService";
import { authService } from "../lib/authService";

// Function to resolve CID inline images
function resolveCIDImages(html: string, attachments: any[] = []) {
  if (!html || !attachments) return html;

  let updated = html;

  attachments.forEach(att => {
    if (!att || !att.inline_cid || !att.content_base64) return;

    const cidPattern = new RegExp("cid:" + att.inline_cid, "g");
    const dataUrl = `data:${att.mime_type};base64,${att.content_base64}`;

    updated = updated.replace(cidPattern, dataUrl);
  });

  return updated;
}

interface ThreadEmail {
  id: number;
  thread_id?: number;
  subject?: string;
  from_email: string;
  from_name?: string;

  to_emails: string[];
  cc_emails: string[];
  bcc_emails: string[];

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
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    setCurrentUser(authService.getCurrentUser());
    fetchThread();
  }, [threadId]);

  // Fetch email thread and its attachments
  async function fetchThread() {
    try {
      setLoading(true);
      const res = await emailService.getThread(threadId, userId);

      const enriched = await Promise.all(
        res.data.map(async (email: any) => {
          if (!email.attachments?.length) return email;

          const atts = [];
          for (const att of email.attachments) {
            const full = await emailService.getAttachment(email.id, att.id);
            atts.push({ ...att, ...full });
          }

          return { ...email, attachments: atts };
        })
      );

      setEmails(enriched);
      setLoading(false);
    } catch (err) {
      console.error("Thread fetch error:", err);
      setLoading(false);
    }
  }

  const handleReply = (email: ThreadEmail) => {
    if (!onCompose) return;
    onCompose({
      to: email.from_email,
      subject: "Re: " + (email.subject || ""),
      body: `<br><br>--- Previous message ---<br>${email.body}`,
      threadId,
      isReply: true
    });
  };

  const handleForward = (email: ThreadEmail) => {
    if (!onCompose) return;
    onCompose({
      subject: "Fwd: " + (email.subject || ""),
      body: `<br><br>--- Forwarded message ---<br>${email.body}`,
      threadId,
      isForward: true
    });
  };

  const toggleExpand = (id: number) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-600 dark:text-slate-300">
        Loading thread…
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700">

      {/* HEADER */}
      <div className="flex justify-between p-4 border-b border-gray-200 dark:border-slate-700">
        <h2 className="text-lg font-semibold">Conversation</h2>

        <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-800">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* THREAD EMAILS */}
      <div className="divide-y divide-gray-200 dark:divide-slate-700">
        {emails.map((email, index) => {
          const isOpen = expanded[email.id] || index === emails.length - 1;

          return (
            <div key={email.id} className="p-4">

              {/* MESSAGE HEADER */}
              <div className="flex justify-between">
                <div>
                  <p className="font-semibold">{email.from_name || email.from_email}</p>
                  <p className="text-xs text-gray-500">{email.created_at}</p>
                </div>

                <button onClick={() => toggleExpand(email.id)}>
                  {isOpen ? <ChevronUp /> : <ChevronDown />}
                </button>
              </div>

              {/* BODY + INLINE IMAGES */}
              {isOpen && (
                <div
                  className="prose dark:prose-invert max-w-none mt-3"
                  dangerouslySetInnerHTML={{
                    __html: resolveCIDImages(email.body || "", email.attachments || [])
                  }}
                />
              )}

              {/* ATTACHMENTS */}
{isOpen && email.attachments?.length > 0 && (
  <div className="mt-4 space-y-2">
    {email.attachments.map((att: any) => {
      const { mime_type, content_base64, filename } = att;

      if (mime_type && mime_type.startsWith('image/')) {
        return (
          <div key={att.id} className="attachment-preview">
            <img
              src={`data:${mime_type};base64,${content_base64}`}
              alt={filename}
              className="w-32 h-32 object-cover"
            />
            <span>{filename}</span>
          </div>
        );
      } else if (mime_type && mime_type.startsWith('application/pdf')) {
        return (
          <a
            key={att.id}
            href={`data:${mime_type};base64,${content_base64}`}
            download={filename}
            className="flex items-center gap-2 p-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            <Paperclip className="w-4 h-4" />
            <span>{filename}</span>
          </a>
        );
      } else {
        return (
          <a
            key={att.id}
            href={`data:${mime_type};base64,${content_base64}`}
            download={filename}
            className="flex items-center gap-2 p-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            <Paperclip className="w-4 h-4" />
            <span>{filename}</span>
          </a>
        );
      }
    })}
  </div>
)}

              {/* ACTION BUTTONS */}
              {isOpen && (
                <div className="flex gap-4 mt-4">
                  <button onClick={() => handleReply(email)} className="flex items-center gap-1 text-blue-600">
                    <Reply className="w-4 h-4" /> Reply
                  </button>

                  <button onClick={() => handleForward(email)} className="flex items-center gap-1 text-blue-600">
                    <Forward className="w-4 h-4" /> Forward
                  </button>
                </div>
              )}

            </div>
          );
        })}
      </div>
    </div>
  );
}
