// src/components/MailLayout.tsx
import { useState, useEffect, useCallback } from 'react';
import {
  Inbox, Send, FileEdit, Trash2, Plus, Star, Archive,
  Circle, ChevronDown,
  Clock, AlertTriangle, Tag, Mail, Menu, Wifi, Share2, CheckCircle2, Layers,
  ShieldCheck as Shield2
} from 'lucide-react';
import { emailService, getFolderIdByName } from '../lib/emailService';
import { authService } from '../lib/authService';
import { inboxScanner } from '../lib/inboxScanner';
import EmailList from './EmailList';
import EmailView from './EmailView';
import ThreadView from './ThreadView';
import TransfersView from './TransfersView';
import ComposeEmail from './compose/ComposeEmail';
import GamificationBadges from './GamificationBadges';
import ActivityLogModal from './ActivityLogModal';
import PrivacyPolicyModal from './PrivacyPolicyModal';
import TermsOfServiceModal from './TermsOfServiceModal';
import { animations } from '../utils/animations';
import { Email, Folder } from '../types/email';
import { normalizeEmailBody } from '../utils/email';
import { encodeEmailId, decodeEmailId } from '../utils/urlEncoding';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableTab } from './SortableTab';

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
  transfers: Shield2
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

interface MailLayoutProps {
  searchQuery?: string;
}

