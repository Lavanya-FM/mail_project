import { useState, useEffect } from 'react';
import {
    Users,
    TrendingUp,
    HardDrive,
    Leaf,
    ArrowUpRight,
    CheckCircle,
    XCircle,
    LogOut,
    Search,
    Calendar,
    Mail,
    Database,
    Sparkles,
    Award,
    Activity,
    Zap,
    BarChart3
} from 'lucide-react';
import superadminService, { User, P2PTransfer, UserAnalytics } from '../lib/superadminService';
import { useTheme } from '../contexts/ThemeContext';

export default function SuperAdminDashboard() {
    const { theme } = useTheme();
    const [stats, setStats] = useState<any>(null);
    const [newUsers, setNewUsers] = useState<User[]>([]);
    const [highCarbonUsers, setHighCarbonUsers] = useState<User[]>([]);
    const [storageUsers, setStorageUsers] = useState<User[]>([]);
    const [p2pTransfers, setP2PTransfers] = useState<P2PTransfer[]>([]);
    const [selectedUser, setSelectedUser] = useState<UserAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        setLoading(true);
        try {
            const [statsData, newUsersData, highCarbonData, storageData, p2pData] = await Promise.all([
                superadminService.getDashboardStats(),
                superadminService.getNewUsers(),
                superadminService.getHighCarbonUsers(30),
                superadminService.getStorageUsage(),
                superadminService.getP2PTransfers()
            ]);

            setStats(statsData);
            setNewUsers(newUsersData);
            setHighCarbonUsers(highCarbonData);
            setStorageUsers(storageData);
            setP2PTransfers(p2pData);
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUserClick = async (userId: number) => {
        const analytics = await superadminService.getUserAnalytics(userId);
        setSelectedUser(analytics);
    };

    const handleLogout = () => {
        superadminService.superadminLogout();
        window.location.reload();
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const filteredNewUsers = newUsers.filter(user =>
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-blue-900 dark:to-purple-900">
                <div className="text-center">
                    <div className="relative">
                        <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 dark:border-t-blue-400 mx-auto"></div>
                        <Sparkles className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-blue-600 dark:text-blue-400 animate-pulse" />
                    </div>
                    <p className="mt-6 text-lg font-medium bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
                        Loading Dashboard...
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-900' : 'bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50'}`}>
            {/* Animated Background Pattern */}
            <div className="fixed inset-0 opacity-30 dark:opacity-10 pointer-events-none">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iIzM3NDBmZiIgc3Ryb2tlLXdpZHRoPSIyIiBvcGFjaXR5PSIuMiIvPjwvZz48L3N2Zz4=')] animate-pulse"></div>
            </div>

            {/* Premium Header with Glassmorphism */}
            <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 dark:bg-gray-900/80 border-b border-gray-200/50 dark:border-gray-700/50 shadow-lg">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl blur-lg opacity-50 animate-pulse"></div>
                                <div className="relative bg-gradient-to-r from-blue-600 to-purple-600 p-3 rounded-2xl shadow-xl">
                                    <Sparkles className="w-6 h-6 text-white" />
                                </div>
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                                    Superadmin Dashboard
                                </h1>
                                <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                                    <Activity className="w-4 h-4" />
                                    JeeMail Analytics & Management
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-xl hover:from-red-600 hover:to-pink-600 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 font-medium"
                        >
                            <LogOut className="w-4 h-4" />
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
                {/* Premium Stats Cards with Gradients */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <PremiumStatCard
                        icon={<Users className="w-7 h-7" />}
                        title="Total Users"
                        value={stats?.totalUsers || 0}
                        change={`+${stats?.newUsers || 0} this month`}
                        changeType="positive"
                        gradient="from-blue-500 to-cyan-500"
                        theme={theme}
                    />
                    <PremiumStatCard
                        icon={<Leaf className="w-7 h-7" />}
                        title="Carbon Credits"
                        value={stats?.totalCarbonCredits || '0.00'}
                        subtitle="Total earned"
                        gradient="from-green-500 to-emerald-500"
                        theme={theme}
                    />
                    <PremiumStatCard
                        icon={<HardDrive className="w-7 h-7" />}
                        title="Total Storage"
                        value={superadminService.formatBytes(stats?.totalStorage || 0)}
                        subtitle="Across all users"
                        gradient="from-purple-500 to-pink-500"
                        theme={theme}
                    />
                    <PremiumStatCard
                        icon={<TrendingUp className="w-7 h-7" />}
                        title="P2P Transfers"
                        value={stats?.totalP2PTransfers || 0}
                        change={`${stats?.successfulP2P || 0} successful`}
                        changeType="positive"
                        gradient="from-orange-500 to-red-500"
                        theme={theme}
                    />
                </div>

                {/* New Users Section with Premium Design */}
                <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 p-6 mb-8 hover:shadow-3xl transition-all duration-300">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl">
                                <Users className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
                                    New Users (Last 30 Days)
                                </h2>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Recent registrations</p>
                            </div>
                        </div>
                        <div className="relative">
                            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} />
                            <input
                                type="text"
                                placeholder="Search users..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className={`pl-11 pr-4 py-3 rounded-xl border-2 ${theme === 'dark'
                                    ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500'
                                    : 'bg-white border-gray-200 text-gray-900 placeholder-gray-500 focus:border-blue-500'
                                    } focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-300 backdrop-blur-sm`}
                            />
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className={`border-b-2 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                                    <th className={`text-left py-4 px-4 font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Name</th>
                                    <th className={`text-left py-4 px-4 font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Email</th>
                                    <th className={`text-left py-4 px-4 font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Joined</th>
                                    <th className={`text-left py-4 px-4 font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Carbon Credits</th>
                                    <th className={`text-left py-4 px-4 font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredNewUsers.map((user) => (
                                    <tr
                                        key={user.id}
                                        className={`border-b ${theme === 'dark' ? 'border-gray-700/50 hover:bg-gray-700/30' : 'border-gray-100 hover:bg-blue-50/50'} transition-all duration-200 group`}
                                    >
                                        <td className={`py-4 px-4 font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold shadow-lg">
                                                    {user.name.charAt(0)}
                                                </div>
                                                {user.name}
                                            </div>
                                        </td>
                                        <td className={`py-4 px-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>{user.email}</td>
                                        <td className={`py-4 px-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                                            <div className="flex items-center gap-2">
                                                <Calendar className="w-4 h-4" />
                                                {formatDate(user.created_at)}
                                            </div>
                                        </td>
                                        <td className="py-4 px-4">
                                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold text-sm shadow-lg">
                                                <Award className="w-4 h-4" />
                                                {user.carbon_credits.toFixed(2)}
                                            </span>
                                        </td>
                                        <td className="py-4 px-4">
                                            <button
                                                onClick={() => handleUserClick(user.id)}
                                                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 font-medium opacity-0 group-hover:opacity-100"
                                            >
                                                View Profile
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    {/* High Carbon Users - Premium Card */}
                    <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-3xl transition-all duration-300">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl">
                                <Award className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 dark:from-green-400 dark:to-emerald-400 bg-clip-text text-transparent">
                                    Top Carbon Credit Users
                                </h2>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Environmental champions</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            {highCarbonUsers.slice(0, 5).map((user, index) => (
                                <div
                                    key={user.id}
                                    onClick={() => handleUserClick(user.id)}
                                    className={`flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all duration-300 ${theme === 'dark' ? 'bg-gray-700/50 hover:bg-gray-700' : 'bg-gradient-to-r from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100'
                                        } border-2 border-transparent hover:border-green-500 hover:shadow-lg hover:scale-102 group`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg shadow-lg ${index === 0 ? 'bg-gradient-to-r from-yellow-400 to-yellow-600 text-white' :
                                            index === 1 ? 'bg-gradient-to-r from-gray-300 to-gray-500 text-white' :
                                                index === 2 ? 'bg-gradient-to-r from-orange-400 to-orange-600 text-white' :
                                                    'bg-gradient-to-r from-blue-500 to-purple-500 text-white'
                                            }`}>
                                            {index + 1}
                                        </div>
                                        <div>
                                            <p className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{user.name}</p>
                                            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>{user.email}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 dark:from-green-400 dark:to-emerald-400 bg-clip-text text-transparent">
                                            {user.carbon_credits.toFixed(2)}
                                        </p>
                                        <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} flex items-center gap-1 justify-end`}>
                                            <Zap className="w-3 h-3" />
                                            credits
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Storage Usage - Premium Card */}
                    <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-3xl transition-all duration-300">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl">
                                <HardDrive className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
                                    Storage Usage by User
                                </h2>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Top storage consumers</p>
                            </div>
                        </div>
                        <div className="space-y-4">
                            {storageUsers.slice(0, 5).map((user) => {
                                const percentage = (user.storage_used / (5 * 1024 * 1024 * 1024)) * 100;
                                return (
                                    <div
                                        key={user.id}
                                        onClick={() => handleUserClick(user.id)}
                                        className={`p-4 rounded-xl cursor-pointer transition-all duration-300 ${theme === 'dark' ? 'bg-gray-700/50 hover:bg-gray-700' : 'bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100'
                                            } border-2 border-transparent hover:border-purple-500 hover:shadow-lg group`}
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <p className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{user.name}</p>
                                            <p className={`text-sm font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                                {superadminService.formatBytes(user.storage_used)}
                                            </p>
                                        </div>
                                        <div className="relative">
                                            <div className={`w-full h-3 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-gray-600' : 'bg-gray-200'}`}>
                                                <div
                                                    className={`h-full rounded-full transition-all duration-500 ${percentage > 80 ? 'bg-gradient-to-r from-red-500 to-pink-500' :
                                                        percentage > 60 ? 'bg-gradient-to-r from-yellow-500 to-orange-500' :
                                                            'bg-gradient-to-r from-blue-500 to-purple-500'
                                                        } shadow-lg`}
                                                    style={{ width: `${Math.min(percentage, 100)}%` }}
                                                />
                                            </div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{percentage.toFixed(1)}% of 5GB</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* P2P Transfers - Premium Section */}
                <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-3xl transition-all duration-300">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl">
                            <TrendingUp className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold bg-gradient-to-r from-orange-600 to-red-600 dark:from-orange-400 dark:to-red-400 bg-clip-text text-transparent">
                                Peer-to-Peer Transfers
                            </h2>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Transfer history and status</p>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className={`border-b-2 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                                    <th className={`text-left py-4 px-4 font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Sender</th>
                                    <th className={`text-left py-4 px-4 font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Recipient</th>
                                    <th className={`text-left py-4 px-4 font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>File Size</th>
                                    <th className={`text-left py-4 px-4 font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Carbon Saved</th>
                                    <th className={`text-left py-4 px-4 font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Status</th>
                                    <th className={`text-left py-4 px-4 font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {p2pTransfers.map((transfer) => (
                                    <tr
                                        key={transfer.id}
                                        className={`border-b ${theme === 'dark' ? 'border-gray-700/50 hover:bg-gray-700/30' : 'border-gray-100 hover:bg-orange-50/50'} transition-all duration-200`}
                                    >
                                        <td className={`py-4 px-4 font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                            {transfer.sender_name}
                                        </td>
                                        <td className={`py-4 px-4 font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                            {transfer.recipient_name}
                                        </td>
                                        <td className={`py-4 px-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                                            {superadminService.formatBytes(transfer.file_size)}
                                        </td>
                                        <td className="py-4 px-4">
                                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold text-sm shadow-lg">
                                                <Leaf className="w-4 h-4" />
                                                {transfer.carbon_saved.toFixed(2)} kg
                                            </span>
                                        </td>
                                        <td className="py-4 px-4">
                                            {transfer.status === 'pass' ? (
                                                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold shadow-lg">
                                                    <CheckCircle className="w-5 h-5" />
                                                    Pass
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-red-500 to-pink-500 text-white font-semibold shadow-lg">
                                                    <XCircle className="w-5 h-5" />
                                                    Fail
                                                </span>
                                            )}
                                        </td>
                                        <td className={`py-4 px-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                                            {formatDate(transfer.created_at)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Premium User Profile Modal */}
            {selectedUser && (
                <PremiumUserProfileModal
                    analytics={selectedUser}
                    onClose={() => setSelectedUser(null)}
                    theme={theme}
                />
            )}
        </div>
    );
}

// Premium Stat Card Component with Gradients
function PremiumStatCard({ icon, title, value, subtitle, change, changeType, gradient, theme }: any) {
    return (
        <div className={`relative overflow-hidden rounded-2xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 hover:shadow-3xl transition-all duration-300 hover:scale-105 group`}>
            {/* Gradient Background */}
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-10 dark:opacity-20 group-hover:opacity-20 dark:group-hover:opacity-30 transition-opacity duration-300`}></div>

            {/* Content */}
            <div className={`relative ${theme === 'dark' ? 'bg-gray-800/80' : 'bg-white/80'} backdrop-blur-xl p-6`}>
                <div className="flex items-center justify-between mb-4">
                    <div className={`p-3 rounded-xl bg-gradient-to-br ${gradient} shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                        <div className="text-white">{icon}</div>
                    </div>
                    <BarChart3 className={`w-8 h-8 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-300'} group-hover:text-blue-500 transition-colors duration-300`} />
                </div>
                <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mb-2`}>
                    {title}
                </h3>
                <p className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-2`}>
                    {value}
                </p>
                {subtitle && (
                    <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>{subtitle}</p>
                )}
                {change && (
                    <div className={`flex items-center gap-1 text-sm font-medium ${changeType === 'positive' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                        }`}>
                        <ArrowUpRight className="w-4 h-4" />
                        {change}
                    </div>
                )}
            </div>
        </div>
    );
}

// Premium User Profile Modal Component
function PremiumUserProfileModal({ analytics, onClose, theme }: { analytics: UserAnalytics; onClose: () => void; theme: string }) {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
            <div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-3xl shadow-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border-2 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} animate-scaleIn`}>
                {/* Header with Gradient */}
                <div className={`sticky top-0 ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} p-6 backdrop-blur-xl z-10`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-2xl shadow-xl">
                                {analytics.user.name.charAt(0)}
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
                                    User Profile
                                </h2>
                                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Detailed analytics</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className={`p-2 rounded-xl ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} transition-colors duration-200`}
                        >
                            <span className="text-2xl">✕</span>
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {/* User Info */}
                    <div className={`p-6 rounded-2xl ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gradient-to-r from-blue-50 to-purple-50'} border-2 ${theme === 'dark' ? 'border-gray-600' : 'border-blue-200'}`}>
                        <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                            <Users className="w-5 h-5" />
                            User Information
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <InfoItem label="Name" value={analytics.user.name} theme={theme} />
                            <InfoItem label="Email" value={analytics.user.email} theme={theme} />
                            <InfoItem label="Joined" value={new Date(analytics.user.created_at).toLocaleDateString()} theme={theme} />
                            <InfoItem label="Role" value={analytics.user.role} theme={theme} />
                        </div>
                    </div>

                    {/* Email Statistics */}
                    <div className={`p-6 rounded-2xl ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gradient-to-r from-green-50 to-emerald-50'} border-2 ${theme === 'dark' ? 'border-gray-600' : 'border-green-200'}`}>
                        <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                            <Mail className="w-5 h-5" />
                            Email Statistics
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <StatItem label="Emails Sent" value={analytics.emails_sent} theme={theme} icon={<ArrowUpRight className="w-4 h-4" />} />
                            <StatItem label="Emails Received" value={analytics.emails_received} theme={theme} icon={<Mail className="w-4 h-4" />} />
                            <StatItem label="P2P Transfers" value={analytics.p2p_transfers} theme={theme} icon={<TrendingUp className="w-4 h-4" />} />
                            <StatItem
                                label="Inbox Storage"
                                value={superadminService.formatBytes(analytics.inbox_storage)}
                                theme={theme}
                                icon={<Database className="w-4 h-4" />}
                            />
                        </div>
                    </div>

                    {/* Carbon & Storage */}
                    <div className={`p-6 rounded-2xl ${theme === 'dark' ? 'bg-gray-700/50' : 'bg-gradient-to-r from-purple-50 to-pink-50'} border-2 ${theme === 'dark' ? 'border-gray-600' : 'border-purple-200'}`}>
                        <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                            <Leaf className="w-5 h-5" />
                            Carbon Credits & Storage
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <StatItem
                                label="Carbon Credits"
                                value={analytics.user.carbon_credits.toFixed(2)}
                                theme={theme}
                                highlight="green"
                                icon={<Award className="w-4 h-4" />}
                            />
                            <StatItem
                                label="Total Storage Used"
                                value={superadminService.formatBytes(analytics.user.storage_used)}
                                theme={theme}
                                icon={<HardDrive className="w-4 h-4" />}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function InfoItem({ label, value, theme }: { label: string; value: string; theme: string }) {
    return (
        <div>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mb-1`}>{label}</p>
            <p className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{value}</p>
        </div>
    );
}

function StatItem({ label, value, theme, highlight, icon }: { label: string; value: string | number; theme: string; highlight?: string; icon?: React.ReactNode }) {
    return (
        <div className={`p-4 rounded-xl ${theme === 'dark' ? 'bg-gray-600/50' : 'bg-white/80'} border-2 ${theme === 'dark' ? 'border-gray-500' : 'border-gray-200'} hover:scale-105 transition-transform duration-200`}>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mb-2 flex items-center gap-2`}>
                {icon}
                {label}
            </p>
            <p className={`text-2xl font-bold ${highlight === 'green'
                ? 'bg-gradient-to-r from-green-600 to-emerald-600 dark:from-green-400 dark:to-emerald-400 bg-clip-text text-transparent'
                : theme === 'dark' ? 'text-white' : 'text-gray-900'
                }`}>
                {value}
            </p>
        </div>
    );
}
