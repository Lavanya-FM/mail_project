/* backend/carbonService.js

Express router + helper functions to calculate carbon metrics and connect/save submissions to DB.
*/

const express = require('express');
const router = express.Router();
const db = require('./db'); // adapt if your db export differs

// --- Configuration / constants ---
const KG_CO2E_PER_GB_STORAGE_MONTH = 0.0003; // kg CO2e per GB-month
const KG_CO2E_PER_GB_TRANSFER = 0.02; // kg CO2e per GB transferred
const KG_PER_CARBON_CREDIT = 1000;

// Ensure DB table exists
async function ensureSchema() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS carbon_submissions (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id VARCHAR(191) NOT NULL,
      credits DECIMAL(18,8) NOT NULL,
      co2e_saved_kg DECIMAL(18,8) NOT NULL,
      metadata JSON DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  if (typeof db.query === 'function') {
    await db.query(createTableSQL);
  } else if (typeof db.execute === 'function') {
    await db.execute(createTableSQL);
  } else {
    throw new Error('Unexpected db export shape. Expected db.query or db.execute. Check ./db.js');
  }
}

// Calculate metrics and return high-precision credits
function calculateCarbonMetrics(storageSavedGB, dataTransferReducedGB, mode = 'realistic') {
  const storageCO2eKg = Number(storageSavedGB || 0) * KG_CO2E_PER_GB_STORAGE_MONTH;
  const transferCO2eKg = Number(dataTransferReducedGB || 0) * KG_CO2E_PER_GB_TRANSFER;

  const totalCO2eSavedKg = storageCO2eKg + transferCO2eKg;

  // Mode multipliers for visibility (optional)
  let multiplier = 1;
  if (mode === 'medium') multiplier = 5;
  if (mode === 'gamified') multiplier = 10;

  const adjustedCO2eKg = totalCO2eSavedKg * multiplier;

  // raw credits (float). 1 credit = KG_PER_CARBON_CREDIT kg (default 1000)
  const rawCredits = Number(adjustedCO2eKg) / (Number(KG_PER_CARBON_CREDIT) || 1000);

  // Keep high precision (8 decimals)
  const carbonCredits = Number(rawCredits.toFixed(8));
  const carbonCreditsEarned = carbonCredits;

  // gamified points (integer) example: scale credits to points
  const gamifiedPoints = Math.round(carbonCredits * 1000);

  return {
    storageSavedGB: Number(storageSavedGB || 0),
    dataTransferReducedGB: Number(dataTransferReducedGB || 0),
    storageCO2eKg,
    transferCO2eKg,
    totalCO2eSavedKg,
    carbonCredits,
    carbonCreditsEarned,
    gamifiedPoints,
  };
} // <-- properly close function

// Helper: fetch email stats from DB for a user (best-effort)
async function fetchEmailStatsForUser(userId) {
  const sql = `
    SELECT
      COUNT(*) AS email_count,
(SELECT COUNT(*) FROM email_attachments ea WHERE ea.email_id = e.id) AS attachments_count
      SUM(COALESCE(size_kb, 0)) AS total_size_kb
    FROM emails
    WHERE user_id = ?
  `;

  const [rows] = typeof db.query === 'function' ? await db.query(sql, [userId]) : await db.execute(sql, [userId]);
  const stats = rows && rows[0] ? rows[0] : { email_count: 0, attachments_count: 0, total_size_kb: 0 };
  return {
    emailCount: Number(stats.email_count || 0),
    attachmentsCount: Number(stats.attachments_count || 0),
    totalSizeKB: Number(stats.total_size_kb || 0),
  };
}

