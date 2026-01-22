/**
 * Database migration for in-mail calling system
 * Creates tables for call sessions, blocks, and audit logging
 */

const db = require('../db');

async function migrate() {
    console.log('Starting call system migration...');

    try {
        // 1. Create calls table
        console.log('Creating calls table...');
        await db.query(`
      CREATE TABLE IF NOT EXISTS calls (
        id INT AUTO_INCREMENT PRIMARY KEY,
        call_id VARCHAR(64) UNIQUE NOT NULL,
        thread_id VARCHAR(255),
        caller_email VARCHAR(255) NOT NULL,
        caller_user_id INT NOT NULL,
        callee_email VARCHAR(255) NOT NULL,
        callee_user_id INT NOT NULL,
        call_type ENUM('audio', 'video') DEFAULT 'audio',
        status ENUM('ringing', 'connecting', 'connected', 'ended', 'missed', 'rejected', 'cancelled') DEFAULT 'ringing',
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        connected_at TIMESTAMP NULL,
        ended_at TIMESTAMP NULL,
        duration_sec INT DEFAULT 0,
        end_reason ENUM('hangup', 'network_lost', 'kicked', 'error', 'timeout', 'rejected', 'cancelled') NULL,
        INDEX idx_call_id (call_id),
        INDEX idx_thread (thread_id),
        INDEX idx_caller (caller_user_id),
        INDEX idx_callee (callee_user_id),
        INDEX idx_status (status),
        INDEX idx_started (started_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

        // 2. Create call_blocks table (abuse prevention)
        console.log('Creating call_blocks table...');
        await db.query(`
      CREATE TABLE IF NOT EXISTS call_blocks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        blocker_user_id INT NOT NULL,
        blocker_email VARCHAR(255) NOT NULL,
        blocked_email VARCHAR(255) NOT NULL,
        blocked_domain VARCHAR(255),
        reason VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_blocker (blocker_user_id),
        INDEX idx_blocked (blocked_email),
        UNIQUE KEY unique_block (blocker_user_id, blocked_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

        // 3. Create call_audit_log table (compliance)
        console.log('Creating call_audit_log table...');
        await db.query(`
      CREATE TABLE IF NOT EXISTS call_audit_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        call_id VARCHAR(64) NOT NULL,
        event VARCHAR(50) NOT NULL,
        user_email VARCHAR(255),
        user_id INT,
        ip_address VARCHAR(45),
        device_hash VARCHAR(64),
        payload JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_call (call_id),
        INDEX idx_event (event),
        INDEX idx_user (user_id),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

        // 4. Create thread_events table (for call history in threads)
        console.log('Creating thread_events table...');
        await db.query(`
      CREATE TABLE IF NOT EXISTS thread_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        thread_id VARCHAR(255) NOT NULL,
        event_type ENUM('call', 'meeting', 'reminder', 'note') NOT NULL,
        event_data JSON NOT NULL,
        user_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_thread (thread_id),
        INDEX idx_type (event_type),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

        // 5. Create call rate limiting table (Redis alternative)
        console.log('Creating call_rate_limits table...');
        await db.query(`
      CREATE TABLE IF NOT EXISTS call_rate_limits (
        user_id INT PRIMARY KEY,
        hourly_count INT DEFAULT 0,
        daily_unanswered INT DEFAULT 0,
        last_call_at TIMESTAMP NULL,
        last_rejection_at TIMESTAMP NULL,
        cooldown_until TIMESTAMP NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_cooldown (cooldown_until)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

        console.log('✓ Migration completed successfully!');
        console.log('');
        console.log('Summary:');
        console.log('- Created calls table for call sessions');
        console.log('- Created call_blocks table for abuse prevention');
        console.log('- Created call_audit_log table for compliance');
        console.log('- Created thread_events table for thread integration');
        console.log('- Created call_rate_limits table for rate limiting');

    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    }
}

// Run migration if called directly
if (require.main === module) {
    migrate()
        .then(() => {
            console.log('\nMigration complete. Call system is ready.');
            process.exit(0);
        })
        .catch(err => {
            console.error('\nMigration failed:', err);
            process.exit(1);
        });
}

module.exports = { migrate };
