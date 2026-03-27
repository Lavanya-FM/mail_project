import { useState, useEffect } from 'react';
import { Mail, HardDrive, Video, Shield, Search, Menu, Settings, HelpCircle, Bell, LayoutGrid, SlidersHorizontal } from 'lucide-react';
import MailLayout from './MailLayout';
import JeeDrive from './JeeDrive';
import CallManager from './CallManager';
import CallsView from './CallsView';
import P2PTransferManager from './P2PTransferManager';
import AccountSwitcher from './AccountSwitcher';
import ThemeToggle from './ThemeToggle';
import AccountManagement from './AccountManagement';
import InboxRulesModal from './InboxRulesModal';
import PrivacyPolicyModal from './PrivacyPolicyModal';
import TermsOfServiceModal from './TermsOfServiceModal';
import ActivityLogModal from './ActivityLogModal';
import { useNotifications } from '../contexts/NotificationContext';

const timeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
};


import P2PReceiverHandler from './P2PReceiverHandler';

type View = 'mail' | 'drive' | 'calls' | 'account';

import { authService } from '../lib/authService';
import { p2pService } from '../lib/p2pService';

export default function MainApp() {
    const [currentView, setCurrentView] = useState<View>('mail');
    const [searchQuery, setSearchQuery] = useState('');
    const [showUserProfile, setShowUserProfile] = useState(false);
    const [showRulesModal, setShowRulesModal] = useState(false);
    const [userProfileTab, setUserProfileTab] = useState<'overview' | 'carbon' | 'settings'>('carbon');
    const [showAppsMenu, setShowAppsMenu] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const { notifications, unreadCount, markAsRead, markAllAsRead, clearNotification } = useNotifications();
    const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
    const [showTermsOfService, setShowTermsOfService] = useState(false);
    const [showActivityLog, setShowActivityLog] = useState(false);


    const user = authService.getCurrentUser() || {
        email: 'user@example.com',
        name: 'User',
        id: 0,
        avatar: null
    };

    const [storageInfo, setStorageInfo] = useState({
        used: user.storage_used_bytes || 0,
        limit: user.storage_limit_bytes || 1073741824
    });

    useEffect(() => {
        const fetchQuota = async () => {
            if (!user.id) return;
            try {
                const res = await authService.fetchWithAuth(`${import.meta.env.VITE_API_URL || '/api'}/storage/quota?user_id=${user.id}`);
                if (res.ok) {
          const data = await res.json();
          if (data.used_bytes !== undefined) {
            setStorageInfo({
              used: data.used_bytes,
              limit: data.quota_bytes || 26843545600
            });
          }
        }
            } catch (err) {
                console.error("Failed to fetch storage quota", err);
            }
        };
        fetchQuota();
    }, [user.id]);

    useEffect(() => {
        if (user && user.email) {
            p2pService.connect(user.id || user.email, user.email);
        }

        const handlePathChange = () => {
            const path = window.location.pathname;
            if (path.startsWith('/meet/') || path === '/meet') {
                setCurrentView('calls');
            } else if (path.startsWith('/drive')) {
                setCurrentView('drive');
            } else {
                setCurrentView('mail');
            }
        };

        // Initial check
        handlePathChange();

        // Listen for custom navigation events
        const handleNavigate = (e: CustomEvent) => {
            const path = e.detail.path;
            if (window.location.pathname !== path) {
                window.history.pushState({}, '', path);
            }
            handlePathChange();
        };

        window.addEventListener('app-navigate', handleNavigate as EventListener);
        window.addEventListener('popstate', handlePathChange);

        const onPrivacy = () => setShowPrivacyPolicy(true);
        const onTerms = () => setShowTermsOfService(true);
        const onActivity = () => setShowActivityLog(true);

        window.addEventListener('show-privacy-policy', onPrivacy);
        window.addEventListener('show-terms-of-service', onTerms);
        window.addEventListener('show-activity-log', onActivity);

        return () => {
            window.removeEventListener('app-navigate', handleNavigate as EventListener);
            window.removeEventListener('popstate', handlePathChange);
            window.removeEventListener('show-privacy-policy', onPrivacy);
            window.removeEventListener('show-terms-of-service', onTerms);
            window.removeEventListener('show-activity-log', onActivity);
        };
    }, []);

    const handleViewProfile = () => {
        setCurrentView('account');
        setShowUserProfile(false);
    };

    const handleNavigation = (view: View) => {
        let path = '/';
        if (view === 'drive') path = '/drive';
        else if (view === 'calls') path = '/meet';
        else if (view === 'account') path = '/account';

        window.history.pushState({}, '', path);
        setCurrentView(view);

        // Dispatch event for other components if needed
        window.dispatchEvent(new CustomEvent('app-navigate', { detail: { path } }));
    };

    const NavItem = ({ view, icon: Icon, label }: { view: View; icon: any; label: string }) => (
        <button
            onClick={() => handleNavigation(view)}
            className={`flex flex-col items-center justify-center gap-1 w-16 h-16 rounded-2xl transition-all duration-200 ${currentView === view
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white'
                }`}
        >
            <Icon className={`w-6 h-6 ${currentView === view ? 'fill-current' : ''}`} />
            <span className="text-[10px] font-medium">{label}</span>
        </button>
    );

    return (
        <div className="h-screen flex flex-col bg-white dark:bg-slate-900">
            <CallManager />
            <P2PTransferManager />
            <P2PReceiverHandler />

            {/* Top Navigation Bar */}
            <div className="h-14 px-4 flex items-center justify-between border-b border-gray-200 dark:border-slate-800 z-[100] bg-white dark:bg-slate-900 shadow-sm relative">
                {/* Left: Logo */}
                <div className="flex items-center gap-3 w-60 pl-2">
                    <button 
                        onClick={() => {
                            // Dispatch event to open sidebar if in Mail view
                            window.dispatchEvent(new CustomEvent('toggle-sidebar'));
                        }}
                        className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 lg:hidden"
                    >
                        <Menu className="w-5 h-5 text-gray-600 dark:text-slate-400" />
                    </button>
                    <div className="flex items-center gap-2.5 group cursor-pointer">
                        <div className={`p-1.5 rounded-[10px] shadow-sm group-hover:scale-105 transition-transform ${currentView === 'drive' ? 'bg-green-600' :
                                currentView === 'calls' ? 'bg-purple-600' : 'bg-blue-600'
                            }`}>
                            {currentView === 'drive' ? <HardDrive className="w-5 h-5 text-white" /> :
                                currentView === 'calls' ? <Video className="w-5 h-5 text-white" /> :
                                    <Mail className="w-5 h-5 text-white" />}
                        </div>
                        <span className="text-xl font-bold text-gray-900 dark:text-white tracking-tight hidden sm:block">
                            {currentView === 'drive' ? 'JeeDrive' :
                                currentView === 'calls' ? 'JeeMeet' : 'JeeMail'}
                        </span>
                    </div>
                </div>

                {/* Center: Search Bar */}
                <div className="flex-1 max-w-2xl px-4 lg:px-8">
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                        </div>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={`Search in ${currentView}...`}
                            className="block w-full pl-11 pr-12 py-2.5 bg-gray-100 dark:bg-slate-800/40 border-transparent focus:border-blue-500/30 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-blue-500/10 rounded-2xl transition-all duration-300 sm:text-[14px] font-medium shadow-inner"
                        />
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                            <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition-colors">
                                <SlidersHorizontal className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center justify-end gap-1 flex-shrink-0 pr-4 relative">
                    <a
                        href="/support"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors flex items-center justify-center" title="Open Support in New Tab">
                        <HelpCircle className="w-5 h-5" />
                    </a>

                    <button
                        onClick={() => {
                            setUserProfileTab('settings');
                            setShowUserProfile(true);
                        }}
                        className="p-2 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors" title="Settings">
                        <Settings className="w-5 h-5" />
                    </button>

                    <div className="relative">
                        <button
                            onClick={() => {
                                setShowNotifications(!showNotifications);
                                setShowAppsMenu(false);
                            }}
                            className="p-2 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors relative"
                            title="Notifications"
                        >
                            <Bell className="w-5 h-5" />
                            {unreadCount > 0 && (
                                <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-600 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white dark:border-slate-900 animate-in zoom-in-0 duration-300">
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </span>
                            )}
                        </button>

                        {/* Notifications Dropdown */}
                        {showNotifications && (
                            <div className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-800 p-0 z-[110] animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                                <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-800">
                                    <h3 className="font-semibold text-gray-900 dark:text-white">Notifications</h3>
                                    {notifications.length > 0 && (
                                        <button 
                                            onClick={markAllAsRead}
                                            className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium"
                                        >
                                            Mark all read
                                        </button>
                                    )}
                                </div>
                                <div className="max-h-96 overflow-y-auto">
                                    {notifications.length > 0 ? (
                                        <div className="divide-y divide-gray-100 dark:divide-slate-800">
                                            {notifications.map((notif) => (
                                                <div 
                                                    key={notif.id} 
                                                    onClick={() => markAsRead(notif.id)}
                                                    className={`p-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer relative ${!notif.isRead ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}
                                                >
                                                    {!notif.isRead && (
                                                        <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                                                    )}
                                                    <div className="flex gap-3">
                                                        <div className={`mt-1 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                                                            notif.type === 'mail' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' :
                                                            notif.type === 'file' ? 'bg-green-100 dark:bg-green-900/30 text-green-600' :
                                                            notif.type === 'call' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600' :
                                                            'bg-gray-100 dark:bg-slate-800 text-gray-600'
                                                        }`}>
                                                            {notif.type === 'mail' ? <Mail className="w-4 h-4" /> :
                                                             notif.type === 'file' ? <HardDrive className="w-4 h-4" /> :
                                                             notif.type === 'call' ? <Video className="w-4 h-4" /> :
                                                             <Bell className="w-4 h-4" />}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                                                {notif.title}
                                                            </p>
                                                            <p className="text-xs text-gray-600 dark:text-slate-400 line-clamp-2 mt-0.5">
                                                                {notif.message}
                                                            </p>
                                                            <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1 font-medium italic">
                                                                {timeAgo(notif.timestamp)}
                                                            </p>
                                                        </div>
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                clearNotification(notif.id);
                                                            }}
                                                            className="text-gray-400 hover:text-red-500 transition-colors p-1"
                                                        >
                                                            &times;
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="py-12 text-center text-gray-500 dark:text-slate-400">
                                            <Bell className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                            <p className="text-sm font-medium">No new notifications</p>
                                            <p className="text-xs opacity-60 mt-1">We'll notify you when something happens</p>
                                        </div>
                                    )}
                                </div>
                                {notifications.length > 0 && (
                                    <div className="p-3 border-t border-gray-100 dark:border-slate-800 text-center">
                                        <button 
                                            onClick={() => {/* Navigate to full notifications page if it exists */}}
                                            className="text-xs font-semibold text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                                        >
                                            View all notifications
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="relative">
                        <button
                            onClick={() => {
                                setShowAppsMenu(!showAppsMenu);
                                setShowNotifications(false);
                            }}
                            className="p-2 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                            title="Google Apps"
                        >
                            <LayoutGrid className="w-5 h-5" />
                        </button>

                        {/* Apps Dropdown */}
                        {showAppsMenu && (
                            <div className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-800 p-4 z-[110] animate-in fade-in zoom-in-95 duration-200">
                                <div className="grid grid-cols-3 gap-4">
                                    <button onClick={() => { handleNavigation('mail'); setShowAppsMenu(false); }} className="flex flex-col items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
                                            <Mail className="w-5 h-5" />
                                        </div>
                                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Mail</span>
                                    </button>
                                    <button onClick={() => { handleNavigation('calls'); setShowAppsMenu(false); }} className="flex flex-col items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition">
                                        <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600">
                                            <Video className="w-5 h-5" />
                                        </div>
                                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Meet</span>
                                    </button>
                                    <button onClick={() => { handleNavigation('drive'); setShowAppsMenu(false); }} className="flex flex-col items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition">
                                        <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600">
                                            <HardDrive className="w-5 h-5" />
                                        </div>
                                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Drive</span>
                                    </button>
                                    <button className="flex flex-col items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition">
                                        <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center text-yellow-600">
                                            <Settings className="w-5 h-5" />
                                        </div>
                                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Admin</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="h-8 w-[1px] bg-gray-200 dark:border-slate-800 mx-2"></div>

                    <ThemeToggle />
                    <div className="ml-2">
                        <AccountSwitcher
                            currentUser={{
                                id: user.id || undefined,
                                name: user.name || user.full_name || 'User',
                                email: user.email || '',
                                avatar: user.avatar || null,
                                token: authService.getToken(),
                                used_bytes: storageInfo.used,
                                quota_bytes: storageInfo.limit
                            }}
                            onManageAccount={handleViewProfile}
                        >
                            <button
                                onClick={() => { setShowRulesModal(true); }}
                                className="w-full px-4 py-2 text-left text-[13px] text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition overflow-hidden flex items-center gap-2 border border-blue-200 dark:border-blue-800 shadow-sm"
                            >
                                <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                Inbox Rules
                            </button>
                            <button
                                onClick={() => {
                                    handleNavigation('mail');
                                    window.location.hash = 'transfers';
                                }}
                                className="w-full px-4 py-2 text-left text-[13px] text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition overflow-hidden flex items-center gap-2 border border-blue-200 dark:border-blue-800 shadow-sm"
                            >
                                <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                Transfers
                            </button>
                        </AccountSwitcher>
                    </div>
                </div>
            </div>

            {/* Main Workspace Area */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left Rail (App Switcher) */}
                <div className="w-20 hidden md:flex flex-col items-center py-4 gap-2 bg-gray-50/50 dark:bg-slate-900/50 border-r border-gray-200 dark:border-slate-800 flex-shrink-0">
                    <NavItem view="mail" icon={Mail} label="Mail" />
                    <NavItem view="calls" icon={Video} label="Meet" />
                    <NavItem view="drive" icon={HardDrive} label="Drive" />
                </div>

                {/* View Content */}
                <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-950 relative">
                    {currentView === 'mail' ? (
                        <MailLayout searchQuery={searchQuery} />
                    ) : currentView === 'calls' ? (
                        <CallsView />
                    ) : (
                        <JeeDrive searchQuery={searchQuery} />
                    )}
                </div>
            </div>

            {/* Global Modals */}
            {currentView === 'account' && (
                <AccountManagement 
                    onBack={() => setCurrentView('mail')} 
                    currentUser={user} 
                />
            )}

            {showRulesModal && (
                <InboxRulesModal isOpen={showRulesModal} onClose={() => setShowRulesModal(false)} />
            )}

            <PrivacyPolicyModal
                isOpen={showPrivacyPolicy}
                onClose={() => setShowPrivacyPolicy(false)}
            />

            <TermsOfServiceModal
                isOpen={showTermsOfService}
                onClose={() => setShowTermsOfService(false)}
            />

            <ActivityLogModal
                isOpen={showActivityLog}
                onClose={() => setShowActivityLog(false)}
            />


        </div>
    );
}
