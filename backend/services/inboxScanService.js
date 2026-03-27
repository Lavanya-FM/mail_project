const db = require('../db');
const crypto = require('crypto');

/**
 * Core Inbox Scanning Service
 * Handles content scanning, classification, and rule execution.
 */

// Known malicious domains/keywords for demo purposes
const MALICIOUS_DOMAINS = ['phishing.com', 'scam-login.net', 'malware-host.org', 'free-money.xyz'];
const SUSPICIOUS_KEYWORDS = ['verify your account', 'urgent action required', 'lottery winner', 'bank details', 'reset password immediately'];
const EXECUTABLE_EXTENSIONS = ['.exe', '.bat', '.sh', '.js', '.vbs', '.scr'];
const KNOWN_BAD_HASHES = ['e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855']; // Empty file hash for test

// -------------------- CONTENT SCANNING --------------------

/**
 * Scans an email for spam, phishing, and malware signatures.
 * @param {Object} email - Email object with body, subject, from, etc.
 * @param {Array} attachments - List of attachment objects
 * @returns {Object} Scan results
 */
async function scanEmail(email, attachments = []) {
    const results = {
        spamScore: 0,
        phishing: false,
        malware: false,
        priority: false,
        tags: [],
        warnings: [],
        extractedKeywords: []
    };

    // 1. Sender Analysis
    if (!isTrustedSender(email.from_email)) {
        results.spamScore += 10;
    } else {
        results.tags.push('trusted-sender');
    }

    // Spoof detection (basic)
    if (email.from_name && email.from_email) {
        // If name looks like a different email address (common spoofing tactic)
        if (email.from_name.includes('@') && !email.from_name.includes(email.from_email)) {
            results.warnings.push('Possible spoofed sender');
            results.phishing = true;
            results.spamScore += 30;
        }
    }

    // 2. Subject + Body Scan (Phishing Keywords)
    const fullText = (email.subject + ' ' + email.body).toLowerCase();

    let keywordMatches = 0;
    for (const keyword of SUSPICIOUS_KEYWORDS) {
        if (fullText.includes(keyword)) {
            keywordMatches++;
            results.extractedKeywords.push(keyword);
        }
    }

    if (keywordMatches > 0) {
        results.spamScore += (keywordMatches * 15);
        results.warnings.push('Suspicious language detected');
        if (keywordMatches >= 2) results.phishing = true;
    }

    // 3. URL Scan
    const links = extractLinks(email.body);
    for (const link of links) {
        if (isMaliciousDomain(link)) {
            results.phishing = true;
            results.spamScore += 50;
            results.warnings.push(`Malicious link detected: ${link}`);
        }
    }

    // 4. Attachment Scan
    for (const file of attachments) {
        // Filename scan
        const ext = file.filename ? file.filename.slice(file.filename.lastIndexOf('.')).toLowerCase() : '';
        if (EXECUTABLE_EXTENSIONS.includes(ext)) {
            results.malware = true;
            results.spamScore += 100;
            results.warnings.push(`Executable attachment detected: ${file.filename}`);
        }

        // P2P Metadata Scan (if content is missing)
        if (file.is_p2p && !file.content && !file.content_base64) {
            results.warnings.push(`P2P Attachment (Scan pending download): ${file.filename}`);
            continue;
        }

        // Hash Scan (if content available)
        let fileHash = null;
        let buffer = null;
        try {
            if (typeof file.content_base64 === 'string') {
                buffer = Buffer.from(file.content_base64, 'base64');
            } else if (file.content) {
                // Assume content is string or buffer
                buffer = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
            }

            if (buffer) {
                fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
                if (KNOWN_BAD_HASHES.includes(fileHash)) {
                    results.malware = true;
                    results.spamScore += 100;
                    results.warnings.push(`Malicious file hash detected: ${file.filename}`);
                }
            }
        } catch (e) {
            console.warn('Attachment scan error:', e);
        }

        // 🛡️ ClamAV Scan (Real-time Stream)
        if (buffer && process.env.CLAMAV_HOST) {
            try {
                const NodeClam = require('clamscan');
                const clamscan = new NodeClam().init({
                    clamdscan: {
                        host: process.env.CLAMAV_HOST,
                        port: process.env.CLAMAV_PORT || 3310,
                    }
                });
                const { isInfected, viruses } = await clamscan.then(clam => clam.scan_stream(require('stream').Readable.from(buffer)));
                if (isInfected) {
                    results.malware = true;
                    results.spamScore += 100;
                    results.warnings.push(`ClamAV detected virus: ${viruses.join(', ')}`);
                }
            } catch (err) {
                console.warn('ClamAV scan failed (check if daemon is running):', err.message);
            }
        }

        // 🛡️ VirusTotal API Scan (Hash only)
        if (fileHash && process.env.VIRUSTOTAL_API_KEY) {
            try {
                const axios = require('axios');
                const vtRes = await axios.get(`https://www.virustotal.com/api/v3/files/${fileHash}`, {
                    headers: { 'x-apikey': process.env.VIRUSTOTAL_API_KEY }
                });
                const stats = vtRes.data?.data?.attributes?.last_analysis_stats;
                if (stats && stats.malicious > 2) {
                    results.malware = true;
                    results.spamScore += 100;
                    results.warnings.push(`VirusTotal flagged file as malicious (${stats.malicious} engines)`);
                }
            } catch (err) {
                // 404 means file not known to VT, which is fine
                if (err.response?.status !== 404) console.warn('VirusTotal lookup failed:', err.message);
            }
        }
    }

    // 🛡️ Machine Learning / Feedback Loop (Bayesian Simulation)
    // In a real system, this would query a trained RSPAMD instance.
    // Here we simulate checking a database of "user-reported spam patterns"
    try {
        const [patterns] = await db.query("SELECT pattern FROM spam_learning_db WHERE type='keyword'");
        for (const p of patterns) {
            if (fullText.includes(p.pattern)) {
                results.spamScore += 20;
                results.warnings.push('Detected user-reported spam pattern');
            }
        }
    } catch (e) { /* ignore if learning db not ready */ }


    // Final Classification
    if (results.spamScore >= 50) {
        results.tags.push('spam');
    }
    if (results.phishing) {
        results.tags.push('phishing');
        results.tags.push('high-risk');
    }
    if (results.malware) {
        results.tags.push('malware');
        results.tags.push('dangerous');
    }

    // 🛡️ Gmail-style Classification
    const classification = classifyEmail(email);
    results.category = classification.category;
    if (classification.category !== 'inbox') {
        results.tags.push(classification.category);
    }

    return results;
}