export default function MailLayout({ searchQuery = '' }: MailLayoutProps) {
  const profile = authService.getCurrentUser();

  // keep raw responses and normalize when using
  const [foldersRaw, setFoldersRaw] = useState<any>([]);
  const [foldersLoaded, setFoldersLoaded] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [emailsRaw, setEmailsRaw] = useState<any>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBadges, setShowBadges] = useState(true);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showTermsOfService, setShowTermsOfService] = useState(false);
  const [labels, setLabels] = useState<any[]>([]);
  const [editingLabelId, setEditingLabelId] = useState<number | null>(null);
  const [editLabelName, setEditLabelName] = useState('');
  const [openedMailTabs, setOpenedMailTabs] = useState<Email[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [composeWindows, setComposeWindows] = useState<{ id: string; data?: any }[]>([]);
  const [nextComposeId, setNextComposeId] = useState(1);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Status State
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isP2PCombined, setIsP2PCombined] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date>(new Date());

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setOpenedMailTabs((items) => {
        const oldIndex = items.findIndex((item) => String(item.id) === active.id);
        const newIndex = items.findIndex((item) => String(item.id) === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  const groupTabsBySender = () => {
    setOpenedMailTabs(prev => {
      const sorted = [...prev].sort((a, b) => {
        const senderA = (a.from_name || a.from_email || '').toLowerCase();
        const senderB = (b.from_name || b.from_email || '').toLowerCase();
        return senderA.localeCompare(senderB);
      });
      return sorted;
    });
  };

  // Storage State
  const [storageInfo, setStorageInfo] = useState({
    used: profile?.storage_used_bytes || 0,
    limit: profile?.storage_limit_bytes || 1073741824
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const i = setInterval(() => {
      // @ts-ignore
      const connected = window.p2p_connected || (navigator.onLine && authService.getCurrentUser());
      setIsP2PCombined(!!connected);
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(i);
    };
  }, []);

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
      const values = Object.values(v);
      for (const val of values) {
        if (Array.isArray(val)) return val;
      }
    }
    return [];
  };

  const folders: Folder[] = normalizeArray(foldersRaw, ['folders', 'data']);
  const emails: Email[] = normalizeArray(emailsRaw, ['emails', 'data', 'items']);

  const loadEmails = useCallback(async (folderId?: string | number) => {
    try {
      if (!profile?.id) return;
      const folderNumericId = folderId ? Number(folderId) : undefined;
      const resp = await emailService.getEmails(profile.id, folderNumericId);
      if (resp.error) {
        console.error('Error loading emails:', resp.error);
        setEmailsRaw([]);
      } else {
        const raw = resp.data ?? [];
        // SCAN EMAILS
        const scanned = inboxScanner.scanEmails(raw);
        setEmailsRaw(scanned);
      }
    } catch (err) {
      console.error('Error loading emails:', err);
      setEmailsRaw([]);
    }
  }, [profile?.id]);

  const loadStarredEmails = useCallback(async () => {
    try {
      if (!profile?.id) return;
      // Use existing getEmails and filter client-side if no dedicated endpoint
      const resp = await emailService.getEmails(profile.id);
      if (resp.error) {
        console.error('Error loading starred emails:', resp.error);
        setEmailsRaw([]);
      } else {
        const allEmails = resp.data ?? [];
        const starredEmails = allEmails.filter((email: any) => email.is_starred);
        // SCAN STARRED EMAILS TOO
        const scanned = inboxScanner.scanEmails(starredEmails);
        setEmailsRaw(scanned);
      }
    } catch (err) {
      console.error('Error loading starred emails:', err);
      setEmailsRaw([]);
    }
  }, [profile?.id]);

  const handleOpenComposeWindow = useCallback((data?: any) => {
    // If opening an existing draft, check if it's already open
    if (data?.id) {
      const existing = composeWindows.find(w => w.data?.id === data.id);
      if (existing) return;
    }

    const newComposeId = `compose-${nextComposeId}`;
    setComposeWindows(prev => [...prev, { id: newComposeId, data }]);
    setNextComposeId(prev => prev + 1);
  }, [nextComposeId, composeWindows]);

  const handleOpenMailInTab = useCallback((email: Email) => {
    if (!openedMailTabs.some(tab => String(tab.id) === String(email.id))) {
      setOpenedMailTabs(prev => [...prev, email]);
    }
    setActiveTabId(String(email.id));
    if (selectedFolder) {
      const folderName = selectedFolder.system_box || selectedFolder.name || 'inbox';
      window.location.hash = `${folderName.toLowerCase()}/${encodeEmailId(email.id)}`;
    }
  }, [openedMailTabs, selectedFolder]);

  const handleCloseTab = useCallback((emailId: string) => {
    setOpenedMailTabs(prev => prev.filter(tab => String(tab.id) !== emailId));

    if (activeTabId === emailId) {
      const remainingTabs = openedMailTabs.filter(tab => String(tab.id) !== emailId);

      if (remainingTabs.length > 0) {
        const nextTab = remainingTabs[remainingTabs.length - 1];
        setActiveTabId(String(nextTab.id));
        if (selectedFolder) {
          const folderName = selectedFolder.system_box || selectedFolder.name || 'inbox';
          window.location.hash = `${folderName.toLowerCase()}/${encodeEmailId(nextTab.id)}`;
        }
      } else {
        setActiveTabId(null);
        setSelectedEmail(null);
        if (selectedFolder) {
          const folderName = selectedFolder.system_box || selectedFolder.name || 'inbox';
          window.location.hash = folderName.toLowerCase();
        }
      }
    }
  }, [activeTabId, openedMailTabs, selectedFolder]);

  // Hash Navigation Handler
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (!hash) {
        if (!openedMailTabs.length) setActiveTabId(null);
        return;
      }

      const [folderName, ...rest] = hash.split('/');

      // Handle Compose
      if (folderName === 'compose') {
        handleOpenComposeWindow();
        return;
      }

      // Handle Folders
      if (folderName && folders.length > 0) {
        let targetFolder = folders.find(f => (f.name || '').toLowerCase() === folderName.toLowerCase() || (f.system_box || '').toLowerCase() === folderName.toLowerCase());

        // Custom handling for virtual folders
        if (!targetFolder) {
          if (['starred', 'snoozed', 'spam', 'trash', 'drafts', 'archive'].includes(folderName)) {
            const systemMap: any = {
              starred: { id: 'starred', name: 'Starred', system_box: 'starred' },
              snoozed: { id: 'snoozed', name: 'Snoozed', system_box: 'snoozed' },
              spam: { id: 'spam', name: 'Spam', system_box: 'spam' },
              trash: { id: 'trash', name: 'Trash', system_box: 'trash' },
              drafts: { id: 'drafts', name: 'Drafts', system_box: 'drafts' },
              archive: { id: 'archive', name: 'Archive', system_box: 'archive' }
            };
            targetFolder = systemMap[folderName];
          }
        }

        if (targetFolder) {
          if (selectedFolder?.id !== targetFolder.id) {
            setSelectedFolder(targetFolder as Folder);
          }

          // Handle Email ID in hash
          const encodedEmailId = rest[0];
          if (encodedEmailId) {
            const decodedId = decodeEmailId(encodedEmailId);
            const foundEmail = emails.find(e => String(e.id) === (decodedId || encodedEmailId));
            if (foundEmail) {
              if (!openedMailTabs.some(tab => String(tab.id) === String(foundEmail.id))) {
                setOpenedMailTabs(prev => [...prev, foundEmail]);
              }
              setActiveTabId(String(foundEmail.id));
            }
          } else {
            if (!openedMailTabs.length) setActiveTabId(null);
          }
        }
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    // Initial check
    if (foldersLoaded) handleHashChange();

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [foldersLoaded, folders, selectedFolder, emails, openedMailTabs, handleOpenComposeWindow]);

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

    const fetchStorageQuota = async () => {
      try {
        const res = await authService.fetchWithAuth(`/api/storage/quota?user_id=${profile.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.storage_used_bytes !== undefined) {
            setStorageInfo({
              used: data.storage_used_bytes,
              limit: data.storage_limit_bytes || 1073741824
            });
          }
        }
      } catch (e) {
        console.error("Failed to fetch storage quota", e);
      }
    };

    initializeUserData();
    fetchStorageQuota();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  useEffect(() => {
    if (selectedFolder) {
      if (selectedFolder.id === 'starred') {
        loadStarredEmails();
      } else if (selectedFolder.id === 'transfers') {
        // For transfers, we want to see emails from both inbox and sent to match contexts
        // Passing null/undefined usually loads inbox, but we can load all or just keep previous
        // Let's load the last few emails without specific folder focus
        loadEmails();
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
        if (!window.location.hash) window.location.hash = 'inbox';
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
        localStorage.setItem("folders", JSON.stringify(resp.data ?? []));
      }
    } catch (err) {
      console.error('Error loading folders:', err);
      setFoldersRaw([]);
    } finally {
      setFoldersLoaded(true);
      setLoading(false);
    }
  };

  // Sync labels with custom folders when folders update
  useEffect(() => {
    if (folders.length > 0) {
      const systemNames = ['inbox', 'starred', 'snoozed', 'sent', 'drafts', 'spam', 'trash', 'archive'];
      const customFolders = folders.filter(f =>
        !systemNames.includes((f.name || '').toLowerCase()) &&
        !systemNames.includes((f.system_box || '').toLowerCase())
      );

      const mappedLabels = customFolders.map((f, index) => ({
        id: Number(f.id),
        name: f.name,
        color: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]
      }));

      setLabels(mappedLabels);
    }
  }, [folders]);

  const refreshEmails = () => {
    setLastSynced(new Date());
    loadFolders(); // Update counts
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

  useEffect(() => {
    const handleNewEmail = () => {
      console.log('[PUSH] New email notification received! Refreshing...');
      refreshEmails();
    };

    window.addEventListener('new-email', handleNewEmail as EventListener);
    return () => {
      window.removeEventListener('new-email', handleNewEmail as EventListener);
    };
  }, [refreshEmails]);

  const handleComposeFromEmail = () => {
    handleOpenComposeWindow();
  };

  const handleCloseComposeWindow = (composeId: string) => {
    setComposeWindows(prev => prev.filter(w => w.id !== composeId));
  };

  const handleFolderClick = (folderType: string, folder: Folder) => {
    window.location.hash = folderType;
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

  const filteredEmails = emails.filter((email) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      ((email.subject || '') + '').toString().toLowerCase().includes(q) ||
      ((email.from_name || '') + '').toString().toLowerCase().includes(q) ||
      ((email.from_email || '') + '').toString().toLowerCase().includes(q) ||
      ((normalizeEmailBody(email.body) || '') + '').toString().toLowerCase().includes(q)
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

            // Calculate counts
            let folderCount = 0;

            if (folder && typeof folder.count === 'number') {
              folderCount = folder.count;
            } else {
              // Fallback for virtual folders or if count is missing
              try {
                if (folderType === 'starred') {
                  folderCount = emails.filter((e) => e.is_starred).length;
                } else if (folderType === 'snoozed') {
                  folderCount = emails.filter((e) => e.is_snoozed).length;
                } else if (folderType === 'drafts') {
                  folderCount = emails.filter((e) => String(e.folder_id) === String(folder.id)).length;
                } else {
                  folderCount = emails.filter((e) => String(e.folder_id) === String(folder.id) && !e.is_read).length;
                }
                folderCount = Number(folderCount) || 0;
              } catch (err) {
                folderCount = 0;
              }
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

                {/* Show badge only when count > 0 to avoid rendering `0` */}
                {folderCount > 0 && (
                  <span
                    className={`text-xs text-white px-2 py-0.5 rounded-full min-w-[20px] text-center flex-shrink-0 ${folderType === 'drafts' ? 'bg-gray-500' : 'bg-blue-600'} ${animations.pulseGlow}`}
                  >
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
            <span>{(storageInfo.used / (1024 * 1024)).toFixed(1)} MB / {(storageInfo.limit / (1024 * 1024)).toFixed(0)} MB</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-1.5">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${Math.min((storageInfo.used / storageInfo.limit) * 100, 100)}%` }}></div>
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



        </div>

        {/* Email Tabs Bar */}
        {openedMailTabs.length > 0 && (
          <div className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-4 py-1.5 flex items-center justify-between shadow-sm z-20">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1 mr-4">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest mr-2 flex-shrink-0 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
                <Clock className="w-3 h-3" />
                <span>Recent</span>
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={openedMailTabs.map(t => String(t.id))}
                  strategy={horizontalListSortingStrategy}
                >
                  {openedMailTabs.map((email) => (
                    <SortableTab
                      key={email.id}
                      email={email}
                      isActive={activeTabId === String(email.id)}
                      onActivate={() => handleOpenMailInTab(email)}
                      onClose={(e) => {
                        e.stopPropagation();
                        handleCloseTab(String(email.id));
                      }}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>

            {/* System Status Indicators - Fills blank space */}
            <div className="hidden lg:flex items-center gap-4 px-4 border-r border-gray-200 dark:border-slate-800 mr-4">
              <button
                onClick={groupTabsBySender}
                title="Group tabs by sender"
                className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800/50 rounded-lg transition-colors"
              >
                <Layers className="w-3 h-3" />
                <span>GROUP</span>
              </button>
              <div className={`flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${isOnline ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/10' : 'text-red-600 bg-red-50'}`}>
                <Wifi className={`w-3 h-3 ${!isOnline ? 'animate-pulse' : ''}`} />
                <span>{isOnline ? 'Online' : 'Offline'}</span>
              </div>

              <div
                title="Peer-to-Peer file sharing network status"
                className={`flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full hidden xl:flex transition-colors cursor-help ${isP2PCombined ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10' : 'text-gray-400 bg-gray-100'}`}>
                <Share2 className="w-3 h-3" />
                <span>{isP2PCombined ? 'P2P Ready' : 'P2P Offline'}</span>
              </div>

              <div
                onClick={refreshEmails}
                className="flex items-center gap-1.5 text-[10px] font-medium text-gray-500 dark:text-slate-400 hidden 2xl:flex cursor-pointer hover:text-blue-500 transition-colors"
                title={`Last synced: ${lastSynced.toLocaleTimeString()}`}
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>Synced {Math.floor((new Date().getTime() - lastSynced.getTime()) / 60000)}m ago</span>
              </div>
            </div>

            <button
              onClick={() => {
                setOpenedMailTabs([]);
                setActiveTabId(null);
                setSelectedEmail(null);
              }}
              className="text-[10px] font-bold text-gray-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 uppercase tracking-widest flex items-center gap-1 flex-shrink-0 transition-colors px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <Trash2 className="w-3 h-3" />
              <span>Close All</span>
            </button>
          </div>
        )}

        {/* Email Content */}
        <div className="flex-1 flex overflow-hidden flex-col lg:flex-row">
          {selectedFolder?.id === 'transfers' ? (
            <div className="flex-1 overflow-hidden">
              <TransfersView
                onOpenEmail={async (id) => {
                  let email = emails.find(e => String(e.id) === id);
                  if (!email) {
                    const res = await emailService.getEmailById(id);
                    if (res.data) email = res.data;
                  }
                  if (email) handleOpenMailInTab(email);
                }}
                emails={emails}
              />
            </div>
          ) : (
            <>
              {/* Email List - Mobile: Full width when no email selected, Desktop: Fixed width */}
              <div className={`${activeTabId ? 'hidden lg:block' : 'block'} w-full lg:w-96 flex-shrink-0`}>
                <EmailList
                  emails={filteredEmails}
                  selectedEmail={selectedEmail}
                  onSelectEmail={(email: any) => {
                    const draftsFolderId = getFolderIdByName('drafts') || getFolderIdByName('draft');
                    if (email.is_draft || String(email.folder_id) === String(draftsFolderId)) {
                      handleOpenComposeWindow(email);
                    } else {
                      handleOpenMailInTab(email);
                    }
                  }}
                  onRefresh={refreshEmails}
                  isTrash={selectedFolder?.id === 'trash' || selectedFolder?.system_box === 'trash'}
                  folderType={selectedFolder?.system_box || selectedFolder?.name?.toLowerCase()}
                />
              </div>

              {/* Email Detail View */}
              <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-slate-900">
                {activeTabId ? (
                  <div className="flex-1 flex flex-col min-h-0">
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
                      <div className="w-24 h-24 bg-gray-200 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                        <Mail className="w-12 h-12" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">Select a message to view</h3>
                      <p className="text-gray-500 max-w-sm mt-2">
                        Choose an email from the list on the left to read its content.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Compose Windows */}
      {composeWindows.map((win) => (
        <ComposeEmail
          key={win.id}
          onClose={() => handleCloseComposeWindow(win.id)}
          onSent={() => { handleCloseComposeWindow(win.id); refreshEmails(); }}
          onDraftSaved={refreshEmails}
          prefilledData={win.data}
        />
      ))}

      {/* Activity Log Modal */}
      <ActivityLogModal
        isOpen={showActivityLog}
        onClose={() => setShowActivityLog(false)}
      />

      {/* Privacy Policy Modal */}
      <PrivacyPolicyModal
        isOpen={showPrivacyPolicy}
        onClose={() => setShowPrivacyPolicy(false)}
      />

      {/* Terms of Service Modal */}
      <TermsOfServiceModal
        isOpen={showTermsOfService}
        onClose={() => setShowTermsOfService(false)}
      />
    </div>
  );
}
