// src/components/EmailList.tsx
import { Paperclip, Inbox, Tag, Users, Square, CheckSquare, Star, RotateCw, MoreVertical, Mail, MailOpen, Trash2, Archive, AlertTriangle } from 'lucide-react';
import { Email } from '../types/email';
import { useState, useMemo } from 'react';
import { emailService, getFolderIdByName } from '../lib/emailService';
import { authService } from '../lib/authService';
import { p2pService } from '../lib/p2pService';

type EmailListProps = {
    emails: Email[];
    selectedEmail: Email | null;
    onSelectEmail: (email: Email) => void;
    onRefresh?: () => void;
    isTrash?: boolean;
    folderType?: string;
};

export default function EmailList({
    emails,
    selectedEmail,
    onSelectEmail,
    onRefresh,
    isTrash,
    folderType
}: EmailListProps) {
    const [activeTab, setActiveTab] = useState<'primary' | 'social' | 'promotions'>('primary');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const handleBulkAction = async (action: 'read' | 'unread' | 'star' | 'unstar' | 'delete' | 'archive' | 'spam' | 'inbox') => {
        const user = authService.getCurrentUser();
        if (!user) return;
        setIsMenuOpen(false); // Close menu immediately

        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;

        try {
            const numericIds = ids.map(Number);

            if (action === 'delete') {
                const actionType = isTrash ? 'delete_permanent' : 'delete';

                // STOP P2P Transfers for deleted emails
                const deletedEmails = emails.filter(e => selectedIds.has(String(e.id)));
                deletedEmails.forEach(email => {
                    if (email.attachments && Array.isArray(email.attachments)) {
                        email.attachments.forEach((att: any) => {
                            if (att.p2p_message_id) {
                                console.log(`[P2P] Stopping transfer on deletion: ${att.p2p_message_id}`);
                                p2pService.cleanupTransfer(att.p2p_message_id, true);
                            }
                        });
                    }
                });

                await emailService.performBulkAction(user.id, numericIds, actionType as any);
            } else if (action === 'star' || action === 'unstar') {
                const status = action === 'star';
                await emailService.performBulkAction(user.id, numericIds, 'star', status);
            } else if (action === 'read' || action === 'unread') {
                const isRead = action === 'read';
                await emailService.performBulkAction(user.id, numericIds, 'read', isRead);
            } else if (action === 'archive') {
                const archiveId = getFolderIdByName('archive');
                if (archiveId) {
                    await emailService.performBulkAction(user.id, numericIds, 'move' as any, archiveId as any);
                }
            } else if (action === 'spam') {
                const spamId = getFolderIdByName('spam');
                if (spamId) {
                    await emailService.performBulkAction(user.id, numericIds, 'move' as any, spamId as any);
                }
            } else if (action === 'inbox') {
                const inboxId = getFolderIdByName('inbox');
                if (inboxId) {
                    await emailService.performBulkAction(user.id, numericIds, 'move' as any, inboxId as any);
                }
            }

            // Clear selection and refresh
            setSelectedIds(new Set());
            if (onRefresh) onRefresh();
        } catch (error) {
            console.error(`Failed to perform bulk action ${action}:`, error);
            alert("Some actions failed. Please check console.");
        }
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        if (diffMs < 24 * 60 * 60 * 1000) {
            return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        }
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const stripHtmlTags = (html: string) => {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        return temp.textContent || temp.innerText || "";
    };

    const getSenderName = (name?: string, email?: string) => {
        if (name && !name.includes('@')) return name;
        return (email || "").split('@')[0];
    };

    const toggleSelection = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleStar = async (e: React.MouseEvent, email: Email) => {
        e.stopPropagation();
        const user = authService.getCurrentUser();
        if (!user) return;

        try {
            await emailService.star(Number(email.id), user.id, !email.is_starred);
            if (onRefresh) onRefresh();
        } catch (err) {
            console.error("Failed to toggle star", err);
        }
    };

    const handleSelectAll = () => {
        const allVisibleIds = threadList.map(t => String(t.latestEmail.id));
        const allSelected = allVisibleIds.every(id => selectedIds.has(id));

        if (allSelected) {
            const newSet = new Set(selectedIds);
            allVisibleIds.forEach(id => newSet.delete(id));
            setSelectedIds(newSet);
        } else {
            const newSet = new Set(selectedIds);
            allVisibleIds.forEach(id => newSet.add(id));
            setSelectedIds(newSet);
        }
    };

    const categorizedEmails = useMemo(() => {
        const categories: Record<'primary' | 'social' | 'promotions', Email[]> = {
            primary: [],
            social: [],
            promotions: []
        };

        emails.forEach(email => {
            const textToCheck = (
                (email.from_name || '') + ' ' +
                (email.subject || '') + ' ' +
                (email.labels?.map((l: any) => typeof l === 'string' ? l : l.name).join(' ') || '')
            ).toLowerCase();

            if (textToCheck.match(/social|linkedin|twitter|facebook|instagram|slack|discord|tiktok/)) {
                categories.social.push(email);
            } else if (textToCheck.match(/promotion|newsletter|offer|sale|discount|deal|marketing|update/)) {
                categories.promotions.push(email);
            } else {
                categories.primary.push(email);
            }
        });
        return categories;
    }, [emails]);

    const filteredEmails = categorizedEmails[activeTab];
    const socialUnread = categorizedEmails.social.filter(e => !e.is_read).length;
    const promotionsUnread = categorizedEmails.promotions.filter(e => !e.is_read).length;

    const groupEmailsByThread = (list: Email[]) => {
        const map: Record<string | number, Email[]> = {};
        for (const email of list) {
            const threadId = email.thread_id || email.id;
            if (!map[threadId]) map[threadId] = [];
            map[threadId].push(email);
        }
        return map;
    };

    const threads = groupEmailsByThread(filteredEmails);
    const threadList = Object.values(threads)
        .map((list) => {
            list.sort((a, b) => new Date(b.created_at || "").getTime() - new Date(a.created_at || "").getTime());
            return {
                latestEmail: list[0],
                allEmails: list,
                unreadCount: list.filter(e => !e.is_read).length
            };
        })
        .sort((a, b) => new Date(b.latestEmail.created_at || "").getTime() - new Date(a.latestEmail.created_at || "").getTime());

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-800 h-14 bg-white dark:bg-gray-900 sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleSelectAll}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-500 dark:text-gray-400"
                        title="Select All"
                    >
                        {threadList.length > 0 && threadList.every(t => selectedIds.has(String(t.latestEmail.id))) ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                            <Square className="w-4 h-4" />
                        )}
                    </button>
                    <button
                        onClick={onRefresh}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-500 dark:text-gray-400" title="Refresh">
                        <RotateCw className="w-4 h-4" />
                    </button>
                    <div className="relative">
                        <button
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-500 dark:text-gray-400"
                            title="More actions"
                        >
                            <MoreVertical className="w-4 h-4" />
                        </button>

                        {isMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)}></div>
                                <div className="absolute left-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 py-1">
                                    <button
                                        onClick={() => handleBulkAction('read')}
                                        disabled={selectedIds.size === 0}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <MailOpen className="w-4 h-4" /> Mark as read
                                    </button>
                                    <button
                                        onClick={() => handleBulkAction('unread')}
                                        disabled={selectedIds.size === 0}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <Mail className="w-4 h-4" /> Mark as unread
                                    </button>
                                    <div className="h-px bg-gray-100 dark:bg-gray-700 my-1"></div>
                                    <button
                                        onClick={() => handleBulkAction('archive')}
                                        disabled={selectedIds.size === 0 || folderType === 'archive'}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <Archive className="w-4 h-4" /> Archive
                                    </button>
                                    <button
                                        onClick={() => handleBulkAction(folderType === 'spam' ? 'inbox' : 'spam')}
                                        disabled={selectedIds.size === 0}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <AlertTriangle className="w-4 h-4" /> {folderType === 'spam' ? 'Not spam' : 'Report spam'}
                                    </button>
                                    <div className="h-px bg-gray-100 dark:bg-gray-700 my-1"></div>
                                    <button
                                        onClick={() => handleBulkAction('star')}
                                        disabled={selectedIds.size === 0}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <Star className="w-4 h-4 text-yellow-500" /> Add star
                                    </button>
                                    <button
                                        onClick={() => handleBulkAction('unstar')}
                                        disabled={selectedIds.size === 0}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <Star className="w-4 h-4" /> Remove star
                                    </button>
                                    <div className="h-px bg-gray-100 dark:bg-gray-700 my-1"></div>
                                    {(isTrash || folderType === 'spam' || folderType === 'archive') && (
                                        <button
                                            onClick={() => handleBulkAction('inbox')}
                                            disabled={selectedIds.size === 0}
                                            className="w-full text-left px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2 disabled:opacity-50"
                                        >
                                            <Inbox className="w-4 h-4" /> Move to Inbox
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleBulkAction('delete')}
                                        disabled={selectedIds.size === 0}
                                        className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <Trash2 className="w-4 h-4" /> {isTrash ? 'Delete permanently' : 'Move to Trash'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                    {threadList.length} items
                </div>
            </div>

            <div className="flex items-center border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900">
                <button
                    onClick={() => { setActiveTab("primary"); setSelectedIds(new Set()); }}
                    className={`flex-1 flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-[3px] transition-colors ${activeTab === "primary"
                        ? "border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-emerald-50/10"
                        : "border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                >
                    <Inbox className={`w-4 h-4 ${activeTab === 'primary' ? 'fill-current' : ''}`} />
                    <span>Primary</span>
                </button>

                <button
                    onClick={() => { setActiveTab("social"); setSelectedIds(new Set()); }}
                    className={`flex-1 flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-[3px] transition-colors ${activeTab === "social"
                        ? "border-blue-600 text-blue-700 dark:text-blue-400 bg-blue-50/10"
                        : "border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                >
                    <Users className={`w-4 h-4 ${activeTab === 'social' ? 'fill-current' : ''}`} />
                    <span>Social</span>
                    {socialUnread > 0 && (
                        <span className="ml-auto bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{socialUnread} new</span>
                    )}
                </button>

                <button
                    onClick={() => { setActiveTab("promotions"); setSelectedIds(new Set()); }}
                    className={`flex-1 flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-[3px] transition-colors ${activeTab === "promotions"
                        ? "border-gray-600 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800"
                        : "border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                >
                    <Tag className={`w-4 h-4 ${activeTab === 'promotions' ? 'fill-current' : ''}`} />
                    <span className="hidden sm:inline">Promotions</span>
                    {promotionsUnread > 0 && (
                        <span className="ml-2 bg-gray-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{promotionsUnread} new</span>
                    )}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                {threadList.map(({ latestEmail: email, allEmails, unreadCount }) => {
                    const isSelected = selectedEmail?.id === email.id;
                    const isChecked = selectedIds.has(String(email.id));
                    const isRead = unreadCount === 0;
                    const messageCount = allEmails.length;

                    return (
                        <div
                            key={email.id}
                            onClick={() => onSelectEmail(email)}
                            className={`group flex items-center gap-3 px-3 py-2 border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:shadow-md hover:z-10 relative transition-all ${isSelected ? 'bg-blue-50 dark:bg-blue-900/10' : 'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800'} ${!isRead ? 'font-semibold bg-gray-50/50' : ''}`}
                        >
                            <div onClick={(e) => toggleSelection(e, String(email.id))} className="text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400">
                                {isChecked ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5" />}
                            </div>

                            <button
                                onClick={(e) => toggleStar(e, email)}
                                className="text-gray-300 hover:text-yellow-400 dark:text-gray-600 focus:outline-none transition-colors"
                                title={email.is_starred ? "Unstar" : "Star"}
                            >
                                {email.is_starred ? <Star className="w-5 h-5 text-yellow-400 fill-current" /> : <Star className="w-5 h-5" />}
                            </button>

                            <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 select-none">
                                <span className={`text-sm truncate sm:w-48 flex-shrink-0 ${!isRead ? 'text-gray-900 dark:text-white font-bold' : 'text-gray-700 dark:text-gray-300 font-medium'}`}>
                                    {getSenderName(email.from_name, email.from_email)}
                                    {messageCount > 1 && <span className="ml-1 text-gray-500 font-normal">({messageCount})</span>}
                                </span>

                                <div className="flex-1 min-w-0 flex items-center pr-2">
                                    <span className={`text-sm truncate ${!isRead ? 'text-gray-900 dark:text-white font-semibold' : 'text-gray-600 dark:text-gray-400'}`}>
                                        {email.subject || '(No Subject)'}
                                        <span className="font-normal text-gray-400 dark:text-gray-500 ml-1">
                                            - {stripHtmlTags(email.body || '').slice(0, 50)}
                                        </span>
                                    </span>
                                </div>

                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {(Boolean((email as any).p2p_enabled) || Boolean((email as any).p2p_delivered)) && (
                                        <div className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 text-[10px] rounded font-bold border border-green-200 dark:border-green-800 flex items-center gap-1" title="P2P Transfer">
                                            <span>P2P</span>
                                        </div>
                                    )}
                                    {(email.has_attachments || Number(email.attachment_count) > 0) && (
                                        <Paperclip className="w-3.5 h-3.5 text-gray-400" />
                                    )}
                                </div>

                                <span className={`text-xs ml-2 whitespace-nowrap w-16 text-right ${!isRead ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-500 dark:text-gray-500'}`}>
                                    {formatDate(email.sent_at || email.created_at || '')}
                                </span>
                            </div>
                        </div>
                    );
                })}

                {threadList.length === 0 && (
                    <div className="p-8 text-center text-gray-500">
                        No emails in {activeTab}.
                    </div>
                )}
            </div>

            <div className="p-2 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-[10px] text-center text-gray-500 flex justify-between px-4">
                <span>{threadList.length} conversations</span>
            </div>
        </div>
    );
}
