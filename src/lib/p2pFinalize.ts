import { emailService } from './emailService';
import { getIncoming } from './p2pReceiveStore';

export async function finalizeIncoming(messageId: string) {
  const incoming = getIncoming(messageId);
  if (!incoming) return;

  const attachments = [];

  for (const file of incoming.files.values()) {
    const ordered = [...file.receivedChunks.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, data]) => data);

    const blob = new Blob(ordered, { type: file.mime });
    const base64 = await blobToBase64(blob);

    attachments.push({
      filename: file.filename,
      content: base64,
      size: file.size,
      mime_type: file.mime,
      encoding: 'base64'
    });
  }

  // SAVE EMAIL FOR RECIPIENT
  await emailService.createEmail({
    user_id: 'ME', // backend resolves via auth
    from_email: incoming.from,
    to_emails: [{ email: authService.getCurrentUser().email }],
    subject: incoming.subject,
    body: incoming.body,
    attachments,
    is_draft: false,
    p2p_delivered: true
  });

  window.dispatchEvent(
    new CustomEvent('p2p-received', { detail: { messageId } })
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () =>
      res(r.result!.toString().replace(/^data:.+;base64,/, ''));
    r.readAsDataURL(blob);
  });
}
