/**
 * Storage Service - Mock Data Implementation
 * Handles storage analytics, quotas, and optimization suggestions
 * Backend team will replace with actual MariaDB queries
 */

export interface StorageQuota {
    user_id: number;
    quota_bytes: number;
    used_bytes: number;
    bonus_bytes: number;
    available_bytes: number;
    percentage_used: number;
}

export interface StorageBreakdown {
    by_type: {
        type: string;
        size_bytes: number;
        file_count: number;
        percentage: number;
        color: string;
    }[];
    by_folder: {
        folder_id: number | null;
        folder_name: string;
        size_bytes: number;
        file_count: number;
        percentage: number;
    }[];
    timeline: {
        date: string;
        size_bytes: number;
    }[];
}

export interface DuplicateFile {
    files: {
        id: number;
        name: string;
        size_bytes: number;
        folder_id: number | null;
        created_at: string;
    }[];
    total_size: number;
    potential_savings: number;
}

export interface LargeFile {
    id: number;
    name: string;
    size_bytes: number;
    folder_id: number | null;
    file_type: string;
    created_at: string;
}

export interface OptimizationSuggestion {
    type: 'duplicate' | 'large_file' | 'old_file' | 'unused_file';
    title: string;
    description: string;
    potential_savings: number;
    action: string;
    file_ids?: number[];
}

// Mock storage data
const MOCK_QUOTA: StorageQuota = {
    user_id: 1,
    quota_bytes: 5368709120, // 5GB
    used_bytes: 2147483648, // 2GB
    bonus_bytes: 0,
    available_bytes: 3221225472, // 3GB
    percentage_used: 40
};

const MOCK_BREAKDOWN: StorageBreakdown = {
    by_type: [
        {
            type: 'Images',
            size_bytes: 850000000,
            file_count: 42,
            percentage: 39.6,
            color: '#8b5cf6'
        },
        {
            type: 'Videos',
            size_bytes: 450000000,
            file_count: 8,
            percentage: 21.0,
            color: '#ef4444'
        },
        {
            type: 'Documents',
            size_bytes: 650000000,
            file_count: 35,
            percentage: 30.3,
            color: '#3b82f6'
        },
        {
            type: 'Archives',
            size_bytes: 150000000,
            file_count: 5,
            percentage: 7.0,
            color: '#f59e0b'
        },
        {
            type: 'Others',
            size_bytes: 47483648,
            file_count: 12,
            percentage: 2.1,
            color: '#6b7280'
        }
    ],
    by_folder: [
        {
            folder_id: 2,
            folder_name: 'Photos',
            size_bytes: 850000000,
            file_count: 42,
            percentage: 39.6
        },
        {
            folder_id: 1,
            folder_name: 'Documents',
            size_bytes: 450000000,
            file_count: 28,
            percentage: 21.0
        },
        {
            folder_id: 3,
            folder_name: 'Projects',
            size_bytes: 550000000,
            file_count: 35,
            percentage: 25.6
        },
        {
            folder_id: null,
            folder_name: 'Root',
            size_bytes: 297483648,
            file_count: 18,
            percentage: 13.8
        }
    ],
    timeline: [
        { date: '2025-11-01', size_bytes: 500000000 },
        { date: '2025-11-05', size_bytes: 750000000 },
        { date: '2025-11-10', size_bytes: 1100000000 },
        { date: '2025-11-15', size_bytes: 1450000000 },
        { date: '2025-11-20', size_bytes: 1750000000 },
        { date: '2025-11-25', size_bytes: 1950000000 },
        { date: '2025-11-30', size_bytes: 2147483648 }
    ]
};

const MOCK_DUPLICATES: DuplicateFile[] = [
    {
        files: [
            {
                id: 2,
                name: 'Beach_Sunset.jpg',
                size_bytes: 4200000,
                folder_id: 2,
                created_at: '2025-11-28T14:20:00Z'
            },
            {
                id: 10,
                name: 'Beach_Panorama.jpg',
                size_bytes: 6500000,
                folder_id: 5,
                created_at: '2025-11-21T14:45:00Z'
            }
        ],
        total_size: 10700000,
        potential_savings: 4200000
    }
];

const MOCK_LARGE_FILES: LargeFile[] = [
    {
        id: 4,
        name: 'Family_Video.mp4',
        size_bytes: 125000000,
        folder_id: 2,
        file_type: 'video',
        created_at: '2025-11-27T18:30:00Z'
    },
    {
        id: 6,
        name: 'Code_Archive.zip',
        size_bytes: 45000000,
        folder_id: 3,
        file_type: 'archive',
        created_at: '2025-11-24T15:45:00Z'
    },
    {
        id: 3,
        name: 'Presentation_Draft.pptx',
        size_bytes: 8500000,
        folder_id: 3,
        file_type: 'document',
        created_at: '2025-11-29T09:15:00Z'
    }
];

