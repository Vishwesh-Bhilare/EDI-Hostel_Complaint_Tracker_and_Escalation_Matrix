-- =====================================================================
-- HostelCare Database Normalization & Performance Migration
-- Core DBMS Concepts Applied:
--   1. First Normal Form (1NF): Atomic attributes, single primary keys.
--   2. Second Normal Form (2NF): No partial functional dependencies.
--   3. Third Normal Form (3NF): Eliminated transitive dependencies by
--      extracting master tables (hostel_blocks, complaint_categories).
--   4. B-Tree Indexing: Fast O(log N) lookups on status, foreign keys,
--      timestamps to prevent full table scans under heavy server load.
--   5. Referential Integrity: Foreign keys with ON DELETE / ON UPDATE actions.
--   6. Relational Views: v_complaints_detailed and v_hostel_block_stats.
-- =====================================================================

USE hostelcare;

-- -----------------------------------------------------
-- 1. Master Table: hostel_blocks (Eliminates transitive & update anomalies for hostel blocks)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS hostel_blocks (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  block_code  VARCHAR(20) UNIQUE NOT NULL,
  block_name  VARCHAR(100) NOT NULL,
  total_rooms INT DEFAULT 100,
  warden_id   INT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (warden_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Seed standard hostel blocks
INSERT IGNORE INTO hostel_blocks (block_code, block_name, total_rooms, warden_id) VALUES
  ('DEVGIRI', 'Devgiri Boys Hostel', 120, 3),
  ('SAHYADRI', 'Sahyadri Boys Hostel', 100, NULL),
  ('SHIVNERI', 'Shivneri Girls Hostel', 100, NULL);

-- -----------------------------------------------------
-- 2. Master Table: complaint_categories (3NF categorization with SLA rules)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS complaint_categories (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(50) UNIQUE NOT NULL,
  default_severity ENUM('Low', 'Medium', 'High', 'Critical') NOT NULL DEFAULT 'Medium',
  sla_hours        INT NOT NULL DEFAULT 48,
  description      VARCHAR(255) NULL
);

-- Seed standard categories
INSERT IGNORE INTO complaint_categories (name, default_severity, sla_hours, description) VALUES
  ('Electrical',    'Medium',   24, 'Electrical appliances, switches, fans, lights'),
  ('Plumbing',      'High',     12, 'Water supply, pipe leakage, washroom fittings'),
  ('Internet/WiFi', 'Medium',   24, 'Hostel WiFi routers and LAN connectivity'),
  ('Carpentry',     'Low',      48, 'Beds, tables, cupboards, doors and window repairs'),
  ('Cleaning',      'Low',      24, 'Room cleaning, corridors, and waste disposal'),
  ('Other',         'Medium',   48, 'General and miscellaneous hostel maintenance');

-- -----------------------------------------------------
-- 3. Add Normalized Foreign Keys to users
-- -----------------------------------------------------
-- Add block_id column if it doesn't already exist
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
                   WHERE TABLE_SCHEMA = 'hostelcare' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'block_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE users ADD COLUMN block_id INT NULL, ADD FOREIGN KEY (block_id) REFERENCES hostel_blocks(id) ON DELETE SET NULL;', 'SELECT "block_id already exists in users"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Link existing user block strings to block_id
UPDATE users u
JOIN hostel_blocks b ON u.block = b.block_name
SET u.block_id = b.id
WHERE u.block_id IS NULL;

-- -----------------------------------------------------
-- 4. Add Normalized Foreign Keys to pending_registrations
-- -----------------------------------------------------
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
                   WHERE TABLE_SCHEMA = 'hostelcare' AND TABLE_NAME = 'pending_registrations' AND COLUMN_NAME = 'block_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE pending_registrations ADD COLUMN block_id INT NULL, ADD FOREIGN KEY (block_id) REFERENCES hostel_blocks(id) ON DELETE SET NULL;', 'SELECT "block_id already exists in pending_registrations"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE pending_registrations pr
JOIN hostel_blocks b ON pr.block = b.block_name
SET pr.block_id = b.id
WHERE pr.block_id IS NULL;

-- -----------------------------------------------------
-- 5. Add Normalized Foreign Keys to complaints
-- -----------------------------------------------------
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
                   WHERE TABLE_SCHEMA = 'hostelcare' AND TABLE_NAME = 'complaints' AND COLUMN_NAME = 'category_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE complaints ADD COLUMN category_id INT NULL, ADD FOREIGN KEY (category_id) REFERENCES complaint_categories(id) ON DELETE SET NULL;', 'SELECT "category_id already exists in complaints"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
                   WHERE TABLE_SCHEMA = 'hostelcare' AND TABLE_NAME = 'complaints' AND COLUMN_NAME = 'block_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE complaints ADD COLUMN block_id INT NULL, ADD FOREIGN KEY (block_id) REFERENCES hostel_blocks(id) ON DELETE SET NULL;', 'SELECT "block_id already exists in complaints"');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill category_id and block_id in complaints
UPDATE complaints c
JOIN complaint_categories cat ON c.category = cat.name
SET c.category_id = cat.id
WHERE c.category_id IS NULL;

UPDATE complaints c
JOIN hostel_blocks b ON c.hostel_block = b.block_name
SET c.block_id = b.id
WHERE c.block_id IS NULL;

-- -----------------------------------------------------
-- 6. Performance Optimization: B-Tree Indexes to reduce server load
-- -----------------------------------------------------
-- In DBMS, indexes prevent O(N) full table scans and allow O(log N) indexed searches.
-- Drop and recreate indexes cleanly if needed or create safely

DELIMITER $$
CREATE PROCEDURE AddIndexIfNotExists(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN cols VARCHAR(255))
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND INDEX_NAME = idx
  ) THEN
    SET @sql = CONCAT('CREATE INDEX ', idx, ' ON ', tbl, '(', cols, ')');
    PREPARE s FROM @sql;
    EXECUTE s;
    DEALLOCATE PREPARE s;
  END IF;
