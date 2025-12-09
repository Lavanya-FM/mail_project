import { X, Upload as UploadIcon, File, Check, AlertCircle } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useState } from 'react';

interface FileUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRefresh: () => void;
}

export default function FileUploadModal({ isOpen, onClose, onRefresh }: FileUploadModalProps) {
    const { theme } = useTheme();
    const [dragActive, setDragActive] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
    const [uploading, setUploading] = useState(false);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(e.type === "dragenter" || e.type === "dragover");
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            setSelectedFiles(e.dataTransfer.files);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setSelectedFiles(e.target.files);
        }
    };

const handleUpload = async () => {
    if (!selectedFiles || selectedFiles.length === 0) {
        alert("Please select files to upload");
        return;
    }

    const savedUser = localStorage.getItem("user");
    let user_id = null;

    if (savedUser) {
        try {
            user_id = JSON.parse(savedUser).id;
        } catch (e) {
            console.error("User parse error:", e);
        }
    }

    if (!user_id) {
        alert("User not logged in");
        return;
    }

    setUploading(true);

    try {
        const formData = new FormData();
        formData.append("file", selectedFiles[0]);

        // FIXED: Add user_id as query parameter, not in form body
        const res = await fetch(`/api/drive/upload?user_id=${user_id}`, {
            method: "POST",
            body: formData
        });

        const data = await res.json();

        if (!data.success) {
            alert("Upload failed: " + (data.error || "Unknown error"));
        } else {
            alert("Uploaded successfully!");
            onRefresh();
            onClose();
            setSelectedFiles(null); // Clear selection
        }

    } catch (err) {
        console.error(err);
        alert("Upload failed: " + (err instanceof Error ? err.message : "Network error"));
    }

    setUploading(false);
};
    if (!isOpen) return null;

    const fileArray = selectedFiles ? Array.from(selectedFiles) : [];
    const totalSize = fileArray.reduce((sum, file) => sum + file.size, 0);

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className={`w-full max-w-2xl overflow-hidden rounded-2xl shadow-2xl ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'}`}>
                
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl">
                            <UploadIcon className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Upload Files</h2>
                            <p className="text-sm text-gray-600 dark:text-slate-400">Upload files to your JeeDrive</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition"
                    >
                        <X className="w-6 h-6 text-gray-600 dark:text-slate-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {/* Drag & Drop Zone */}
                    <div
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        className={`relative border-2 border-dashed rounded-xl p-12 text-center transition ${dragActive
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-gray-300 dark:border-slate-700 hover:border-blue-400'
                            }`}
                    >
                        <input
                            type="file"
                            multiple
                            onChange={handleFileSelect}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />

                        <div className="pointer-events-none">
                            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                                <UploadIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                            </div>
                            <p className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                {dragActive ? 'Drop files here' : 'Drag & drop files here'}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-slate-400">
                                or click to browse from your computer
                            </p>
                        </div>
                    </div>

                    {/* Selected Files */}
                    {fileArray.length > 0 && (
                        <div className="mt-6">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-semibold text-gray-900 dark:text-white">
                                    Selected Files ({fileArray.length})
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-slate-400">
                                    Total: {formatBytes(totalSize)}
                                </p>
                            </div>

                            <div className="max-h-64 overflow-y-auto space-y-2 bg-gray-50 dark:bg-slate-800 rounded-lg p-3">
                                {fileArray.map((file, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center gap-3 p-2 bg-white dark:bg-slate-700 rounded-lg"
                                    >
                                        <File className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                {file.name}
                                            </p>
                                            <p className="text-xs text-gray-600 dark:text-slate-400">
                                                {formatBytes(file.size)}
                                            </p>
                                        </div>
                                        <Check className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                                    </div>
                                ))}
                            </div>

                            {totalSize > 100000000 && (
                                <div className="mt-3 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg flex items-start gap-2">
                                    <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-orange-800 dark:text-orange-200">
                                        <p className="font-medium">Large upload detected</p>
                                        <p className="text-orange-700 dark:text-orange-300">
                                            This upload may take some time. Please don't close this window.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
                    <button
                        onClick={() => setSelectedFiles(null)}
                        disabled={!selectedFiles || uploading}
                        className="px-4 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Clear
                    </button>
                    <button
                        onClick={handleUpload}
                        disabled={!selectedFiles || selectedFiles.length === 0 || uploading}
                        className="px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg hover:from-blue-600 hover:to-cyan-600 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {uploading ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                Uploading...
                            </>
                        ) : (
                            <>
                                <UploadIcon className="w-4 h-4" />
                                Upload {fileArray.length > 0 && `(${fileArray.length})`}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
