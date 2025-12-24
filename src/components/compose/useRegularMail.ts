import { emailService } from '../../lib/emailService';

export function useRegularMail(ui: any, attachments: any) {
  async function send() {
    const finalAttachments = await attachments.prepareAttachments();
    const [attachments, setAttachments] = useState<File[]>([]);

    await emailService.createEmail({
      user_id: ui.profile.id,
      from_email: ui.profile.email,
      from_name: ui.profile.full_name || ui.profile.email,
      to_emails: ui.toList,
      cc_emails: ui.ccList,
      bcc_emails: ui.bccList,
      subject: ui.subject,
      body: ui.body,
      attachments: finalAttachments,
      is_draft: false,
      folder_id: ui.sentFolderId,
      thread_id: ui.threadId,
      p2p_enabled: false,
      p2p_delivered: false,
    });

    ui.onSent();
    ui.onClose();
  }

  return { send };
}