/**
 * Classifies email into Gmail-style categories
 */
function classifyEmail(email) {
    const from = (email.from_email || '').toLowerCase();
    const subject = (email.subject || '').toLowerCase();
    const body = (email.body || '').toLowerCase();
    const fullText = subject + ' ' + body;

    // SOCIAL: Major networks
    const socialDomains = ['facebook.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com', 'tiktok.com', 'pinterest.com', 'reddit.com', 'snapchat.com'];
    if (socialDomains.some(d => from.includes(d)) || 
        fullText.includes('friend request') || 
        fullText.includes('new message from') || 
        fullText.includes('notification from')) {
        return { category: 'social' };
    }

    // PROMOTIONS: Keywords
    const promoKeywords = ['discount', 'offer', 'sale', 'limited time', 'coupon', 'exclusive', 'deal', 'promo', 'unsubscribe', 'click here to view'];
    if (promoKeywords.some(kw => fullText.includes(kw)) || from.includes('newsletter') || from.includes('marketing')) {
        return { category: 'promotions' };
    }

    // UPDATES: Automated notifications
    const updateKeywords = ['receipt', 'invoice', 'confirm', 'ticket', 'statement', 'shipping', 'order', 'tracking', 'verify'];
    if (updateKeywords.some(kw => fullText.includes(kw)) || from.includes('no-reply') || from.includes('noreply') || from.includes('support')) {
        return { category: 'updates' };
    }

    // FORUMS: Generic list signatures (if no other hit)
    if (fullText.includes('unsubscribe from this list') || fullText.includes('group message')) {
        return { category: 'forums' };
    }

    return { category: 'inbox' };
}

// -------------------- RULE ENGINE --------------------

