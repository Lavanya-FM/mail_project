type Props = {
  emailId: number;
  attachment: {
    id: number;
    filename: string;
    mime_type?: string;
  };
  onClose: () => void;
};

export default function AttachmentViewer({ emailId, attachment, onClose }: Props) {
  const fileUrl = `/email/${emailId}/attachment/${attachment.id}`;
  const mime = attachment.mime_type || "";

  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf";
  const isDoc =
    mime.includes("officedocument") ||
    attachment.filename.endsWith(".docx");

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <div className="bg-white w-[90vw] h-[90vh] rounded-xl overflow-hidden relative">

        <button
          onClick={onClose}
          className="absolute top-3 right-3 px-3 py-1 bg-gray-100 rounded z-10"
        >
          ✕
        </button>

        {isImage && (
          <img src={fileUrl} className="w-full h-full object-contain" />
        )}

        {isPdf && (
          <iframe src={fileUrl} className="w-full h-full" />
        )}

        {isDoc && (
          <iframe
            src={`https://docs.google.com/gview?url=${encodeURIComponent(
              window.location.origin + fileUrl
            )}&embedded=true`}
            className="w-full h-full"
          />
        )}

        {!isImage && !isPdf && !isDoc && (
          <div className="flex items-center justify-center h-full">
            <a
              href={`${fileUrl}?download=1`}
              className="px-4 py-2 bg-blue-600 text-white rounded"
            >
              Download
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
