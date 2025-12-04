import { useState } from 'react';
import { X, Share2, Mail, Check, Copy, Users } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { DriveFile } from '../lib/driveService';

interface ShareFileModalProps {
    isOpen: boolean;
    onClose: () => void;
    file: DriveFile | null;
}

export default function ShareFileModal({ isOpen, onClose, file }: ShareFileModalProps) {
    const { theme } = useTheme();
    const [email, setEmail] = useState('');
    const [permission, setPermission] = useState<'view' | 'edit'>('view');
    const [shares, setShares] = useState<Array<{ email: string; permission: 'view' | 'edit' }>>([]);
    const [linkCopied, setLinkCopied] = useState(false);

    if (!isOpen || !file) return null;

    const handleAddShare = () => {
        if (email && email.includes('@')) {
            setShares([...shares, { email, permission }]);
            setEmail('');
        }
    };

    const handleCopyLink = () => {
        const shareLink = `https://jeemail.com/drive/share/${file.id}`;
        navigator.clipboard.writeText(shareLink);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
    };

    const handleRemoveShare = (index: number) => {
        setShares(shares.filter((_, i) => i !== index));
    };

    const handleShare = () => {
        console.log('Sharing file:', file.name, 'with:', shares);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className={`w-full max-w-2xl overflow-hidden rounded-2xl shadow-2xl ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'}`}>
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                            <Share2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Share File</h2>
                            <p className="text-sm text-gray-600 dark:text-slate-400">{file.name}</p>
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
                <div className="p-6 space-y-6">
                    {/* Share link */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                            Share Link
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={`https://jeemail.com/drive/share/${file.id}`}
                                readOnly
                                className="flex-1 px-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white text-sm"
                            />
                            <button
                                onClick={handleCopyLink}
                                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition flex items-center gap-2"
                            >
                                {linkCopied ? (
                                    <>
                                        <Check className="w-4 h-4" />
                                        Copied!
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-4 h-4" />
                                        Copy
                                    </>
                                )}
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-slate-500 mt-2">
                            Anyone with this link can view the file
                        </p>
                    </div>

                    {/* Share with specific people */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                            Share with People
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleAddShare()}
                                placeholder="Enter email address"
                                className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <select
                                value={permission}
                                onChange={(e) => setPermission(e.target.value as 'view' | 'edit')}
                                className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="view">Can view</option>
                                <option value="edit">Can edit</option>
                            </select>
                            <button
                                onClick={handleAddShare}
                                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                            >
                                Add
                            </button>
                        </div>
                    </div>

                    {/* Shared with list */}
                    {shares.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <Users className="w-4 h-4 text-gray-600 dark:text-slate-400" />
                                <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
                                    Shared with {shares.length} {shares.length === 1 ? 'person' : 'people'}
                                </span>
                            </div>
                            <div className="space-y-2">
                                {shares.map((share, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-lg"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                                                {share.email[0].toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                    {share.email}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-slate-500">
                                                    {share.permission === 'view' ? 'Can view' : 'Can edit'}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleRemoveShare(index)}
                                            className="p-1 text-gray-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-slate-700">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleShare}
                        className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium"
                    >
                        Share
                    </button>
                </div>
            </div>
        </div>
    );
}
