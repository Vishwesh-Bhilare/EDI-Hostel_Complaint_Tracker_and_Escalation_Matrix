-- =====================================================================
-- Hostel Complaint Tracker & Escalation Matrix - MySQL Database Schema
--
-- DBMS Core Concepts Applied:
-- 1. Normalization:
--    - 1NF (First Normal Form): Atomic attributes, defined primary keys, no repeating groups.
--    - 2NF (Second Normal Form): In 1NF and no partial functional dependencies (single-attribute PKs).
--    - 3NF (Third Normal Form): No transitive dependencies. Extracted master entities
--      (hostel_blocks, complaint_categories) instead of duplicating text attributes.
-- 2. Referential Integrity: Foreign Keys with ON DELETE/ON UPDATE constraints.
-- 3. Load Management & Performance: B-Tree Indexes on foreign keys and search predicates
--    (status, severity, escalation_level, timestamps) to eliminate O(N) full table scans.
-- 4. High Availability & Fault Tolerance: Supported by backup database (hostelcare_backup)
--    and automated replication/failover.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS hostelcare;
USE hostelcare;

-- ===================================================
-- 1. HOSTEL BLOCKS (Master Table - 3NF Decomposition)
-- Eliminates update anomalies when hostel block details change.
-- ===================================================
CREATE TABLE IF NOT EXISTS hostel_blocks (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  block_code  VARCHAR(20) UNIQUE NOT NULL,      -- Candidate Key: e.g. 'DEVGIRI', 'SAHYADRI'
  block_name  VARCHAR(100) NOT NULL,             -- Descriptive block name
  total_rooms INT DEFAULT 100,                  -- Capacity
  warden_id   INT NULL,                          -- Assigned Warden (FK to users)
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===================================================
-- 2. COMPLAINT CATEGORIES (Master Table - 3NF Decomposition)
-- Enforces domain integrity and defines standard SLA parameters.
-- ===================================================
CREATE TABLE IF NOT EXISTS complaint_categories (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(50) UNIQUE NOT NULL,    -- Candidate Key: 'Electrical', 'Plumbing', etc.
  default_severity ENUM('Low', 'Medium', 'High', 'Critical') NOT NULL DEFAULT 'Medium',
  sla_hours        INT NOT NULL DEFAULT 48,        -- Target resolution time in hours
  description      VARCHAR(255) NULL
);

-- ===================================================
-- 3. USERS
-- Entity representing all human actors in the hostel escalation hierarchy.
-- ===================================================
CREATE TABLE IF NOT EXISTS users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  role       ENUM('student', 'warden', 'chief_warden', 'college_authority', 'principal', 'maintenance', 'admin') NOT NULL,
  prn        VARCHAR(20) UNIQUE,          -- Unique candidate key for students
  email      VARCHAR(100) UNIQUE,         -- Unique candidate key for notifications
  password   VARCHAR(255),                -- Authentication credential
  block_id   INT NULL,                    -- Normalized Foreign Key to hostel_blocks
  block      VARCHAR(100),                -- Backward-compatible string name
  room       VARCHAR(20),                 -- Room number (for students)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (block_id) REFERENCES hostel_blocks(id) ON DELETE SET NULL
);

-- Circular FK reference for warden in hostel_blocks
ALTER TABLE hostel_blocks
  ADD CONSTRAINT fk_hostel_blocks_warden
  FOREIGN KEY (warden_id) REFERENCES users(id) ON DELETE SET NULL;

-- ===================================================
-- 4. PENDING REGISTRATIONS
-- Staging relation for student signups awaiting admin verification.
-- ===================================================
CREATE TABLE IF NOT EXISTS pending_registrations (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  name              VARCHAR(100) NOT NULL,
  prn               VARCHAR(20) NOT NULL,
  email             VARCHAR(100) NOT NULL,
  password          VARCHAR(255) NOT NULL,
  block_id          INT NULL,             -- Normalized FK
  block             VARCHAR(100) NOT NULL,
  status            ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  rejection_reason  VARCHAR(255),
  requested_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (block_id) REFERENCES hostel_blocks(id) ON DELETE SET NULL,
  INDEX idx_pending_status (status)
);

