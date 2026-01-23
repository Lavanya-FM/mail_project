import { useState } from 'react';
import { Database, X } from 'lucide-react';
import { chatStorage } from '../lib/chatStorage';

interface LocalStoragePromptProps {
    onComplete: (enabled: boolean) => void;
    onClose: () => void;
}

export default function LocalStoragePrompt({ onComplete, onClose }: LocalStoragePromptProps) {
    const [clearOnLogout, setClearOnLogout] = useState(false);

    const handleEnable = () => {
        chatStorage.setPreference(true, clearOnLogout);
        onComplete(true);
    };

    const handleDisable = () => {
        // Did user mean "Disable feature" or "Just don't enable now"?
        // The prompt implies setting a preference.
        chatStorage.setPreference(false, false);
        onComplete(false);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-up font-sans">
                {/* Header */}
                <div className="p-4 flex items-start gap-4">
                    <div className="p-2 bg-blue-100 rounded-lg text-blue-600 shrink-0">
                        <Database size={24} />
                    </div>

                    <div className="flex-1">
                        <div className="flex justify-between items-start">
                            <h3 className="text-lg font-bold text-gray-900">Local Data Storage</h3>
                            <button
                                onClick={onClose}
                                className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                            Data will be stored locally to improve app performance and enable offline functionality.
                        </p>
                        <p className="mt-1 text-sm text-gray-600">
                            Not recommended on public or shared computers.
                        </p>
                    </div>
                </div>

                {/* Footer/Actions */}
                <div className="p-4 bg-gray-50 flex items-center justify-between border-t border-gray-100">
                    <label className="flex items-center gap-2 cursor-pointer group select-none">
                        <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={clearOnLogout}
                            onChange={(e) => setClearOnLogout(e.target.checked)}
                        />
                        <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">Clear data on logout</span>
                    </label>

                    <div className="flex gap-3">
                        <button
                            onClick={handleDisable}
                            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 bg-gray-100 rounded-lg transition"
                        >
                            Disable
                        </button>
                        <button
                            onClick={handleEnable}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition"
                        >
                            Enable
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
