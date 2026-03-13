import { useState } from 'react';
import { X, Mail, Send, UserPlus, Calendar, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

interface InviteModalProps {
    isOpen: boolean;
    onClose: () => void;
    meetingId: string;
    meetingTitle?: string;
    userId: number;
}

const InviteModal = ({ isOpen, onClose, meetingId, meetingTitle, userId }: InviteModalProps) => {
    const [email, setEmail] = useState('');
    const [meetingDate, setMeetingDate] = useState('');
    const [meetingTime, setMeetingTime] = useState('');
    const [sending, setSending] = useState(false);

    if (!isOpen) return null;

    const handleSendInvite = async () => {
        if (!email || !email.includes('@')) {
            toast.error('Please enter a valid email address');
            return;
        }

        setSending(true);

        try {
            const response = await fetch('/api/meeting-invites/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    fromUserId: userId,
                    toEmail: email.trim(),
                    meetingId: meetingId,
                    meetingTitle: meetingTitle || 'Video Conference',
                    meetingDate: meetingDate || undefined,
                    meetingTime: meetingTime || undefined,
                }),
            });

            const data = await response.json();

            if (data.success) {
                toast.success(`Invite sent to ${email}!`);
                setEmail('');
                setMeetingDate('');
                setMeetingTime('');
                onClose();
            } else {
                toast.error(data.error || 'Failed to send invite');
            }
        } catch (error) {
            console.error('Error sending invite:', error);
            toast.error('Failed to send invite');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                            <Mail className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                Send Meeting Invite
                            </h2>
                            <p className="text-sm text-gray-500 dark:text-slate-400">
                                Invite someone via email
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                    {/* Email Input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                            <UserPlus className="w-4 h-4 inline mr-2" />
                            Recipient Email
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="colleague@example.com"
                            className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
                            autoFocus
                        />
                    </div>

                    {/* Meeting Title (Read-only) */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                            Meeting Title
                        </label>
                        <input
                            type="text"
                            value={meetingTitle || 'Video Conference'}
                            readOnly
                            className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700/50 dark:text-white cursor-not-allowed"
                        />
                    </div>

                    {/* Optional: Date & Time */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                                <Calendar className="w-4 h-4 inline mr-2" />
                                Date (Optional)
                            </label>
                            <input
                                type="date"
                                value={meetingDate}
                                onChange={(e) => setMeetingDate(e.target.value)}
                                className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                                <Clock className="w-4 h-4 inline mr-2" />
                                Time (Optional)
                            </label>
                            <input
                                type="time"
                                value={meetingTime}
                                onChange={(e) => setMeetingTime(e.target.value)}
                                className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
                            />
                        </div>
                    </div>

                    {/* Meeting Link Preview */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                        <p className="text-xs font-medium text-blue-900 dark:text-blue-300 mb-1">
                            Meeting Link (will be included in email):
                        </p>
                        <p className="text-sm text-blue-700 dark:text-blue-400 font-mono break-all">
                            {window.location.origin}/meet/{meetingId}
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-slate-700">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSendInvite}
                        disabled={sending || !email}
                        className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {sending ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Sending...
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4" />
                                Send Invite
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InviteModal;