// Route: GET /metrics/:userId
router.get('/metrics/:userId', async (req, res) => {
  try {
    await ensureSchema();

    const userId = req.params.userId;
    const { storageSavedGB, dataTransferReducedGB, mode } = req.query;

    if (storageSavedGB !== undefined && dataTransferReducedGB !== undefined) {
      const metrics = calculateCarbonMetrics(Number(storageSavedGB), Number(dataTransferReducedGB), String(mode || 'realistic'));
      return res.json({ ok: true, metrics });
    }

    // derive from emails
    const stats = await fetchEmailStatsForUser(userId);

    let storageGB = 0;
    let transferGB = 0;

    if (stats.totalSizeKB > 0) {
      storageGB = stats.totalSizeKB / 1024 / 1024; // KB -> GB
    } else {
      const avgEmailSizeKB = 50;
      storageGB = (stats.emailCount * avgEmailSizeKB) / 1024 / 1024;
    }

    if (stats.attachmentsCount > 0) {
      const avgAttachmentMB = 2;
      transferGB = (stats.attachmentsCount * avgAttachmentMB) / 1024;
    }

    const metrics = calculateCarbonMetrics(storageGB, transferGB, String(mode || 'realistic'));
    return res.json({ ok: true, metrics, derivedFrom: 'emails', stats });
  } catch (err) {
    console.error('Error in /api/carbon/metrics:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal error' });
  }
});

// Convenience endpoint: GET /metrics/me (requires Authorization header resolved elsewhere)
router.get('/metrics/me', async (req, res) => {
  try {
    await ensureSchema();

    // try to read user id from req.user (if JWT middleware sets it) or from query fallback
    const userId = (req.user && (req.user.id || req.user.userId || req.user.sub)) || req.query.userId;
    const mode = String(req.query.mode || 'realistic');

    if (!userId) {
      // If no user id, allow query overrides only
      const { storageSavedGB, dataTransferReducedGB } = req.query;
      if (storageSavedGB !== undefined && dataTransferReducedGB !== undefined) {
        const metrics = calculateCarbonMetrics(Number(storageSavedGB), Number(dataTransferReducedGB), mode);
        return res.json({ ok: true, metrics });
      }
      return res.status(400).json({ ok: false, error: 'Missing user id and no overrides provided' });
    }

    // derive from emails
    const stats = await fetchEmailStatsForUser(userId);

    let storageGB = 0;
    let transferGB = 0;

    if (stats.totalSizeKB > 0) {
      storageGB = stats.totalSizeKB / 1024 / 1024;
    } else {
      const avgEmailSizeKB = 50;
      storageGB = (stats.emailCount * avgEmailSizeKB) / 1024 / 1024;
    }

    if (stats.attachmentsCount > 0) {
      const avgAttachmentMB = 2;
      transferGB = (stats.attachmentsCount * avgAttachmentMB) / 1024;
    }

    const metrics = calculateCarbonMetrics(storageGB, transferGB, mode);
    return res.json({ ok: true, metrics, derivedFrom: 'emails', stats });
  } catch (err) {
    console.error('Error in /api/carbon/metrics/me:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal error' });
  }
});

// Route: POST /submit
router.post('/submit', async (req, res) => {
  try {
    await ensureSchema();
    const { userId, credits, co2eSaved, gamifiedPoints, metadata } = req.body;

    if (!userId || (credits === undefined && gamifiedPoints === undefined) || co2eSaved === undefined) {
      return res.status(400).json({ ok: false, error: 'Missing required fields: userId, credits/gamifiedPoints, co2eSaved' });
    }

    const insertSQL = `
      INSERT INTO carbon_submissions (user_id, credits, co2e_saved_kg, metadata)
      VALUES (?, ?, ?, ?)
    `;

    const metaJson = metadata ? JSON.stringify(metadata) : null;
    const params = [userId, Number(credits || 0), Number(co2eSaved), metaJson];

    const [result] = typeof db.query === 'function' ? await db.query(insertSQL, params) : await db.execute(insertSQL, params);

    return res.json({ ok: true, insertedId: result.insertId || null });
  } catch (err) {
    console.error('Error in /api/carbon/submit:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal error' });
  }
});

// Route: GET /submissions/:userId
router.get('/submissions/:userId', async (req, res) => {
  try {
    await ensureSchema();
    const userId = req.params.userId;
    const sql = `SELECT id, user_id, credits, co2e_saved_kg as co2eSavedKg, metadata, created_at FROM carbon_submissions WHERE user_id = ? ORDER BY created_at DESC`;
    const [rows] = typeof db.query === 'function' ? await db.query(sql, [userId]) : await db.execute(sql, [userId]);
    return res.json({ ok: true, submissions: rows || [] });
  } catch (err) {
    console.error('Error in /api/carbon/submissions:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal error' });
  }
});

// Export
module.exports = router;
module.exports.calculateCarbonMetrics = calculateCarbonMetrics;
module.exports.ensureSchema = ensureSchema;
