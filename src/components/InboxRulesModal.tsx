import { X, Shield, Plus, Trash2, CheckCircle, AlertCircle, Filter } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useState, useEffect } from 'react';
import { authService } from '../lib/authService';
import toast from 'react-hot-toast';

interface InboxRulesModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface Rule {
    id: number;
    condition_json: any;
    action_json: any;
    created_at: string;
}

export default function InboxRulesModal({ isOpen, onClose }: InboxRulesModalProps) {
    const { theme } = useTheme();
    const user = authService.getCurrentUser();

    const [rules, setRules] = useState<Rule[]>([]);
    const [loading, setLoading] = useState(false);

    // Form State
    const [conditionType, setConditionType] = useState('from_contains');
    const [conditionValue, setConditionValue] = useState('');
    const [actionType, setActionType] = useState('move_to');
    const [actionValue, setActionValue] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen && user) {
            fetchRules();
        }
    }, [isOpen]);

    const fetchRules = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/rules/${user.id}`);
            const data = await res.json();
            if (data.data) {
                setRules(data.data);
            }
        } catch (err) {
            console.error(err);
            toast.error('Failed to load rules');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateRule = async () => {
        if (!user) return;

        // Basic validation
        if (['from_contains', 'subject_contains', 'body_contains'].includes(conditionType) && !conditionValue) {
            toast.error('Please enter a value for the condition');
            return;
        }
        if (actionType === 'move_to' && !actionValue) {
            toast.error('Please enter a folder name');
            return;
        }

        setSubmitting(true);

        const condition: any = {};
        if (conditionType === 'has_attachment') condition.has_attachment = true;
        else if (conditionType === 'is_priority') condition.is_priority = true;
        else condition[conditionType] = conditionValue;

        const action: any = {};
        if (actionType === 'move_to') action.move_to = actionValue;
        else if (actionType === 'mark_important') action.mark_important = true;
        else if (actionType === 'mark_read') action.mark_read = true;
        else if (actionType === 'delete') action.delete = true;

        try {
            const res = await fetch('/api/rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: user.id,
                    condition,
                    action
                })
            });
            const data = await res.json();

            if (data.success) {
                toast.success('Rule created!');
                setConditionValue('');
                setActionValue('');
                fetchRules();
            } else {
                toast.error(data.error || 'Failed to create rule');
            }
        } catch (err) {
            console.error(err);
            toast.error('Error creating rule');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteRule = async (id: number) => {
        if (!confirm('Are you sure you want to delete this rule?')) return;
        try {
            const res = await fetch(`/api/rules/${id}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success('Rule deleted');
                setRules(rules.filter(r => r.id !== id));
            } else {
                toast.error('Failed to delete rule');
            }
        } catch (err) {
            toast.error('Error deleting rule');
        }
    };

    // Helper to render readable rule strings
    const renderRuleText = (rule: Rule) => {
        let condText = '';
        let actText = '';

        try {
            const c = typeof rule.condition_json === 'string' ? JSON.parse(rule.condition_json) : rule.condition_json;
            const a = typeof rule.action_json === 'string' ? JSON.parse(rule.action_json) : rule.action_json;

            if (c.from_contains) condText = `Sender contains "${c.from_contains}"`;
            else if (c.subject_contains) condText = `Subject contains "${c.subject_contains}"`;
            else if (c.body_contains) condText = `Body contains "${c.body_contains}"`;
            else if (c.has_attachment) condText = `Has Attachment`;
            else if (c.is_priority) condText = `Is Priority`;
            else condText = JSON.stringify(c);

            if (a.move_to) actText = `Move to "${a.move_to}"`;
            else if (a.mark_important) actText = `Mark as Important`;
            else if (a.mark_read) actText = `Mark as Read`;
            else if (a.delete) actText = `Delete`;
            else actText = JSON.stringify(a);
        } catch (e) { return { condText: "Invalid Rule Data", actText: "Error" }; }

        return { condText, actText };
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className={`w-full max-w-2xl overflow-hidden rounded-2xl shadow-2xl flex flex-col max-h-[90vh] ${theme === 'dark' ? 'bg-slate-900 border border-slate-700' : 'bg-white'}`}>

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                            <Filter className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Inbox Rules</h2>
                            <p className="text-sm text-gray-500 dark:text-slate-400">Automate your inbox organization</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition">
                        <X className="w-6 h-6 text-gray-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {/* Create Rule Form */}
                    <div className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-5 mb-8 border border-gray-200 dark:border-slate-700">
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-4 flex items-center gap-2">
                            <Plus className="w-4 h-4" /> Create New Rule
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            {/* IF Condition */}
                            <div>
                                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">When...</label>
                                <select
                                    className="w-full p-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm dark:text-white mb-2"
                                    value={conditionType}
                                    onChange={e => setConditionType(e.target.value)}
                                >
                                    <option value="from_contains">Sender contains</option>
                                    <option value="subject_contains">Subject contains</option>
                                    <option value="body_contains">Body contains</option>
                                    <option value="has_attachment">Has Attachment</option>
                                    <option value="is_priority">Is High Priority</option>
                                </select>

                                {['from_contains', 'subject_contains', 'body_contains'].includes(conditionType) && (
                                    <input
                                        type="text"
                                        className="w-full p-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm dark:text-white placeholder-gray-400"
                                        placeholder="Enter text..."
                                        value={conditionValue}
                                        onChange={e => setConditionValue(e.target.value)}
                                    />
                                )}
                            </div>

                            {/* THEN Action */}
                            <div>
                                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">Then...</label>
                                <select
                                    className="w-full p-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm dark:text-white mb-2"
                                    value={actionType}
                                    onChange={e => setActionType(e.target.value)}
                                >
                                    <option value="move_to">Move to Folder</option>
                                    <option value="mark_important">Mark as Important</option>
                                    <option value="mark_read">Mark as Read</option>
                                    <option value="delete">Delete Message</option>
                                </select>

                                {actionType === 'move_to' && (
                                    <input
                                        type="text"
                                        className="w-full p-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm dark:text-white placeholder-gray-400"
                                        placeholder="Folder name (e.g. Finance)"
                                        value={actionValue}
                                        onChange={e => setActionValue(e.target.value)}
                                    />
                                )}
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button
                                onClick={handleCreateRule}
                                disabled={submitting}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                            >
                                {submitting ? 'Saving...' : 'Save Rule'}
                            </button>
                        </div>
                    </div>

                    {/* Existing Rules List */}
                    <div>
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-4">Active Rules</h3>

                        {loading && <div className="text-sm text-center py-4 text-gray-500">Loading rules...</div>}

                        {!loading && rules.length === 0 && (
                            <div className="text-center py-8 bg-gray-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-gray-300 dark:border-slate-700">
                                <Shield className="w-10 h-10 mx-auto text-gray-400 mb-2" />
                                <p className="text-sm text-gray-500">No rules configured yet.</p>
                            </div>
                        )}

                        <div className="space-y-3">
                            {rules.map(rule => {
                                const { condText, actText } = renderRuleText(rule);
                                return (
                                    <div key={rule.id} className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm">
                                        <div className="flex items-center gap-4">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded uppercase">IF</span>
                                                    <span className="text-sm font-medium text-gray-900 dark:text-white">{condText}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-green-600 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded uppercase">THEN</span>
                                                    <span className="text-sm text-gray-600 dark:text-slate-300">{actText}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteRule(rule.id)}
                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                                            title="Delete Rule"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
