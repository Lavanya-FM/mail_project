const crypto = require('crypto');
const axios = require('axios');
let NodeClam;
try {
    NodeClam = require('clamscan');
} catch (e) {
    console.warn('ClamAV module not found, skipping deep scan capabilities');
}

const MAX_SCAN_SIZE = 25 * 1024 * 1024; // 25MB
const MAX_SCAN_TIME_MS = 8000; // 8 seconds
const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.sh', '.js', '.vbs', '.scr', '.jar', '.msi'];
const HIGH_RISK_EXTENSIONS = ['.zip', '.exe', '.js', '.doc', '.docx', '.xls', '.xlsx', '.pdf', '.msi'];
const MAGIC_BYTES = {
    '4d5a': 'exe',
    'cafebabe': 'class',
    '7f454c46': 'elf',
    '504b0304': 'zip',
    '25504446': 'pdf',
};

/**
 * Tier-1: Instant Synchronous Checks
 */
function tier1Scan(buffer, filename) {
    if (buffer.length > MAX_SCAN_SIZE) {
        return {
            status: 'not_scanned',
            reason: 'File too large to scan',
            safe: true
        };
    }

    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();

    // Blocked types
    if (BLOCKED_EXTENSIONS.includes(ext)) {
        return { status: 'blocked', reason: 'File type not allowed', safe: false };
    }

    // Magic bytes check
    const header = buffer.toString('hex', 0, 4);
    if (MAGIC_BYTES[header] && ext !== '.' + MAGIC_BYTES[header]) {
        if (header === '4d5a') {
            return { status: 'blocked', reason: 'File content mismatch (Executable disguised)', safe: false };
        }
    }

    return { status: 'CONTINUE', safe: true };
}

/**
 * Tier-2: Deep Scan (Async) with Timeout
 */
async function runDeepScan(buffer, filename) {
    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
    const isHighRisk = HIGH_RISK_EXTENSIONS.includes(ext);

    if (!isHighRisk) {
        return {
            status: 'clean',
            reason: 'No threats detected',
            safe: true,
            engine: 'quick'
        };
    }

    if (!process.env.CLAMAV_HOST || !NodeClam) {
        return {
            status: 'not_scanned',
            reason: 'Deep scan temporarily unavailable',
            safe: true,
            engine: 'deep'
        };
    }

    try {
        const clamscan = new NodeClam().init({
            clamdscan: {
                host: process.env.CLAMAV_HOST,
                port: process.env.CLAMAV_PORT || 3310,
            }
        });

        // 🚀 TIER-2 SCAN WITH TIMEOUT
        const scanTask = clamscan.then(clam => clam.scan_stream(require('stream').Readable.from(buffer)));
        const timeoutTask = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), MAX_SCAN_TIME_MS)
        );

        const { isInfected, viruses } = await Promise.race([scanTask, timeoutTask]);

        if (isInfected) {
            return {
                status: 'blocked',
                reason: 'Potential malware detected',
                safe: false,
                engine: 'deep'
            };
        }

        return {
            status: 'clean',
            reason: 'No threats detected',
            safe: true,
            engine: 'deep'
        };
    } catch (err) {
        if (err.message === 'timeout') {
            return {
                status: 'not_scanned',
                reason: 'Scan timeout',
                safe: true,
                engine: 'deep'
            };
        }
        console.warn('Deep scan failed:', err.message);
        return {
            status: 'not_scanned',
            reason: 'Scan failure',
            safe: true,
            engine: 'deep'
        };
    }
}

/**
 * Unified Backend Entry Point
 */
async function performFullScan(buffer, filename) {
    // 1. Tier-1
    const t1 = tier1Scan(buffer, filename);
    if (t1.status !== 'CONTINUE') {
        return {
            scan_status: t1.status,
            scan_reason: t1.reason,
            scan_engine: 'quick',
            scan_timestamp: Date.now(),
            safe: t1.safe
        };
    }

    // 2. Tier-2
    const t2 = await runDeepScan(buffer, filename);
    return {
        scan_status: t2.status,
        scan_reason: t2.reason,
        scan_engine: t2.engine,
        scan_timestamp: Date.now(),
        safe: t2.safe
    };
}

module.exports = {
    performFullScan,
    // Keep individual for legacy or specific cases
    tier1Scan,
    runDeepScan
};

