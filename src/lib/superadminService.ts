/**
 * Superadmin Service with Mock Data
 * No database calls - all data is dummy/mock for UI demonstration
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

// Mock superadmin credentials
const SUPERADMIN_EMAIL = 'superadmin@jeemail.com';
const SUPERADMIN_PASSWORD = 'admin123';

// Mock users data
const MOCK_USERS: User[] = [
    {
        id: 1,
        name: 'Alice Johnson',
        email: 'alice@example.com',
        role: 'user',
        carbon_credits: 45.5,
        storage_used: 2500000000, // 2.5 GB
        created_at: '2025-11-25T10:30:00Z'
    },
    {
        id: 2,
        name: 'Bob Smith',
        email: 'bob@example.com',
        role: 'user',
        carbon_credits: 32.8,
        storage_used: 1800000000, // 1.8 GB
        created_at: '2025-11-28T14:20:00Z'
    },
    {
        id: 3,
        name: 'Carol Williams',
        email: 'carol@example.com',
        role: 'user',
        carbon_credits: 78.2,
        storage_used: 3200000000, // 3.2 GB
        created_at: '2025-11-20T09:15:00Z'
    },
    {
        id: 4,
        name: 'David Brown',
        email: 'david@example.com',
        role: 'user',
        carbon_credits: 15.4,
        storage_used: 950000000, // 950 MB
        created_at: '2025-11-29T16:45:00Z'
    },
    {
        id: 5,
        name: 'Emma Davis',
        email: 'emma@example.com',
        role: 'user',
        carbon_credits: 92.1,
        storage_used: 4100000000, // 4.1 GB
        created_at: '2025-11-15T11:00:00Z'
    },
    {
        id: 6,
        name: 'Frank Miller',
        email: 'frank@example.com',
        role: 'user',
        carbon_credits: 23.7,
        storage_used: 1200000000, // 1.2 GB
        created_at: '2025-11-30T08:30:00Z'
    },
    {
        id: 7,
        name: 'Grace Lee',
        email: 'grace@example.com',
        role: 'user',
        carbon_credits: 56.9,
        storage_used: 2800000000, // 2.8 GB
        created_at: '2025-11-22T13:20:00Z'
    },
    {
        id: 8,
        name: 'Henry Wilson',
        email: 'henry@example.com',
        role: 'user',
        carbon_credits: 41.3,
        storage_used: 2100000000, // 2.1 GB
        created_at: '2025-11-27T15:10:00Z'
    }
];

// Mock P2P transfers
const MOCK_P2P_TRANSFERS: P2PTransfer[] = [
    {
        id: 1,
        sender_name: 'Alice Johnson',
        recipient_name: 'Bob Smith',
        file_size: 50000000, // 50 MB
        carbon_saved: 0.5,
        status: 'pass',
        created_at: '2025-11-30T10:00:00Z'
    },
    {
        id: 2,
        sender_name: 'Carol Williams',
        recipient_name: 'David Brown',
        file_size: 120000000, // 120 MB
        carbon_saved: 1.2,
        status: 'pass',
        created_at: '2025-11-29T14:30:00Z'
    },
    {
        id: 3,
        sender_name: 'Emma Davis',
        recipient_name: 'Frank Miller',
        file_size: 80000000, // 80 MB
        carbon_saved: 0.8,
        status: 'fail',
        created_at: '2025-11-28T09:15:00Z'
    },
    {
        id: 4,
        sender_name: 'Grace Lee',
        recipient_name: 'Henry Wilson',
        file_size: 200000000, // 200 MB
        carbon_saved: 2.0,
        status: 'pass',
        created_at: '2025-11-27T16:45:00Z'
    },
    {
        id: 5,
        sender_name: 'Bob Smith',
        recipient_name: 'Alice Johnson',
        file_size: 35000000, // 35 MB
        carbon_saved: 0.35,
        status: 'pass',
        created_at: '2025-11-26T11:20:00Z'
    }
];

/**
 * Superadmin login (mock)
 */
export async function superadminLogin(email: string, password: string) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    if (email === SUPERADMIN_EMAIL && password === SUPERADMIN_PASSWORD) {
        const superadmin = {
            id: 999,
            name: 'Super Admin',
            email: SUPERADMIN_EMAIL,
            role: 'superadmin'
        };

        // Store in localStorage
        localStorage.setItem('superadmin', JSON.stringify(superadmin));

        return { success: true, user: superadmin };
    }

    return { success: false, error: 'Invalid credentials' };
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
