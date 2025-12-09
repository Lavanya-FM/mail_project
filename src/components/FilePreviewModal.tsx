import { useState } from "react";
import {
    X,
    Download,
    Share2,
    ChevronLeft,
    ChevronRight,
    ZoomIn,
    ZoomOut
} from "lucide-react";
import { authService } from "../lib/authService";

import { getFileIconComponent } from "../lib/fileIcons";
import * as driveService from "../lib/driveService";

interface FilePreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    file: DriveFile | null;
    allFiles?: DriveFile[];
}

export default function FilePreviewModal({
    isOpen,
    onClose,
    file,
    allFiles = []
}: FilePreviewModalProps) {

    const [zoom, setZoom] = useState(100);
    const [index, setIndex] = useState(0);

    if (!isOpen || !file) return null;

    const currentFile = allFiles.length ? allFiles[index] : file;
    const fileType = currentFile.file_type?.toLowerCase() || "";
    const fileUserId = currentFile.user_id ?? authService.getCurrentUser()?._id ?? authService.getCurrentUser()?.id ?? 1;
    const previewUrl = `/uploads/${fileUserId}/${encodeURIComponent(currentFile.filename)}`;

    const FileIcon = getFileIconComponent(currentFile.file_type);
    const fileColor = driveService.getFileColor(currentFile.file_type);

    // Navigation
    const canNavigate = allFiles.length > 1;

    const next = () => {
        if (index < allFiles.length - 1) {
            setIndex(index + 1);
            setZoom(100);
        }
    };

    const prev = () => {
        if (index > 0) {
            setIndex(index - 1);
            setZoom(100);
        }
    };

    // Zoom
    const zoomIn = () => setZoom(z => Math.min(z + 25, 200));
    const zoomOut = () => setZoom(z => Math.max(z - 25, 50));

    const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(fileType);

    // Main preview renderer
    const renderPreview = () => {
        if (isImage) {
            return (
                <img
                    src={previewUrl}
                    className="max-w-full max-h-full object-contain"
                    style={{ transform: `scale(${zoom / 100})`, transition: "0.2s" }}
                />
            );
        }

        if (fileType === "pdf") {
            return (
                <iframe
                    src={previewUrl}
                    className="w-full h-full bg-white rounded-lg"
                />
            );
        }

        if (["mp4", "mov", "avi", "webm"].includes(fileType)) {
            return (
                <video controls className="max-w-full max-h-full rounded-lg">
                    <source src={previewUrl} />
                </video>
            );
        }

        if (["mp3", "wav"].includes(fileType)) {
            return (
                <audio controls className="w-3/4">
                    <source src={previewUrl} />
                </audio>
            );
        }

        // ❗ Correct fallback
        return (
            <div className="text-center text-white opacity-80">
                <FileIcon
                    className="w-24 h-24 mx-auto mb-4"
                    style={{ color: fileColor }}
                />
                <p>No preview available</p>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">

            {/* HEADER */}
            <div className="absolute top-0 left-0 right-0 p-4 bg-black/40 flex justify-between items-center">
                <div>
                    <h3 className="text-white font-semibold">{currentFile.name}</h3>
                    <p className="text-gray-400 text-sm">
                        {driveService.formatFileSize(currentFile.size_bytes)}
                    </p>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-3">
                    {isImage && (
                        <>
                            <ZoomOut onClick={zoomOut} className="text-white cursor-pointer" />
                            <span className="text-white text-sm">{zoom}%</span>
                            <ZoomIn onClick={zoomIn} className="text-white cursor-pointer" />
                        </>
                    )}

                    <Download className="text-white cursor-pointer" />
                    <Share2 className="text-white cursor-pointer" />

                    <X onClick={onClose} className="text-white cursor-pointer" />
                </div>
            </div>

            {/* PREVIEW */}
            <div className="w-full h-full pt-20 flex items-center justify-center px-4 overflow-hidden">
                {renderPreview()}
            </div>

            {/* NAVIGATION */}
            {canNavigate && (
                <>
                    <ChevronLeft
                        onClick={prev}
                        className={`absolute left-4 text-white w-12 h-12 cursor-pointer ${
                            index === 0 ? "opacity-30" : "hover:text-gray-300"
                        }`}
                    />

                    <ChevronRight
                        onClick={next}
                        className={`absolute right-4 text-white w-12 h-12 cursor-pointer ${
                            index === allFiles.length - 1 ? "opacity-30" : "hover:text-gray-300"
                        }`}
                    />
                </>
            )}

            {/* COUNTER */}
            {canNavigate && (
                <div className="absolute bottom-6 bg-black/40 px-4 py-2 rounded-full text-white text-sm">
                    {index + 1} / {allFiles.length}
                </div>
            )}

        </div>
    );
}