END$$
DELIMITER ;

CALL AddIndexIfNotExists('complaints', 'idx_complaints_status', 'status');
CALL AddIndexIfNotExists('complaints', 'idx_complaints_severity', 'severity');
CALL AddIndexIfNotExists('complaints', 'idx_complaints_escalation', 'escalation_level');
CALL AddIndexIfNotExists('complaints', 'idx_complaints_student_id', 'student_id');
CALL AddIndexIfNotExists('complaints', 'idx_complaints_assigned_to', 'assigned_to');
CALL AddIndexIfNotExists('complaints', 'idx_complaints_created_at', 'created_at');
CALL AddIndexIfNotExists('complaints', 'idx_complaints_student_status', 'student_id, status');

CALL AddIndexIfNotExists('complaint_history', 'idx_history_complaint_id', 'complaint_id');
CALL AddIndexIfNotExists('escalations', 'idx_escalations_complaint_id', 'complaint_id');
CALL AddIndexIfNotExists('notifications', 'idx_notifications_complaint_id', 'complaint_id');
CALL AddIndexIfNotExists('notifications', 'idx_notifications_status', 'status');
CALL AddIndexIfNotExists('pending_registrations', 'idx_pending_status', 'status');

DROP PROCEDURE IF EXISTS AddIndexIfNotExists;

-- -----------------------------------------------------
-- 7. SQL Views for Normalized Data Access (Relational Views)
-- -----------------------------------------------------
CREATE OR REPLACE VIEW v_complaints_detailed AS
SELECT 
  c.id AS complaint_id,
  c.title,
  c.description,
  COALESCE(cat.name, c.category) AS category_name,
  cat.sla_hours,
  c.severity,
  c.status,
  c.escalation_level,
  c.student_id,
  u_student.name AS student_name,
  u_student.prn AS student_prn,
  u_student.room AS student_room,
  COALESCE(b.block_name, c.hostel_block) AS block_name,
  c.assigned_to,
  u_staff.name AS assigned_staff_name,
  c.response_due_at,
  c.resolution_due_at,
  c.final_due_at,
  c.created_at
FROM complaints c
LEFT JOIN users u_student ON c.student_id = u_student.id
LEFT JOIN users u_staff ON c.assigned_to = u_staff.id
LEFT JOIN complaint_categories cat ON c.category_id = cat.id
LEFT JOIN hostel_blocks b ON c.block_id = b.id;

CREATE OR REPLACE VIEW v_hostel_block_stats AS
SELECT 
  COALESCE(b.block_name, c.hostel_block, 'Unknown') AS block_name,
  COUNT(c.id) AS total_complaints,
  SUM(CASE WHEN c.status = 'Pending' THEN 1 ELSE 0 END) AS pending_complaints,
  SUM(CASE WHEN c.status = 'Assigned' THEN 1 ELSE 0 END) AS assigned_complaints,
  SUM(CASE WHEN c.status = 'Under Review' THEN 1 ELSE 0 END) AS under_review_complaints,
  SUM(CASE WHEN c.status = 'Resolved' THEN 1 ELSE 0 END) AS resolved_complaints
FROM complaints c
LEFT JOIN hostel_blocks b ON c.block_id = b.id
GROUP BY COALESCE(b.block_name, c.hostel_block, 'Unknown');
