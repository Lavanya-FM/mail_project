# In-Mail Calling System - Implementation Plan

## Executive Summary

Implementing a production-grade, Zoom/Google Meet-style calling system integrated into the email application, following enterprise security and scalability principles.

## Architecture Overview

### Three-Plane Separation

1. **Mail Plane** (Asynchronous, Persistent)
   - Identity and authentication
   - Thread context
   - Call logging and history
   - Permissions and relationships

2. **Signaling Plane** (Real-Time, Lightweight)
   - WebSocket-based signaling
   - Session negotiation
   - Presence management
   - State coordination

3. **Media Plane** (Real-Time, High Bandwidth)
   - WebRTC peer-to-peer
   - TURN relay fallback
   - End-to-end encrypted
   - Never touches mail server

## Core Principles

✅ **Email is identity** - No separate login
✅ **Thread-bound calls** - Context-aware
✅ **Security-first** - Fail-closed policy
✅ **Abuse-resistant** - Rate limiting and reputation
✅ **Scalable** - Stateless signaling, P2P media
✅ **Recoverable** - Reconnection and state persistence

## Implementation Phases

### Phase 1: Foundation (Database & Backend)
- Call sessions table
- Call events/logs table
- Signaling WebSocket server
- Security middleware
- Rate limiting service

### Phase 2: WebRTC Infrastructure
- Peer connection manager
- ICE/STUN/TURN configuration
- Media stream handling
- Network quality monitoring

### Phase 3: Frontend Components
- Call UI components
- State management
- Thread integration
- Notifications

### Phase 4: Security & Abuse Prevention
- Relationship gating
- Rate limiting
- Spam detection
- Audit logging

### Phase 5: Advanced Features
- Screen sharing
- Multi-device handling
- Call recording (optional)
- Network recovery

## Technology Stack

### Backend
- **WebSocket Server**: ws library with authentication
- **Signaling**: Custom protocol (defined below)
- **Database**: MariaDB for call logs
- **Cache**: Redis for presence and sessions
- **Security**: JWT-based authentication

### Frontend
- **WebRTC**: Native browser APIs
- **State Management**: React hooks + context
- **UI**: Custom components matching mail design
- **Notifications**: Browser Notification API

## Database Schema

### calls table
```sql
CREATE TABLE calls (
  id INT AUTO_INCREMENT PRIMARY KEY,
  call_id VARCHAR(64) UNIQUE NOT NULL,
  thread_id VARCHAR(255),
  message_id INT,
  caller_email VARCHAR(255) NOT NULL,
  caller_user_id INT NOT NULL,
  call_type ENUM('audio', 'video') DEFAULT 'audio',
  status ENUM('ringing', 'connecting', 'connected', 'ended', 'missed', 'rejected') DEFAULT 'ringing',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  connected_at TIMESTAMP NULL,
  ended_at TIMESTAMP NULL,
  duration_sec INT DEFAULT 0,
  end_reason ENUM('hangup', 'network_lost', 'kicked', 'error', 'timeout') NULL,
  INDEX idx_caller (caller_user_id),
  INDEX idx_thread (thread_id),
  INDEX idx_status (status),
  INDEX idx_started (started_at)
);
```

### call_participants table
```sql
CREATE TABLE call_participants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  call_id VARCHAR(64) NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  user_id INT NOT NULL,
  role ENUM('caller', 'callee') NOT NULL,
  status ENUM('invited', 'ringing', 'accepted', 'rejected', 'missed') DEFAULT 'invited',
  joined_at TIMESTAMP NULL,
  left_at TIMESTAMP NULL,
  device_id VARCHAR(255),
  INDEX idx_call (call_id),
  INDEX idx_user (user_id),
  FOREIGN KEY (call_id) REFERENCES calls(call_id) ON DELETE CASCADE
);
```

### call_events table (audit log)
```sql
CREATE TABLE call_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  call_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  user_email VARCHAR(255),
  payload JSON,
  ip_address VARCHAR(45),
  device_hash VARCHAR(64),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_call (call_id),
  INDEX idx_type (event_type),
  INDEX idx_created (created_at)
);
```

### call_blocks table (abuse prevention)
```sql
CREATE TABLE call_blocks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  blocker_user_id INT NOT NULL,
  blocked_email VARCHAR(255) NOT NULL,
  blocked_domain VARCHAR(255),
  reason VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_blocker (blocker_user_id),
  INDEX idx_blocked (blocked_email),
  UNIQUE KEY unique_block (blocker_user_id, blocked_email)
);
```

