import { useState, useEffect } from "react";
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
import { AlertCircle, Clock, Lock, FileQuestion, Loader2 } from "lucide-react";

import { getFileIconComponent } from "../lib/fileIcons";
import * as driveService from "../lib/driveService";
import { DriveFile } from "../lib/driveService";

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
    const [signedPreviewUrl, setSignedPreviewUrl] = useState<string | null>(null);
    const [textContent, setTextContent] = useState<string | null>(null);
    const [error, setError] = useState<"PERMISSION" | "MISSING" | "TIMEOUT" | "UNSUPPORTED" | "GENERIC" | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const currentFile = (allFiles?.length > 0 && allFiles[index]) ? allFiles[index] : file;

    // Derived state for hooks - safe even if currentFile is null
    const fileType = currentFile?.file_type?.toLowerCase() || "";
    const isText = ["txt", "json", "csv", "js", "ts", "html", "css", "md", "sql", "log"].includes(fileType);
    const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(fileType);
    const isVideo = ["mp4", "mov", "avi", "webm"].includes(fileType);
    const isAudio = ["mp3", "wav", "flac", "ogg", "audio"].includes(fileType);
    const isPDF = fileType === "pdf";
    const isUnsupported = !isImage && !isVideo && !isAudio && !isPDF && !isText;

    useEffect(() => {
        if (!isOpen) {
            setSignedPreviewUrl(null);
            setTextContent(null);
            setError(null);
            setIsLoading(false);
            return;
        }

        if (!currentFile) return;

        setIsLoading(true);
        setError(null);

        // ⏱️ Rule 6: Timeout Fallback (12 seconds)
        const timeout = setTimeout(() => {
            setIsLoading(prev => {
                if (prev && !signedPreviewUrl) setError("TIMEOUT");
                return false;
            });
        }, 12000);

        const fileUserId = currentFile.owner_id || currentFile.user_id || authService.getCurrentUser()?.id || 1;

        driveService.getPreviewInfo(currentFile.id, fileUserId).then(info => {
            if (info.success) {
                setSignedPreviewUrl(info.previewUrl);

                if (isUnsupported) {
                    setError("UNSUPPORTED");
                    setIsLoading(false);
                    clearTimeout(timeout);
                    return;
                }

                if (isText) {
                    fetch(info.previewUrl)
                        .then(res => {
                            if (res.status === 403) throw new Error("PERMISSION");
                            if (res.status === 404) throw new Error("MISSING");
                            return res.text();
                        })
                        .then(text => setTextContent(text.slice(0, 100000)))
                        .catch(err => {
                            const msg = err instanceof Error ? err.message : "GENERIC";
                            setError(msg === "PERMISSION" || msg === "MISSING" ? msg as any : "GENERIC");
                        })
                        .finally(() => {
                            setIsLoading(false);
                            clearTimeout(timeout);
                        });
                } else {
                    setIsLoading(false);
                    clearTimeout(timeout);
                }
            }
        }).catch(() => {
            setError("GENERIC");
            setIsLoading(false);
            clearTimeout(timeout);
        });

        return () => clearTimeout(timeout);
    }, [index, isOpen, currentFile?.id, isText, isUnsupported]);

    // ⌨️ Rule 12: Keyboard Accessibility
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowRight") next();
            if (e.key === "ArrowLeft") prev();
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, index]);

    if (!isOpen || !currentFile) return null;

    const fileUserId = currentFile.owner_id || currentFile.user_id || authService.getCurrentUser()?.id || 1;
    const downloadUrl = driveService.getDownloadUrl(currentFile.id, fileUserId);
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



    // Main preview renderer
    const renderPreview = () => {
        // 9️⃣ Rule: Error Handling
        if (error) {
            const configs: Record<string, { icon: any, title: string, msg: string, color: string }> = {
                PERMISSION: { icon: Lock, title: "Access Denied", msg: "You don't have permission to preview this file.", color: "#EF4444" },
                MISSING: { icon: AlertCircle, title: "File Missing", msg: "The file could not be found on the server.", color: "#F59E0B" },
                TIMEOUT: { icon: Clock, title: "Preview Timeout", msg: "Preview failed to load within the expected time.", color: "#6B7280" },
                UNSUPPORTED: { icon: FileQuestion, title: "Preview Unavailable", msg: `Preview is not supported for .${fileType} files.`, color: "#3B82F6" },
                GENERIC: { icon: AlertCircle, title: "Loading Failed", msg: "Something went wrong while preparing your preview.", color: "#EF4444" }
            };
            const config = configs[error] || configs.GENERIC;

            return (
                <div className="text-center p-12 bg-gray-900/80 rounded-3xl backdrop-blur-xl border border-white/10 max-w-lg shadow-2xl animate-in fade-in zoom-in duration-300">
                    <config.icon className="w-20 h-20 mx-auto mb-6" style={{ color: config.color }} />
                    <h2 className="text-2xl font-bold text-white mb-2">{config.title}</h2>
                    <p className="text-gray-400 mb-8 leading-relaxed">{config.msg}</p>
                    <div className="flex flex-col gap-3 items-center">
                        <a href={downloadUrl} download className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-8 py-3 rounded-full font-semibold transition active:scale-95">
                            <Download className="w-5 h-5" /> Download Locally
                        </a>
                        <button onClick={onClose} className="text-gray-500 hover:text-white text-sm transition font-medium">Dismiss</button>
                    </div>
                </div>
            );
        }

        // 6️⃣ Rule: Loading States (Spinner + Specific Text)
        if (isLoading) {
            return (
                <div className="flex flex-col items-center gap-6 text-white p-12">
                    <Loader2 className="w-14 h-14 text-blue-500 animate-spin opacity-80" />
                    <div className="space-y-1 text-center">
                        <p className="text-xl font-medium">⏳ Loading preview…</p>
                        <p className="text-sm text-gray-500">Securing your connection...</p>
                    </div>
                </div>
            );
        }

        if (isImage) {
            return (
                <div className="w-full h-full flex items-center justify-center overflow-auto p-4">
                    <img
                        src={signedPreviewUrl || ""}
                        className="max-w-full max-h-full object-contain shadow-2xl rounded-sm transition-all duration-300"
                        style={{ transform: `scale(${zoom / 100})` }}
                        onLoad={() => setIsLoading(false)}
                    />
                </div>
            );
        }

        if (isPDF) {
            return (
                <iframe
                    src={signedPreviewUrl || ""}
                    className="w-full h-full max-w-6xl bg-white rounded-lg shadow-2xl ring-1 ring-white/20"
                    title="PDF Preview"
                />
            );
        }

        if (isVideo) {
            return (
                <video controls className="max-w-full max-h-full rounded-xl shadow-2xl bg-black" autoPlay>
                    <source src={signedPreviewUrl || ""} />
                </video>
            );
        }

        if (isAudio) {
            return (
                <div className="bg-gray-800/80 backdrop-blur-xl p-10 rounded-3xl shadow-2xl flex flex-col items-center gap-8 w-full max-w-md border border-white/5">
                    <div className="p-6 bg-blue-500/10 rounded-full">
                        <FileIcon className="w-16 h-16" style={{ color: fileColor }} />
                    </div>
                    <div className="text-center">
                        <p className="text-white font-semibold truncate w-64">{currentFile.name}</p>
                        <p className="text-gray-500 text-sm mt-1">Audio Track</p>
                    </div>
                    <audio controls className="w-full accent-blue-500">
                        <source src={signedPreviewUrl || ""} />
                    </audio>
                </div>
            );
        }

        if (isText) {
            return (
                <div className="w-full h-full max-w-6xl bg-gray-950 border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                    <div className="bg-gray-900 px-6 py-3 border-b border-white/10 flex justify-between items-center">
                        <span className="text-xs text-gray-500 font-mono">CODE VIEW - {fileType.toUpperCase()}</span>
                        {textContent && textContent.length === 100000 && (
                            <span className="text-[10px] bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded">Partial View</span>
                        )}
                    </div>
                    <div className="p-8 overflow-auto font-mono text-gray-300 text-sm leading-relaxed scrollbar-thin">
                        <pre className="whitespace-pre-wrap">{textContent}</pre>
                    </div>
                </div>
            );
        }

        return null;
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

                    <a href={downloadUrl} download>
                        <Download className="text-white cursor-pointer hover:text-blue-400 transition" />
                    </a>
                    <Share2 className="text-white cursor-pointer hover:text-blue-400 transition" />

                    <X onClick={onClose} className="text-white cursor-pointer hover:text-red-400 transition" />
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
                        className={`absolute left-4 text-white w-12 h-12 cursor-pointer ${index === 0 ? "opacity-30" : "hover:text-gray-300"
                            }`}
                    />

                    <ChevronRight
                        onClick={next}
                        className={`absolute right-4 text-white w-12 h-12 cursor-pointer ${index === allFiles.length - 1 ? "opacity-30" : "hover:text-gray-300"
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
