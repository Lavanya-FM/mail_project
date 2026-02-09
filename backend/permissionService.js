/**
 * JeeDrive Permission Service
 * 
 * Authoritative permission enforcement for files and folders.
 * Implements the permission model with proper inheritance.
 */

const db = require('./db');

/**
 * Permission hierarchy (for comparison)
 * OWNER > EDIT > DOWNLOAD > VIEW
 */
const PERMISSION_LEVELS = {
    'OWNER': 4,
    'EDIT': 3,
    'DOWNLOAD': 2,
    'VIEW': 1
};

/**
 * Check if a user has a specific permission on a resource
 * 
 * @param {string} resourceType - 'FILE' or 'FOLDER'
 * @param {number} resourceId - ID of the resource
 * @param {number} userId - User requesting access
 * @param {string} requiredPermission - 'VIEW', 'EDIT', 'DOWNLOAD', or 'OWNER'
 * @returns {Promise<boolean>} - true if user has permission
 */
async function checkPermission(resourceType, resourceId, userId, requiredPermission = 'VIEW') {
    if (!resourceId || !userId) {
        console.warn('[Permission] Invalid parameters:', { resourceType, resourceId, userId });
        return false;
    }

    try {
        // 1. Check ownership first
        const isOwner = await checkOwnership(resourceType, resourceId, userId);
        if (isOwner) {
            console.log(`[Permission] User ${userId} is OWNER of ${resourceType} ${resourceId}`);
            return true;
        }

        // 2. If OWNER permission is required, deny (only owner can have OWNER permission)
        if (requiredPermission === 'OWNER') {
            console.log(`[Permission] User ${userId} is NOT owner of ${resourceType} ${resourceId}`);
            return false;
        }

        // 3. Check direct permissions on the resource
        const directPermission = await getDirectPermission(resourceType, resourceId, userId);
        if (directPermission && hasPermissionLevel(directPermission, requiredPermission)) {
            console.log(`[Permission] User ${userId} has direct ${directPermission} on ${resourceType} ${resourceId}`);
            return true;
        }

        // 4. Check inherited permissions from parent folder (if applicable)
        if (resourceType === 'FILE') {
            const inheritedPermission = await getInheritedPermission(resourceId, userId);
            if (inheritedPermission && hasPermissionLevel(inheritedPermission, requiredPermission)) {
                console.log(`[Permission] User ${userId} has inherited ${inheritedPermission} on FILE ${resourceId}`);
                return true;
            }
        } else if (resourceType === 'FOLDER') {
            // Check parent folder permissions
            const parentPermission = await getParentFolderPermission(resourceId, userId);
            if (parentPermission && hasPermissionLevel(parentPermission, requiredPermission)) {
                console.log(`[Permission] User ${userId} has parent ${parentPermission} on FOLDER ${resourceId}`);
                return true;
            }
        }

        console.log(`[Permission] User ${userId} DENIED ${requiredPermission} on ${resourceType} ${resourceId}`);
        return false;
    } catch (error) {
        console.error('[Permission] Error checking permission:', error);
        return false;
    }
}

/**
 * Check if user is the owner of a resource
 */
async function checkOwnership(resourceType, resourceId, userId) {
    const table = resourceType === 'FILE' ? 'drive_files' : 'drive_folders';
    const [[resource]] = await db.query(
        `SELECT owner_id FROM ${table} WHERE id = ?`,
        [resourceId]
    );

    return resource && String(resource.owner_id) === String(userId);
}

/**
 * Get direct permission on a resource
 */
async function getDirectPermission(resourceType, resourceId, userId) {
    const [permissions] = await db.query(
        `SELECT permission FROM drive_permissions 
         WHERE resource_type = ? AND resource_id = ? AND user_id = ?
         ORDER BY 
            CASE permission 
                WHEN 'EDIT' THEN 3
                WHEN 'DOWNLOAD' THEN 2
                WHEN 'VIEW' THEN 1
            END DESC
         LIMIT 1`,
        [resourceType, resourceId, userId]
    );

    return permissions.length > 0 ? permissions[0].permission : null;
}

/**
 * Get inherited permission from parent folder (for files)
 */
async function getInheritedPermission(fileId, userId) {
    // Get the folder_id of the file
    const [[file]] = await db.query(
        `SELECT folder_id FROM drive_files WHERE id = ?`,
        [fileId]
    );

    if (!file || !file.folder_id) return null;

    // Check permissions on the parent folder
    return await getDirectPermission('FOLDER', file.folder_id, userId);
}

/**
 * Get permission from parent folder (for folders)
 */
async function getParentFolderPermission(folderId, userId) {
    const [[folder]] = await db.query(
        `SELECT parent_folder_id FROM drive_folders WHERE id = ?`,
        [folderId]
    );

    if (!folder || !folder.parent_folder_id) return null;

    return await getDirectPermission('FOLDER', folder.parent_folder_id, userId);
}

/**
 * Check if a permission level satisfies the required level
 */
