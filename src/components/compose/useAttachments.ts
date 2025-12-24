import { useState } from 'react';
import toast from 'react-hot-toast';

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export function useAttachments() {
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);

  const totalBytes = attachments.reduce((s, f) => s + f.size, 0);

  const isImageFile = (file: File) =>
    /^image\/(png|jpe?g|gif|webp)$/i.test(file.type);

  function handleFileSelect(files: File[]) {
    const valid = files.filter(f => {
      if (f.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`${f.name} exceeds 25MB`);
        return false;
      }
      return true;
    });
    setAttachments(prev => [...prev, ...valid]);
  }

  function removeAttachment(i: number) {
    setAttachments(prev => prev.filter((_, idx) => idx !== i));
  }

  async function fileToBase64(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        res(reader.result!.toString().replace(/^data:.+;base64,/, ''));
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });
  }

  async function prepareAttachments() {
    const out = [];
    for (const f of attachments) {
      const base64 = await fileToBase64(f);
      out.push({
        filename: f.name,
        content: base64,
        encoding: 'base64',
        size: f.size,
        mime_type: f.type || 'application/octet-stream',
        is_image: isImageFile(f),
      });
    }
    return out;
  }

  return {
    attachments,
    setAttachments,
    uploadProgress,
    totalBytes,
    isImageFile,
    handleFileSelect,
    removeAttachment,
    prepareAttachments,
  };
}
