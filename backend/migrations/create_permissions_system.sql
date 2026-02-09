-- ================================================
-- JEEDRIVE PERMISSIONS SYSTEM - MIGRATION SCRIPT
-- ================================================
-- This script creates the authoritative permission system
-- for JeeDrive files and folders.

-- 1. Add owner_id columns if they don't exist
ALTER TABLE drive_files 
ADD COLUMN IF NOT EXISTS owner_id INT NOT NULL DEFAULT 0 AFTER user_id,
ADD INDEX idx_owner_id (owner_id);

ALTER TABLE drive_folders 
ADD COLUMN IF NOT EXISTS owner_id INT NOT NULL DEFAULT 0 AFTER user_id,
ADD INDEX idx_owner_id (owner_id);

-- Migrate existing data: user_id -> owner_id
UPDATE drive_files SET owner_id = user_id WHERE owner_id = 0;
UPDATE drive_folders SET owner_id = user_id WHERE owner_id = 0;

-- 2. Create the authoritative permissions table
CREATE TABLE IF NOT EXISTS drive_permissions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- Resource identification
    resource_type ENUM('FILE', 'FOLDER') NOT NULL,
    resource_id BIGINT NOT NULL,
    
    -- Permission grant
    user_id INT NOT NULL,
    permission ENUM('VIEW', 'EDIT', 'DOWNLOAD') NOT NULL,
    
    -- Audit trail
    granted_by INT NOT NULL COMMENT 'Owner who granted this permission',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for performance
    INDEX idx_resource (resource_type, resource_id),
    INDEX idx_user (user_id),
    INDEX idx_granted_by (granted_by),
    
    -- Prevent duplicate permissions
    UNIQUE KEY unique_permission (resource_type, resource_id, user_id, permission),
    
    -- Foreign key constraints
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Create permission audit log
CREATE TABLE IF NOT EXISTS drive_permission_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    resource_type ENUM('FILE', 'FOLDER') NOT NULL,
    resource_id BIGINT NOT NULL,
    user_id INT NOT NULL,
    permission ENUM('VIEW', 'EDIT', 'DOWNLOAD') NOT NULL,
    action ENUM('GRANTED', 'REVOKED') NOT NULL,
    performed_by INT NOT NULL,
    performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_resource (resource_type, resource_id),
    INDEX idx_user (user_id),
    INDEX idx_performed_at (performed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Add updated_at to drive_files if missing
ALTER TABLE drive_files 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- 5. Drop old permission tables if they exist (migration from old schema)
DROP TABLE IF EXISTS file_permissions;

-- 6. Create view for easy permission queries
CREATE OR REPLACE VIEW drive_user_permissions AS
SELECT 
    p.id,
    p.resource_type,
    p.resource_id,
    p.user_id,
    p.permission,
    p.granted_by,
    p.created_at,
    u.email as user_email,
    gb.email as granted_by_email
FROM drive_permissions p
LEFT JOIN users u ON p.user_id = u.id
LEFT JOIN users gb ON p.granted_by = gb.id;

-- 7. Migration complete
SELECT 'Permission system migration completed successfully' AS status;
