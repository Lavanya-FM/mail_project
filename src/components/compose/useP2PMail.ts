import { useState } from 'react';
import { p2pService } from '../../lib/p2pService';
import { emailService } from '../../lib/emailService';
import { createManifest, manifestToBase64 } from '../../lib/p2pManifest';
import { authService } from '../../lib/authService';
import toast from 'react-hot-toast';

export function useP2PMail(ui: any, attachments: any) {
  const [showProgress, setShowProgress] = useState(false);

  async function send() {
    try {
      setShowProgress(true);
      const user = authService.getCurrentUser();
      const senderEmail = user ? user.email : (ui.basePayload.from_email || 'unknown@jeemail.in');

      // 5MB Threshold for P2P Manifest
      const P2P_THRESHOLD = 5 * 1024 * 1024;

      const processedAttachments = [];
      const rawFiles = attachments.attachments || [];
      const p2pMessageIds: string[] = [];
      const p2pFiles: File[] = [];

      for (const att of rawFiles) {
        const file = att.file;

        // Check conditions for P2P: Large file
        if (file.size > P2P_THRESHOLD) {
          // Generate Manifest
          const manifest = await createManifest(file, senderEmail);
          const manifestBase64 = manifestToBase64(manifest);

          // Add to payload as manifest
          processedAttachments.push({
            filename: `${file.name}.p2p`,
            mime_type: 'application/x-jeemail-manifest+json',
            size: manifestBase64.length,
            content_base64: manifestBase64,
            p2p_message_id: manifest.attachmentId
          });

          // Prepare to seed
          p2pMessageIds.push(manifest.attachmentId);
          p2pFiles.push(file);

        } else {
          // Normal attachment
          const buffer = await file.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
          );
          processedAttachments.push({
            filename: file.name,
            mime_type: file.type,
            size: file.size,
            content_base64: base64
          });
        }
      }

      // If we have P2P files, register them for seeding
      if (p2pFiles.length > 0) {
        // We start transfer to make them available. 
        // Note: recipient might be offline, so this just registers them in p2pService active session.
        // p2pService.startTransfer expects recipient email.
        const recipient = ui.recipientEmail;
        // If multiple recipients, logic gets complex. Assuming single or broadcasting intent.
        // startTransfer iterates over recipients if array.
        const recipients = Array.isArray(recipient) ? recipient : [recipient];

        // We do this non-blocking
        p2pService.startTransfer(recipients, p2pFiles, p2pMessageIds)
          .catch(err => console.error("Failed to start P2P seeding", err));

        toast.success(`Encrypted ${p2pFiles.length} file(s) for P2P delivery`);
      }

      // Send Email with Metadata
      await emailService.createEmail({
        ...ui.basePayload,
        attachments: processedAttachments,
        p2p_enabled: p2pFiles.length > 0,
        p2p_delivered: false, // Not delivered yet, just metadata sent
      });

      ui.onSent();
      ui.onClose();
      return true;

    } catch (e) {
      console.error(e);
      toast.error('Failed to send email');
      return false;
    } finally {
      setShowProgress(false);
    }
  }

  return {
    send,
    p2pFiles: [],
    showProgress,
  };
}
