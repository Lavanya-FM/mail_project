// src/components/UserProfile.tsx
import { useState, useEffect } from 'react';
import { X, Mail, Leaf, Settings } from 'lucide-react';
import CarbonBadges from './CarbonBadges';
import { authService } from '../lib/authService';
import { emailService } from '../lib/emailService';
import AccountSwitcher from "./AccountSwitcher";

interface UserProfileProps {
  onClose: () => void;
  userEmail?: string;
  userName?: string;
  initialTab?: 'overview' | 'carbon' | 'settings';
}

export default function UserProfile({
  onClose,
  userEmail = 'user@example.com',
  userName = 'User',
  initialTab = 'overview'
}: UserProfileProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'carbon' | 'settings'>(initialTab);
  const [userStats, setUserStats] = useState({
    emailCount: 0,
    storageUsedBytes: 0,
    storageLimitBytes: 1024 * 1024 * 1024,
    memberSince: 'Oct 2024'
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Read current profile from authService (keeps initial values consistent)
  const currentProfile = authService.getCurrentUser?.() || {
    id: undefined,
    name: userName,
    email: userEmail,
    avatar: undefined,
    created_at: undefined
  };

  const [displayName, setDisplayName] = useState<string>(currentProfile.name || userName);
  const [displayEmail, setDisplayEmail] = useState<string>(currentProfile.email || userEmail);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const profile = authService.getCurrentUser?.() || currentProfile;
        if (!profile || !profile.id) {
          setLoading(false);
          return;
        }

        // 1. Fetch Stats & Storage
        const [statsRes, activityLog] = await Promise.all([
          authService.fetchWithAuth(`${import.meta.env.VITE_API_URL || '/api'}/storage/quota?user_id=${profile.id}`),
          authService.getRecentActivity?.() || []
        ]);

        let storageData = { used_bytes: 0, limit_bytes: 1024 * 1024 * 1024 };
        if (statsRes.ok) {
          const quota = await statsRes.json();
          storageData = {
            used_bytes: quota.used_bytes || 0,
            limit_bytes: quota.limit_bytes || 1024 * 1024 * 1024
          };
        }

        const { data: emails } = await emailService.getEmails(profile.id);
        const emailCount = emails?.length || 0;
        
        const memberSince = profile.created_at ? 
          new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) :
          'Oct 2024';

        setUserStats({
          emailCount,
          storageUsedBytes: storageData.used_bytes,
          storageLimitBytes: storageData.limit_bytes,
          memberSince
        });

        // 2. Fetch Real Activity (Map to list items)
        setRecentActivity(activityLog.slice(0, 5));

        setDisplayName(profile.name || userName);
        setDisplayEmail(profile.email || userEmail);

      } catch (error) {
        console.error('Error fetching user stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  const formatStorage = (bytes: number) => {
    if (bytes === 0) return '0.0 GB';
    const gb = bytes / (1024 * 1024 * 1024);
    return gb < 0.1 ? '< 0.1 GB' : `${gb.toFixed(1)} GB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-500 to-cyan-500 px-6 py-6 flex items-center justify-between z-10 font-sans">
          <div className="flex items-center gap-5">
            <div className="relative">
              {currentProfile.avatar ? (
                <img src={currentProfile.avatar} alt={displayName} className="w-20 h-20 rounded-full object-cover border-4 border-white/20 shadow-2xl" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white text-3xl font-bold border-4 border-white/20 shadow-2xl">
                  {displayName?.[0]?.toUpperCase() ?? "U"}
                </div>
              )}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-1 drop-shadow-sm">{displayName}</h2>
              <p className="text-blue-10 flex items-center gap-2 text-sm font-medium opacity-90">
                <Mail className="w-4 h-4" />
                {displayEmail}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white hover:bg-white/20 rounded-full transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Account Switcher (placed above tabs) */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700">
          <AccountSwitcher
            currentUser={{
              id: currentProfile?.id,
              name: currentProfile?.name || userName,
              email: currentProfile?.email || userEmail,
              avatar: currentProfile?.avatar || null,
            }}
          />
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-slate-700 px-6">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 px-2 font-medium border-b-2 transition ${
                activeTab === 'overview'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('carbon')}
              className={`py-4 px-2 font-medium border-b-2 transition flex items-center gap-2 ${
                activeTab === 'carbon'
                  ? 'border-green-500 text-green-600 dark:text-green-400'
                  : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Leaf className="w-4 h-4" />
              Carbon Credits
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`py-4 px-2 font-medium border-b-2 transition flex items-center gap-2 ${
                activeTab === 'settings'
                  ? 'border-gray-500 text-gray-600 dark:text-gray-400'
                  : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Profile Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800 shadow-sm">
                  <p className="text-[10px] text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-2 font-bold">Emails Sent</p>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {loading ? '...' : userStats.emailCount}
                  </p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800 shadow-sm">
                  <p className="text-[10px] text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-2 font-bold">Storage Used</p>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {loading ? '...' : formatStorage(userStats.storageUsedBytes)}
                  </p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800 shadow-sm">
                  <p className="text-[10px] text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-2 font-bold">Member Since</p>
                  <p className="text-xl font-bold text-purple-600 dark:text-purple-400">
                    {loading ? '...' : userStats.memberSince}
                  </p>
                </div>
              </div>

              {/* Recent Activity */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Security & Activity</h3>
                <div className="space-y-3">
                  {recentActivity.length > 0 ? (
                    recentActivity.map((activity, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-100 dark:border-slate-700">
                        <div className={`w-2 h-2 rounded-full ${activity.is_current ? 'bg-green-500' : 'bg-blue-500 animate-pulse'}`}></div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-700 dark:text-slate-200">{activity.access_type} ({activity.location})</span>
                          <span className="text-[11px] text-gray-500">{activity.ip}</span>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-slate-500 ml-auto">
                          {new Date(activity.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500 text-sm italic">
                      No recent security activity found.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'carbon' && (
            <CarbonBadges />
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Notification Preferences</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 transition">
                    <input type="checkbox" defaultChecked className="w-4 h-4 rounded" />
                    <span className="text-sm text-gray-700 dark:text-slate-300">Email notifications</span>
                  </label>
                  <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 transition">
                    <input type="checkbox" defaultChecked className="w-4 h-4 rounded" />
                    <span className="text-sm text-gray-700 dark:text-slate-300">Carbon milestone alerts</span>
                  </label>
                  <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 transition">
                    <input type="checkbox" className="w-4 h-4 rounded" />
                    <span className="text-sm text-gray-700 dark:text-slate-300">Weekly digest</span>
                  </label>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Privacy</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 transition">
                    <input type="checkbox" defaultChecked className="w-4 h-4 rounded" />
                    <span className="text-sm text-gray-700 dark:text-slate-300">Show profile on leaderboard</span>
                  </label>
                  <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 transition">
                    <input type="checkbox" className="w-4 h-4 rounded" />
                    <span className="text-sm text-gray-700 dark:text-slate-300">Make carbon credits public</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-slate-700 px-6 py-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
