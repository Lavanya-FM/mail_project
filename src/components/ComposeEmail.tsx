// ComposeEmail.tsx - Complete implementation with both Regular and P2P send modes
import { useState, useEffect, useRef } from 'react';
import { emailService } from '../lib/emailService';
import { authService } from '../lib/authService';
import { p2pService } from '../lib/p2pService';
import { normalizeEmailBody } from '../utils/email';
import { p2pToast } from '../utils/p2pToasts';
import toast from 'react-hot-toast';
import ComposeUI from './compose/ComposeUI';
import { presenceService } from '../lib/presenceService';
import { fileToBase64 } from '../lib/fileUtils';
import { classifyAttachments } from '../lib/p2pClassifier';


const getFolderIdByName = (name: string) => {
  const folders = JSON.parse(localStorage.getItem("folders") || "[]");
  const f = folders.find((x: any) => x.name.toLowerCase() === name.toLowerCase());
  return f ? Number(f.id) : null;
};

interface ComposeEmailProps {
  onClose: () => void;
  onSent: () => void;
  onDraftSaved?: () => void;
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

  const [draftId, setDraftId] = useState<number | null>(() => {
    if (prefilledData?.is_draft && prefilledData.id) return Number(prefilledData.id);
    return null;
  });

  // Attachments
  const [attachments, setAttachments] = useState<File[]>([]);
  const LARGE_ATTACHMENT_BYTES = 25 * 1024 * 1024;

