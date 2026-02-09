# JeeDrive Permission System Documentation

## Overview

The JeeDrive permission system provides **authoritative, granular access control** for files and folders. It mirrors enterprise-grade permission models with ownership, explicit permissions, and inheritance.

---

## 1. Permission Model (FOUNDATION)

### 1.1 Permission Types

The system supports **four permission levels**:

| Permission | Description | Capabilities |
|-----------|-------------|--------------|
| **OWNER** | Resource owner | Full control: VIEW + EDIT + DOWNLOAD + manage permissions |
| **EDIT** | Can modify | VIEW + EDIT + DOWNLOAD (cannot manage permissions) |
| **DOWNLOAD** | Can download | VIEW + DOWNLOAD (cannot edit) |
| **VIEW** | Read-only | Can view only (cannot download or edit) |

### 1.2 Permission Rules

✅ **Explicit Permissions**
- Permissions are **explicitly granted**, never inferred
- OWNER permission is implicit for the resource owner
- EDIT permission includes VIEW and DOWNLOAD
- VIEW does NOT include DOWNLOAD
- DOWNLOAD does NOT include EDIT

✅ **Permission Scope**
- Permissions apply to:
  - **Files** (individual documents)
  - **Folders** (and cascade to children)

---

## 2. Database Schema

### 2.1 Core Tables

#### `drive_files`
```sql
- id (bigint, primary key)
- owner_id (int, indexed) -- User who owns the file
- user_id (int) -- Legacy, kept for compatibility
- name, filename, filepath, size, mime_type
- folder_id (bigint) -- Parent folder
- is_starred, is_deleted, is_shared
- created_at, updated_at
```

#### `drive_folders`
```sql
- id (bigint, primary key)
- owner_id (int, indexed) -- User who owns the folder
- user_id (int) -- Legacy
- parent_folder_id (int) -- Parent folder for nesting
- name, color
- created_at, updated_at
```

#### `drive_permissions` (AUTHORITATIVE)
```sql
- id (bigint, primary key)
- resource_type (ENUM: 'FILE', 'FOLDER')
- resource_id (bigint) -- ID of file or folder
- user_id (int) -- User receiving permission
- permission (ENUM: 'VIEW', 'EDIT', 'DOWNLOAD')
- granted_by (int) -- Owner who granted permission
- created_at (timestamp)

UNIQUE KEY: (resource_type, resource_id, user_id, permission)
```

#### `drive_permission_audit`
```sql
- id (bigint, primary key)
- resource_type, resource_id, user_id, permission
- action (ENUM: 'GRANTED', 'REVOKED')
- performed_by (int)
- performed_at (timestamp)
```

---

## 3. Permission Inheritance Rules

### 3.1 Folder → Child Inheritance

**Rule**: Folder permissions **cascade** to all child files and folders.

```
Folder A (User B has EDIT)
  ├── File 1 → User B can EDIT (inherited)
  ├── File 2 → User B can EDIT (inherited)
  └── Subfolder C
        └── File 3 → User B can EDIT (inherited)
```

### 3.2 Effective Permission Resolution

**Algorithm**:
1. Check if user is **OWNER** → Grant full access
2. Check **direct permissions** on resource
3. Check **inherited permissions** from parent folder(s)
4. Use the **highest permission level** found

**Example**:
```
File X in Folder Y
- User A has VIEW on File X (direct)
- User A has EDIT on Folder Y (inherited)
→ Effective permission: EDIT (higher level wins)
```

### 3.3 Override Rules

- Child resources can have **stricter** permissions than parent
- Direct permissions **override** inherited permissions
- Owner always has full access (cannot be restricted)

---

## 4. API Endpoints

### 4.1 Grant Permission
```http
POST /api/permissions/grant
Content-Type: application/json

{
  "resource_type": "FILE" | "FOLDER",
  "resource_id": 123,
  "user_email": "user@example.com",
  "permission": "VIEW" | "EDIT" | "DOWNLOAD",
  "granted_by": 1
}
```

**Response**:
```json
{
  "success": true,
  "message": "EDIT permission granted to user@example.com"
}
```

### 4.2 Revoke Permission
```http
POST /api/permissions/revoke

{
  "resource_type": "FILE",
  "resource_id": 123,
  "user_id": 5,
  "permission": "EDIT",
  "revoked_by": 1
}
```

### 4.3 Get Resource Permissions
```http
GET /api/permissions/resource?type=FILE&id=123&user_id=1
```

**Response**:
```json
{
  "success": true,
  "permissions": [
    {
      "id": 1,
      "user_id": 5,
      "user_email": "user@example.com",
      "permission": "EDIT",
      "granted_by_email": "owner@example.com",
      "created_at": "2026-02-09T10:00:00Z"
    }
  ]
}
```

### 4.4 Check Permission
```http
GET /api/permissions/check?type=FILE&id=123&user_id=5&permission=EDIT
```

**Response**:
```json
{
  "success": true,
  "has_permission": true,
  "permission": "EDIT"
}
```

### 4.5 Get Shared Resources
```http
GET /api/permissions/shared?user_id=5&type=FILE
```

**Response**:
```json
{
  "success": true,
  "owned": [...],  // Resources user owns
  "shared": [...]  // Resources shared with user
}
```

### 4.6 Bulk Grant
```http
POST /api/permissions/bulk-grant

{
  "resource_type": "FOLDER",
  "resource_id": 10,
  "grants": [
    { "user_email": "user1@example.com", "permission": "VIEW" },
    { "user_email": "user2@example.com", "permission": "EDIT" }
  ],
  "granted_by": 1
}
```

