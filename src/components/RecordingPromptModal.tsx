
import { Save, Download, X, AlertCircle } from 'lucide-react';

interface RecordingPromptModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaveToDrive: () => void;
    onDownloadLocally: () => void;
    isUploading: boolean;
}

export default function RecordingPromptModal({
    isOpen,
    onClose,
    onSaveToDrive,
    onDownloadLocally,
    isUploading
}: RecordingPromptModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-[#202124] w-full max-w-md rounded-2xl border border-[#5f6368] shadow-2xl p-6 relative">
                <button
                    onClick={onClose}
                    disabled={isUploading}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>

                <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6 text-red-500">
                        <div className="w-8 h-8 rounded-full bg-red-500 animate-pulse" />
                    </div>

                    <h2 className="text-2xl font-medium text-white mb-2">Recording Stopped</h2>
                    <p className="text-[#9aa0a6] mb-8">
                        The call recording has been captured successfully. <br />
                        Where would you like to save the recording?
                    </p>

                    <div className="space-y-3 w-full">
                        <button
                            onClick={onSaveToDrive}
                            disabled={isUploading}
                            className="w-full py-3 px-4 bg-[#8ab4f8] hover:bg-[#aecbfa] disabled:opacity-50 disabled:cursor-not-allowed text-[#202124] rounded-xl font-medium flex items-center justify-center gap-3 transition-all"
                        >
                            {isUploading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-[#202124] border-t-transparent rounded-full animate-spin" />
                                    Saving to JeeDrive...
                                </>
                            ) : (
                                <>
                                    <Save size={20} />
                                    Save to JeeDrive
                                </>
                            )}
                        </button>

                        {!isUploading && (
                            <button
                                onClick={onDownloadLocally}
                                className="w-full py-3 px-4 bg-[#3c4043] hover:bg-[#4d5155] text-white rounded-xl font-medium flex items-center justify-center gap-3 transition-colors"
                            >
                                <Download size={20} />
                                Download to Device
                            </button>
                        )}
                    </div>

                    <div className="mt-6 flex items-start gap-2 text-xs text-[#9aa0a6] bg-[#3c4043]/50 p-3 rounded-lg text-left">
                        <AlertCircle size={14} className="shrink-0 mt-0.5" />
                        <p>
                            Files saved to JeeDrive are automatically named with the current date and time (e.g., <code>Recording_2024-03-20...webm</code>).
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
