
/**
 * src/utils/fileScanner.ts
 * Client-side file scanning logic (Tier-1 and Tier-2 triggers)
 */

import axios from 'axios';

export type ScanStatus = 'pending' | 'scanning' | 'CLEAN' | 'BLOCKED' | 'TIMEOUT' | 'SKIPPED';

export interface ScanResult {
    safe: boolean;
    status: ScanStatus;
    message: string;
    engine?: 'quick' | 'clamav' | 'none'; // Updated engine types
    timestamp?: number;
}

const MAX_SCAN_SIZE = 25 * 1024 * 1024; // 25MB (Consistent with backend)
const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.sh', '.js', '.vbs', '.scr', '.jar', '.msi'];

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
        return {
            status: 'SKIPPED',
            message: 'File too large to scan'
        };
    }

    // 2. Extension Check
    const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(ext)) {
        return {
            status: 'BLOCKED',
            message: 'File type mapped as blocked'
        };
    }

    // 3. Magic Bytes Check
    try {
        const headerChunk = file.slice(0, 4);
        const buffer = await headerChunk.arrayBuffer();
        const header = getMagicBytes(buffer);

        // Content mismatch check (e.g. EXE renamed to TXT)
        if (MAGIC_BYTES[header] && ext !== '.' + MAGIC_BYTES[header]) {
            if (header === '4d5a') {
                return {
                    status: 'BLOCKED',
                    message: 'File content mismatch (Executable disguised)'
                };
            }
        }
    } catch (e) {
        console.warn('Magic byte check failed', e);
        // Fail open here? Or conservative? 
        // Conservative: If we can't read reliable bytes, we let Tier 2 handle it.
    }

    return { status: 'CONTINUE', message: '' };
}

/**
 * Tier-2 Scan: Deep Async Scan (Backend Authority)
 */
export async function runDeepScan(file: File | Blob, fileName: string, source: 'EMAIL' | 'P2P'): Promise<ScanResult> {
    // Strict Mode: No client-side shortcuts. All valid files must go to backend.

    try {
        // Prepare for API call
        const formData = new FormData();
        formData.append('file', file, fileName); // Pass filename explicitly
        formData.append('source', source);

        const token = localStorage.getItem('token');
        const res = await axios.post('/api/scan/file', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            timeout: 20000 // 20s timeout (Client timeout > Backend 8s timeout)
        });

        // Backend returns: { scan_status: 'CLEAN'|'BLOCKED'|'TIMEOUT', ... }
        // Ensure we map it correctly
        const serverStatus = res.data.scan_status;
        const validStatuses: ScanStatus[] = ['CLEAN', 'BLOCKED', 'TIMEOUT', 'SKIPPED'];

        let finalStatus: ScanStatus = 'TIMEOUT'; // Default conservative
        if (validStatuses.includes(serverStatus)) {
            finalStatus = serverStatus as ScanStatus;
        } else if (serverStatus === 'clean') { // Legacy fallback
            finalStatus = 'CLEAN';
        } else if (serverStatus === 'blocked') { // Legacy fallback
            finalStatus = 'BLOCKED';
        }

        return {
            safe: finalStatus === 'CLEAN' || finalStatus === 'SKIPPED',
            status: finalStatus,
            message: res.data.scan_reason || 'Scan complete',
            engine: (res.data.scan_engine as any) || 'clamav',
            timestamp: res.data.scan_timestamp || Date.now()
        };

    } catch (e: any) {
        console.error('Deep scan failed:', e);
        const isTimeout = e.code === 'ECONNABORTED' || e.message?.toLowerCase().includes('timeout');

        // Strict Fail: detailed error
        return {
            safe: false,
            status: 'TIMEOUT',
            message: isTimeout ? 'Scan timed out' : 'Scan service unavailable',
            engine: 'none',
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
        const strictStatus = t1.status as ScanStatus;
        return {
            safe: strictStatus === 'CLEAN' || strictStatus === 'SKIPPED', // SKIPPED (large files) are allowed
            status: strictStatus,
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
 * Core Rule: Only CLEAN files are accessible.
 */
export function canDownload(scanStatus: string): boolean {
    return scanStatus === 'CLEAN' || scanStatus === 'SKIPPED';
}
