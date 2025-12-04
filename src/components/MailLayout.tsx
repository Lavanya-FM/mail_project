import { useState, useEffect } from 'react';
import {
  Inbox, Send, FileEdit, Trash2, Plus, Star, Archive,
  Search, LogOut, Sparkles, Circle, X, ChevronDown, User,
  Clock, AlertTriangle, Tag, Mail, Minimize2, Maximize2, Menu
} from 'lucide-react';
import { emailService, getFolderIdByName } from '../lib/emailService';
import { authService } from '../lib/authService';
import EmailList from './EmailList';
import EmailView from './EmailView';
import ThreadView from './ThreadView';
import ComposeEmail from './ComposeEmail';
import ThemeToggle from './ThemeToggle';
import GamificationBadges from './GamificationBadges';
import UserProfile from './UserProfile';
import AddAccountModal from './AddAccountModal';
import { animations } from '../utils/animations';
import { Email, Folder } from '../types/email';

const iconMap: Record<string, typeof Inbox> = {
  inbox: Inbox,
  send: Send,
  'file-edit': FileEdit,
  'trash-2': Trash2,
  archive: Archive,
  star: Star,
  circle: Circle,
  folder: Circle,
  drafts: FileEdit,
  sent: Send,
  spam: AlertTriangle,
  trash: Trash2,
  snoozed: Clock,
};

// Color mapping for each folder type
const folderColors: Record<string, string> = {
  inbox: '#3b82f6',    // Blue
  starred: '#fbbf24', // Yellow/Gold
  snoozed: '#8b5cf6',  // Purple
  sent: '#10b981',    // Green
  drafts: '#f59e0b',  // Amber
  spam: '#ef4444',     // Red
  trash: '#6b7280',   // Gray
};

