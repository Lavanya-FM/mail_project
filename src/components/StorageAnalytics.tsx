import { useState, useEffect } from 'react';
import { X, HardDrive, TrendingUp, Leaf, Sparkles, FileText, Image, Video, Music, Archive, Trash2, Download } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import storageService from '../lib/storageService';
import { authService } from '../lib/authService';

interface StorageAnalyticsProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function StorageAnalytics({ isOpen, onClose }: StorageAnalyticsProps) {
    const { theme } = useTheme();
    const user = authService.getCurrentUser();
    const [loading, setLoading] = useState(true);
    const [quota, setQuota] = useState<any>(null);
    const [breakdown, setBreakdown] = useState<any>(null);
    const [trends, setTrends] = useState<any[]>([]);
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [carbonFootprint, setCarbonFootprint] = useState(0);

    useEffect(() => {
        if (isOpen && user) {
            loadAnalytics();
        }
    }, [isOpen, user]);

    const loadAnalytics = async () => {
        if (!user) return;

        setLoading(true);
        try {
            const [quotaData, breakdownData, trendsData, suggestionsData] = await Promise.all([
                storageService.getUserQuota(user.id),
                storageService.getStorageBreakdown(user.id),
                storageService.getStorageTrends(user.id, 7),
                storageService.getOptimizationSuggestions(user.id)
            ]);

            setQuota(quotaData);
            setBreakdown(breakdownData);
            setTrends(Array.isArray(trendsData) ? trendsData : []);
            setSuggestions(Array.isArray(suggestionsData) ? suggestionsData : []);
            setCarbonFootprint(storageService.calculateCarbonFootprint(quotaData.used_bytes));
        } catch (error) {
            console.error('Error loading analytics:', error);
            // Set defaults on error
            setTrends([]);
            setSuggestions([]);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;
    if (!user) return null;

    const typeIcons: Record<string, any> = {
        'Images': Image,
        'Videos': Video,
        'Documents': FileText,
        'Audio': Music,
        'Archives': Archive,
        'Others': HardDrive
    };

    const usagePercent = quota ? (quota.used_bytes / quota.total_bytes) * 100 : 0;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
            <div
                className={`w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'}`}
            >
                {/* Header */}
                <div className="relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-10"></div>
                    <div className="relative flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl">
                                <Sparkles className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Storage Analytics</h2>
                                <p className="text-sm text-gray-600 dark:text-slate-400">Detailed insights into your storage usage</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition"
                        >
                            <X className="w-6 h-6 text-gray-600 dark:text-slate-400" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 dark:border-t-blue-400"></div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Overview Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Storage Usage Card */}
                                <div className="p-6 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-xl border-2 border-blue-200 dark:border-blue-800">
                                    <div className="flex items-center justify-between mb-4">
                                        <HardDrive className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                                        <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                            {usagePercent.toFixed(1)}%
                                        </span>
                                    </div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Storage Used</h3>
                                    <p className="text-sm text-gray-600 dark:text-slate-400">
                                        {storageService.formatBytes(quota?.used_bytes || 0)} of {storageService.formatBytes(quota?.total_bytes || 0)}
                                    </p>
                                    <div className="mt-4 w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                                        <div
                                            className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-500"
                                            style={{ width: `${Math.min(usagePercent, 100)}%` }}
                                        ></div>
                                    </div>
                                </div>

                                {/* Carbon Footprint Card */}
                                <div className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl border-2 border-green-200 dark:border-green-800">
                                    <div className="flex items-center justify-between mb-4">
                                        <Leaf className="w-8 h-8 text-green-600 dark:text-green-400" />
                                        <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                                            {carbonFootprint.toFixed(2)}g
                                        </span>
                                    </div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">CO₂ Impact</h3>
                                    <p className="text-sm text-gray-600 dark:text-slate-400">
                                        Carbon footprint of your storage
                                    </p>
                                    <p className="text-xs text-green-700 dark:text-green-300 mt-2">
                                        🌱 Equivalent to {(carbonFootprint / 1000).toFixed(3)}kg CO₂
                                    </p>
                                </div>

                                {/* Optimization Card */}
                                <div className="p-6 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl border-2 border-purple-200 dark:border-purple-800">
                                    <div className="flex items-center justify-between mb-4">
                                        <TrendingUp className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                                        <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                                            {suggestions.length}
                                        </span>
                                    </div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Suggestions</h3>
                                    <p className="text-sm text-gray-600 dark:text-slate-400">
                                        Ways to optimize your storage
                                    </p>
                                    <p className="text-xs text-purple-700 dark:text-purple-300 mt-2">
                                        💡 Save up to {storageService.formatBytes(suggestions.reduce((sum, s) => sum + s.potential_savings, 0))}
                                    </p>
                                </div>
                            </div>

                            {/* File Type Distribution - Donut Chart Simulation */}
                            <div className="p-6 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                    Storage by File Type
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Visual representation */}
                                    <div className="flex items-center justify-center">
                                        <div className="relative w-48 h-48">
                                            {breakdown?.by_type.map((type: any, index: number) => {
                                                const startAngle = breakdown.by_type.slice(0, index).reduce((sum: number, t: any) => sum + (t.percentage * 3.6), 0);
                                                const endAngle = startAngle + (type.percentage * 3.6);

                                                return (
                                                    <div
                                                        key={index}
                                                        className="absolute inset-0 rounded-full"
                                                        style={{
                                                            background: `conic-gradient(from ${startAngle}deg, ${type.color} 0deg, ${type.color} ${type.percentage * 3.6}deg, transparent ${type.percentage * 3.6}deg)`,
                                                            clipPath: index === 0 ? 'none' : undefined
                                                        }}
                                                    ></div>
                                                );
                                            })}
                                            <div className="absolute inset-8 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center">
                                                <div className="text-center">
                                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{usagePercent.toFixed(0)}%</p>
                                                    <p className="text-xs text-gray-600 dark:text-slate-400">Used</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Legend */}
                                    <div className="space-y-3">
                                        {breakdown?.by_type.map((type: any, index: number) => {
                                            const Icon = typeIcons[type.type] || HardDrive;
                                            return (
                                                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 rounded-lg" style={{ backgroundColor: type.color + '20' }}>
                                                            <Icon className="w-4 h-4" style={{ color: type.color }} />
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-gray-900 dark:text-white">{type.type}</p>
                                                            <p className="text-xs text-gray-600 dark:text-slate-400">{type.file_count} files</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-semibold text-gray-900 dark:text-white">
                                                            {storageService.formatBytes(type.size_bytes)}
                                                        </p>
                                                        <p className="text-xs text-gray-600 dark:text-slate-400">{type.percentage.toFixed(1)}%</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Storage Growth Timeline */}
                            <div className="p-6 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                    Storage Growth (Last 7 Days)
                                </h3>
                                <div className="space-y-2">
                                    {trends && trends.length > 0 ? trends.map((point: any, index: number) => {
                                        const maxSize = Math.max(...trends.map((t: any) => t.size_bytes));
                                        const barWidth = (point.size_bytes / maxSize) * 100;

                                        return (
                                            <div key={index} className="flex items-center gap-3">
                                                <span className="text-sm text-gray-600 dark:text-slate-400 w-24">
                                                    {new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                </span>
                                                <div className="flex-1 bg-gray-200 dark:bg-slate-700 rounded-full h-8 relative overflow-hidden">
                                                    <div
                                                        className="h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500 flex items-center justify-end pr-3"
                                                        style={{ width: `${barWidth}%` }}
                                                    >
                                                        <span className="text-xs font-medium text-white">
                                                            {storageService.formatBytes(point.size_bytes)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }) : (
                                        <p className="text-sm text-gray-500 dark:text-slate-400 text-center py-4">
                                            No storage trend data available
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Optimization Suggestions */}
                            <div className="p-6 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-xl border-2 border-orange-200 dark:border-orange-800">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                    <Sparkles className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                                    Smart Optimization Suggestions
                                </h3>
                                <div className="space-y-3">
                                    {suggestions && suggestions.length > 0 ? suggestions.map((suggestion: any, index: number) => (
                                        <div key={index} className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-orange-200 dark:border-orange-700">
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex-1">
                                                    <h4 className="font-semibold text-gray-900 dark:text-white mb-1">{suggestion.title}</h4>
                                                    <p className="text-sm text-gray-600 dark:text-slate-400">{suggestion.description}</p>
                                                </div>
                                                <span className="text-sm font-medium text-green-600 dark:text-green-400 ml-4">
                                                    Save {storageService.formatBytes(suggestion.potential_savings)}
                                                </span>
                                            </div>
                                            <button className="mt-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition text-sm font-medium">
                                                {suggestion.action}
                                            </button>
                                        </div>
                                    )) : (
                                        <p className="text-sm text-gray-500 dark:text-slate-400 text-center py-4">
                                            No optimization suggestions available
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Eco Tips */}
                            <div className="p-6 bg-gradient-to-br from-green-50 to-teal-50 dark:from-green-900/20 dark:to-teal-900/20 rounded-xl border-2 border-green-200 dark:border-green-800">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                    <Leaf className="w-5 h-5 text-green-600 dark:text-green-400" />
                                    Eco-Friendly Storage Tips
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                                            <Trash2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-white">Delete Unused Files</p>
                                            <p className="text-sm text-gray-600 dark:text-slate-400">Reduce your carbon footprint by removing old files</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                                            <Download className="w-5 h-5 text-green-600 dark:text-green-400" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-white">Compress Large Files</p>
                                            <p className="text-sm text-gray-600 dark:text-slate-400">Save space and energy with compression</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
