/**
 * backend/callSignaling.js
 * Call signaling handlers for WebRTC call setup
 * Extends P2P infrastructure for voice/video calls
 */

const db = require('./db');
const crypto = require('crypto');

/**
 * Handle call-related signaling messages
 */
async function handleCallSignaling(ws, msg, peerConnections) {
    const { event, callId, from, to, payload } = msg;

    console.log(`[Call] ${event} from ${from} to ${to?.join(',')}`);

    try {
        switch (event) {
            case 'CALL_INVITE':
                await handleCallInvite(ws, msg, peerConnections);
                break;

            case 'CALL_ACCEPT':
                await handleCallAccept(ws, msg, peerConnections);
                break;

            case 'CALL_REJECT':
                await handleCallReject(ws, msg, peerConnections);
                break;

            case 'CALL_CANCEL':
                await handleCallCancel(ws, msg, peerConnections);
                break;

            case 'RTC_OFFER':
            case 'RTC_ANSWER':
            case 'RTC_ICE':
                // Forward WebRTC signaling directly
                forwardToParticipants(to, msg, peerConnections);
                break;

            case 'MEDIA_UPDATE':
                // Forward media state changes
                forwardToParticipants(to, msg, peerConnections);
                await logCallEvent(callId, event, from, payload);
                break;

            case 'CALL_END':
                await handleCallEnd(ws, msg, peerConnections);
                break;

            default:
                console.warn(`[Call] Unknown event: ${event}`);
        }
    } catch (error) {
        console.error(`[Call] Error handling ${event}:`, error);
        ws.send(JSON.stringify({
            type: 'CALL_EVENT',
            event: 'CALL_ERROR',
            callId,
            payload: { error: error.message }
        }));
    }
}

/**
 * Handle incoming call invitation
 */
async function handleCallInvite(ws, msg, peerConnections) {
    const { callId, from, to, payload } = msg;
    const callee = to[0]; // MVP: 1-on-1 only

    // Security checks
    const canCall = await checkCallPermission(from, callee);
    if (!canCall.allowed) {
        ws.send(JSON.stringify({
            type: 'CALL_EVENT',
            event: 'CALL_REJECT',
            callId,
            payload: { reason: canCall.reason }
        }));
        return;
    }

    // Rate limiting
    const rateLimitOk = await checkRateLimit(ws.userId);
    if (!rateLimitOk) {
        ws.send(JSON.stringify({
            type: 'CALL_EVENT',
            event: 'CALL_REJECT',
            callId,
            payload: { reason: 'RATE_LIMITED' }
        }));
        return;
    }

    // Get user IDs
    const [[caller]] = await db.query('SELECT id FROM users WHERE email = ?', [from]);
    const [[callee_user]] = await db.query('SELECT id FROM users WHERE email = ?', [callee]);

    if (!caller || !callee_user) {
        throw new Error('User not found');
    }

    // Create call record
    await db.query(
        `INSERT INTO calls (
      call_id, thread_id, caller_email, caller_user_id,
      callee_email, callee_user_id, call_type, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ringing')`,
        [
            callId,
            payload.context?.threadId || null,
            from,
            caller.id,
            callee,
            callee_user.id,
            payload.mode || 'audio'
        ]
    );

    // Log event
    await logCallEvent(callId, 'CALL_INVITE', from, payload);

    // Forward to callee if online
    const calleePeer = findPeerByEmail(callee, peerConnections);
    if (calleePeer && calleePeer.ws.readyState === 1) { // WebSocket.OPEN
        calleePeer.ws.send(JSON.stringify(msg));

        // Start ring timeout
        setTimeout(async () => {
            const [[call]] = await db.query(
                'SELECT status FROM calls WHERE call_id = ?',
                [callId]
            );

            if (call && call.status === 'ringing') {
                // Call not answered - mark as missed
                await handleCallTimeout(callId, from, callee, peerConnections);
            }
        }, (payload.timeoutSec || 30) * 1000);
    } else {
        // Callee offline - mark as missed immediately
        await db.query(
            `UPDATE calls SET status = 'missed', ended_at = NOW() WHERE call_id = ?`,
            [callId]
        );

        ws.send(JSON.stringify({
            type: 'CALL_EVENT',
            event: 'CALL_REJECT',
            callId,
            payload: { reason: 'OFFLINE' }
        }));
    }
}

