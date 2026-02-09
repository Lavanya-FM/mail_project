/**
 * SharePermissionsModal Component
 * 
 * Modal for managing file and folder permissions in JeeDrive
 */

import { useState, useEffect } from 'react';
import { X, Users, Eye, Edit, Download, Trash2, Plus, Shield } from 'lucide-react';
import { authService } from '../lib/authService';

interface Permission {
    id: number;
    user_id: number;
    user_email: string;
    permission: 'VIEW' | 'EDIT' | 'DOWNLOAD';
    granted_by_email: string;
    created_at: string;
}

interface SharePermissionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    resourceType: 'FILE' | 'FOLDER';
    resourceId: number;
    resourceName: string;
    isOwner: boolean;
}

export default function SharePermissionsModal({
    isOpen,
    onClose,
    resourceType,
    resourceId,
    resourceName,
    isOwner
}: SharePermissionsModalProps) {
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [loading, setLoading] = useState(true);
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newPermission, setNewPermission] = useState<'VIEW' | 'EDIT' | 'DOWNLOAD'>('VIEW');
    const [granting, setGranting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            loadPermissions();
        }
    }, [isOpen, resourceId]);

    const loadPermissions = async () => {
        setLoading(true);
        setError('');
        try {
            const user = authService.getCurrentUser();
            const res = await authService.fetchWithAuth(
                `/api/permissions/resource?type=${resourceType}&id=${resourceId}&user_id=${user?.id}`
            );
            const data = await res.json();

            if (data.success) {
                setPermissions(data.permissions || []);
            } else {
                setError(data.error || 'Failed to load permissions');
            }
        } catch (err) {
            console.error('Error loading permissions:', err);
            setError('Failed to load permissions');
        } finally {
            setLoading(false);
        }
    };

    const handleGrantPermission = async () => {
        if (!newUserEmail.trim()) {
            setError('Please enter an email address');
            return;
        }

        setGranting(true);
        setError('');

        try {
            const user = authService.getCurrentUser();
            const res = await authService.fetchWithAuth('/api/permissions/grant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    resource_type: resourceType,
                    resource_id: resourceId,
                    user_email: newUserEmail.trim(),
                    permission: newPermission,
                    granted_by: user?.id
                })
            });

            const data = await res.json();

            if (data.success) {
                setNewUserEmail('');
                setNewPermission('VIEW');
                await loadPermissions();
            } else {
                setError(data.error || 'Failed to grant permission');
            }
        } catch (err) {
            console.error('Error granting permission:', err);
            setError('Failed to grant permission');
        } finally {
            setGranting(false);
        }
    };

    const handleRevokePermission = async (permissionId: number, userId: number, permission: string) => {
        if (!confirm('Are you sure you want to revoke this permission?')) return;

        try {
            const user = authService.getCurrentUser();
            const res = await authService.fetchWithAuth('/api/permissions/revoke', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    resource_type: resourceType,
                    resource_id: resourceId,
                    user_id: userId,
                    permission: permission,
                    revoked_by: user?.id
                })
            });

            const data = await res.json();

            if (data.success) {
                await loadPermissions();
            } else {
                setError(data.error || 'Failed to revoke permission');
            }
        } catch (err) {
            console.error('Error revoking permission:', err);
            setError('Failed to revoke permission');
        }
    };

    const getPermissionIcon = (permission: string) => {
        switch (permission) {
            case 'VIEW': return <Eye className="w-4 h-4" />;
            case 'EDIT': return <Edit className="w-4 h-4" />;
            case 'DOWNLOAD': return <Download className="w-4 h-4" />;
            default: return <Shield className="w-4 h-4" />;
        }
    };

    const getPermissionColor = (permission: string) => {
        switch (permission) {
            case 'VIEW': return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20';
            case 'EDIT': return 'text-green-600 bg-green-50 dark:bg-green-900/20';
            case 'DOWNLOAD': return 'text-purple-600 bg-purple-50 dark:bg-purple-900/20';
            default: return 'text-gray-600 bg-gray-50 dark:bg-gray-900/20';
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                Share & Permissions
                            </h2>
                            <p className="text-sm text-gray-500 dark:text-slate-400 truncate max-w-md">
                                {resourceName}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Grant New Permission */}
                    {isOwner && (
                        <div className="mb-6 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                                Grant Access
                            </h3>
                            <div className="flex gap-2">
                                <input
                                    type="email"
                                    value={newUserEmail}
                                    onChange={(e) => setNewUserEmail(e.target.value)}
                                    placeholder="Enter email address"
                                    className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <select
                                    value={newPermission}
                                    onChange={(e) => setNewPermission(e.target.value as any)}
                                    className="px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="VIEW">View</option>
                                    <option value="DOWNLOAD">Download</option>
                                    <option value="EDIT">Edit</option>
                                </select>
                                <button
                                    onClick={handleGrantPermission}
                                    disabled={granting}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
                                >
                                    <Plus className="w-4 h-4" />
                                    {granting ? 'Adding...' : 'Add'}
                                </button>
                            </div>
                            {error && (
                                <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
                            )}
                        </div>
                    )}

                    {/* Permission Legend */}
                    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
                        <p className="text-xs font-medium text-blue-900 dark:text-blue-300 mb-2">Permission Types:</p>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                            <div className="flex items-center gap-1 text-blue-700 dark:text-blue-400">
                                <Eye className="w-3 h-3" />
                                <span>VIEW - Can view only</span>
                            </div>
                            <div className="flex items-center gap-1 text-purple-700 dark:text-purple-400">
                                <Download className="w-3 h-3" />
                                <span>DOWNLOAD - Can download</span>
                            </div>
                            <div className="flex items-center gap-1 text-green-700 dark:text-green-400">
                                <Edit className="w-3 h-3" />
                                <span>EDIT - Full access</span>
                            </div>
                        </div>
                    </div>

                    {/* Permissions List */}
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 dark:border-t-blue-400"></div>
                        </div>
                    ) : permissions.length === 0 ? (
                        <div className="text-center py-12">
                            <Users className="w-12 h-12 text-gray-300 dark:text-slate-700 mx-auto mb-3" />
                            <p className="text-gray-500 dark:text-slate-400">
                                No permissions granted yet
                            </p>
                            {isOwner && (
                                <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">
                                    Add users above to share this {resourceType.toLowerCase()}
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {permissions.map((perm) => (
                                <div
                                    key={perm.id}
                                    className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 hover:shadow-sm transition"
                                >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                                            {perm.user_email.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-gray-900 dark:text-white truncate">
                                                {perm.user_email}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-slate-400">
                                                Granted by {perm.granted_by_email} • {new Date(perm.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${getPermissionColor(perm.permission)}`}>
                                            {getPermissionIcon(perm.permission)}
                                            {perm.permission}
                                        </span>
                                        {isOwner && (
                                            <button
                                                onClick={() => handleRevokePermission(perm.id, perm.user_id, perm.permission)}
                                                className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                                                title="Revoke permission"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-800 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition font-medium"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