/**
 * Get user storage quota and usage
 */
export async function getUserQuota(userId: number): Promise<StorageQuota> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return { ...MOCK_QUOTA, user_id: userId };
}

/**
 * Get detailed storage breakdown
 */
export async function getStorageBreakdown(userId: number): Promise<StorageBreakdown> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return MOCK_BREAKDOWN;
}

/**
 * Find duplicate files
 */
export async function findDuplicates(userId: number): Promise<DuplicateFile[]> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return MOCK_DUPLICATES;
}

/**
 * Find large files
 */
export async function findLargeFiles(userId: number, minSizeBytes: number = 5000000): Promise<LargeFile[]> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return MOCK_LARGE_FILES.filter(f => f.size_bytes >= minSizeBytes);
}

/**
 * Get storage optimization suggestions
 */
export async function getOptimizationSuggestions(userId: number): Promise<OptimizationSuggestion[]> {
    await new Promise(resolve => setTimeout(resolve, 300));

    const suggestions: OptimizationSuggestion[] = [];

    // Duplicate files suggestion
    if (MOCK_DUPLICATES.length > 0) {
        const totalSavings = MOCK_DUPLICATES.reduce((sum, dup) => sum + dup.potential_savings, 0);
        suggestions.push({
            type: 'duplicate',
            title: 'Remove Duplicate Files',
            description: `Found ${MOCK_DUPLICATES.length} set(s) of duplicate files`,
            potential_savings: totalSavings,
            action: 'Review and delete duplicates',
            file_ids: MOCK_DUPLICATES.flatMap(d => d.files.map(f => f.id))
        });
    }

    // Large files suggestion
    suggestions.push({
        type: 'large_file',
        title: 'Archive Large Files',
        description: `${MOCK_LARGE_FILES.length} files are larger than 5MB`,
        potential_savings: MOCK_LARGE_FILES.reduce((sum, f) => sum + f.size_bytes, 0) * 0.3,
        action: 'Compress or archive large files',
        file_ids: MOCK_LARGE_FILES.map(f => f.id)
    });

    // Old files suggestion
    suggestions.push({
        type: 'old_file',
        title: 'Clean Up Old Files',
        description: 'Files older than 6 months that haven\'t been accessed',
        potential_savings: 85000000,
        action: 'Review and delete old files'
    });

    return suggestions;
}

/**
 * Calculate carbon footprint for storage
 * Based on average data center energy consumption
 */
export function calculateCarbonFootprint(storageBytes: number): number {
    // Average: 0.01 kg CO2 per GB per year
    const storageGB = storageBytes / (1024 * 1024 * 1024);
    const annualCO2 = storageGB * 0.01;
    return Math.round(annualCO2 * 100) / 100;
}

/**
 * Get storage trends and predictions
 */
export async function getStorageTrends(userId: number, days: number = 30): Promise<{
    current_growth_rate: number;
    predicted_full_date: string | null;
    average_daily_usage: number;
}> {
    await new Promise(resolve => setTimeout(resolve, 300));

    const timeline = MOCK_BREAKDOWN.timeline;
    if (timeline.length < 2) {
        return {
            current_growth_rate: 0,
            predicted_full_date: null,
            average_daily_usage: 0
        };
    }

    // Calculate growth rate
    const firstDay = timeline[0];
    const lastDay = timeline[timeline.length - 1];
    const daysDiff = Math.max(1, timeline.length - 1);
    const totalGrowth = lastDay.size_bytes - firstDay.size_bytes;
    const averageDailyUsage = totalGrowth / daysDiff;
    const growthRate = (totalGrowth / firstDay.size_bytes) * 100;

    // Predict when storage will be full
    const remainingSpace = MOCK_QUOTA.quota_bytes - MOCK_QUOTA.used_bytes;
    const daysUntilFull = Math.ceil(remainingSpace / averageDailyUsage);
    const predictedDate = new Date();
    predictedDate.setDate(predictedDate.getDate() + daysUntilFull);

    return {
        current_growth_rate: Math.round(growthRate * 100) / 100,
        predicted_full_date: daysUntilFull > 0 && daysUntilFull < 365 ? predictedDate.toISOString() : null,
        average_daily_usage: Math.round(averageDailyUsage)
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

/**
 * Get storage percentage color
 */
export function getStorageColor(percentage: number): string {
    if (percentage >= 90) return '#ef4444'; // Red
    if (percentage >= 75) return '#f59e0b'; // Orange
    if (percentage >= 50) return '#eab308'; // Yellow
    return '#10b981'; // Green
}

export default {
    getUserQuota,
    getStorageBreakdown,
    findDuplicates,
    findLargeFiles,
    getOptimizationSuggestions,
    calculateCarbonFootprint,
    getStorageTrends,
    formatBytes,
    getStorageColor
};
