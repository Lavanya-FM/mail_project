import { useState } from 'react';
import { X, Download, Share2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import driveService, { DriveFile } from '../lib/driveService';

interface FilePreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    file: DriveFile | null;
    allFiles?: DriveFile[];
}

export default function FilePreviewModal({ isOpen, onClose, file, allFiles = [] }: FilePreviewModalProps) {
    const { theme } = useTheme();
    const [zoom, setZoom] = useState(100);
    const [currentIndex, setCurrentIndex] = useState(0);

    if (!isOpen || !file) return null;

    const currentFile = allFiles.length > 0 ? allFiles[currentIndex] : file;
    const canNavigate = allFiles.length > 1;

    const handlePrevious = () => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
            setZoom(100);
        }
    };

    const handleNext = () => {
        if (currentIndex < allFiles.length - 1) {
            setCurrentIndex(currentIndex + 1);
            setZoom(100);
        }
    };

    const handleZoomIn = () => setZoom(Math.min(zoom + 25, 200));
    const handleZoomOut = () => setZoom(Math.max(zoom - 25, 50));

    const getFileIcon = () => driveService.getFileIcon(currentFile.file_type);
    const fileColor = driveService.getFileColor(currentFile.file_type);

    const renderPreview = () => {
        const fileType = currentFile.file_type.toLowerCase();

        // Images
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(fileType)) {
            return (
                <div className="flex items-center justify-center h-full p-4">
                    <img
                        src={`https://via.placeholder.com/800x600/4F46E5/FFFFFF?text=${currentFile.name}`}
                        alt={currentFile.name}
                        style={{ transform: `scale(${zoom / 100})`, transition: 'transform 0.2s' }}
                        className="max-w-full max-h-full object-contain"
                    />
                </div>
            );
        }

        // PDFs
        if (fileType === 'pdf') {
            return (
                <div className="flex items-center justify-center h-full p-4">
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-lg shadow-lg max-w-2xl">
                        <div className="text-center">
                            <div className="text-6xl mb-4">📄</div>
                            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                                {currentFile.name}
                            </h3>
                            <p className="text-gray-600 dark:text-slate-400 mb-4">
                                PDF Preview (Mock)
                            </p>
                            <p className="text-sm text-gray-500 dark:text-slate-500">
                                In production, this would show an embedded PDF viewer
                            </p>
                        </div>
                    </div>
                </div>
            );
        }

        // Videos
        if (['mp4', 'webm', 'mov', 'avi'].includes(fileType)) {
            return (
                <div className="flex items-center justify-center h-full p-4">
                    <video
                        controls
                        className="max-w-full max-h-full rounded-lg"
                        style={{ maxHeight: '80vh' }}
                    >
                        <source src={`https://www.w3schools.com/html/mov_bbb.mp4`} type="video/mp4" />
                        Your browser does not support the video tag.
                    </video>
                </div>
            );
        }

        // Text/Code files
        if (['txt', 'md', 'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'json', 'xml'].includes(fileType)) {
            return (
                <div className="h-full p-6 overflow-auto">
                    <pre className="bg-gray-900 text-green-400 p-6 rounded-lg font-mono text-sm">
                        {`// ${currentFile.name}
// This is a mock preview

function example() {
    console.log("File preview for ${currentFile.name}");
    return "In production, this would show the actual file content";
}

example();`}
                    </pre>
                </div>
            );
        }

        // Documents (Word, Excel, etc.)
        if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(fileType)) {
            const FileIcon = getFileIcon();
            return (
                <div className="flex items-center justify-center h-full p-4">
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-lg shadow-lg max-w-2xl text-center">
                        <FileIcon className="w-24 h-24 mx-auto mb-4" style={{ color: fileColor }} />
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                            {currentFile.name}
                        </h3>
                        <p className="text-gray-600 dark:text-slate-400 mb-4">
                            {currentFile.file_type.toUpperCase()} Document
                        </p>
                        <p className="text-sm text-gray-500 dark:text-slate-500 mb-6">
                            Preview not available for this file type
                        </p>
                        <button
                            onClick={() => console.log('Download:', currentFile.name)}
                            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                        >
                            Download to View
                        </button>
                    </div>
                </div>
            );
        }

        // Default fallback
        const FileIcon = getFileIcon();
        return (
            <div className="flex items-center justify-center h-full p-4">
                <div className="bg-white dark:bg-slate-800 p-8 rounded-lg shadow-lg max-w-2xl text-center">
                    <FileIcon className="w-24 h-24 mx-auto mb-4" style={{ color: fileColor }} />
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                        {currentFile.name}
                    </h3>
                    <p className="text-gray-600 dark:text-slate-400 mb-4">
                        {driveService.formatFileSize(currentFile.size_bytes)}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-slate-500">
                        Preview not available for this file type
                    </p>
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 bg-black/50 backdrop-blur-sm p-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                    <div className="text-white">
                        <h3 className="font-semibold">{currentFile.name}</h3>
                        <p className="text-sm text-gray-300">
                            {driveService.formatFileSize(currentFile.size_bytes)}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Zoom controls for images */}
                    {['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(currentFile.file_type.toLowerCase()) && (
                        <>
                            <button
                                onClick={handleZoomOut}
                                className="p-2 text-white hover:bg-white/20 rounded-lg transition"
                                title="Zoom Out"
                            >
                                <ZoomOut className="w-5 h-5" />
                            </button>
                            <span className="text-white text-sm px-2">{zoom}%</span>
                            <button
                                onClick={handleZoomIn}
                                className="p-2 text-white hover:bg-white/20 rounded-lg transition"
                                title="Zoom In"
                            >
                                <ZoomIn className="w-5 h-5" />
                            </button>
                            <div className="w-px h-6 bg-white/30 mx-2"></div>
                        </>
                    )}

                    <button
                        onClick={() => console.log('Download:', currentFile.name)}
                        className="p-2 text-white hover:bg-white/20 rounded-lg transition"
                        title="Download"
                    >
                        <Download className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => console.log('Share:', currentFile.name)}
                        className="p-2 text-white hover:bg-white/20 rounded-lg transition"
                        title="Share"
                    >
                        <Share2 className="w-5 h-5" />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 text-white hover:bg-white/20 rounded-lg transition"
                        title="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Navigation arrows */}
            {canNavigate && (
                <>
                    <button
                        onClick={handlePrevious}
                        disabled={currentIndex === 0}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 text-white rounded-full hover:bg-black/70 transition disabled:opacity-30 disabled:cursor-not-allowed z-10"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <button
                        onClick={handleNext}
                        disabled={currentIndex === allFiles.length - 1}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 text-white rounded-full hover:bg-black/70 transition disabled:opacity-30 disabled:cursor-not-allowed z-10"
                    >
                        <ChevronRight className="w-6 h-6" />
                    </button>
                </>
            )}

            {/* Preview content */}
            <div className="w-full h-full pt-20">
                {renderPreview()}
            </div>

            {/* File counter */}
            {canNavigate && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm px-4 py-2 rounded-full text-white text-sm">
                    {currentIndex + 1} / {allFiles.length}
                </div>
            )}
        </div>
    );
}