/**
 * Checks email against user-defined rules and returns actions.
 * @param {number} userId 
 * @param {Object} email 
 * @param {Object} scanResults 
 * @returns {Object} actions { moveToFolderId: number, markImportant: boolean, etc. }
 */
async function processUserRules(userId, email, scanResults) {
    const actions = {
        moveToFolderId: null,
        markImportant: false,
        markRead: false,
        delete: false
    };

    try {
        // Fetch rules for user
        const [rules] = await db.query(
            `SELECT * FROM email_rules WHERE user_id = ? ORDER BY id ASC`,
            [userId]
        );

        if (!rules || rules.length === 0) return actions;

        for (const rule of rules) {
            let conditions = {};
            let ruleActions = {};

            try {
                conditions = typeof rule.condition_json === 'string' ? JSON.parse(rule.condition_json) : rule.condition_json;
                ruleActions = typeof rule.action_json === 'string' ? JSON.parse(rule.action_json) : rule.action_json;
            } catch (e) {
                console.error('Invalid rule JSON', e);
                continue;
            }

            if (evaluateCondition(email, scanResults, conditions)) {
                // Apply actions
                if (ruleActions.move_to) {
                    // Resolve folder name to ID
                    try {
                        const [[folder]] = await db.query(
                            'SELECT id FROM mailboxes WHERE user_id = ? AND (name = ? OR system_box = ?) LIMIT 1',
                            [userId, ruleActions.move_to, ruleActions.move_to]
                        );
                        if (folder) actions.moveToFolderId = folder.id;
                    } catch (e) { console.error('Rule folder resolution error', e); }
                }

                if (ruleActions.mark_important) actions.markImportant = true;
                if (ruleActions.mark_read) actions.markRead = true;
                if (ruleActions.delete) actions.delete = true;

                // Break if we want "stop processing other rules"? For now, let all run (last win for folder).
            }
        }
    } catch (err) {
        console.error('Error processing user rules:', err);
    }

    return actions;
}

function evaluateCondition(email, scanResults, condition) {
    // Sender
    if (condition.from_contains && !email.from_email.includes(condition.from_contains)) return false;

    // Subject
    if (condition.subject_contains && !email.subject.includes(condition.subject_contains)) return false;

    // Body (Keywords)
    if (condition.body_contains && !email.body.includes(condition.body_contains)) return false;

    // Scan Tags (e.g., if tag == 'spam')
    if (condition.has_tag && !scanResults.tags.includes(condition.has_tag)) return false;

    // Attachments
    if (condition.has_attachment === true && (!email.attachments || email.attachments.length === 0)) return false;

    // High Priority
    if (condition.is_priority === true && !scanResults.priority) return false;

    return true;
}

// -------------------- PERSISTENCE --------------------

async function saveScanResults(emailId, results) {
    try {
        const tagsJson = JSON.stringify(results.tags);
        const keywordsJson = JSON.stringify(results.extractedKeywords || []);

        await db.query(
            `INSERT INTO email_scan_results_v2 
       (email_id, spam_score, phishing, malware, tags, category, extracted_keywords, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE 
         spam_score = VALUES(spam_score),
         phishing = VALUES(phishing),
         malware = VALUES(malware),
         tags = VALUES(tags),
         category = VALUES(category),
         extracted_keywords = VALUES(extracted_keywords)
      `,
            [emailId, results.spamScore, results.phishing ? 1 : 0, results.malware ? 1 : 0, tagsJson, results.category || 'inbox', keywordsJson]
        );
    } catch (err) {
        console.error('Failed to save scan results:', err);
    }
}

// -------------------- HELPERS --------------------

function isTrustedSender(emailStr) {
    if (!emailStr) return false;
    // Demo: internal domain is trusted
    return emailStr.endsWith('@jeemail.in');
}

function extractLinks(text) {
    if (!text) return [];
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex) || [];
}

function isMaliciousDomain(url) {
    try {
        const domain = new URL(url).hostname;
        return MALICIOUS_DOMAINS.some(d => domain.includes(d));
    } catch (e) {
        return false;
    }
}


module.exports = {
    scanEmail,
    processUserRules,
    saveScanResults
};
