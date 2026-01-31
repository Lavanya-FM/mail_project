import { useState, useEffect } from 'react';
import { Mail, HardDrive, Video } from 'lucide-react';
import MailLayout from './MailLayout';
import JeeDrive from './JeeDrive';
import CallManager from './CallManager';
import CallsView from './CallsView';
import P2PTransferManager from './P2PTransferManager';

type View = 'mail' | 'drive' | 'calls';

import { authService } from '../lib/authService';
import { p2pService } from '../lib/p2pService';

export default function MainApp() {
    const [currentView, setCurrentView] = useState<View>('mail');

    useEffect(() => {
        const user = authService.getCurrentUser();
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

    return (
        <div className="h-screen flex flex-col">
            <CallManager />
            <P2PTransferManager />
            {/* Top Navigation Bar */}
            <div className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2">
                    <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-2 rounded-lg">
                        <Mail className="w-5 h-5 text-white" />
                    </div>
                    <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                        JeeMail
                    </h1>
                </div>

                {/* View Switcher */}
                <div className="flex gap-2 bg-gray-100 dark:bg-slate-800 p-1 rounded-lg">
                    <button
                        onClick={() => setCurrentView('mail')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${currentView === 'mail'
                            ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-md'
                            : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                    >
                        <Mail className="w-4 h-4" />
                        <span className="text-sm font-medium">Mail</span>
                    </button>
                    <button
                        onClick={() => setCurrentView('calls')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${currentView === 'calls'
                            ? 'bg-white dark:bg-slate-700 text-green-600 dark:text-green-400 shadow-md'
                            : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                    >
                        <Video className="w-4 h-4" />
                        <span className="text-sm font-medium">Meet</span>
                    </button>
                    <button
                        onClick={() => setCurrentView('drive')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${currentView === 'drive'
                            ? 'bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-400 shadow-md'
                            : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                    >
                        <HardDrive className="w-4 h-4" />
                        <span className="text-sm font-medium">Drive</span>
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {currentView === 'mail' ? (
                    <MailLayout />
                ) : currentView === 'calls' ? (
                    <CallsView />
                ) : (
                    <JeeDrive />
                )}
            </div>
        </div>
    );
}