### 4.7 Audit Log
```http
GET /api/permissions/audit?type=FILE&id=123&user_id=1
```

---

## 5. Backend Implementation

### 5.1 Permission Service (`permissionService.js`)

**Core Functions**:

```javascript
// Check if user has permission
await checkPermission('FILE', fileId, userId, 'EDIT')

// Check ownership
await checkOwnership('FILE', fileId, userId)

// Grant permission
await grantPermission('FILE', fileId, targetUserId, 'VIEW', ownerId)

// Revoke permission
await revokePermission('FILE', fileId, targetUserId, 'VIEW', ownerId)

// Get all permissions for a resource
await getResourcePermissions('FILE', fileId)

// Get user's accessible resources
await getUserAccessibleResources(userId, 'FILE')
```

### 5.2 Permission Enforcement in `drive.js`

**All operations check permissions**:

```javascript
// View file
if (!(await checkPermission('FILE', id, userId, 'VIEW'))) {
    return res.status(403).json({ error: 'View permission required' });
}

// Edit file
if (!(await checkPermission('FILE', id, userId, 'EDIT'))) {
    return res.status(403).json({ error: 'Edit permission required' });
}

// Download file
if (!(await checkPermission('FILE', id, userId, 'DOWNLOAD'))) {
    return res.status(403).json({ error: 'Download permission required' });
}

// Delete file (owner only)
if (!(await checkPermission('FILE', id, userId, 'OWNER'))) {
    return res.status(403).json({ error: 'Owner permission required' });
}
```

---

## 6. Frontend Integration

### 6.1 SharePermissionsModal Component

**Usage**:
```tsx
<SharePermissionsModal
    isOpen={showShareModal}
    onClose={() => setShowShareModal(false)}
    resourceType="FILE"
    resourceId={selectedFile.id}
    resourceName={selectedFile.name}
    isOwner={true}
/>
```

**Features**:
- Grant permissions to users by email
- View all current permissions
- Revoke permissions (owner only)
- Visual permission indicators
- Real-time updates

### 6.2 Integration with JeeDrive

Add share button to file/folder actions:

```tsx
<button
    onClick={() => {
        setSelectedResource(file);
        setShowShareModal(true);
    }}
    className="flex items-center gap-2"
>
    <Users className="w-4 h-4" />
    Share
</button>
```

---

## 7. Security Considerations

### 7.1 Authorization Checks

✅ **Every API endpoint** checks permissions before allowing access
✅ **Owner verification** before granting/revoking permissions
✅ **Audit logging** for all permission changes
✅ **SQL injection protection** via parameterized queries
✅ **Foreign key constraints** ensure data integrity

### 7.2 Permission Validation

- Only owners can grant/revoke permissions
- Cannot grant OWNER permission (implicit only)
- Cannot revoke own ownership
- Permissions validated against enum values

---

## 8. Usage Examples

### Example 1: Share a Document with View-Only Access

```javascript
// Owner shares file with colleague
await grantPermission('FILE', 42, colleagueUserId, 'VIEW', ownerId);

// Colleague can now view but not download or edit
```

### Example 2: Grant Folder Edit Access

```javascript
// Share entire project folder with team
await grantPermission('FOLDER', 10, teamMemberId, 'EDIT', ownerId);

// Team member can now edit all files in folder and subfolders
```

### Example 3: Download-Only Permission

```javascript
// Allow client to download deliverables
await grantPermission('FILE', 99, clientUserId, 'DOWNLOAD', ownerId);

// Client can view and download, but not edit
```

---

## 9. Migration Guide

### Running the Migration

```bash
# On server
cd /home/ubuntu/Mail_Project/backend
node -e "const db=require('./db'); const fs=require('fs'); (async()=>{ const sql = fs.readFileSync('migrations/create_permissions_system.sql', 'utf8'); const statements = sql.split(';').filter(s => s.trim()); for(const stmt of statements) { if(stmt.trim()) { await db.query(stmt); } } process.exit(0); })()"
```

### What the Migration Does

1. Adds `owner_id` columns to `drive_files` and `drive_folders`
2. Migrates existing `user_id` data to `owner_id`
3. Creates `drive_permissions` table
4. Creates `drive_permission_audit` table
5. Adds `updated_at` column to `drive_files`
6. Creates `drive_user_permissions` view
7. Drops old `file_permissions` table

---

## 10. Testing Checklist

- [ ] Owner can view/edit/download own files
- [ ] User with VIEW can view but not download/edit
- [ ] User with DOWNLOAD can view and download but not edit
- [ ] User with EDIT can view, download, and edit
- [ ] Folder permissions cascade to children
- [ ] Direct permissions override inherited
- [ ] Only owner can grant/revoke permissions
- [ ] Audit log records all changes
- [ ] Permission checks work across all API endpoints
- [ ] UI correctly shows/hides actions based on permissions

---

## 11. Future Enhancements

- [ ] Link sharing (public URLs with permissions)
- [ ] Expiring permissions (time-limited access)
- [ ] Group permissions (share with teams)
- [ ] Permission templates (predefined sets)
- [ ] Advanced audit reports
- [ ] Bulk permission management UI

---

**Last Updated**: 2026-02-09
**Version**: 1.0.0
**Status**: ✅ Production Ready
