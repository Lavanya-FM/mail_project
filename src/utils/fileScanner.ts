
/**
 * src/utils/fileScanner.ts
 * Client-side file scanning logic (Tier-1 and Tier-2 triggers)
 */

import axios from 'axios';

export type ScanStatus = 'pending' | 'scanning' | 'clean' | 'blocked' | 'not_scanned';

export interface ScanResult {
    safe: boolean;
    status: ScanStatus;
    message: string;
    engine?: 'quick' | 'deep';
    timestamp?: number;
}

const MAX_SCAN_SIZE = 25 * 1024 * 1024; // 25MB (Consistent with backend)
const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.sh', '.js', '.vbs', '.scr', '.jar', '.msi'];
const HIGH_RISK_EXTENSIONS = ['.zip', '.exe', '.js', '.doc', '.docx', '.xls', '.xlsx', '.pdf', '.msi'];

// Magic Bytes for instant detection
const MAGIC_BYTES: Record<string, string> = {
    '4d5a': 'exe', // DOS MZ
    'cafebabe': 'class', // Java
    '7f454c46': 'elf', // Linux Executable
    '504b0304': 'zip', // ZIP/Office
    '25504446': 'pdf', // PDF
};

function getMagicBytes(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer).slice(0, 4);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Tier-1 Scan: Instant Synchronous Checks
 */
export async function tier1Scan(file: File | Blob, fileName: string): Promise<{ status: ScanStatus | 'CONTINUE', message: string }> {
    // 1. Size Check
    if (file.size > MAX_SCAN_SIZE) {
        return { status: 'not_scanned', message: 'File too large to scan' };
    }

    // 2. Extension Check
    const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(ext)) {
        return { status: 'blocked', message: 'File type mapped as blocked' };
    }

    // 3. Magic Bytes Check
    try {
        const headerChunk = file.slice(0, 4);
        const buffer = await headerChunk.arrayBuffer();
        const header = getMagicBytes(buffer);

        // Content mismatch check (e.g. EXE renamed to TXT)
        if (MAGIC_BYTES[header] && ext !== '.' + MAGIC_BYTES[header]) {
            if (header === '4d5a') {
                return { status: 'blocked', message: 'File content mismatch (Executable disguised)' };
            }
        }
    } catch (e) {
        console.warn('Magic byte check failed', e);
    }

    return { status: 'CONTINUE', message: '' };
}

/**
 * Tier-2 Scan: Deep Async Scan (Server-side)
 */
export async function runDeepScan(file: File | Blob, fileName: string, source: 'EMAIL' | 'P2P'): Promise<ScanResult> {
    const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
    const isHighRisk = HIGH_RISK_EXTENSIONS.includes(ext);

    if (!isHighRisk) {
        return {
            safe: true,
            status: 'clean',
            message: 'No threats detected',
            engine: 'quick',
            timestamp: Date.now()
        };
    }

    try {
        // Prepare for API call
        const formData = new FormData();
        formData.append('file', file, fileName);
        formData.append('source', source);

        const token = localStorage.getItem('token');
        const res = await axios.post('/api/scan/file', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            timeout: 15000 // 15s timeout
        });

        return {
            safe: res.data.safe,
            status: res.data.scan_status as ScanStatus,
            message: res.data.scan_reason || (res.data.safe ? 'No threats detected' : 'Potential malware detected'),
            engine: (res.data.scan_engine as any) || 'deep',
            timestamp: res.data.scan_timestamp || Date.now()
        };

    } catch (e: any) {
        console.error('Deep scan failed:', e);
        const isTimeout = e.code === 'ECONNABORTED' || e.message?.toLowerCase().includes('timeout');
        return {
            safe: true, // Allow but warn
            status: 'not_scanned',
            message: isTimeout ? 'Scan timeout' : 'Scan failure',
            engine: 'deep',
            timestamp: Date.now()
        };
    }
}

/**
 * Unified Scan Entry Point
 */
export async function startFileScan(file: File | Blob, fileName: string, source: 'EMAIL' | 'P2P'): Promise<ScanResult> {
    // Stage 1: Tier-1 Checks
    const t1 = await tier1Scan(file, fileName);

    if (t1.status !== 'CONTINUE') {
        return {
            safe: t1.status !== 'blocked',
            status: t1.status as ScanStatus,
            message: t1.message,
            engine: 'quick',
            timestamp: Date.now()
        };
    }

    // Stage 2: Tier-2 (Deep)
    return await runDeepScan(file, fileName, source);
}

/**
 * Download Gating Logic
 */
export function canDownload(scanStatus: ScanStatus): boolean {
    return scanStatus === 'clean' || scanStatus === 'not_scanned';
}