### call_reputation table
```sql
CREATE TABLE call_reputation (
  user_id INT PRIMARY KEY,
  total_calls INT DEFAULT 0,
  missed_calls INT DEFAULT 0,
  rejected_calls INT DEFAULT 0,
  spam_reports INT DEFAULT 0,
  blocks_received INT DEFAULT 0,
  trust_score DECIMAL(3,2) DEFAULT 1.00,
  last_call_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_trust (trust_score)
);
```

## Signaling Message Schema

### Message Envelope
```typescript
interface SignalingMessage {
  v: number;                    // Protocol version
  type: 'CALL_EVENT';
  event: CallEventType;
  callId: string;
  from: string;                 // Email
  to: string[];                 // Email array
  timestamp: number;            // Unix ms
  payload: any;
}
```

### Event Types
```typescript
type CallEventType =
  | 'CALL_INVITE'
  | 'CALL_ACCEPT'
  | 'CALL_REJECT'
  | 'CALL_CANCEL'
  | 'RTC_OFFER'
  | 'RTC_ANSWER'
  | 'RTC_ICE'
  | 'CALL_STATE'
  | 'MEDIA_UPDATE'
  | 'SCREEN_SHARE_START'
  | 'SCREEN_SHARE_STOP'
  | 'NETWORK_QUALITY'
  | 'CALL_RECONNECTING'
  | 'CALL_END';
```

## Security Rules

### 1. Identity Validation
- ✅ Must be logged in
- ✅ Email verified
- ✅ Session token valid
- ✅ Device fingerprint consistent

### 2. Relationship Gating
Calls allowed only if:
- ✅ Existing email thread
- ✅ Mutual contacts
- ✅ Explicit call consent
- ✅ Calendar invite with call

### 3. Rate Limiting
```typescript
const RATE_LIMITS = {
  MAX_CALLS_PER_HOUR: 20,
  MAX_UNANSWERED_PER_DAY: 10,
  REJECTION_COOLDOWN_MIN: 10,
  MISSED_COOLDOWN_MIN: 30,
  MAX_CONCURRENT_CALLS: 1
};
```

### 4. Trust Scoring
```typescript
function calculateTrustScore(user: CallReputation): number {
  const missedRatio = user.missed_calls / Math.max(user.total_calls, 1);
  const spamRatio = user.spam_reports / Math.max(user.total_calls, 1);
  const blockRatio = user.blocks_received / Math.max(user.total_calls, 1);
  
  let score = 1.0;
  score -= missedRatio * 0.3;
  score -= spamRatio * 0.5;
  score -= blockRatio * 0.4;
  
  return Math.max(0, Math.min(1, score));
}
```

## Thread Integration

### Call as Thread Event
```typescript
interface CallThreadEvent {
  type: 'CALL_LOG';
  callId: string;
  participants: string[];
  durationSec: number;
  missed: boolean;
  timestamp: number;
}
```

### Display in Thread
```
┌─────────────────────────────────────┐
│ 📞 Call with bob@jeemail.in         │
│ Duration: 12:34                     │
│ Jan 21, 2026 at 3:15 PM            │
└─────────────────────────────────────┘
```

## File Structure

```
backend/
├── callController.js          # REST API endpoints
├── callSignaling.js           # WebSocket signaling server
├── callSecurity.js            # Security middleware
├── callRateLimiter.js         # Rate limiting
└── migrations/
    └── call_system.js         # Database migration

src/
├── lib/
│   ├── callService.ts         # Call business logic
│   ├── webrtcManager.ts       # WebRTC handling
│   ├── signalingClient.ts     # WebSocket client
│   └── callSecurity.ts        # Security checks
├── hooks/
│   ├── useCall.ts             # Call management hook
│   ├── useWebRTC.ts           # WebRTC hook
│   └── useCallState.ts        # State management
├── components/
│   ├── CallButton.tsx         # Initiate call button
│   ├── IncomingCall.tsx       # Incoming call UI
│   ├── ActiveCall.tsx         # Active call UI
│   ├── CallControls.tsx       # Mute/video/hangup
│   └── CallHistory.tsx        # Call logs
└── contexts/
    └── CallContext.tsx        # Global call state
```

## Next Steps

1. ✅ Review and approve architecture
2. Create database migration
3. Implement signaling server
4. Build WebRTC manager
5. Create frontend components
6. Implement security layer
7. Add abuse prevention
8. Testing and deployment

## Success Criteria

- ✅ One-click call initiation
- ✅ < 2s connection time
- ✅ End-to-end encryption
- ✅ Zero spam calls
- ✅ Multi-device support
- ✅ Network recovery
- ✅ Thread integration
- ✅ Audit logging

---

**Status**: Ready for implementation
**Estimated Effort**: 2-3 weeks for MVP
**Dependencies**: Existing P2P infrastructure can be leveraged
