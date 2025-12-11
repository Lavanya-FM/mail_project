import { useState, useEffect } from "react";
function resolveCIDImages(html: string, attachments: any[]) { 
  if (!html || !attachments) return html; 
  let updated = html; 
  attachments.forEach(att => { 
    if (!att || !att.inline_cid || !att.content_base64) return; 
    const cidPattern = new RegExp(`cid:${att.inline_cid}`, "g"); 
    const dataUrl = `data:${att.mime_type};base64,${att.content_base64}`; 
    updated = updated.replace(cidPattern, dataUrl); 
  }); 
  return updated; 
} 

import { X, Download, File } from "lucide-react";
function resolveCIDImages(html: string, attachments: any[]) { 
  if (!html || !attachments) return html; 
  let updated = html; 
  attachments.forEach(att => { 
    if (!att || !att.inline_cid || !att.content_base64) return; 
    const cidPattern = new RegExp(`cid:${att.inline_cid}`, "g"); 
    const dataUrl = `data:${att.mime_type};base64,${att.content_base64}`; 
    updated = updated.replace(cidPattern, dataUrl); 
  }); 
  return updated; 
} 


interface ReadEmailProps {
  email: any;     // full email object returned from backend
  onClose: () => void;
}

/* ===============================================
    FETCH SINGLE ATTACHMENT (Base64)
   =============================================== */
async function fetchAttachment(emailId: number, attId: number) {
  const res = await fetch(`/api/email/${emailId}/attachment/${attId}`);
  if (!res.ok) return null;
  return await res.json(); // contains content_base64
}

/* ===============================================
    RESOLVE CID INLINE <img src="cid:...">
   =============================================== */
async function resolveCIDImages(body: string, emailId: number, attachments: any[]) {
  if (!body || !attachments?.length) return body;

  let updated = body;

  for (const att of attachments) {
    if (!att.filename) continue;
    const cidPattern = `cid:${att.filename}`;

    if (!updated.includes(cidPattern)) continue;

    const data = await fetchAttachment(emailId, att.id);
    if (!data?.content_base64) continue;

    const dataUrl = `data:${data.mime_type};base64,${data.content_base64}`;
    updated = updated.replaceAll(cidPattern, dataUrl);
  }

  return updated;
}

export default function ReadEmail({ email, onClose }: ReadEmailProps) {
  const [htmlBody, setHtmlBody] = useState(email.body || "");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  /* ===============================================
      LOAD INLINE CID IMAGES INTO HTML BODY
     =============================================== */
  useEffect(() => {
    (async () => {
      const resolved = await resolveCIDImages(
        email.body || "",
        email.id,
        email.attachments || []
      );
      setHtmlBody(resolved);
    })();
  }, [email]);

  const formatSize = (size: number) => {
    if (!size) return "0 B";
    if (size < 1024) return `${size} B`;
    const kb = size / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
  };

  const isImage = (att: any) =>
    att.mime_type?.startsWith("image/") ||
    /\.(png|jpg|jpeg|gif|webp)$/i.test(att.filename || "");

  /* ===============================================
      DOWNLOAD ATTACHMENT
     =============================================== */
  const downloadAttachment = async (att: any) => {
    const data = await fetchAttachment(email.id, att.id);
    if (!data) return;

    const url = `data:${data.mime_type};base64,${data.content_base64}`;
    const link = document.createElement("a");
    link.href = url;
    link.download = att.filename;
    link.click();
  };

  /* ===============================================
      OPEN PREVIEW (IMAGE FETCH)
     =============================================== */
  const openPreview = async (att: any) => {
    const data = await fetchAttachment(email.id, att.id);
    if (!data) return;
    const url = `data:${data.mime_type};base64,${data.content_base64}`;
    setPreviewImage(url);
  };

  return (
    <div className="w-full h-full overflow-y-auto bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700 p-5">

      {/* HEADER */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            {email.subject}
          </h1>
          <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
            {email.from_name || email.from_email} &lt;{email.from_email}&gt;
          </p>
          <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
            to {email.to_emails?.map((t: any) => t.email).join(", ")}
          </p>
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-800 transition text-gray-500 dark:text-slate-400"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* BODY */}
      <div
        className="prose dark:prose-invert max-w-none mb-6 text-gray-800 dark:text-slate-200"
        dangerouslySetInnerHTML={{ __html: resolveCIDImages(email.body, attachments) }}
      />

      {/* ATTACHMENTS */}
      {email.attachments?.length > 0 && (
        <div className="mt-6 border-t border-gray-200 dark:border-slate-700 pt-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-3">
            Attachments ({email.attachments.length})
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {email.attachments.map((att: any, index: number) => {
              const img = isImage(att);

              return (
                <div
                  key={index}
                  className="bg-gray-100 dark:bg-slate-800 rounded-lg p-3 border border-gray-200 dark:border-slate-700 flex gap-3 items-start"
                >

                  {/* IMAGE THUMBNAIL (FETCHED ON DEMAND) */}
                  {img ? (
                    <button
                      className="w-24 h-24"
                      onClick={() => openPreview(att)}
                    >
                      <div className="w-24 h-24 rounded-lg bg-gray-200 dark:bg-slate-700 flex items-center justify-center text-xs text-gray-500">
                        Loading...
                      </div>
                    </button>
                  ) : (
                    <div className="w-24 h-24 rounded-lg bg-gray-200 dark:bg-slate-700 flex items-center justify-center">
                      <File className="w-8 h-8 text-gray-500 dark:text-slate-400" />
                    </div>
                  )}

                  {/* DETAILS */}
                  <div className="flex flex-col flex-1">
                    <div className="text-gray-900 dark:text-white font-medium">
                      {att.filename}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-slate-400">
                      {formatSize(att.size_bytes)}
                    </div>

                    <button
                      onClick={() => downloadAttachment(att)}
                      className="flex items-center text-xs text-blue-600 dark:text-blue-400 mt-2 hover:underline"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* IMAGE FULLSCREEN PREVIEW */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="relative bg-white dark:bg-slate-900 rounded-lg shadow-2xl p-4 max-w-3xl">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-2 right-2 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={previewImage}
              className="max-w-full max-h-[80vh] rounded-lg shadow-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