/**
 * Handle call acceptance
 */
async function handleCallAccept(ws, msg, peerConnections) {
    const { callId, from, to, payload } = msg;

    // Update call status
    await db.query(
        `UPDATE calls 
     SET status = 'connecting', connected_at = NOW() 
     WHERE call_id = ? AND status = 'ringing'`,
        [callId]
    );

    // Log event
    await logCallEvent(callId, 'CALL_ACCEPT', from, payload);

    // Forward to caller
    forwardToParticipants(to, msg, peerConnections);

    // Update rate limit
    await updateRateLimit(ws.userId, 'call_started');
}

/**
 * Handle call rejection
 */
async function handleCallReject(ws, msg, peerConnections) {
    const { callId, from, to, payload } = msg;

    // Update call status
    await db.query(
        `UPDATE calls 
     SET status = 'rejected', ended_at = NOW(), end_reason = 'rejected'
     WHERE call_id = ?`,
        [callId]
    );

    // Log event
    await logCallEvent(callId, 'CALL_REJECT', from, payload);

    // Forward to caller
    forwardToParticipants(to, msg, peerConnections);

    // Apply rejection cooldown
    await applyRejectionCooldown(ws.userId);
}

/**
 * Handle call cancellation (caller hangs up before answer)
 */
async function handleCallCancel(ws, msg, peerConnections) {
    const { callId, from, to } = msg;

    // Update call status
    await db.query(
        `UPDATE calls 
     SET status = 'cancelled', ended_at = NOW(), end_reason = 'cancelled'
     WHERE call_id = ?`,
        [callId]
    );

    // Log event
    await logCallEvent(callId, 'CALL_CANCEL', from, {});

    // Forward to callee
    forwardToParticipants(to, msg, peerConnections);
}

/**
 * Handle call end
 */
async function handleCallEnd(ws, msg, peerConnections) {
    const { callId, from, to, payload } = msg;

    // Get call start time to calculate duration
    const [[call]] = await db.query(
        'SELECT connected_at FROM calls WHERE call_id = ?',
        [callId]
    );

    let duration = 0;
    if (call && call.connected_at) {
        duration = Math.floor((Date.now() - new Date(call.connected_at).getTime()) / 1000);
    }

    // Update call status
    await db.query(
        `UPDATE calls 
     SET status = 'ended', ended_at = NOW(), 
         duration_sec = ?, end_reason = ?
     WHERE call_id = ?`,
        [duration, payload.reason || 'hangup', callId]
    );

    // Log event
    await logCallEvent(callId, 'CALL_END', from, { ...payload, duration });

    // Create thread event
    await createThreadEvent(callId);

    // Forward to other participants
    forwardToParticipants(to, msg, peerConnections);
}

/**
 * Handle call timeout (no answer)
 */
async function handleCallTimeout(callId, caller, callee, peerConnections) {
    await db.query(
        `UPDATE calls 
     SET status = 'missed', ended_at = NOW(), end_reason = 'timeout'
     WHERE call_id = ?`,
        [callId]
    );

    await logCallEvent(callId, 'CALL_TIMEOUT', callee, {});

    // Notify caller
    const callerPeer = findPeerByEmail(caller, peerConnections);
    if (callerPeer) {
        callerPeer.ws.send(JSON.stringify({
            type: 'CALL_EVENT',
            event: 'CALL_END',
            callId,
            payload: { reason: 'timeout' }
        }));
    }

    // Create thread event for missed call
    await createThreadEvent(callId);
}

/**
 * Check if user can call another user
 */
