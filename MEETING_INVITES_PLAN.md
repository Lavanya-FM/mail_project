# JeeMeet Email Invites Implementation Plan

**Date:** 2026-02-11 15:45 IST  
**Feature:** Send meeting invites via email and store in dedicated section

---

## 🎯 Requirements

1. **JeeMeet:** Add "Send Invite via Email" button
2. **Backend:** Create endpoint to send meeting invite emails
3. **Jeemail:** Add "Meeting Invites" section/folder
4. **Storage:** Store all sent meeting invites in this dedicated section

---

## 📋 Implementation Steps

### Phase 1: Backend - Email Sending

**File:** `backend/meetingInvites.js` (NEW)

**Endpoints:**
- `POST /api/meeting-invites/send` - Send invite email
- `GET /api/meeting-invites` - Get all meeting invites for user

**Database:**
- Use existing `emails` table
- Add `category` field with value `'meeting_invite'`
- Store meeting link, date, time in email body

### Phase 2: Frontend - JeeMeet UI

**File:** `src/components/MeetingPage.tsx`

**Changes:**
- Add "Invite via Email" button
- Create modal to select recipients
- Send invite via API

### Phase 3: Frontend - Jeemail Section

**File:** `src/components/EmailList.tsx`

**Changes:**
- Add "Meeting Invites" sidebar item
- Filter emails by `category = 'meeting_invite'`
- Display with special icon/badge

---

## 🔧 Technical Details

### Email Template

```html
Subject: Meeting Invitation - [Meeting Title]

You're invited to join a JeeMeet video conference!

Meeting Link: [LINK]
Meeting ID: [ID]
Date: [DATE]
Time: [TIME]

Click the link above to join the meeting.

Sent via JeeMeet
```

### Database Schema

```sql
-- Use existing emails table
-- Add category field if not exists
ALTER TABLE emails ADD COLUMN category VARCHAR(50) DEFAULT 'inbox';

-- Meeting invites will have:
-- category = 'meeting_invite'
-- subject = 'Meeting Invitation - [Title]'
-- body = HTML template with meeting details
```

---

## 🎨 UI Design

### JeeMeet - Invite Button

```
┌─────────────────────────────────────┐
│ Meeting Controls                    │
├─────────────────────────────────────┤
│ [🎥] [🎤] [📱] [📹]                 │
│                                     │
│ [📋 Copy Link] [✉️ Send Invite]    │
└─────────────────────────────────────┘
```

### Jeemail - Meeting Invites Section

```
┌─────────────────────────────────────┐
│ 📧 Jeemail                          │
├─────────────────────────────────────┤
│ 📥 Inbox                            │
│ ⭐ Starred                          │
│ 📤 Sent                             │
│ 📅 Meeting Invites          [NEW]  │ ← NEW
│ 🗑️  Trash                           │
└─────────────────────────────────────┘
```

---

## ✅ Implementation Checklist

- [ ] Create `backend/meetingInvites.js`
- [ ] Add database migration for `category` field
- [ ] Create email template
- [ ] Add API endpoints
- [ ] Update MeetingPage.tsx with invite button
- [ ] Create InviteModal component
- [ ] Add "Meeting Invites" to EmailList sidebar
- [ ] Filter logic for meeting invites
- [ ] Test email sending
- [ ] Test invite storage
- [ ] Deploy to production

---

**Status:** Ready to implement  
**Priority:** High  
**Estimated Time:** 2-3 hours
