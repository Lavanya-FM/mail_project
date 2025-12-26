// src/components/AttachmentPreview.tsx
import { Download, Image as ImageIcon, FileText, File } from "lucide-react";

type Attachment = {
  id?: number;
  filename: string;
  mime_type?: string;
  size?: number;
};

type Props = {
  attachments: Attachment[];
  emailId?: number | string;
};

const isImage = (mime?: string) => mime?.startsWith("image/");
const isPdf = (mime?: string) => mime === "application/pdf";

const formatBytes = (bytes = 0) => {
  if (!bytes) return "";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

export default function AttachmentPreview({ attachments, emailId }: Props) {
  if (!attachments.length) return null;

  return (
    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
      {attachments.map((a, idx) => {
        const previewable = isImage(a.mime_type) || isPdf(a.mime_type);

        const downloadUrl =
          emailId && a.id
            ? `/email/${emailId}/attachment/${a.id}`
            : undefined;

        return (
          <div
            key={idx}
            className="flex items-center gap-3 border border-gray-200 dark:border-slate-700 rounded-xl p-3 bg-gray-50 dark:bg-slate-800"
          >
            {/* Icon */}
            <div className="flex-shrink-0">
              {isImage(a.mime_type) ? (
                <ImageIcon className="w-6 h-6 text-blue-500" />
              ) : isPdf(a.mime_type) ? (
                <FileText className="w-6 h-6 text-red-500" />
              ) : (
                <File className="w-6 h-6 text-gray-500" />
              )}
            </div>

            {/* Meta */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{a.filename}</p>
              <p className="text-xs text-gray-500">
                {formatBytes(a.size)}
              </p>
            </div>

            {/* Actions */}
            {downloadUrl && (
<button
  onClick={() => emailId && a.id && window.dispatchEvent(
    new CustomEvent("open-attachment", {
      detail: { emailId, attachment: a }
    })
  )}
  className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700"
>
  <Download className="w-4 h-4" />
</button>

            )}
          </div>
        );
      })}
    </div>
  );
}
