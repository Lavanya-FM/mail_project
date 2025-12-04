/**
 * Superadmin Service
 * Backend implementation required for data fetching.
 */

export interface User {
    id: number;
    name: string;
    email: string;
    role: string;
    carbon_credits: number;
    storage_used: number;
    created_at: string;
}

export interface P2PTransfer {
    id: number;
    sender_name: string;
    recipient_name: string;
    file_size: number;
    carbon_saved: number;
    status: 'pass' | 'fail';
    created_at: string;
}

export interface UserAnalytics {
    user: User;
    emails_sent: number;
    emails_received: number;
    inbox_storage: number;
    p2p_transfers: number;
}

// Mock users data (empty for now, should be replaced with API calls)
const MOCK_USERS: User[] = [];

// Mock P2P transfers (empty for now)
const MOCK_P2P_TRANSFERS: P2PTransfer[] = [];

/**
 * Superadmin login (real)
 */
export async function superadminLogin(email: string, password: string) {
    const { authService } = await import('./authService');
    const result = await authService.login(email, password);

    if (result.success && result.user) {
        // In a real app, we would check result.user.role === 'superadmin'
        // For now, we enforce the email check here or assume the backend handles it.
        // If the user managed to log in with this email, we treat them as superadmin.
        if (email === 'superadmin@jeemail.com') {
            const superadmin = {
                ...result.user,
                role: 'superadmin'
            };
            localStorage.setItem('superadmin', JSON.stringify(superadmin));
            return { success: true, user: superadmin };
        }
        return { success: false, error: 'Not authorized as superadmin' };
    }

    return result;
}

/**
 * Check if superadmin is logged in
 */
export function isSuperadminAuthenticated(): boolean {
    try {
        const superadmin = localStorage.getItem('superadmin');
        return !!superadmin;
    } catch {
        return false;
    }
}

/**
 * Get current superadmin
 */
export function getCurrentSuperadmin() {
    try {
        const superadmin = localStorage.getItem('superadmin');
        return superadmin ? JSON.parse(superadmin) : null;
    } catch {
        return null;
    }
}

/**
 * Logout superadmin
 */
export function superadminLogout() {
    localStorage.removeItem('superadmin');
}

/**
 * Get all users
 */
export async function getAllUsers(): Promise<User[]> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return [...MOCK_USERS];
}

/**
 * Get new users (last 30 days)
 */
export async function getNewUsers(): Promise<User[]> {
    await new Promise(resolve => setTimeout(resolve, 300));

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return MOCK_USERS.filter(user => new Date(user.created_at) >= thirtyDaysAgo);
}

/**
 * Get users with high carbon credits
 */
export async function getHighCarbonUsers(minCredits: number = 30): Promise<User[]> {
    await new Promise(resolve => setTimeout(resolve, 300));

    return MOCK_USERS
        .filter(user => user.carbon_credits >= minCredits)
        .sort((a, b) => b.carbon_credits - a.carbon_credits);
}

/**
 * Get storage usage by all users
 */
export async function getStorageUsage(): Promise<User[]> {
    await new Promise(resolve => setTimeout(resolve, 300));

    return MOCK_USERS.sort((a, b) => b.storage_used - a.storage_used);
}

/**
 * Get all P2P transfers
 */
export async function getP2PTransfers(): Promise<P2PTransfer[]> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return [...MOCK_P2P_TRANSFERS];
}

/**
 * Get user analytics
 */
export async function getUserAnalytics(userId: number): Promise<UserAnalytics | null> {
    await new Promise(resolve => setTimeout(resolve, 300));

    const user = MOCK_USERS.find(u => u.id === userId);
    if (!user) return null;

    // Generate random analytics
    return {
        user,
        emails_sent: Math.floor(Math.random() * 500) + 50,
        emails_received: Math.floor(Math.random() * 800) + 100,
        inbox_storage: Math.floor(user.storage_used * 0.6),
        p2p_transfers: MOCK_P2P_TRANSFERS.filter(
            t => t.sender_name === user.name || t.recipient_name === user.name
        ).length
    };
}

/**
 * Get dashboard statistics
 */
export async function getDashboardStats() {
    await new Promise(resolve => setTimeout(resolve, 300));

    const totalUsers = MOCK_USERS.length;
    const newUsers = MOCK_USERS.filter(user => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return new Date(user.created_at) >= thirtyDaysAgo;
    }).length;

    const totalCarbonCredits = MOCK_USERS.reduce((sum, user) => sum + user.carbon_credits, 0);
    const totalStorage = MOCK_USERS.reduce((sum, user) => sum + user.storage_used, 0);
    const successfulP2P = MOCK_P2P_TRANSFERS.filter(t => t.status === 'pass').length;
    const failedP2P = MOCK_P2P_TRANSFERS.filter(t => t.status === 'fail').length;

    return {
        totalUsers,
        newUsers,
        totalCarbonCredits: totalCarbonCredits.toFixed(2),
        totalStorage,
        totalP2PTransfers: MOCK_P2P_TRANSFERS.length,
        successfulP2P,
        failedP2P
    };
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export default {
    superadminLogin,
    isSuperadminAuthenticated,
    getCurrentSuperadmin,
    superadminLogout,
    getAllUsers,
    getNewUsers,
    getHighCarbonUsers,
    getStorageUsage,
    getP2PTransfers,
    getUserAnalytics,
    getDashboardStats,
    formatBytes
};
