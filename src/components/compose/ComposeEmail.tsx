// ComposeEmail.tsx - Complete implementation with two send modes
import React, { useState, useEffect, useRef } from 'react';
import { emailService } from '../../lib/emailService';
import { authService } from '../../lib/authService';
import { p2pService } from '../../lib/p2pService';
import { normalizeEmailBody } from '../../utils/email';
import { p2pToast } from '../../utils/p2pToasts';
import toast from 'react-hot-toast';
import ComposeUI from './ComposeUI';
import { presenceService } from '../../lib/presenceService';
import { filesToBase64 } from '../../lib/fileUtils';
import { MAX_EMAIL_ATTACHMENT_BYTES } from '../../constants/attachmentLimits';
import { createManifest, manifestToBase64 } from '../../lib/p2pManifest';

const getFolderIdByName = (name: string) => {
  const folders = JSON.parse(localStorage.getItem("folders") || "[]");
  const f = folders.find((x: any) => x.name.toLowerCase() === name.toLowerCase());
  return f ? Number(f.id) : null;
};

interface ComposeEmailProps {
  onClose: () => void;
  onSent: () => void;
  onDraftSaved: () => void;
  prefilledData?: any;
}

const normalizeEmailField = (val: any): string => {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val))
    return val.map(v => typeof v === "string" ? v : (v.email || v.address || "")).filter(Boolean).join(", ");
  if (typeof val === "object") return val.email || val.address || "";
  return "";
};