function hasPermissionLevel(currentPermission, requiredPermission) {
    const currentLevel = PERMISSION_LEVELS[currentPermission] || 0;
    const requiredLevel = PERMISSION_LEVELS[requiredPermission] || 0;

    // If required is OWNER, strict check (handled by checkOwnership usually, but here for completeness)
    if (requiredPermission === 'OWNER') {
        return currentPermission === 'OWNER';
    }

    // Otherwise, check numeric level
    return currentLevel >= requiredLevel;
}

/**
 * Grant permission to a user
 */
async function grantPermission(resourceType, resourceId, userId, permission, grantedBy) {
    try {
        // Verify that grantedBy is the owner
        const isOwner = await checkOwnership(resourceType, resourceId, grantedBy);
        if (!isOwner) {
            throw new Error('Only the owner can grant permissions');
        }

        // Validate permission type
        if (!['VIEW', 'EDIT', 'DOWNLOAD'].includes(permission)) {
            throw new Error('Invalid permission type');
        }

        // Insert or update permission
        await db.query(
            `INSERT INTO drive_permissions (resource_type, resource_id, user_id, permission, granted_by)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE permission = VALUES(permission), granted_by = VALUES(granted_by)`,
            [resourceType, resourceId, userId, permission, grantedBy]
        );

        // Audit log
        await db.query(
            `INSERT INTO drive_permission_audit (resource_type, resource_id, user_id, permission, action, performed_by)
             VALUES (?, ?, ?, ?, 'GRANTED', ?)`,
            [resourceType, resourceId, userId, permission, grantedBy]
        );

        console.log(`[Permission] Granted ${permission} to user ${userId} on ${resourceType} ${resourceId} by ${grantedBy}`);
        return true;
    } catch (error) {
        console.error('[Permission] Error granting permission:', error);
        throw error;
    }
}

/**
 * Revoke permission from a user
 */
async function revokePermission(resourceType, resourceId, userId, permission, revokedBy) {
    try {
        // Verify that revokedBy is the owner
        const isOwner = await checkOwnership(resourceType, resourceId, revokedBy);
        if (!isOwner) {
            throw new Error('Only the owner can revoke permissions');
        }

        // Delete permission
        await db.query(
            `DELETE FROM drive_permissions 
             WHERE resource_type = ? AND resource_id = ? AND user_id = ? AND permission = ?`,
            [resourceType, resourceId, userId, permission]
        );

        // Audit log
        await db.query(
            `INSERT INTO drive_permission_audit (resource_type, resource_id, user_id, permission, action, performed_by)
             VALUES (?, ?, ?, ?, 'REVOKED', ?)`,
            [resourceType, resourceId, userId, permission, revokedBy]
        );

        console.log(`[Permission] Revoked ${permission} from user ${userId} on ${resourceType} ${resourceId} by ${revokedBy}`);
        return true;
    } catch (error) {
        console.error('[Permission] Error revoking permission:', error);
        throw error;
    }
}

/**
 * Get all permissions for a resource
 */
async function getResourcePermissions(resourceType, resourceId) {
    const [permissions] = await db.query(
        `SELECT p.*, u.email as user_email, gb.email as granted_by_email
         FROM drive_permissions p
         LEFT JOIN users u ON p.user_id = u.id
         LEFT JOIN users gb ON p.granted_by = gb.id
         WHERE p.resource_type = ? AND p.resource_id = ?
         ORDER BY p.created_at DESC`,
        [resourceType, resourceId]
    );

    return permissions;
}

/**
 * Get all resources a user has access to
 */
async function getUserAccessibleResources(userId, resourceType) {
    // Get owned resources
    const table = resourceType === 'FILE' ? 'drive_files' : 'drive_folders';
    const [ownedResources] = await db.query(
        `SELECT * FROM ${table} WHERE owner_id = ? AND is_deleted = 0`,
        [userId]
    );

    // Get shared resources
    const [sharedResources] = await db.query(
        `SELECT DISTINCT r.*, p.permission
         FROM ${table} r
         INNER JOIN drive_permissions p ON p.resource_id = r.id AND p.resource_type = ?
         WHERE p.user_id = ? AND r.is_deleted = 0`,
        [resourceType, userId]
    );

    return {
        owned: ownedResources,
        shared: sharedResources
    };
}

/**
 * Bulk permission check for multiple resources
 */
async function checkBulkPermissions(resources, userId, requiredPermission) {
    const results = {};

    for (const resource of resources) {
        const hasAccess = await checkPermission(
            resource.type,
            resource.id,
            userId,
            requiredPermission
        );
        results[`${resource.type}_${resource.id}`] = hasAccess;
    }

    return results;
}

/**
 * Remove all permissions for a resource (when deleting)
 */
async function removeAllPermissions(resourceType, resourceId) {
    await db.query(
        `DELETE FROM drive_permissions WHERE resource_type = ? AND resource_id = ?`,
        [resourceType, resourceId]
    );
    console.log(`[Permission] Removed all permissions for ${resourceType} ${resourceId}`);
}

module.exports = {
    checkPermission,
    checkOwnership,
    grantPermission,
    revokePermission,
    getResourcePermissions,
    getUserAccessibleResources,
    checkBulkPermissions,
    removeAllPermissions,
    hasPermissionLevel
};
