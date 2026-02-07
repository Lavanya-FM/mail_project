const express = require('express');
const router = express.Router();
const fileScanService = require('./services/fileScanService');
const multer = require('multer');
const crypto = require('crypto');

// Memory storage for immediate streaming/buffer access (don't save to disk just for scan)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB limit for deep scan

/**
 * Unified Scan Entry Point
 * POST /api/scan/file
 * Body: Multipart file
 */
router.post('/file', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'File required' });

        const buffer = req.file.buffer;
        const filename = req.file.originalname;

        // Perform Multi-Tier Scan
        const scanResult = await fileScanService.performFullScan(buffer, filename);

        res.json(scanResult);

    } catch (err) {
        console.error('File scan error:', err);
        res.status(500).json({
            scan_status: 'not_scanned',
            scan_reason: 'Scan engine failed',
            safe: true // Allow but warn
        });
    }
});


module.exports = router;
