/**
 * JeeDrive Permission API Routes
 * 
 * Endpoints for managing file and folder permissions
 */

const express = require('express');
const router = express.Router();
const permissionService = require('./permissionService');
const db = require('./db');

/**
 * Grant permission to a user
 * POST /api/permissions/grant
 * 
 * Body: {
 *   resource_type: 'FILE' | 'FOLDER',
 *   resource_id: number,
 *   user_email: string,  // Email of user to grant permission to
 *   permission: 'VIEW' | 'EDIT' | 'DOWNLOAD',
 *   granted_by: number   // User ID of the owner
 * }
 */
router.post('/grant', async (req, res) => {
    const { resource_type, resource_id, user_email, permission } = req.body;
    const granted_by = req.user.id;

    if (!resource_type || !resource_id || !user_email || !permission) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields'
        });
    }

    try {
        // Look up user by email
        const [[targetUser]] = await db.query(
            'SELECT id FROM users WHERE email = ?',
            [user_email]
        );

        if (!targetUser) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Grant permission
        await permissionService.grantPermission(
            resource_type,
            resource_id,
            targetUser.id,
            permission,
            granted_by
        );

        res.json({
            success: true,
            message: `${permission} permission granted to ${user_email}`
        });
    } catch (error) {
        console.error('[Permission API] Grant error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to grant permission'
        });
    }
});

/**
 * Revoke permission from a user
 * POST /api/permissions/revoke
 * 
 * Body: {
 *   resource_type: 'FILE' | 'FOLDER',
 *   resource_id: number,
 *   user_id: number,
 *   permission: 'VIEW' | 'EDIT' | 'DOWNLOAD',
 *   revoked_by: number
 * }
 */
router.post('/revoke', async (req, res) => {
    const { resource_type, resource_id, user_id, permission } = req.body;
    const revoked_by = req.user.id;

    if (!resource_type || !resource_id || !user_id || !permission) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields'
        });
    }

    try {
        await permissionService.revokePermission(
            resource_type,
            resource_id,
            user_id,
            permission,
            revoked_by
        );

        res.json({
            success: true,
            message: 'Permission revoked successfully'
        });
    } catch (error) {
        console.error('[Permission API] Revoke error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to revoke permission'
        });
    }
});

/**
 * Get all permissions for a resource
 * GET /api/permissions/resource?type=FILE&id=123
 */
router.get('/resource', async (req, res) => {
    const { type, id } = req.query;
    const user_id = req.user.id;

    if (!type || !id) {
        return res.status(400).json({
            success: false,
            error: 'Missing resource type or id'
        });
    }

    try {
        // Verify user is owner before showing permissions
        const isOwner = await permissionService.checkOwnership(type, id, user_id);
        if (!isOwner) {
            return res.status(403).json({
                success: false,
                error: 'Only the owner can view permissions'
            });
        }

        const permissions = await permissionService.getResourcePermissions(type, id);

        res.json({
            success: true,
            permissions
        });
    } catch (error) {
        console.error('[Permission API] Get resource permissions error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve permissions'
        });
    }
});

/**
 * Get all resources shared with a user
 * GET /api/permissions/shared?user_id=123&type=FILE
 */
router.get('/shared', async (req, res) => {
    const { type } = req.query;
    const user_id = req.user.id;

    try {
        const resourceType = type || 'FILE';
        const resources = await permissionService.getUserAccessibleResources(user_id, resourceType);

        res.json({
            success: true,
            owned: resources.owned,
            shared: resources.shared
        });
    } catch (error) {
        console.error('[Permission API] Get shared resources error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve shared resources'
        });
    }
});

/**
 * Check if user has specific permission on a resource
 * GET /api/permissions/check?type=FILE&id=123&user_id=456&permission=VIEW
 */
router.get('/check', async (req, res) => {
    const { type, id, user_id, permission } = req.query;

    if (!type || !id || !user_id) {
        return res.status(400).json({
            success: false,
            error: 'Missing required parameters'
        });
    }

    try {
        const hasPermission = await permissionService.checkPermission(
            type,
            id,
            user_id,
            permission || 'VIEW'
        );

        res.json({
            success: true,
            has_permission: hasPermission,
            permission: permission || 'VIEW'
        });
    } catch (error) {
        console.error('[Permission API] Check permission error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check permission'
        });
    }
});

/**
 * Bulk grant permissions (for sharing with multiple users)
 * POST /api/permissions/bulk-grant
 * 
 * Body: {
 *   resource_type: 'FILE' | 'FOLDER',
 *   resource_id: number,
 *   grants: [
 *     { user_email: string, permission: string },
 *     ...
 *   ],
 *   granted_by: number
 * }
 */
router.post('/bulk-grant', async (req, res) => {
    const { resource_type, resource_id, grants } = req.body;
    const granted_by = req.user.id;

    if (!resource_type || !resource_id || !grants || !Array.isArray(grants)) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields or invalid grants array'
        });
    }

    try {
        const results = [];
        const errors = [];

        for (const grant of grants) {
            try {
                // Look up user
                const [[user]] = await db.query(
                    'SELECT id FROM users WHERE email = ?',
                    [grant.user_email]
                );

                if (!user) {
                    errors.push({ email: grant.user_email, error: 'User not found' });
                    continue;
                }

                // Grant permission
                await permissionService.grantPermission(
                    resource_type,
                    resource_id,
                    user.id,
                    grant.permission,
                    granted_by
                );

                results.push({
                    email: grant.user_email,
                    permission: grant.permission,
                    status: 'granted'
                });
            } catch (error) {
                errors.push({
                    email: grant.user_email,
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            results,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        console.error('[Permission API] Bulk grant error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process bulk grant'
        });
    }
});

/**
 * Get permission audit log for a resource
 * GET /api/permissions/audit?type=FILE&id=123
 */
router.get('/audit', async (req, res) => {
    const { type, id } = req.query;
    const user_id = req.user.id;

    if (!type || !id) {
        return res.status(400).json({
            success: false,
            error: 'Missing resource type or id'
        });
    }

    try {
        // Verify user is owner
        const isOwner = await permissionService.checkOwnership(type, id, user_id);
        if (!isOwner) {
            return res.status(403).json({
                success: false,
                error: 'Only the owner can view audit logs'
            });
        }

        const [auditLogs] = await db.query(
            `SELECT a.*, u.email as user_email, p.email as performed_by_email
             FROM drive_permission_audit a
             LEFT JOIN users u ON a.user_id = u.id
             LEFT JOIN users p ON a.performed_by = p.id
             WHERE a.resource_type = ? AND a.resource_id = ?
             ORDER BY a.performed_at DESC
             LIMIT 100`,
            [type, id]
        );

        res.json({
            success: true,
            audit_logs: auditLogs
        });
    } catch (error) {
        console.error('[Permission API] Audit log error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve audit logs'
        });
    }
});

module.exports = router;
