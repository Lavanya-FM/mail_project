import {
  Image,
  Video,
  FileText,
  Archive,
  Music,
  File,
  type LucideIcon,
} from "lucide-react";

/**
 * Return a Lucide icon component for a given file type.
 * This function is defensive:
 *  - accepts filenames or extensions
 *  - handles undefined/null
 *  - lowercases and strips leading dots
 *  - quotes numeric keys like '7z'
 */
export function getFileIconComponent(fileType: string | null | undefined): LucideIcon {
  if (!fileType || typeof fileType !== "string") {
    return File;
  }

  // Normalize
  let type = fileType.toLowerCase().trim();

  // If it's a filename (has a dot) extract extension
  if (type.includes(".")) {
    const parts = type.split(".");
    type = parts[parts.length - 1] || type;
  }

  // Remove any leading dot (e.g. ".png")
  if (type.startsWith(".")) type = type.slice(1);

  const map: Record<string, LucideIcon> = {
    // Images
    image: Image,
    jpg: Image,
    jpeg: Image,
    png: Image,
    gif: Image,
    webp: Image,
    svg: Image,
    bmp: Image,
    ico: Image,
    tiff: Image,

    // Videos
    video: Video,
    mp4: Video,
    mov: Video,
    avi: Video,
    mkv: Video,
    webm: Video,

    // Documents
    document: FileText,
    pdf: FileText,
    txt: FileText,
    doc: FileText,
    docx: FileText,

    // Archives (note the quoted '7z' key)
    archive: Archive,
    zip: Archive,
    rar: Archive,
    "7z": Archive,
    tar: Archive,
    gz: Archive,

    // Audio
    audio: Music,
    mp3: Music,
    wav: Music,
    flac: Music,
    ogg: Music,
  };

  return map[type] || File;
}
