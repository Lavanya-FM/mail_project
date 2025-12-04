import { X, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { authService, ActivityLog } from '../lib/authService';

interface ActivityLogModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ActivityLogModal({ isOpen, onClose }: ActivityLogModalProps) {
    const [activities, setActivities] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen) {
            loadActivity();
        }
    }, [isOpen]);

    const loadActivity = async () => {
        setLoading(true);
        try {
            const data = await authService.getRecentActivity();
            setActivities(data);
        } catch (error) {
            console.error('Error loading activity:', error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-none sm:rounded-lg shadow-2xl border border-gray-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-blue-50 dark:bg-slate-800/50">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Activity on this account</h2>
                        <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                            This feature provides information about the last activity on this mail account and any concurrent activity.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                        <p className="text-sm text-gray-800 dark:text-slate-200">
                            This account does not seem to be open in any other location. However, there may be sessions that have not been signed out.
                        </p>
                    </div>

                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Recent activity:</h3>

                    <div className="overflow-x-auto border border-gray-200 dark:border-slate-700 rounded-lg">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-semibold border-b border-gray-200 dark:border-slate-700">
                                <tr>
                                    <th className="px-4 py-3 border-r border-gray-200 dark:border-slate-700">
                                        Access Type
                                        <Info className="w-3 h-3 inline ml-1 text-gray-400" />
                                    </th>
                                    <th className="px-4 py-3 border-r border-gray-200 dark:border-slate-700">
                                        Location (IP address)
                                        <Info className="w-3 h-3 inline ml-1 text-gray-400" />
                                    </th>
                                    <th className="px-4 py-3">
                                        Date/Time
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                                {loading ? (
                                    <tr>
                                        <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                                            Loading activity...
                                        </td>
                                    </tr>
                                ) : activities.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                                            No recent activity found.
                                        </td>
                                    </tr>
                                ) : (
                                    activities.map((activity, index) => (
                                        <tr key={index} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                                            <td className="px-4 py-3 border-r border-gray-200 dark:border-slate-700">
                                                <div className="font-medium text-gray-900 dark:text-white">
                                                    {activity.access_type}
                                                </div>
                                                <button className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-0.5">
                                                    Show details
                                                </button>
                                            </td>
                                            <td className="px-4 py-3 border-r border-gray-200 dark:border-slate-700">
                                                <div className="text-gray-700 dark:text-slate-300">
                                                    {activity.is_current && '* '}
                                                    {activity.location} ({activity.ip})
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-gray-700 dark:text-slate-300">
                                                {new Date(activity.date).toLocaleString()}
                                                {activity.is_current && (
                                                    <span className="ml-2 text-xs text-green-600 dark:text-green-400 font-medium">
                                                        (Current session)
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-4 text-xs text-gray-500 dark:text-slate-400">
                        * indicates activity from the current session.
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
