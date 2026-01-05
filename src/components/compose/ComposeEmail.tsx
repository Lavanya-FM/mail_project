// ComposeEmail.tsx - Complete implementation with two send modes
import { useState, useEffect, useRef } from 'react';
import { emailService } from '../../lib/emailService';
import { authService } from '../../lib/authService';
import { p2pService } from '../../lib/p2pService';
import { normalizeEmailBody } from '../../utils/email';
import toast from 'react-hot-toast';
import ComposeUI from './ComposeUI';
import { presenceService } from '../../lib/presenceService';
import { filesToBase64 } from '../../lib/fileUtils';
import { MAX_EMAIL_ATTACHMENT_BYTES } from '../../constants/attachmentLimits';

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
  const { onClose, onSent, onDraftSaved, prefilledData } = props;

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
    p2pService.hasSessionKey?.(recipientEmail) &&
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

    presenceService.connect(profile.email, profile.id);
    p2pService.connect(profile.id, profile.email);

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
    setTo(normalizeEmailField(prefilledData.to));
    setCc(normalizeEmailField(prefilledData.cc));
    setBcc(normalizeEmailField(prefilledData.bcc));
    setSubject(prefilledData.subject || "");
    const normalizedBody = normalizeEmailBody(prefilledData.body) || "";
    setBody(normalizedBody);
    if (prefilledData.cc) setShowCc(true);
    if (textareaRef.current) textareaRef.current.innerHTML = normalizedBody;
    if (prefilledData.threadId) setThreadId(prefilledData.threadId);
  }, [prefilledData]);

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
    const handleModalClosed = () => {
      const allDelivered = p2pFiles.every(f => f.status === 'delivered');

      if (allDelivered && p2pFiles.length > 0) {
        setP2pFiles([]);
        setShowP2PProgress(false);
        onSent?.();
        onClose();
      }
    };

    window.addEventListener('p2p-modal-closed', handleModalClosed);
    return () => window.removeEventListener('p2p-modal-closed', handleModalClosed);
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
  toast.error('Email attachments must be under 25MB. Use P2P.');
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

      // STEP 1: generate stable P2P IDs
      const p2pAttachments = attachments.map(file => ({
        filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        p2p_message_id: uuid(),
      }));

      // STEP 2: create email + attachment metadata ONCE
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
        p2p_delivered: false,

        attachments: p2pAttachments.map(a => ({
          ...a,
          content_base64: null
        }))
      });

      // STEP 3: UI state
      setP2pFiles(
        p2pAttachments.map(a => ({
          name: a.filename,
          size: a.size_bytes,
          progress: 0,
          status: 'pending',
          messageId: a.p2p_message_id
        }))
      );

      setShowP2PProgress(true);

      // STEP 4: start P2P transfer
      await p2pService.startTransfer(
        recipientEmail,
        attachments,
        p2pAttachments.map(a => a.p2p_message_id)
      );


      toast.success('✓ Email sent, transferring files via P2P');

      // Don't close - wait for P2P progress modal

    } catch (err: any) {
      console.error('[P2P SEND FAILED]', err);
      toast.error(err?.message || 'Failed to send via P2P');

      setP2pFiles(prev => prev.map(f => ({ ...f, status: 'failed' as const })));
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
    />
  );
}
