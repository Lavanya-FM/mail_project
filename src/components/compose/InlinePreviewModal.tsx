import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface InlinePreviewModalProps {
  isOpen: boolean;
  file: File | null;
  onClose: () => void;
}

export default function InlinePreviewModal({
  isOpen,
  file,
  onClose
}: InlinePreviewModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  /* -------------------------------------------------- */
  /* ESC KEY + SCROLL LOCK                              */
  /* -------------------------------------------------- */

  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  /* -------------------------------------------------- */

  if (!isOpen || !file) return null;

  const url = URL.createObjectURL(file);

  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  const isAudio = file.type.startsWith('audio/');
  const isPDF = file.type === 'application/pdf';

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      onClose();
    }
  };

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center"
    >
      {/* MODAL */}
      <div className="relative w-full h-full max-w-6xl max-h-[95vh] bg-white dark:bg-slate-900 rounded-none lg:rounded-lg shadow-2xl flex flex-col">

        {/* HEADER */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700">
          <div className="truncate">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {file.name}
            </p>
            <p className="text-xs text-gray-500">
              {file.type || 'Unknown type'}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-50 dark:bg-slate-800">

          {isImage && (
            <img
              src={url}
              alt={file.name}
              className="max-w-full max-h-full object-contain"
              onLoad={() => URL.revokeObjectURL(url)}
            />
          )}

          {isVideo && (
            <video
              src={url}
              controls
              autoPlay
              className="max-w-full max-h-full"
              onLoadedData={() => URL.revokeObjectURL(url)}
            />
          )}

          {isAudio && (
            <audio
              src={url}
              controls
              autoPlay
              className="w-full px-6"
              onLoadedData={() => URL.revokeObjectURL(url)}
            />
          )}

          {isPDF && (
            <iframe
              src={url}
              title={file.name}
              className="w-full h-full border-none"
              onLoad={() => URL.revokeObjectURL(url)}
            />
          )}

          {!isImage && !isVideo && !isAudio && !isPDF && (
            <div className="text-center text-sm text-gray-600 dark:text-gray-400">
              Preview not supported for this file type.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