export default function MailLayout() {
  const profile = authService.getCurrentUser();
  const signOut = () => {
    authService.logout();
    window.location.reload();
  };

  // keep raw responses and normalize when using
  const [foldersRaw, setFoldersRaw] = useState<any>([]);
  const [foldersLoaded, setFoldersLoaded] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [emailsRaw, setEmailsRaw] = useState<any>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showBadges, setShowBadges] = useState(true);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [userProfileTab, setUserProfileTab] = useState<'overview' | 'carbon' | 'settings'>('carbon');
  const [labels, setLabels] = useState([
    { id: 1, name: 'Personal', color: '#10b981' },
    { id: 2, name: 'Work', color: '#3b82f6' },
    { id: 3, name: 'Travel', color: '#f59e0b' },
  ]);
  const [editingLabelId, setEditingLabelId] = useState<number | null>(null);
  const [editLabelName, setEditLabelName] = useState('');
  const [openedMailTabs, setOpenedMailTabs] = useState<Email[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [composeWindows, setComposeWindows] = useState<string[]>([]);
  const [nextComposeId, setNextComposeId] = useState(1);
  const [windowStates, setWindowStates] = useState<Record<string, { minimized: boolean; maximized: boolean }>>({});
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // normalize different possible shapes to array
  const normalizeArray = (v: any, hints: string[] = []) => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'object') {
      for (const h of hints) {
        if (Array.isArray(v[h])) return v[h];
      }
      if (Array.isArray(v.data)) return v.data;
      if (Array.isArray(v.items)) return v.items;
      if (Array.isArray(v.folders)) return v.folders;
      if (Array.isArray(v.emails)) return v.emails;
      // sometimes the API returns { data: {...} } where data is object map
      // try to extract any array value
      const values = Object.values(v);
      for (const val of values) {
        if (Array.isArray(val)) return val;
      }
    }
    return [];
  };

  const folders: Folder[] = normalizeArray(foldersRaw, ['folders', 'data']);
  const emails: Email[] = normalizeArray(emailsRaw, ['emails', 'data', 'items']);

  useEffect(() => {
    if (!profile?.id) return;

    const initializeUserData = async () => {
      try {
        // any migration/cleanup goes here
      } catch (error) {
        console.error('init error:', error);
      } finally {
        await loadFolders();
        await loadEmails();
      }
    };

    initializeUserData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  useEffect(() => {
    if (selectedFolder) {
      // Handle special folders differently
      if (selectedFolder.id === 'starred') {
        loadStarredEmails();
      } else if (selectedFolder.id === 'archive') {
        const archiveFolderId = getFolderIdByName('archive');
        if (archiveFolderId) {
          loadEmails(archiveFolderId);
        }
      } else {
        loadEmails(Number(selectedFolder.id));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolder]);

  useEffect(() => {
    if (folders.length > 0 && !selectedFolder) {
      const inboxFolder = folders.find((f) => (f.name || '').toString().toLowerCase() === 'inbox');
      if (inboxFolder) {
        setSelectedFolder({ ...inboxFolder, id: Number(inboxFolder.id) });
      } else {
        setSelectedFolder({ ...folders[0], id: Number(folders[0].id) });
      }
    }
  }, [folders, selectedFolder]);

  const loadFolders = async () => {
    try {
      if (!profile?.id) return;
      const resp = await emailService.getFolders(profile.id);
      if (resp.error) {
        console.error('Error loading folders:', resp.error);
        setFoldersRaw([]);
      } else {
        setFoldersRaw(resp.data ?? []);
        localStorage.setItem("folders", JSON.stringify(resp.data ?? []));  // <-- FIXED
      }
    } catch (err) {
      console.error('Error loading folders:', err);
      setFoldersRaw([]);
    } finally {
      setFoldersLoaded(true);
      setLoading(false);
    }
  };

  const loadEmails = async (folderId?: string | number) => {
    try {
      if (!profile?.id) return;
      const folderNumericId = folderId ? Number(folderId) : undefined;
      const resp = await emailService.getEmails(profile.id, folderNumericId);
      if (resp.error) {
        console.error('Error loading emails:', resp.error);
        setEmailsRaw([]);
      } else {
        setEmailsRaw(resp.data ?? []);
      }
    } catch (err) {
      console.error('Error loading emails:', err);
      setEmailsRaw([]);
    }
  };

  const refreshEmails = () => {
    if (selectedFolder) {
      if (selectedFolder.id === 'starred') {
        loadStarredEmails();
      } else if (selectedFolder.id === 'archive') {
        const archiveFolderId = getFolderIdByName('archive');
        if (archiveFolderId) {
          loadEmails(archiveFolderId);
        }
      } else {
        loadEmails(Number(selectedFolder.id));
      }
    } else {
      loadEmails();
    }
  };

  const handleComposeFromEmail = () => {
    handleOpenComposeWindow();
  };

  const handleAddAccount = () => {
    setShowAddAccount(true);
    setShowProfileDropdown(false);
  };

  const handleAccountAdded = (account: any) => {
    // Store the new account (you can implement localStorage or backend storage)
    const existingAccounts = JSON.parse(localStorage.getItem('additionalAccounts') || '[]');
    existingAccounts.push(account);
    localStorage.setItem('additionalAccounts', JSON.stringify(existingAccounts));

    // Show success message or switch to the new account
    console.log('Account added:', account);
  };

  const handleViewProfile = () => {
    setUserProfileTab('carbon'); // Set to carbon tab by default
    setShowUserProfile(true);
    setShowProfileDropdown(false);
  };

  const handleOpenMailInTab = (email: Email) => {
    const existingTab = openedMailTabs.find(tab => tab.id === email.id);
    if (!existingTab) {
      setOpenedMailTabs([...openedMailTabs, email]);
    }
    setActiveTabId(String(email.id));
    setSelectedEmail(null); // Clear the single email view
  };

  const handleCloseTab = (emailId: string) => {
    setOpenedMailTabs(openedMailTabs.filter(tab => String(tab.id) !== emailId));
    if (activeTabId === emailId) {
      const remainingTabs = openedMailTabs.filter(tab => String(tab.id) !== emailId);
      if (remainingTabs.length > 0) {
        setActiveTabId(String(remainingTabs[0].id));
      } else {
        setActiveTabId(null);
        setSelectedEmail(null); // Clear selected email when no tabs are open
      }
    }
  };

  const handleOpenComposeWindow = () => {
    // Only allow one compose window at a time
    if (composeWindows.length === 0) {
      const newComposeId = `compose-${nextComposeId}`;
      setComposeWindows([newComposeId]);
      setNextComposeId(nextComposeId + 1);
    }
  };

  const handleCloseComposeWindow = (composeId: string) => {
    setComposeWindows(composeWindows.filter(id => id !== composeId));
    // Clean up window state when window is closed
    const newWindowStates = { ...windowStates };
    delete newWindowStates[composeId];
    setWindowStates(newWindowStates);
  };

  const handleMinimizeWindow = (composeId: string) => {
    setWindowStates(prev => ({
      ...prev,
      [composeId]: { ...prev[composeId], minimized: true, maximized: false }
    }));
  };

  const handleMaximizeWindow = (composeId: string) => {
    setWindowStates(prev => ({
      ...prev,
      [composeId]: { ...prev[composeId], minimized: false, maximized: !prev[composeId]?.maximized }
    }));
  };

  const handleFolderClick = (folderType: string, folder: Folder) => {
    setSelectedFolder(folder);

    // Load emails based on folder type
    if (folderType === 'starred') {
      loadStarredEmails();
    } else if (folderType === 'archive') {
      const archiveFolderId = getFolderIdByName('archive');
      if (archiveFolderId) {
        loadEmails(archiveFolderId);
      }
    } else {
      loadEmails(Number(folder.id));
    }
  };

  const loadStarredEmails = async () => {
    try {
      if (!profile?.id) return;
      // For now, load all emails and filter client-side for starred
      // Backend teammate can implement proper starred endpoint
      const resp = await emailService.getEmails(profile.id);
      if (resp.error) {
        console.error('Error loading emails:', resp.error);
        setEmailsRaw([]);
      } else {
        const allEmails = resp.data ?? [];
        const starredEmails = allEmails.filter((email: any) => email.is_starred);
        setEmailsRaw(starredEmails);
      }
    } catch (err) {
      console.error('Error loading starred emails:', err);
      setEmailsRaw([]);
    }
  };

  const handleAddLabel = () => {
    const newId = labels.length > 0 ? Math.max(...labels.map(l => l.id)) + 1 : 1;
    const newLabel = {
      id: newId,
      name: 'New Label',
      color: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'][labels.length % 5]
    };
    setLabels([...labels, newLabel]);
    setEditingLabelId(newId);
    setEditLabelName('New Label');
  };

  const handleLabelRename = (id: number) => {
    if (!editLabelName.trim()) return;
    setLabels(labels.map(l => l.id === id ? { ...l, name: editLabelName } : l));
    setEditingLabelId(null);
  };

  const handleLabelEditKeyDown = (e: React.KeyboardEvent, id: number) => {
    if (e.key === 'Enter') {
      handleLabelRename(id);
    } else if (e.key === 'Escape') {
      setEditingLabelId(null);
    }
  };

  // close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (showProfileDropdown) setShowProfileDropdown(false);
    };
    if (showProfileDropdown) document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showProfileDropdown]);

  const filteredEmails = emails.filter((email) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      ((email.subject || '') + '').toString().toLowerCase().includes(q) ||
      ((email.from_name || '') + '').toString().toLowerCase().includes(q) ||
      ((email.from_email || '') + '').toString().toLowerCase().includes(q) ||
      ((email.body || '') + '').toString().toLowerCase().includes(q)
    );
  });

  if (loading && !foldersLoaded) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const SidebarContent = () => (
    <>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-500 to-cyan-500 p-2 rounded-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-gray-900 dark:text-white font-bold text-lg">Jeemail</span>
          </div>
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="lg:hidden p-2 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* User Profile */}
      <div className="p-4 border-b border-gray-200 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <div className="relative flex-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowProfileDropdown(!showProfileDropdown);
              }}
              className="flex items-center gap-3 w-full p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition"
            >
              <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold text-lg">
                {profile?.full_name?.charAt(0) || profile?.email?.charAt(0) || 'U'}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {profile?.full_name || 'User'}
                </p>
                <p className="text-xs text-gray-500 dark:text-slate-400 truncate">
                  {profile?.email}
                </p>
              </div>
            </button>

            {/* Profile Dropdown */}
            {showProfileDropdown && (
              <div className={`absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden ${animations.slideInUp}`} style={{ minWidth: '280px' }}>
                {/* User Info Header */}
                <div className="p-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold text-xl relative">
                      {profile?.full_name?.charAt(0) || profile?.email?.charAt(0) || 'U'}
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white dark:border-slate-800"></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        Hi, {profile?.full_name || 'User'}!
                      </p>
                      <p className="text-xs text-gray-600 dark:text-slate-400 truncate">
                        {profile?.email}
                      </p>
                    </div>
                    <button
                      onClick={() => setShowProfileDropdown(false)}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Manage Account Button */}
                <div className="p-2">
                  <button
                    onClick={handleViewProfile}
                    className="w-full px-4 py-3 text-left text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition border border-blue-200 dark:border-blue-800 mb-2 flex items-center gap-2"
                  >
                    <User className="w-4 h-4" />
                    View Profile & Carbon Credits
                  </button>
                </div>

                {/* Actions */}
                <div className="p-2 space-y-1">
                  <button
                    onClick={handleAddAccount}
                    className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition flex items-center gap-3"
                  >
                    <Plus className="w-4 h-4 text-blue-500" />
                    Add account
                  </button>
                  <button
                    onClick={signOut}
                    className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition flex items-center gap-3"
                  >
                    <LogOut className="w-4 h-4 text-gray-500" />
                    Sign out
                  </button>
                </div>

                {/* Storage Info */}
                <div className="p-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50">
                  <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-r from-blue-500 to-purple-500"></div>
                    <span>8% of 1 GB used</span>
                  </div>
                </div>

                {/* Footer Links */}
                <div className="p-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50">
                  <div className="flex justify-center gap-4 text-xs text-gray-500 dark:text-slate-500">
                    <button className="hover:text-gray-700 dark:hover:text-slate-300 transition">Privacy Policy</button>
                    <span>•</span>
                    <button className="hover:text-gray-700 dark:hover:text-slate-300 transition">Terms of Service</button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="ml-2">
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Compose Button */}
      <div className="p-4">
        <button
          onClick={() => {
            handleOpenComposeWindow();
            setMobileSidebarOpen(false);
          }}
          className={`w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-4 py-2.5 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-blue-500/25 hover:scale-[1.02] ${animations.fadeInUp}`}
        >
          <Plus className="w-4 h-4" />
          Compose
        </button>
      </div>

      {/* Folders */}
      <div className="flex-1 overflow-y-auto py-2">
        <div className="px-2 space-y-1">
          {['inbox', 'starred', 'snoozed', 'sent', 'drafts', 'spam', 'trash'].map((folderType) => {
            let folder = folders.find((f) => (f.name || '').toString().toLowerCase() === folderType);

            // Create virtual folders for starred, snoozed if they don't exist in backend
            if (!folder && (folderType === 'starred' || folderType === 'snoozed')) {
              folder = {
                id: folderType === 'starred' ? 'starred' : 'snoozed',
                name: folderType.charAt(0).toUpperCase() + folderType.slice(1),
                icon: folderType === 'starred' ? 'star' : folderType,
                color: folderType === 'starred' ? '#fbbf24' : folderType === 'snoozed' ? '#8b5cf6' : '#6b7280'
              };
            }

            if (!folder) return null;

            const Icon = folderType === 'starred' ? Star : (iconMap[folderType] || iconMap[folder.icon || 'folder'] || Circle);
            const isActive = String(selectedFolder?.id) === String(folder.id);
            const iconColor = folderColors[folderType] || (isActive ? '#1e40af' : undefined);

            // Calculate counts differently for special folders
            let folderCount = 0;
            if (folderType === 'starred') {
              folderCount = emails.filter((e) => e.is_starred).length;
            } else if (folderType === 'snoozed') {
              folderCount = emails.filter((e) => e.is_snoozed).length;
            } else if (folderType === 'drafts') {
              folderCount = emails.filter((e) => String(e.folder_id) === String(folder.id)).length;
            } else {
              folderCount = emails.filter((e) => String(e.folder_id) === String(folder.id) && !e.is_read).length;
            }

            return (
              <button
                key={String(folder.id)}
                onClick={() => {
                  handleFolderClick(folderType, folder!);
                  setMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${animations.fadeInLeft} ${isActive ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 shadow-md' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800/50 hover:scale-105'}`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" style={{ color: iconColor }} />
                <span className="flex-1 text-left font-medium text-sm">{folder.name}</span>
                {folderCount > 0 && folderType === 'drafts' && (
                  <span className={`bg-gray-500 text-white text-xs px-2 py-0.5 rounded-full min-w-[20px] text-center flex-shrink-0 ${animations.pulseGlow}`}>
                    {folderCount}
                  </span>
                )}
              </button>
            );
          })}

        </div>

        {/* Labels Section */}
        <div className="px-2 mt-4">
          <div className="flex items-center justify-between mb-3 px-3">
            <h3 className="text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wider">Labels</h3>
            <button
              onClick={handleAddLabel}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700 transition"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-1">
            {labels.map((label) => (
              <div
                key={label.id}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800/50 hover:scale-105 group"
              >
                <Tag className="w-4 h-4 flex-shrink-0" style={{ color: label.color }} />
                {editingLabelId === label.id ? (
                  <input
                    autoFocus
                    type="text"
                    value={editLabelName}
                    onChange={(e) => setEditLabelName(e.target.value)}
                    onBlur={() => handleLabelRename(label.id)}
                    onKeyDown={(e) => handleLabelEditKeyDown(e, label.id)}
                    className="flex-1 bg-white dark:bg-slate-900 border border-blue-500 rounded px-1 py-0.5 text-sm outline-none text-gray-900 dark:text-white"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="flex-1 text-left text-sm cursor-pointer"
                    onDoubleClick={() => {
                      setEditingLabelId(label.id);
                      setEditLabelName(label.name);
                    }}
                  >
                    {label.name}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gamification Badges Section */}
      <div className="border-t border-gray-200 dark:border-slate-800 p-4">
        <button onClick={() => setShowBadges(!showBadges)} className="flex items-center justify-between w-full mb-3 hover:opacity-80 transition">
          <h3 className="text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wider">🏆 Achievements</h3>
          <ChevronDown className={`w-4 h-4 text-gray-500 dark:text-slate-400 transition-transform ${showBadges ? 'rotate-180' : ''}`} />
        </button>
        {showBadges && <div className="max-h-96 overflow-y-auto"><GamificationBadges /></div>}
      </div>

      {/* Storage Usage - Bottom Left */}
      <div className="p-4 border-t border-gray-200 dark:border-slate-800">
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-gray-600 dark:text-slate-400 mb-2">
            <span>Storage Used</span>
            <span>{((profile?.storage_used || 0) / (1024 * 1024)).toFixed(1)} MB / 1024 MB</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-1.5">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${Math.min(((profile?.storage_used || 0) / (profile?.storage_limit || 1073741824)) * 100, 100)}%` }}></div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="h-screen bg-gray-50 dark:bg-slate-950 flex flex-col lg:flex-row overflow-hidden">
      {/* Desktop Sidebar - Hidden on Mobile */}
      <div className="hidden lg:flex w-64 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 flex-col flex-shrink-0">
        <SidebarContent />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileSidebarOpen(false)}
          ></div>
          <div className="relative w-72 bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-gray-50 dark:bg-slate-950 lg:ml-0">
        {/* Top Bar */}
        <div className="h-16 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 flex items-center px-4 lg:px-6 gap-4 shadow-sm">
          {/* Mobile Menu Button */}
          <button
            className="lg:hidden p-2 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition"
            onClick={() => setMobileSidebarOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>

          <div className="flex-1 max-w-xl relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search emails..."
              className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
          {/* Mobile Profile & Theme */}
          <div className="flex items-center gap-2 lg:hidden">
            <ThemeToggle />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowProfileDropdown(!showProfileDropdown);
              }}
              className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold text-sm"
            >
              {profile?.full_name?.charAt(0) || profile?.email?.charAt(0) || 'U'}
            </button>
          </div>
        </div>

        {/* Email Tabs Bar */}
        {openedMailTabs.length > 0 && (
          <div className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-2 py-1 flex items-center gap-1 overflow-x-auto">
            {openedMailTabs.map((email) => (
              <div
                key={email.id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-t-lg cursor-pointer transition-all duration-200 min-w-0 max-w-xs ${activeTabId === String(email.id)
                  ? 'bg-blue-50 dark:bg-blue-900/30 border-b-2 border-blue-500'
                  : 'bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 border-b-2 border-transparent'
                  }`}
                onClick={() => setActiveTabId(String(email.id))}
              >
                <span className="text-sm font-medium text-gray-700 dark:text-slate-300 truncate">
                  {email.subject || 'No Subject'}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTab(String(email.id));
                  }}
                  className="p-0.5 rounded-full hover:bg-gray-300 dark:hover:bg-slate-600 transition"
                >
                  <X className="w-3 h-3 text-gray-500 dark:text-slate-400" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Email Content */}
        <div className="flex-1 flex overflow-hidden flex-col lg:flex-row">
          {/* Email List - Mobile: Full width when no email selected, Desktop: Fixed width */}
          <div className={`${activeTabId ? 'hidden lg:block' : 'block'} w-full lg:w-96 flex-shrink-0`}>
            <EmailList
              emails={filteredEmails}
              selectedEmail={selectedEmail}
              onSelectEmail={(email: any) => {
                handleOpenMailInTab(email);
              }}
              onRefresh={refreshEmails}
            />
          </div>
          <div className="flex-1 flex flex-col min-w-0">
            {activeTabId ? (
              <div className="flex-1 bg-white dark:bg-slate-900">
                {(() => {
                  const activeEmail = openedMailTabs.find(tab => String(tab.id) === activeTabId);
                  if (!activeEmail) return null;

                  if (activeEmail.thread_id) {
                    return (
                      <ThreadView
                        threadId={String(activeEmail.thread_id)}
                        userId={String(profile?.id || '')}
                        onClose={() => handleCloseTab(String(activeEmail.id))}
                        onCompose={handleComposeFromEmail}
                      />
                    );
                  } else {
                    return (
                      <EmailView
                        email={activeEmail}
                        onClose={() => handleCloseTab(String(activeEmail.id))}
                        onRefresh={refreshEmails}
                        onCompose={handleComposeFromEmail}
                      />
                    );
                  }
                })()}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-slate-950">
                <div className="text-center">
                  <div className="w-24 h-24 bg-gray-200 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Mail className="w-12 h-12 text-gray-400 dark:text-slate-600" />
                  </div>
                  <p className="text-gray-500 dark:text-slate-400 text-lg">Select an email to read</p>
                  <p className="text-gray-400 dark:text-slate-500 text-sm mt-2">Emails will open in tabs above</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Multiple Compose Windows */}
      {composeWindows.map((composeId, index) => {
        const windowState = windowStates[composeId] || { minimized: false, maximized: false };

        if (windowState.minimized) {
          return (
            <div
              key={composeId}
              className="fixed bottom-4 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 z-40 flex items-center px-3 py-2 cursor-pointer"
              style={{ left: `${20 + index * 200}px` }}
              onClick={() => handleMaximizeWindow(composeId)}
            >
              <Mail className="w-4 h-4 text-gray-500 dark:text-slate-400 mr-2" />
              <span className="text-sm text-gray-700 dark:text-slate-300">New Message</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseComposeWindow(composeId);
                }}
                className="ml-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700 transition"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        }

        return (
          <div
            key={composeId}
            className={`fixed bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 z-40 flex flex-col ${windowState.maximized ? 'inset-4 rounded-2xl' : 'w-96 h-[500px]'
              }`}
            style={!windowState.maximized ? {
              right: `${20 + index * 420}px`,
              bottom: `${20}px`
            } : {}}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 rounded-t-2xl">
              <h3 className="font-semibold text-gray-900 dark:text-white">New Message</h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleMinimizeWindow(composeId)}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700 transition"
                  title="Minimize"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleMaximizeWindow(composeId)}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700 transition"
                  title={windowState.maximized ? "Restore" : "Maximize"}
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleCloseComposeWindow(composeId)}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700 transition"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <ComposeEmail
                onClose={() => handleCloseComposeWindow(composeId)}
                onSent={() => { handleCloseComposeWindow(composeId); refreshEmails(); }}
                onDraftSaved={refreshEmails}
                prefilledData={undefined}
              />
            </div>
          </div>
        );
      })}

      {/* User Profile Modal */}
      {showUserProfile && (
        <UserProfile
          onClose={() => setShowUserProfile(false)}
          userEmail={profile?.email}
          userName={profile?.full_name || profile?.email}
          initialTab={userProfileTab}
        />
      )}

      {/* Add Account Modal */}
      {showAddAccount && (
        <AddAccountModal
          onClose={() => setShowAddAccount(false)}
          onSuccess={handleAccountAdded}
        />
      )}
    </div>
  );
}