-- ===================================================
-- 5. COMPLAINTS (Core Transactional Relation)
-- Represents hostel grievances tracked across the escalation matrix.
-- ===================================================
CREATE TABLE IF NOT EXISTS complaints (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  title               VARCHAR(150) NOT NULL,
  category_id         INT NULL,              -- Normalized FK to complaint_categories
  category            VARCHAR(50) NOT NULL,  -- Backward-compatible category name
  severity            ENUM('Low', 'Medium', 'High', 'Critical') NOT NULL,
  description         TEXT,
  photo               VARCHAR(255),
  completion_photo    VARCHAR(255),
  status              ENUM('Pending', 'Assigned', 'Under Review', 'Resolved') NOT NULL DEFAULT 'Pending',
  student_id          INT NOT NULL,          -- FK: Student who registered complaint
  block_id            INT NULL,              -- Normalized FK to hostel_blocks
  hostel_block        VARCHAR(100),          -- Backward-compatible block name
  assigned_to         INT NULL,              -- FK: Maintenance personnel assigned
  escalation_level    TINYINT NOT NULL DEFAULT 0,  -- 0=Warden, 1=Chief Warden, 2=College Authority, 3=Principal
  response_due_at     TIMESTAMP NULL,        -- SLA Acknowledgment deadline
  resolution_due_at   TIMESTAMP NULL,        -- SLA Resolution deadline
  final_due_at        TIMESTAMP NULL,        -- SLA Escalation ceiling deadline
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (category_id) REFERENCES complaint_categories(id) ON DELETE SET NULL,
  FOREIGN KEY (block_id) REFERENCES hostel_blocks(id) ON DELETE SET NULL,

  -- B-Tree Performance Indexes to handle query load without server processing delays
  INDEX idx_complaints_status (status),
  INDEX idx_complaints_severity (severity),
  INDEX idx_complaints_escalation (escalation_level),
  INDEX idx_complaints_student_id (student_id),
  INDEX idx_complaints_assigned_to (assigned_to),
  INDEX idx_complaints_created_at (created_at),
  INDEX idx_complaints_student_status (student_id, status)
);

-- ===================================================
-- 6. COMPLAINT HISTORY (Audit Log Relation - 1NF Decomposition)
-- Preserves complete timeline history for every complaint.
-- ===================================================
CREATE TABLE IF NOT EXISTS complaint_history (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id  INT NOT NULL,
  note          VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
  INDEX idx_history_complaint_id (complaint_id)
);

-- ===================================================
-- 7. ESCALATIONS (Escalation Event Audit Log)
-- Maintains immutable audit trail of automated SLA breaches & manual escalations.
-- ===================================================
CREATE TABLE IF NOT EXISTS escalations (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id       INT NOT NULL,
  level              TINYINT NOT NULL,
  escalated_to_role  VARCHAR(30) NOT NULL,
  reason             VARCHAR(255) NOT NULL,
  triggered_by       VARCHAR(20) NOT NULL DEFAULT 'system',
  triggered_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
  INDEX idx_escalations_complaint_id (complaint_id)
);

-- ===================================================
-- 8. NOTIFICATIONS (Notification Dispatch Log)
-- Tracks email dispatches and escalation alerts.
-- ===================================================
CREATE TABLE IF NOT EXISTS notifications (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id  INT NOT NULL,
  role          VARCHAR(30) NOT NULL,
  email         VARCHAR(100) NOT NULL,
  subject       VARCHAR(255) NOT NULL,
  status        ENUM('sent', 'failed', 'skipped') NOT NULL,
  sent_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
  INDEX idx_notifications_complaint_id (complaint_id),
  INDEX idx_notifications_status (status)
);

-- ===================================================
-- RELATIONAL VIEWS (Virtual Tables for Optimized Queries)
-- ===================================================
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

-- ===================================================
-- SEED DATA
-- ===================================================
INSERT IGNORE INTO hostel_blocks (id, block_code, block_name, total_rooms) VALUES
  (1, 'DEVGIRI', 'Devgiri Boys Hostel', 120),
  (2, 'SAHYADRI', 'Sahyadri Boys Hostel', 100),
  (3, 'SHIVNERI', 'Shivneri Girls Hostel', 100);

INSERT IGNORE INTO complaint_categories (id, name, default_severity, sla_hours, description) VALUES
  (1, 'Electrical',    'Medium',   24, 'Electrical appliances, switches, fans, lights'),
  (2, 'Plumbing',      'High',     12, 'Water supply, pipe leakage, washroom fittings'),
  (3, 'Internet/WiFi', 'Medium',   24, 'Hostel WiFi routers and LAN connectivity'),
  (4, 'Carpentry',     'Low',      48, 'Beds, tables, cupboards, doors and window repairs'),
  (5, 'Cleaning',      'Low',      24, 'Room cleaning, corridors, and waste disposal'),
  (6, 'Other',         'Medium',   48, 'General and miscellaneous hostel maintenance');

INSERT IGNORE INTO users (id, name, role, prn, email, password, block_id, block, room) VALUES
  (1, 'Tushar', 'student', 'B24CE1001', 'tusharborate2024.comp@mmcoe.edu.in', '12345678', 1, 'Devgiri Boys Hostel', 'B-204'),
  (2, 'Mahesh', 'student', 'B24CE1009', 'maheshgaikwad2024.comp@mmcoe.edu.in', '12345678', 1, 'Devgiri Boys Hostel', 'B-118');

INSERT IGNORE INTO users (id, name, role, email) VALUES
  (3, 'Warden A', 'warden', 'warden@replace-me.hostelcare.local'),
  (4, 'Chief Warden', 'chief_warden', 'chiefwarden@replace-me.hostelcare.local'),
  (5, 'College Authority', 'college_authority', 'authority@replace-me.hostelcare.local'),
  (6, 'Principal', 'principal', 'principal@replace-me.hostelcare.local');

INSERT IGNORE INTO users (id, name, role) VALUES
  (7, 'Maintenance Staff A', 'maintenance'),
  (8, 'Maintenance Staff B', 'maintenance'),
  (9, 'Admin', 'admin');

-- Set Warden for Devgiri
UPDATE hostel_blocks SET warden_id = 3 WHERE id = 1;