  // P2P State
  const [profile, setProfile] = useState<any>(null);
  const [p2pConnected, setP2pConnected] = useState(false);
  const [recipientStatus, setRecipientStatus] = useState<'ONLINE' | 'OFFLINE' | 'UNKNOWN'>('UNKNOWN');
  const [p2pFiles, setP2pFiles] = useState<any[]>([]);
  const [showP2PProgress, setShowP2PProgress] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);

  const textareaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const recipientEmail = normalizeEmailField(to).split(',')[0]?.trim();
  // Allow P2P if we have a valid recipient email (Offline P2P Support)
  const recipientP2PCapable = !!recipientEmail;

  const classifications = classifyAttachments(attachments, recipientP2PCapable);
  const hasP2PAttachments = classifications.some(c => c.mode === 'P2P');
  const hasLargeAttachments = attachments.some(f => f.size > LARGE_ATTACHMENT_BYTES);

  // Check if P2P is available (We only need to be connected ourselves)
  const canUseP2P = p2pConnected &&
    recipientP2PCapable &&
    recipientEmail &&
    attachments.length > 0;


  // Draft autosave
  const saveDraft = async () => {
    if (!profile || sending) return;

    setDraftStatus('saving');

    try {
      if (draftId) {
        // UPDATE existing draft
        await emailService.updateDraft(draftId, {
          user_id: profile.id,
          to_emails: to.split(',').map(e => ({ email: e.trim() })).filter(e => e.email),
          cc_emails: cc ? cc.split(',').map(e => ({ email: e.trim() })).filter(e => e.email) : [],
          bcc_emails: bcc ? bcc.split(',').map(e => ({ email: e.trim() })).filter(e => e.email) : [],
          subject,
          body
        });
        setDraftStatus('saved');
      } else {
        // CREATE new draft
        const res = await emailService.createEmail({
          user_id: profile.id,
          from_email: profile.email,
          from_name: profile.full_name,
          to_emails: to.split(',').map(e => ({ email: e.trim() })).filter(e => e.email),
          cc_emails: cc ? cc.split(',').map(e => ({ email: e.trim() })).filter(e => e.email) : [],
          bcc_emails: bcc ? bcc.split(',').map(e => ({ email: e.trim() })).filter(e => e.email) : [],
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
          thread_id: threadId, // if replying
        });

        if (res.data && res.data.email_id) {
          setDraftId(res.data.email_id);
        }
        setDraftStatus('saved');
      }
      onDraftSaved?.();
      setTimeout(() => setDraftStatus('idle'), 2000);
    } catch (err) {
      console.error('Draft save failed:', err);
      setDraftStatus('idle');
    }
  };

  // P2P Progress tracking
  useEffect(() => {
    const progressHandler = (e: any) => {
      const { messageId, fileName, progress, speedBps, etaSeconds, status, reason } = e.detail;

      setP2pFiles(prev => {
        const existing = prev.find(f => f.name === fileName || f.messageId === messageId);

        if (existing) {
          return prev.map(f =>
            (f.name === fileName || f.messageId === messageId)
              ? {
                ...f,
                messageId,
                progress,
                speedBps,
                etaSeconds,
                reason,
                status: progress >= 100 ? 'delivered' : (status || 'transferring')
              }
              : f
          );
        } else if (fileName) { // Ensure we don't add empty entries
          return [...prev, {
            name: fileName,
            size: 0, // Gets updated later or we might miss it here
            progress: progress,
            messageId,
            status: 'transferring',
            speedBps,
            etaSeconds,
            reason
          }];
        }
        return prev;
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

    const errorHandler = async (e: any) => {
      const { messageId, fileName, message } = e.detail;

      setP2pFiles(prev => prev.map(f =>
        (f.messageId === messageId || f.name === fileName)
          ? { ...f, status: 'failed' as const }
          : f
      ));

      // Handle Automatic Fallback Upload
      if (message?.includes('Falling back') || message?.includes('Secure pipe lost')) {
        const file = attachments.find(a => a.name === fileName);
        if (file && profile) {
          const toastId = `fallback-${messageId}`;
          toast.loading(`Fallback: Uploading ${fileName} to server...`, { id: toastId });
          try {
            const base64 = await fileToBase64(file);
            await emailService.updateEmailAttachment({
              p2p_message_id: messageId,
              content_base64: base64,
              delivery_mode: 'FALLBACK'
            });
            toast.success(`Fallback complete: ${fileName} uploaded to server`, { id: toastId });
          } catch (err) {
            console.error('Fallback upload failed:', err);
            toast.error(`Fallback failed for ${fileName}`, { id: toastId });
          }
        }
      }
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
      // Only save if there is content
      if (to || subject || body) {
        saveDraft();
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [to, subject, body, attachments, sending, draftId]); // Depends on draftId now

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

    return () => {
      setP2pConnected(false);
    };
  }, [profile]);

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
    // Note: draftId is set in useState initializer
  }, [prefilledData]);

  // Reactive Presence Detection
  useEffect(() => {
    // Only check presence if we have a valid single email
    if (!recipientEmail || !p2pConnected || recipientEmail.includes(',')) {
      setRecipientStatus('UNKNOWN');
      return;
    }

    const email = recipientEmail.toLowerCase().trim();
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setRecipientStatus('UNKNOWN');
      return;
    }

    // 1. Check initial status from service
    const isOnline = presenceService.isOnline(email);
    setRecipientStatus(isOnline ? 'ONLINE' : 'OFFLINE');

    // 2. Subscribe to updates via presenceService (wrapper around P2P)
    const updateHandler = (peers: Set<string>) => {
      const isNowOnline = peers.has(email);
      setRecipientStatus(isNowOnline ? 'ONLINE' : 'OFFLINE');
    };

    presenceService.onUpdate(updateHandler);

    // 3. Force refresh to get latest status
    presenceService.requestRefresh();

    return () => {
      // cleanup logic is handled by presenceService internals usually, 
      // but here we just stop listening to the wrapper if extended.
      // Since onUpdate currently just registers a callback, we might need a way to unsubscribe 
      // if we want to be perfectly clean, but p2pService listeners are global.
      // For now, this is acceptable as the component unmounts rarely.
    };
  }, [recipientEmail, p2pConnected]);

  // Modal close handler
  useEffect(() => {
    const handleModalClosed = () => {
      setP2pFiles([]);
      setShowP2PProgress(false);
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

  // UNIFIED SEND HANDLER
  const handleSend = async () => {
    if (sending) return;
    if (!profile) { toast.error('Please log in to send email'); return; }
    if (!to.trim()) { toast.error('Please enter a recipient'); return; }

    setSending(true);
    try {
      const p2pAttachmentsMeta = attachments.map((file, idx) => {
        const cls = classifications[idx];
        const isP2P = cls.mode === 'P2P';

        return {
          filename: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          p2p_message_id: isP2P ? uuid() : undefined,
          delivery_mode: isP2P ? 'P2P' : 'EMAIL',
          is_p2p: isP2P,
        };
      });

      // Prepare attachments: metadata-only for P2P, base64 for EMAIL
      const processedAttachments = await Promise.all(attachments.map(async (file, idx) => {
        const cls = classifications[idx];
        const isP2P = cls.mode === 'P2P';

        if (isP2P) {
          return {
            filename: file.name,
            mime_type: file.type,
            size_bytes: file.size,
            p2p_message_id: p2pAttachmentsMeta[idx].p2p_message_id,
            delivery_mode: 'P2P',
            is_p2p: true,
            content_base64: null
          };
        } else {
          const base64 = await fileToBase64(file);
          return {
            filename: file.name,
            mime_type: file.type,
            size_bytes: file.size,
            delivery_mode: 'EMAIL',
            is_p2p: false,
            content_base64: base64
          };
        }
      }));

      await emailService.createEmail({
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
        p2p_enabled: hasP2PAttachments,
        p2p_delivered: false,
        attachments: processedAttachments
      });

      // CLEANUP DRAFT IF EXISTS
      if (draftId) {
        await emailService.deletePermanently(draftId, profile.id).catch(e => console.error("Draft cleanup error", e));
      }

      const p2pList = p2pAttachmentsMeta.filter(a => a.is_p2p);
      const p2pFilesToStart = attachments.filter((_, idx) => classifications[idx].mode === 'P2P');

      if (p2pList.length > 0) {
        setP2pFiles(p2pList.map(a => ({
          name: a.filename,
          size: a.size_bytes,
          progress: 0,
          status: 'pending',
          messageId: a.p2p_message_id
        })));

        setShowP2PProgress(true);
        const recipients = to.split(',').map(e => e.trim()).filter(Boolean);

        await p2pService.startTransfer(
          recipients,
          p2pFilesToStart,
          p2pList.map(a => a.p2p_message_id!)
        );

        toast.success(`✓ Email sent, ${p2pList.length} files queued for secure delivery`);
      } else {
        toast.success('✓ Email sent successfully');
      }

      onSent?.();
      onClose();
    } catch (err: any) {
      console.error('[SEND FAILED]', err);
      toast.error(err?.message || 'Failed to send email');
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
      onP2PSend={handleSend}
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
      onScheduleSend={(min) => { toast(`Scheduled in ${min} minutes`); }}
      onBodyInput={(html) => { setBody(html); }}
      onBodyKeyDown={handleKeyDown}
      bodyRef={textareaRef}
      fileInputRef={fileInputRef}
      p2pFiles={p2pFiles}
      showP2PProgress={showP2PProgress}
      setShowP2PProgress={setShowP2PProgress}
      recipientEmail={recipientEmail}
      canUseP2P={canUseP2P}
      classifications={classifications}
      hasLargeAttachments={hasLargeAttachments}
      hasSessionKey={(email) => p2pService.hasSessionKey?.(email) || false}
      normalizeEmailField={normalizeEmailField}
    />
  );
}