async function checkCallPermission(caller, callee) {
    // Check if blocked
    const [[block]] = await db.query(
        `SELECT 1 FROM call_blocks 
     WHERE blocker_email = ? AND blocked_email = ?`,
        [callee, caller]
    );

    if (block) {
        return { allowed: false, reason: 'BLOCKED' };
    }

    // Check relationship (thread exists or same domain)
    const [[thread]] = await db.query(
        `SELECT 1 FROM emails e
     JOIN email_recipients r ON e.id = r.email_id
     WHERE e.from_email = ? AND r.address = ?
     LIMIT 1`,
        [caller, callee]
    );

    if (thread) {
        return { allowed: true };
    }

    // Check same domain
    const callerDomain = caller.split('@')[1];
    const calleeDomain = callee.split('@')[1];

    if (callerDomain === calleeDomain) {
        return { allowed: true };
    }

    return { allowed: false, reason: 'NO_RELATIONSHIP' };
}

/**
 * Check rate limiting
 */
async function checkRateLimit(userId) {
    const [[limits]] = await db.query(
        `SELECT hourly_count, cooldown_until 
     FROM call_rate_limits 
     WHERE user_id = ?`,
        [userId]
    );

    if (!limits) {
        // First call - create record
        await db.query(
            `INSERT INTO call_rate_limits (user_id, hourly_count, last_call_at)
       VALUES (?, 1, NOW())`,
            [userId]
        );
        return true;
    }

    // Check cooldown
    if (limits.cooldown_until && new Date(limits.cooldown_until) > new Date()) {
        return false;
    }

    // Check hourly limit
    if (limits.hourly_count >= 20) {
        return false;
    }

    return true;
}

/**
 * Update rate limit counters
 */
async function updateRateLimit(userId, action) {
    await db.query(
        `INSERT INTO call_rate_limits (user_id, hourly_count, last_call_at)
     VALUES (?, 1, NOW())
     ON DUPLICATE KEY UPDATE
       hourly_count = hourly_count + 1,
       last_call_at = NOW()`,
        [userId]
    );
}

/**
 * Apply rejection cooldown
 */
async function applyRejectionCooldown(userId) {
    await db.query(
        `UPDATE call_rate_limits 
     SET cooldown_until = DATE_ADD(NOW(), INTERVAL 10 MINUTE),
         last_rejection_at = NOW()
     WHERE user_id = ?`,
        [userId]
    );
}

/**
 * Log call event for audit
 */
async function logCallEvent(callId, event, userEmail, payload) {
    await db.query(
        `INSERT INTO call_audit_log (call_id, event, user_email, payload)
     VALUES (?, ?, ?, ?)`,
        [callId, event, userEmail, JSON.stringify(payload)]
    );
}

/**
 * Create thread event for call history
 */
async function createThreadEvent(callId) {
    const [[call]] = await db.query(
        `SELECT thread_id, caller_email, callee_email, duration_sec, status
     FROM calls WHERE call_id = ?`,
        [callId]
    );

    if (!call || !call.thread_id) return;

    const eventData = {
        callId,
        participants: [call.caller_email, call.callee_email],
        durationSec: call.duration_sec,
        missed: call.status === 'missed'
    };

    await db.query(
        `INSERT INTO thread_events (thread_id, event_type, event_data)
     VALUES (?, 'call', ?)`,
        [call.thread_id, JSON.stringify(eventData)]
    );
}

/**
 * Forward message to participants
 */
function forwardToParticipants(emails, msg, peerConnections) {
    if (!emails || !Array.isArray(emails)) return;

    for (const email of emails) {
        const peer = findPeerByEmail(email, peerConnections);
        if (peer && peer.ws.readyState === 1) {
            peer.ws.send(JSON.stringify(msg));
        }
    }
}

/**
 * Find peer by email
 */
function findPeerByEmail(email, peerConnections) {
    for (const peer of peerConnections.values()) {
        if (peer.email === email) return peer;
    }
    return null;
}

module.exports = {
    handleCallSignaling
};
