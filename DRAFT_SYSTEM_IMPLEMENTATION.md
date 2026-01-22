# Gmail-Style Draft Management System Implementation

## Architecture Overview

This document outlines the implementation of a production-grade draft management system following Gmail's architecture principles.

## Core Principles

1. **Drafts are Stateful Entities** - First-class database objects with stable IDs
2. **Single Draft Per Session** - No duplicate drafts, deterministic updates
3. **Incremental Updates** - Delta-based saves, not full overwrites
4. **Debounced Writes** - Protects backend from write amplification
5. **Optimistic Locking** - Version control prevents conflicts
6. **Offline-First** - IndexedDB persistence with sync queue
7. **Async Attachments** - Decoupled from draft body
8. **Thread Binding** - Drafts bound to conversations immediately
9. **Send as Transition** - Draft becomes sent message atomically
10. **Security** - Drafts never exposed to recipients

## Database Schema (MariaDB)

### emails table (existing, enhanced)
```sql
ALTER TABLE emails ADD COLUMN IF NOT EXISTS draft_version INT DEFAULT 1;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS original_message_id VARCHAR(255);
```

### draft_sync_queue table (new)
```sql
CREATE TABLE IF NOT EXISTS draft_sync_queue (
  id INT AUTO_INCREMENT PRIMARY KEY,
  draft_id INT NOT NULL,
  user_id INT NOT NULL,
  changes JSON NOT NULL,
  version INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  synced BOOLEAN DEFAULT FALSE,
  INDEX idx_draft_user (draft_id, user_id),
  INDEX idx_synced (synced)
);
```

## Client-Side Storage (IndexedDB)

### Stores
1. **drafts** - Local draft state
2. **draft_changes** - Pending changes queue
3. **draft_attachments** - Attachment upload queue

## Implementation Components

### 1. Draft Service (`draftService.ts`)
- Create draft on first interaction
- Incremental update with debouncing
- Version management
- Offline queue management

### 2. Draft Storage (`draftStorage.ts`)
- IndexedDB wrapper
- Offline persistence
- Sync queue management

### 3. Backend API (`backend/draftController.js`)
- POST /api/drafts - Create draft
- PATCH /api/drafts/:id - Update draft (versioned)
- POST /api/drafts/:id/send - Convert to sent message
- DELETE /api/drafts/:id - Delete draft
- GET /api/drafts/sync - Sync offline changes

### 4. Attachment Handler
- Separate upload endpoint
- Progress tracking
- Resume support

## Flow Diagrams

### Draft Creation
```
User types → Debounce (1-3s) → Check if draft exists
  ↓ No
  Create draft → Server returns {draft_id, thread_id, version: 1}
  ↓
  Store in IndexedDB + memory
```

### Draft Update
```
User edits → Buffer changes locally → Debounce timer
  ↓
  Send PATCH with {draft_id, version, changes: {...}}
  ↓
  Server checks version → Update → Return new version
  ↓
  Update local state
```

### Offline Handling
```
Network down → Queue changes in IndexedDB
  ↓
  Network restored → Sync queue
  ↓
  Resolve conflicts using version merge
```

### Send Flow
```
User clicks Send → Validate
  ↓
  POST /api/drafts/:id/send {version}
  ↓
  Server atomically:
    - Set is_draft = false
    - Generate new message_id
    - Move to sent folder
    - Send via SMTP/P2P
    - Delete/archive draft
```

## API Endpoints

### POST /api/drafts
**Request:**
```json
{
  "user_id": 1,
  "from_email": "user@jeemail.in",
  "thread_id": null,
  "subject": "",
  "body": "",
  "to_emails": [],
  "cc_emails": [],
  "bcc_emails": []
}
```

**Response:**
```json
{
  "draft_id": 123,
  "thread_id": "thread_abc",
  "version": 1,
  "created_at": "2026-01-21T15:00:00Z"
}
```

### PATCH /api/drafts/:id
**Request:**
```json
{
  "version": 1,
  "changes": {
    "subject": "Updated subject",
    "body_delta": "<p>New paragraph</p>"
  }
}
```

**Response:**
```json
{
  "version": 2,
  "last_modified": "2026-01-21T15:01:00Z",
  "status": "updated"
}
```

### POST /api/drafts/:id/send
**Request:**
```json
{
  "version": 5,
  "p2p_enabled": false
}
```

**Response:**
```json
{
  "message_id": "msg_xyz",
  "sent_at": "2026-01-21T15:05:00Z",
  "status": "sent"
}
```

## Implementation Phases

### Phase 1: Database Schema (✓ Ready to implement)
- Add version column to emails
- Create draft_sync_queue table
- Migration scripts

### Phase 2: Backend API (✓ Ready to implement)
- Draft controller
- Version conflict handling
- Cleanup jobs

### Phase 3: Frontend Service (✓ Ready to implement)
- draftService.ts
- draftStorage.ts (IndexedDB)
- Integration with ComposeEmail

### Phase 4: Testing & Migration
- Unit tests
- Integration tests
- Gradual rollout

## Backward Compatibility

All changes are additive:
- Existing draft functionality continues to work
- New system runs in parallel initially
- Feature flag for gradual migration
- No breaking changes to existing APIs

## Success Metrics

- Zero duplicate drafts
- 100% offline recovery rate
- < 100ms draft save latency
- Zero data loss on crashes
- Multi-tab conflict resolution

## Next Steps

1. Review and approve architecture
2. Implement Phase 1 (Database)
3. Implement Phase 2 (Backend API)
4. Implement Phase 3 (Frontend)
5. Testing and deployment
