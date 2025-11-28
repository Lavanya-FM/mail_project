import {
  Star,
  Reply,
  ReplyAll,
  Forward,
  Trash2,
  Archive,
  MoreVertical,
  Paperclip,
  X,
  Flag,
  FileEdit
} from "lucide-react";

import { useState, useEffect, useRef } from "react";
import { emailService } from "../lib/emailService";
import { authService } from "../lib/authService";
import { Email } from "../types/email";


// =========================
// Props + ConfirmDialog Def
// =========================

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



// =========================
// MAIN COMPONENT
// =========================

export default function EmailView({
  email,
  onClose,
  onRefresh,
  onCompose
}: EmailViewProps) {
  const [starred, setStarred] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentUser = authService.getCurrentUser();

  const initialConfirmState: ConfirmDialogState = {
    open: false,
    title: "",
    message: "",
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
    processing: false,
    error: undefined,
    onConfirm: undefined
  };

  const [confirmDialog, setConfirmDialog] =
    useState<ConfirmDialogState>(initialConfirmState);



  // ====================================
  // INITIALIZE: Mark read + load starred
  // ====================================

  useEffect(() => {
    if (email) {
      setStarred(email.is_starred || false);

      if (!email.is_read) {
        markAsRead(String(email.id));
      }
    }
  }, [email]);



  // ====================================
  // Hide dropdown when clicking outside
  // ====================================

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowActions(false);
      }
    };

    if (showActions) document.addEventListener("mousedown", handleClickOutside);

    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, [showActions]);



  // =========================
  // Helpers
  // =========================

  const markAsRead = async (emailId: string) => {
    try {
      await emailService.updateEmail(emailId, {
        user_id: currentUser.id,
        is_read: true
      });
      onRefresh();
    } catch (err) {
      console.error("Error marking email as read", err);
    }
  };

  const toggleStar = async () => {
    if (!email) return;
    try {
      await emailService.updateEmail(email.id, {
        user_id: currentUser.id,
        is_starred: !starred
      });
      setStarred(!starred);
      onRefresh();
    } catch (err) {
      console.error("Error toggling star", err);
    }
  };

  const formatFullDate = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  };

  const formatShortDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffHours < 24)
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit"
      });

    if (diffHours < 168)
      return date.toLocaleDateString("en-US", { weekday: "short" });

    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);



  // =========================
  // COMPOSE (Reply / Forward)
  // =========================

  const handleReply = () => {
    if (!email || !onCompose) return;

    const replySubject = email.subject?.startsWith("Re:")
      ? email.subject
      : `Re: ${email.subject || "(No subject)"}`;

    const replyBody = `

--- Original Message ---
From: ${email.from_name || email.from_email}
To: ${
      email.to_emails?.map((t) => t.email).join(", ") || currentUser.email
    }
Subject: ${email.subject || "(No subject)"}

${email.body || ""}`;

    onCompose({
      to: email.from_email,
      subject: replySubject,
      body: replyBody
    });
  };

  const handleReplyAll = () => {
    if (!email || !onCompose) return;

    const recipients = [
      email.from_email,
      ...(email.to_emails?.map((t) => t.email) || []),
      ...(email.cc_emails?.map((c) => c.email) || [])
    ].filter((addr) => addr !== currentUser.email); // remove yourself

    const replyBody = `

--- Original Message ---
From: ${email.from_name || email.from_email}
To: ${
      email.to_emails?.map((t) => t.email).join(", ") || currentUser.email
    }
Subject: ${email.subject || "(No subject)"}

${email.body || ""}`;

    onCompose({
      to: Array.from(new Set(recipients)).join(", "),
      subject: email.subject?.startsWith("Re:")
        ? email.subject
        : `Re: ${email.subject || "(No subject)"}`,
      body: replyBody
    });
  };

  const handleForward = () => {
    if (!email || !onCompose) return;

    const forwardBody = `

--- Forwarded Message ---
From: ${email.from_name || email.from_email}
To: ${
      email.to_emails?.map((t) => t.email).join(", ") || currentUser.email
    }
Subject: ${email.subject || "(No subject)"}
Date: ${formatFullDate(email.sent_at || email.created_at || "")}

${email.body || ""}`;

    onCompose({
      subject: email.subject?.startsWith("Fwd:")
        ? email.subject
        : `Fwd: ${email.subject || "(No subject)"}`,
      body: forwardBody
    });
  };



  // =========================
  // DELETE / ARCHIVE / SPAM
  // =========================

  const openConfirmDialog = (
    config: Omit<ConfirmDialogState, "open" | "processing">
  ) => {
    setConfirmDialog({
      ...initialConfirmState,
      open: true,
      ...config
    });
  };

  const closeConfirmDialog = () =>
    setConfirmDialog(initialConfirmState);

  const executeConfirmAction = async () => {
    if (!confirmDialog.onConfirm) return;
    setConfirmDialog((p) => ({ ...p, processing: true }));

    try {
      await confirmDialog.onConfirm();
      closeConfirmDialog();
    } catch (err) {
      console.error("Action failed:", err);
      setConfirmDialog((p) => ({
        ...p,
        processing: false,
        error: "Something went wrong. Try again."
      }));
    }
  };

  const handleDelete = () => {
    if (!email) return;

    openConfirmDialog({
      title: "Delete email?",
      message: "This email will be moved to Trash.",
      confirmLabel: "Move to Trash",
      cancelLabel: "Cancel",
      onConfirm: async () => {
        const { data: folders } = await emailService.getFolders(currentUser.id);

        const trash = folders?.find(
          (f) => f.name.toLowerCase() === "trash"
        );

        if (trash) {
          await emailService.updateEmail(email.id, {
            user_id: currentUser.id,
            folder_id: trash.id
          });
        } else {
          await emailService.deleteEmail(Number(email.id), currentUser.id);
        }

        onRefresh();
        onClose();
      }
    });
  };

  const handleArchive = async () => {
    if (!email) return;

    const { data: folders } = await emailService.getFolders(currentUser.id);

    const archive = folders?.find(
      (f) => f.name.toLowerCase() === "archive"
    );

    if (!archive) {
      alert("Archive folder not found.");
      return;
    }

    await emailService.moveEmail(
      Number(email.id),
      currentUser.id,
      Number(archive.id)
    );

    onRefresh();
    onClose();
  };

  const handleSpam = () => {
    if (!email) return;

    openConfirmDialog({
      title: "Report Spam?",
      message: "Email will be moved to Spam.",
      confirmLabel: "Move to Spam",
      cancelLabel: "Cancel",
      onConfirm: async () => {
        const { data: folders } = await emailService.getFolders(currentUser.id);

        const spam = folders?.find(
          (f) => f.name.toLowerCase() === "spam"
        );

        if (!spam) {
          alert("Spam folder not found.");
          return;
        }

        await emailService.moveEmail(
          Number(email.id),
          currentUser.id,
          Number(spam.id)
        );

        onRefresh();
        onClose();
      }
    });
  };



  // =========================
  // EDIT DRAFT
  // =========================

  const handleEditDraft = async () => {
    if (!email || !onCompose) return;

    const to = email.to_emails?.map((t) => t.email).join(", ") || "";
    const cc = email.cc_emails?.map((c) => c.email).join(", ") || "";

    await emailService.deleteEmail(Number(email.id), currentUser.id);
    onRefresh();

    onCompose({
      to,
      cc,
      subject: email.subject || "",
      body: email.body || ""
    });

    onClose();
  };



  // =========================
  // RENDER – when no email selected
  // =========================

  if (!email) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50">
        <div className="text-center">
          <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center">
            📩
          </div>
          <h3 className="text-lg font-medium">Select an email</h3>
          <p className="text-sm text-gray-500">
            Choose an email to view its contents
          </p>
        </div>
      </div>
    );
  }



  // =========================
  // SENT FOLDER LOGIC
  // =========================

  const isSent = email.folder_name === "Sent";
  const fromName = isSent ? currentUser.email : (email.from_name || email.from_email);
  const fromEmail = isSent ? currentUser.email : email.from_email;
  const toList = isSent
    ? email.to_emails?.map((t) => t.email).join(", ")
    : email.to_header || email.to_emails?.map((t) => t.email).join(", ");




  // =========================
  // MAIN EMAIL CONTENT
  // =========================

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50">

      {/* TOP TOOLBAR */}
      <div className="h-14 bg-white border-b flex items-center px-4 gap-3">

        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-full"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Archive / Spam / Delete */}
        <button onClick={handleArchive} className="p-2 hover:bg-gray-100 rounded-full">
          <Archive className="w-4 h-4" />
        </button>

        <button onClick={handleSpam} className="p-2 hover:bg-red-50 text-red-500 rounded-full">
          <Flag className="w-4 h-4" />
        </button>

        <button onClick={handleDelete} className="p-2 hover:bg-red-50 text-red-500 rounded-full">
          <Trash2 className="w-4 h-4" />
        </button>

        {/* DROPDOWN */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowActions(!showActions);
            }}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showActions && (
            <div className="absolute left-0 top-full mt-1 bg-white border rounded-lg shadow-xl py-2 w-72 text-sm z-50">
              <div className="px-3 py-2 space-y-2">
                <div className="text-xs">
                  <strong>from:</strong>{" "}
                  {fromName} &lt;{fromEmail}&gt;
                </div>

                <div className="text-xs">
                  <strong>to:</strong>{" "}
                  {toList || "(No recipients)"}
                </div>

                <div className="text-xs">
                  <strong>date:</strong>{" "}
                  {formatFullDate(email.sent_at || email.created_at || "")}
                </div>

                <div className="text-xs break-all">
                  <strong>subject:</strong>{" "}
                  {email.subject || "(No subject)"}
                </div>

                <div className="text-xs">
                  <strong>mailed-by:</strong>{" "}
                  {fromEmail.split("@")[1]}
                </div>

                <div className="text-xs">
                  <strong>signed-by:</strong>{" "}
                  {fromEmail.split("@")[1]}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1" />

        <button onClick={toggleStar} className="p-2 hover:bg-yellow-50 rounded-full">
          <Star
            className={`w-4 h-4 ${starred && "text-yellow-500 fill-yellow-500"}`}
          />
        </button>
      </div>



      {/* MAIN CONTENT */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-4">

          {/* SUBJECT */}
          <h1 className="text-2xl font-normal mb-6">
            {email.subject || "(No subject)"}
          </h1>

          {/* CARD */}
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden mb-6">

            {/* Header */}
            <div className="p-4 flex items-start gap-4">

              <div className="w-10 h-10 bg-indigo-500 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                {getInitials(fromName)}
              </div>

              <div className="flex-1">

                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium">{fromName}</h3>
                      <span className="text-xs text-gray-500">
                        &lt;{fromEmail}&gt;
                      </span>
                    </div>

                    <div className="text-xs text-gray-600 mt-1">
                      to {toList || currentUser.email}
                      {email.cc_emails?.length > 0 && (
                        <>
                          , cc{" "}
                          {email.cc_emails.map((c) => c.email).join(", ")}
                        </>
                      )}
                    </div>
                  </div>

                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {formatShortDate(
                      email.sent_at || email.created_at || ""
                    )}
                  </span>
                </div>
              </div>
            </div>



            {/* BODY */}
            <div className="p-4 border-t">
              <div
                className="text-sm leading-relaxed"
                dangerouslySetInnerHTML={{
                  __html: email.body?.replace(/\n/g, "<br>") || ""
                }}
              />
            </div>



            {/* ATTACHMENTS */}
            {email.has_attachments && (
              <div className="p-4 border-t">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Paperclip className="w-4 h-4" /> Attachments
                </h4>

                {/* Placeholder attachment */}
                <div className="p-3 bg-gray-50 rounded-lg border flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center">
                    <Paperclip className="w-6 h-6 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">document.pdf</p>
                    <p className="text-xs text-gray-500">2.4 MB</p>
                  </div>
                </div>
              </div>
            )}
          </div>



          {/* ACTION BUTTONS */}
          <div className="flex flex-wrap gap-2">

            {!email.is_draft ? (
              <>
                <button
                  onClick={handleReply}
                  className="px-4 py-2 bg-white border rounded-lg flex items-center gap-2"
                >
                  <Reply className="w-4 h-4" /> Reply
                </button>

                <button
                  onClick={handleReplyAll}
                  className="px-4 py-2 bg-white border rounded-lg flex items-center gap-2"
                >
                  <ReplyAll className="w-4 h-4" /> Reply All
                </button>

                <button
                  onClick={handleForward}
                  className="px-4 py-2 bg-white border rounded-lg flex items-center gap-2"
                >
                  <Forward className="w-4 h-4" /> Forward
                </button>
              </>
            ) : (
              <button
                onClick={handleEditDraft}
                className="px-4 py-2 bg-green-500 text-white rounded-lg flex items-center gap-2"
              >
                <FileEdit className="w-4 h-4" /> Continue Editing
              </button>
            )}

          </div>
        </div>
      </div>



      {/* CONFIRM DIALOG */}
      {confirmDialog.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">

            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {confirmDialog.title}
              </h3>

              <button
                disabled={confirmDialog.processing}
                onClick={closeConfirmDialog}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-gray-600">
              {confirmDialog.message}
            </p>

            {confirmDialog.error && (
              <p className="text-sm text-red-500 mt-3">
                {confirmDialog.error}
              </p>
            )}

            <div className="flex justify-end gap-3 mt-6">

              <button
                disabled={confirmDialog.processing}
                onClick={closeConfirmDialog}
                className="px-4 py-2 text-sm"
              >
                {confirmDialog.cancelLabel}
              </button>

              <button
                onClick={executeConfirmAction}
                disabled={confirmDialog.processing}
                className="px-5 py-2 bg-red-500 text-white rounded-lg"
              >
                {confirmDialog.processing ? "Working..." : confirmDialog.confirmLabel}
              </button>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}

