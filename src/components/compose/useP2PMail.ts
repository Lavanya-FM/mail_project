import { useEffect, useState } from 'react';
import { p2pService } from '../../lib/p2pService';
import { emailService } from '../../lib/emailService';
import toast from 'react-hot-toast';

export function useP2PMail(ui: any, attachments: any) {
  const [p2pFiles, setP2pFiles] = useState<any[]>([]);
  const [showProgress, setShowProgress] = useState(false);

  useEffect(() => {
    const onDelivered = async () => {
      const finalAttachments = await attachments.prepareAttachments();

      await emailService.createEmail({
        ...ui.basePayload,
        attachments: finalAttachments,
        p2p_enabled: true,
        p2p_delivered: true,
      });

      toast.success('P2P delivered');
      ui.onSent();
      ui.onClose();
    };

    window.addEventListener('p2p-delivered', onDelivered);
    return () => window.removeEventListener('p2p-delivered', onDelivered);
  }, []);

  async function send() {
    try {
      setShowProgress(true);
      await p2pService.startTransfer({
        recipientEmail: ui.recipientEmail,
        subject: ui.subject,
        body: ui.body,
        attachments: attachments.attachments,
      });
      return true;
    } catch {
      toast.error('P2P failed, fallback to email');
      return false;
    }
  }

  return {
    send,
    p2pFiles,
    showProgress,
  };
}