export default function ComposeEmail(props: ComposeEmailProps) {
  const { onClose, onSent, prefilledData } = props;

  // Form State
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [sending, setSending] = useState(false);
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const uuid = () => window.crypto.randomUUID();


  // Attachments
  const [attachments, setAttachments] = useState<File[]>([]);
  const LARGE_ATTACHMENT_BYTES = 5 * 1024 * 1024;

  // P2P State
  const [profile, setProfile] = useState<any>(null);
  const [p2pConnected, setP2pConnected] = useState(false);
  const [recipientStatus, setRecipientStatus] = useState<'online' | 'offline' | 'unknown'>('unknown');
  const [p2pFiles, setP2pFiles] = useState<any[]>([]);
  const [showP2PProgress, setShowP2PProgress] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);

  const textareaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasLargeAttachments = attachments.some(f => f.size > LARGE_ATTACHMENT_BYTES);
  const recipientEmail = normalizeEmailField(to).split(',')[0]?.trim();

  // Check if P2P is available
  const canUseP2P = p2pConnected &&
    recipientStatus === 'online' &&
    recipientEmail &&
    attachments.length > 0;

  // Draft autosave
  const saveDraft = async () => {
    if (!profile || sending) return;

    setDraftStatus('saving');

    try {
      await emailService.createEmail({
        user_id: profile.id,
        from_email: profile.email,
        from_name: profile.full_name,
        to_emails: [],
        cc_emails: [],
        bcc_emails: [],
        subject,
        body,
        attachments: attachments.map(f => ({
          filename: f.name,
          mime_type: f.type,
          size_bytes: f.size,
          content_base64: null
        })),
        is_draft: true,
        folder_id: getFolderIdByName('draft'),
      });
      setDraftStatus('saved');
      setTimeout(() => setDraftStatus('idle'), 2000);
    } catch (err) {
      console.error('Draft save failed:', err);
      setDraftStatus('idle');
    }
  };

  // P2P Progress tracking
  useEffect(() => {
    const progressHandler = (e: any) => {
      const { messageId, fileName, progress } = e.detail;

      setP2pFiles(prev => {
        const existing = prev.find(f => f.name === fileName || f.messageId === messageId);

        if (existing) {
          return prev.map(f =>
            (f.name === fileName || f.messageId === messageId)
              ? {
                ...f,
                messageId,
                progress,
                status: progress >= 100 ? 'delivered' : 'transferring'
              }
              : f
          );
        } else {
          const attachment = attachments.find(a => a.name === fileName);

          return [...prev, {
            name: fileName,
            size: attachment?.size || 0,
            progress,
            status: progress > 0 ? 'transferring' : 'pending',
            messageId
          }];
        }
      });
    };

    const deliveredHandler = (e: any) => {
      const { messageId, fileName } = e.detail;

      setP2pFiles(prev => prev.map(f =>
        (f.messageId === messageId || f.name === fileName)
          ? { ...f, status: 'delivered' as const, progress: 100 }
          : f
      ));

      // Show toast notification
      p2pToast.delivered(fileName);
    };

    const errorHandler = (e: any) => {
      const { messageId, fileName } = e.detail;

      setP2pFiles(prev => prev.map(f =>
        (f.messageId === messageId || f.name === fileName)
          ? { ...f, status: 'failed' as const }
          : f
      ));
    };

    window.addEventListener('p2p-progress', progressHandler);
    window.addEventListener('p2p-delivered', deliveredHandler);
    window.addEventListener('p2p-error', errorHandler);

    return () => {
      window.removeEventListener('p2p-progress', progressHandler);
      window.removeEventListener('p2p-delivered', deliveredHandler);
      window.removeEventListener('p2p-error', errorHandler);
    };
  }, [attachments]);

  // Auto draft save
  useEffect(() => {
    if (sending) return;

    const timer = setTimeout(() => {
      if (to || subject || body) {
        saveDraft();
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [to, subject, body, attachments, sending]);

  // Load user
  useEffect(() => {
    setProfile(authService.getCurrentUser());
  }, []);

  // Connect P2P
  useEffect(() => {
    if (!profile) return;

    // P2P service is already initialized in MainApp
    // Just connect presence service for recipient status
    presenceService.connect(profile.email, profile.id);

    setP2pConnected(true);

    const updateStatus = (online: Set<string>) => {
      if (!to.trim()) {
        setRecipientStatus('unknown');
        return;
      }

      const recipient = normalizeEmailField(to).split(',')[0]?.trim();
      if (!recipient) return;

      setRecipientStatus(online.has(recipient) ? 'online' : 'offline');
    };

    presenceService.onUpdate(updateStatus);

    return () => {
      setP2pConnected(false);
    };
  }, [profile, to]);

  // Prefill
  useEffect(() => {
    if (!prefilledData) return;

    let targetTo = normalizeEmailField(prefilledData.to);

    setTo(targetTo);
    setCc(normalizeEmailField(prefilledData.cc));
    setBcc(normalizeEmailField(prefilledData.bcc));
    setSubject(prefilledData.subject || "");
    const normalizedBody = normalizeEmailBody(prefilledData.body) || "";
    setBody(normalizedBody);
    if (prefilledData.cc) setShowCc(true);
    if (textareaRef.current) textareaRef.current.innerHTML = normalizedBody;
    if (prefilledData.threadId) setThreadId(prefilledData.threadId);
  }, [prefilledData, profile]);

  // Check recipient status
  useEffect(() => {
    if (!to.trim() || !p2pConnected) {
      setRecipientStatus('unknown');
      return;
    }

    const email = normalizeEmailField(to).split(',')[0]?.trim();
    if (!email) return;

    const checkStatus = () => {
      const online = p2pService.isPeerOnline?.(email);
      setRecipientStatus(online ? 'online' : 'offline');
    };

    checkStatus();
    const interval = setInterval(checkStatus, 2000);

    return () => clearInterval(interval);
  }, [to, p2pConnected]);

  // Modal close handler
  useEffect(() => {
    // No longer needed to block close for P2P
  }, [p2pFiles, onSent, onClose]);

  // Attachment helpers
  const isImageFile = (file: File) => /^image\/(png|jpe?g|gif|webp)$/i.test(file.type);

  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    const kb = size / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments(prev => [...prev, ...files]);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Formatting
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') {
        e.preventDefault();
        textareaRef.current?.focus();
        document.execCommand('bold', false);
      } else if (e.key === 'i') {
        e.preventDefault();
        textareaRef.current?.focus();
        document.execCommand('italic', false);
      }
    }
  };

  // ==================== SEND MODES ====================

  // MODE 1: Regular Email Send
  const handleRegularSend = async () => {
    if (sending) return;

    if (!profile) {
      toast.error('Please log in to send email');
      return;
    }

    if (!to.trim()) {
      toast.error('Please enter a recipient');
      return;
    }

    setSending(true);

    try {
      console.log('[REGULAR SEND] Sending email with attachments via server');

      const emailData: any = {
        user_id: profile.id,
        from_email: profile.email,
        from_name: profile.full_name || profile.email,
        to_emails: to.split(',').map(e => ({ email: e.trim() })),
        cc_emails: cc ? cc.split(',').map(e => ({ email: e.trim() })) : [],
        bcc_emails: bcc ? bcc.split(',').map(e => ({ email: e.trim() })) : [],
        subject: subject || '(no subject)',
        body: normalizeEmailBody(textareaRef.current?.innerHTML || body),
        is_draft: false,
        folder_id: getFolderIdByName('sent'),
        thread_id: threadId ?? null,
        p2p_enabled: false,
        p2p_delivered: false,
      };

      if (attachments.some(f => f.size > MAX_EMAIL_ATTACHMENT_BYTES)) {
        if (canUseP2P) {
          console.log('[REGULAR SEND] Switching to P2P for large files');
          setSending(false); // handleP2PSend sets it to true
          handleP2PSend();
          return;
        }

        toast.error('File too large (>25MB) and recipient is offline. Cannot use P2P.');
        setSending(false);
        return;
      }

      // Always send full attachments for regular email
      if (attachments.length > 0) {
        const encoded = await filesToBase64(attachments);
        emailData.attachments = encoded;
      } else {
        emailData.attachments = [];
      }

      await emailService.createEmail(emailData);

      toast.success('✓ Email sent successfully');
      onSent?.();
      onClose();

    } catch (err: any) {
      console.error('[REGULAR SEND FAILED]', err);
      toast.error(err?.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  // MODE 2: P2P Transfer Send
  const handleP2PSend = async () => {
    if (sending) return;

    if (!profile) {
      toast.error('Please log in to send email');
      return;
    }

    if (!to.trim()) {
      toast.error('Please enter a recipient');
      return;
    }

    if (!canUseP2P) {
      toast.error('P2P transfer not available. Recipient must be online.');
      return;
    }

    if (attachments.length === 0) {
      toast.error('No attachments to transfer via P2P');
      return;
    }

    setSending(true);

    try {
      console.log('[P2P SEND] Starting P2P transfer to:', recipientEmail);

      // Support multiple recipients (comma-separated)
      const recipients = to.split(',').map(e => e.trim()).filter(Boolean);
      const P2P_THRESHOLD = 5 * 1024 * 1024; // 5MB

      const processedAttachments = [];
      const p2pMessageIds: string[] = [];
      const p2pFilesToSeed: File[] = [];

      // STEP 1: Process attachments (Generate Manifests for Large Files)
      for (const file of attachments) {
        if (file.size > P2P_THRESHOLD) {
          // LARGE FILE -> MANIFEST
          const senderEmail = profile.email; // Ensure this is available
          const manifest = await createManifest(file, senderEmail);
          const manifestBase64 = manifestToBase64(manifest);

          processedAttachments.push({
            filename: file.name, // Display ORIGINAL filename, not .p2p
            mime_type: 'application/x-jeemail-manifest+json',
            size_bytes: file.size, // Use REAL file size for UI display, not manifest size
            content_base64: manifestBase64,
            p2p_message_id: manifest.attachmentId,
            delivery_mode: 'P2P',
            is_p2p: true
          });

          p2pMessageIds.push(manifest.attachmentId);
          p2pFilesToSeed.push(file);

        } else {
          // SMALL FILE -> STANDARD ATTACHMENT (or P2P Direct)
          // For consistency with P2P mode, we can still use P2P direct transfer
          // OR just send it as a regular attachment if it's small?
          // The user clicked "Via P2P", so we should try to use P2P transfer even for small files
          // to save server storage/bandwidth, but for robustness small files are better on server.
          // Let's use P2P for everything since "Via P2P" was clicked, BUT
          // allow server fallback (content_base64) for small files.

          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(file);
          });

          const msgId = uuid();
          processedAttachments.push({
            filename: file.name,
            mime_type: file.type,
            size_bytes: file.size,
            content_base64: base64, // Fallback allowed
            p2p_message_id: msgId,
            delivery_mode: 'P2P',
            is_p2p: true
          });

          p2pMessageIds.push(msgId);
          p2pFilesToSeed.push(file);
        }
      }

      // STEP 2: Start Seeding (Non-blocking)
      // We don't await this strictly before sending email to ensure UI responsiveness,
      // but it's good to ensure registration happens.
      await p2pService.startTransfer(recipients, p2pFilesToSeed, p2pMessageIds);

      // STEP 3: Send Email with Metadata
      await emailService.createEmail({
        user_id: profile.id,
        from_email: profile.email,
        from_name: profile.full_name || profile.email,
        to_emails: to.split(',').map(e => ({ email: e.trim() })),
        subject: subject || '(no subject)',
        body: normalizeEmailBody(textareaRef.current?.innerHTML || body),
        is_draft: false,
        folder_id: getFolderIdByName('sent'),
        thread_id: threadId ?? null,

        p2p_enabled: true,
        p2p_delivered: false, // Metadata sent, content pending P2P

        attachments: processedAttachments
      });

      // Close immediately (Metadata-First / Non-Blocking)
      onSent?.();
      onClose();

    } catch (err: any) {
      console.error('[P2P SEND FAILED]', err);
      toast.error(err?.message || 'Failed to send via P2P');
    } finally {
      setSending(false);
    }
  };

  return (
    <ComposeUI
      to={to}
      cc={cc}
      bcc={bcc}
      subject={subject}

      setTo={setTo}
      setCc={setCc}
      setBcc={setBcc}
      setSubject={setSubject}

      showCc={showCc}
      showBcc={showBcc}
      setShowCc={setShowCc}
      setShowBcc={setShowBcc}

      sending={sending}
      liveRecipientStatus={recipientStatus}
      draftStatus={draftStatus}

      attachments={attachments}
      isImageFile={isImageFile}
      removeAttachment={removeAttachment}
      formatFileSize={formatFileSize}

      onRegularSend={handleRegularSend}
      onP2PSend={handleP2PSend}
      onClose={onClose}
      onLocalAttach={handleFileSelect}
      onDriveAttach={(files) => setAttachments(prev => [...prev, ...files])}

      onInsertEmoji={(emoji) => {
        textareaRef.current?.focus();
        document.execCommand('insertText', false, emoji);
      }}

      onInsertLink={(url) => {
        if (!url) return;
        textareaRef.current?.focus();
        document.execCommand('createLink', false, url);
      }}

      onScheduleSend={(min) => {
        toast(`Scheduled in ${min} minutes`);
      }}

      onBodyInput={(html) => {
        setBody(html);
      }}

      onBodyKeyDown={handleKeyDown}

      bodyRef={textareaRef}
      fileInputRef={fileInputRef}

      p2pFiles={p2pFiles}
      showP2PProgress={showP2PProgress}
      setShowP2PProgress={setShowP2PProgress}
      recipientEmail={recipientEmail}
      deliveryMode={canUseP2P ? 'P2P' : 'EMAIL'}

      p2pConnected={p2pConnected}
      canUseP2P={canUseP2P}
      hasLargeAttachments={hasLargeAttachments}
      hasSessionKey={(email) => p2pService.hasSessionKey?.(email) || false}
      normalizeEmailField={normalizeEmailField}
      fromEmail={profile?.email}
    />
  );
}
