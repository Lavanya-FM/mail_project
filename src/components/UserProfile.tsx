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
    storageUsed: 0,
    memberSince: 'Nov 2024'
  });
  const [loading, setLoading] = useState(true);

  // Read current profile from authService (keeps initial values consistent)
  const currentProfile = authService.getCurrentUser?.() || {
    id: undefined,
    name: userName,
    email: userEmail,
    avatar: undefined,
    created_at: undefined
  };

  // Keep displayed header fields in local state so they can be updated if you later wire a switch event
  const [displayName, setDisplayName] = useState<string>(currentProfile.name || userName);
  const [displayEmail, setDisplayEmail] = useState<string>(currentProfile.email || userEmail);

  useEffect(() => {
    const fetchUserStats = async () => {
      try {
        // Ensure we use the latest profile (authService may update elsewhere)
        const profile = authService.getCurrentUser?.() || currentProfile;
        if (!profile || !profile.id) {
          setLoading(false);
          return;
        }

        const { data: emails } = await emailService.getEmails(profile.id);
        const emailCount = emails?.length || 0;
        
        // Calculate storage used (based on email count and average size)
        const avgEmailSize = 0.05; // 50KB average per email
        const storageUsedGB = (emailCount * avgEmailSize) / 1024;
        
        // Get member since date from profile or default
        const memberSince = profile.created_at ? 
          new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) :
          'Nov 2024';

        setUserStats({
          emailCount,
          storageUsed: storageUsedGB,
          memberSince
        });

        // also keep header in sync
        setDisplayName(profile.name || userName);
        setDisplayEmail(profile.email || userEmail);

      } catch (error) {
        console.error('Error fetching user stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserStats();
    // Note: no dependencies so runs once on mount. If you want to refresh on auth changes,
    // you can listen to an auth event or add a small interval here.
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-500 to-cyan-500 px-6 py-6 flex items-center justify-between z-10">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">{displayName}</h2>
            <p className="text-blue-100 flex items-center gap-2">
              <Mail className="w-4 h-4" />
              {displayEmail}
            </p>
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
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                  <p className="text-xs text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-2">Emails Sent</p>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {loading ? '...' : userStats.emailCount}
                  </p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                  <p className="text-xs text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-2">Storage Used</p>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {loading ? '...' : userStats.storageUsed.toFixed(1)} GB
                  </p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
                  <p className="text-xs text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-2">Member Since</p>
                  <p className="text-lg font-bold text-purple-600 dark:text-purple-400">
                    {loading ? '...' : userStats.memberSince}
                  </p>
                </div>
              </div>

              {/* Recent Activity */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Recent Activity</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-sm text-gray-700 dark:text-slate-300">Sent email to team@company.com</span>
                    <span className="text-xs text-gray-500 dark:text-slate-500 ml-auto">2 hours ago</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-gray-700 dark:text-slate-300">Earned Bronze 2 badge</span>
                    <span className="text-xs text-gray-500 dark:text-slate-500 ml-auto">1 day ago</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    <span className="text-sm text-gray-700 dark:text-slate-300">Scheduled 3 emails</span>
                    <span className="text-xs text-gray-500 dark:text-slate-500 ml-auto">3 days ago</span>
                  </div>
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
