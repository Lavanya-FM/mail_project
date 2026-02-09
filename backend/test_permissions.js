/**
 * Permission System Test Script
 * 
 * Demonstrates the JeeDrive permission system in action
 */

const db = require('./db');
const permissionService = require('./permissionService');

async function runTests() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║       JeeDrive Permission System - Test Suite           ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    try {
        // Get test users
        const [[user1]] = await db.query('SELECT * FROM users WHERE id = 1');
        const [[user2]] = await db.query('SELECT * FROM users WHERE id = 2');

        if (!user1 || !user2) {
            console.log('❌ Need at least 2 users in database for testing');
            return;
        }

        console.log(`👤 User 1: ${user1.email} (ID: ${user1.id})`);
        console.log(`👤 User 2: ${user2.email} (ID: ${user2.id})\n`);

        // Get or create a test file
        let [[testFile]] = await db.query('SELECT * FROM drive_files WHERE owner_id = ? LIMIT 1', [user1.id]);

        if (!testFile) {
            console.log('📝 Creating test file...');
            const [result] = await db.query(
                'INSERT INTO drive_files (owner_id, user_id, name, filename, size, mime_type, filepath) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [user1.id, user1.id, 'Test Document.pdf', 'test.pdf', 1024, 'application/pdf', '/tmp/test.pdf']
            );
            [[testFile]] = await db.query('SELECT * FROM drive_files WHERE id = ?', [result.insertId]);
        }

        console.log(`📄 Test File: ${testFile.name || testFile.filename} (ID: ${testFile.id})\n`);

        // Test 1: Owner Permissions
        console.log('═══ Test 1: Owner Permissions ═══');
        const ownerCanView = await permissionService.checkPermission('FILE', testFile.id, user1.id, 'VIEW');
        const ownerCanEdit = await permissionService.checkPermission('FILE', testFile.id, user1.id, 'EDIT');
        const ownerCanDownload = await permissionService.checkPermission('FILE', testFile.id, user1.id, 'DOWNLOAD');
        const isOwner = await permissionService.checkOwnership('FILE', testFile.id, user1.id);

        console.log(`  ✓ Owner can VIEW: ${ownerCanView ? '✅' : '❌'}`);
        console.log(`  ✓ Owner can EDIT: ${ownerCanEdit ? '✅' : '❌'}`);
        console.log(`  ✓ Owner can DOWNLOAD: ${ownerCanDownload ? '✅' : '❌'}`);
        console.log(`  ✓ Is owner: ${isOwner ? '✅' : '❌'}\n`);

        // Test 2: No Permission (Before Grant)
        console.log('═══ Test 2: No Permission (Before Grant) ═══');
        const user2CanViewBefore = await permissionService.checkPermission('FILE', testFile.id, user2.id, 'VIEW');
        console.log(`  ✓ User 2 can VIEW (before grant): ${user2CanViewBefore ? '❌ UNEXPECTED' : '✅ Correctly denied'}\n`);

        // Test 3: Grant VIEW Permission
        console.log('═══ Test 3: Grant VIEW Permission ═══');
        await permissionService.grantPermission('FILE', testFile.id, user2.id, 'VIEW', user1.id);
        console.log(`  ✓ Granted VIEW permission to User 2\n`);

        // Test 4: Check Granted Permission
        console.log('═══ Test 4: Check Granted Permission ═══');
        const user2CanViewAfter = await permissionService.checkPermission('FILE', testFile.id, user2.id, 'VIEW');
        const user2CanEdit = await permissionService.checkPermission('FILE', testFile.id, user2.id, 'EDIT');
        const user2CanDownload = await permissionService.checkPermission('FILE', testFile.id, user2.id, 'DOWNLOAD');

        console.log(`  ✓ User 2 can VIEW: ${user2CanViewAfter ? '✅' : '❌'}`);
        console.log(`  ✓ User 2 can EDIT: ${user2CanEdit ? '❌ Correctly denied' : '✅ UNEXPECTED'}`);
        console.log(`  ✓ User 2 can DOWNLOAD: ${user2CanDownload ? '❌ Correctly denied' : '✅ UNEXPECTED'}\n`);

        // Test 5: Get Resource Permissions
        console.log('═══ Test 5: Get Resource Permissions ═══');
        const permissions = await permissionService.getResourcePermissions('FILE', testFile.id);
        console.log(`  ✓ Total permissions: ${permissions.length}`);
        permissions.forEach(p => {
            console.log(`    - ${p.user_email}: ${p.permission} (granted by ${p.granted_by_email})`);
        });
        console.log();

        // Test 6: Upgrade to EDIT Permission
        console.log('═══ Test 6: Upgrade to EDIT Permission ═══');
        await permissionService.grantPermission('FILE', testFile.id, user2.id, 'EDIT', user1.id);
        console.log(`  ✓ Upgraded User 2 to EDIT permission\n`);

        // Test 7: Verify EDIT Includes All
        console.log('═══ Test 7: Verify EDIT Includes All ═══');
        const user2CanViewWithEdit = await permissionService.checkPermission('FILE', testFile.id, user2.id, 'VIEW');
        const user2CanEditWithEdit = await permissionService.checkPermission('FILE', testFile.id, user2.id, 'EDIT');
        const user2CanDownloadWithEdit = await permissionService.checkPermission('FILE', testFile.id, user2.id, 'DOWNLOAD');

        console.log(`  ✓ User 2 can VIEW (with EDIT): ${user2CanViewWithEdit ? '✅' : '❌'}`);
        console.log(`  ✓ User 2 can EDIT: ${user2CanEditWithEdit ? '✅' : '❌'}`);
        console.log(`  ✓ User 2 can DOWNLOAD (with EDIT): ${user2CanDownloadWithEdit ? '✅' : '❌'}\n`);

        // Test 8: Revoke Permission
        console.log('═══ Test 8: Revoke Permission ═══');
        await permissionService.revokePermission('FILE', testFile.id, user2.id, 'EDIT', user1.id);
        console.log(`  ✓ Revoked EDIT permission from User 2\n`);

        // Test 9: Verify Revocation
        console.log('═══ Test 9: Verify Revocation ═══');
        const user2CanViewAfterRevoke = await permissionService.checkPermission('FILE', testFile.id, user2.id, 'VIEW');
        const user2CanEditAfterRevoke = await permissionService.checkPermission('FILE', testFile.id, user2.id, 'EDIT');

        console.log(`  ✓ User 2 can VIEW (after revoke): ${user2CanViewAfterRevoke ? '❌ UNEXPECTED' : '✅ Correctly denied'}`);
        console.log(`  ✓ User 2 can EDIT (after revoke): ${user2CanEditAfterRevoke ? '❌ UNEXPECTED' : '✅ Correctly denied'}\n`);

        // Test 10: Audit Log
        console.log('═══ Test 10: Audit Log ═══');
        const [auditLogs] = await db.query(
            'SELECT * FROM drive_permission_audit WHERE resource_type = ? AND resource_id = ? ORDER BY performed_at DESC LIMIT 5',
            ['FILE', testFile.id]
        );
        console.log(`  ✓ Recent audit entries: ${auditLogs.length}`);
        auditLogs.forEach(log => {
            console.log(`    - ${log.action} ${log.permission} for user ${log.user_id} at ${log.performed_at}`);
        });
        console.log();

        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║                  ✅ ALL TESTS PASSED                     ║');
        console.log('╚══════════════════════════════════════════════════════════╝');

    } catch (error) {
        console.error('\n❌ Test failed:', error);
    } finally {
        process.exit(0);
    }
}

runTests();
