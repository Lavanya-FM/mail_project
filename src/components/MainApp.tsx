import { useState, useEffect } from 'react';
import { Mail, HardDrive, Video, Shield, Search, Menu, Settings, HelpCircle, Bell, LayoutGrid, SlidersHorizontal } from 'lucide-react';
import MailLayout from './MailLayout';
import JeeDrive from './JeeDrive';
import CallManager from './CallManager';
import CallsView from './CallsView';
import P2PTransferManager from './P2PTransferManager';
import AccountSwitcher from './AccountSwitcher';
import ThemeToggle from './ThemeToggle';
import UserProfile from './UserProfile';
import InboxRulesModal from './InboxRulesModal';


type View = 'mail' | 'drive' | 'calls';

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


    const user = authService.getCurrentUser() || {
        email: 'user@example.com',
        name: 'User',
        id: 0
    };

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

        return () => {
            window.removeEventListener('app-navigate', handleNavigate as EventListener);
            window.removeEventListener('popstate', handlePathChange);
        };
    }, []);

    const handleViewProfile = () => {
        setUserProfileTab('carbon');
        setShowUserProfile(true);
    };

    const handleNavigation = (view: View) => {
        let path = '/';
        if (view === 'drive') path = '/drive';
        else if (view === 'calls') path = '/meet';

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

            {/* Top Navigation Bar */}
            <div className="h-16 px-4 flex items-center justify-between border-b border-gray-200 dark:border-slate-800 z-50 bg-white dark:bg-slate-900">
                {/* Left: Logo */}
                <div className="flex items-center gap-3 w-64 pl-2">
                    <button className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 lg:hidden">
                        <Menu className="w-5 h-5 text-gray-600 dark:text-slate-400" />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="bg-gradient-to-r from-blue-600 to-cyan-500 p-1.5 rounded-lg">
                            <Mail className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent hidden sm:block">
                            JeeMail
                        </span>
                    </div>
                </div>

                {/* Center: Search Bar */}
                <div className="flex-1 max-w-2xl px-4 lg:px-8">
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                        </div>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={`Search in ${currentView}...`}
                            className="block w-full pl-10 pr-12 py-2.5 bg-gray-100/50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 focus:shadow-lg rounded-2xl transition-all duration-300 sm:text-sm"
                        />
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                            <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition-colors">
                                <SlidersHorizontal className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center justify-end gap-1 w-80 pr-4 relative">
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
                            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"></span>
                        </button>

                        {/* Notifications Dropdown */}
                        {showNotifications && (
                            <div className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-800 p-4 z-50 animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="font-semibold text-gray-900 dark:text-white">Notifications</h3>
                                    <button className="text-xs text-blue-600 hover:underline">Mark all read</button>
                                </div>
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    <div className="py-8 text-center text-gray-500 dark:text-slate-400">
                                        <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                        <p className="text-sm">No new notifications</p>
                                    </div>
                                </div>
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
                            <div className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-800 p-4 z-50 animate-in fade-in zoom-in-95 duration-200">
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
                                token: authService.getToken()
                            }}
                            onManageAccount={handleViewProfile}
                        >
                            <button
                                onClick={() => { setShowRulesModal(true); }}
                                className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition overflow-hidden mb-2 flex items-center gap-2 border border-blue-200 dark:border-blue-800"
                            >
                                <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                Inbox Rules
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
                        <JeeDrive />
                    )}
                </div>
            </div>

            {/* Global Modals */}
            {showUserProfile && (
                <UserProfile
                    onClose={() => setShowUserProfile(false)}
                    userEmail={user.email}
                    userName={user.name || user.full_name || 'User'}
                    initialTab={userProfileTab}
                />
            )}

            {showRulesModal && (
                <InboxRulesModal isOpen={showRulesModal} onClose={() => setShowRulesModal(false)} />
            )}


        </div>
    );
}
