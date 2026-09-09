-- =====================================================================
-- HostelCare — Hostel Complaint Tracker & Escalation Matrix
-- Relational Database Management System (RDBMS) Schema
--
-- This schema demonstrates core DBMS concepts and properties:
--   1. Data Definition Language (DDL) with Standard Relational Data Types
--   2. Integrity Constraints:
--      - Entity Integrity (PRIMARY KEY, AUTO_INCREMENT)
--      - Referential Integrity (FOREIGN KEY with ON DELETE / ON UPDATE)
--      - Domain Integrity (NOT NULL, DEFAULT, CHECK constraints)
--      - Key / Uniqueness Integrity (UNIQUE constraint)
--   3. Normalization (1NF, 2NF, 3NF compliance)
--   4. Indexing (B-Tree Indexes for Query Optimization)
--   5. Views (Data Abstraction & Reporting)
--   6. Triggers (Automated Audit Logging & Validation)
--   7. Stored Procedures & ACID Transaction Management
--   8. Data Manipulation Language (DML) with Initial Seed Records
--   9. Sample Queries for Lab Evaluation and Project Viva Defense
-- =====================================================================

CREATE DATABASE IF NOT EXISTS hostelcare_db;
USE hostelcare_db;

SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================================
-- SECTION 1: DDL — MASTER LOOKUP TABLES
-- =====================================================================

-- 1.1 Hostel Blocks Lookup Table
-- Concept: Master domain table ensuring referential integrity for hostel locations.
DROP TABLE IF EXISTS hostel_blocks;
CREATE TABLE hostel_blocks (
  block_name VARCHAR(20) NOT NULL,
  CONSTRAINT pk_hostel_blocks PRIMARY KEY (block_name)
);

INSERT INTO hostel_blocks (block_name) VALUES
  ('Block A'), ('Block B'), ('Block C'), ('Block D');


-- 1.2 Complaint Categories Lookup Table
-- Concept: Master domain table ensuring standardized issue categories.
DROP TABLE IF EXISTS categories;
CREATE TABLE categories (
  category_name VARCHAR(40) NOT NULL,
  CONSTRAINT pk_categories PRIMARY KEY (category_name)
);

INSERT INTO categories (category_name) VALUES
  ('Maintenance / Repair'),
  ('Electrical'),
  ('Plumbing / Water'),
  ('Cleanliness / Hygiene'),
  ('Security'),
  ('Food / Mess'),
  ('Internet / Wi-Fi'),
  ('Other');


-- 1.3 Performance Policies Table
-- Concept: Performance targets for response and resolution times (Domain Integrity via CHECK constraint).
DROP TABLE IF EXISTS performance_chain_steps;
DROP TABLE IF EXISTS performance_policies;
CREATE TABLE performance_policies (
  severity           VARCHAR(20) NOT NULL,
  response_minutes   INT NOT NULL,
  resolution_minutes INT NOT NULL,
  CONSTRAINT pk_performance_policies PRIMARY KEY (severity),
  CONSTRAINT chk_perf_severity CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
  CONSTRAINT chk_perf_response CHECK (response_minutes > 0),
  CONSTRAINT chk_perf_resolution CHECK (resolution_minutes > 0)
);

INSERT INTO performance_policies (severity, response_minutes, resolution_minutes) VALUES
  ('Low',       720,  4320),   -- 12 hours response / 72 hours resolution
  ('Medium',    360,  2880),   -- 6 hours response  / 48 hours resolution
  ('High',      120,  1440),   -- 2 hours response  / 24 hours resolution
  ('Critical',   30,   360);   -- 30 mins response  / 6 hours resolution


-- 1.4 Performance Escalation Hierarchy Table
-- Concept: Normalized composite-key table (3NF) representing multi-tier escalation hierarchy.
CREATE TABLE performance_chain_steps (
  severity      VARCHAR(20) NOT NULL,
  level         INT NOT NULL,
  role          VARCHAR(30) NOT NULL,
  role_label    VARCHAR(60) NOT NULL,
  CONSTRAINT pk_performance_chain_steps PRIMARY KEY (severity, level),
  CONSTRAINT fk_chain_severity FOREIGN KEY (severity) 
      REFERENCES performance_policies(severity) ON UPDATE CASCADE ON DELETE CASCADE
);

INSERT INTO performance_chain_steps (severity, level, role, role_label) VALUES
  ('Low', 1, 'maintenance_staff', 'Maintenance Staff'),
  ('Low', 2, 'warden',            'Warden'),

  ('Medium', 1, 'warden',         'Warden'),
  ('Medium', 2, 'deputy_warden',  'Assistant / Deputy Warden'),
  ('Medium', 3, 'chief_warden',   'Chief Warden'),

  ('High', 1, 'warden',           'Warden'),
  ('High', 2, 'chief_warden',     'Chief Warden'),
  ('High', 3, 'dean',             'Dean of Student Welfare'),

  ('Critical', 1, 'warden',       'Warden + Security'),
  ('Critical', 2, 'chief_warden', 'Chief Warden'),
  ('Critical', 3, 'dean',         'Dean of Student Welfare'),
  ('Critical', 4, 'director',     'Director / Principal');


-- =====================================================================
-- SECTION 2: CORE ENTITY TABLES (1NF, 2NF, 3NF RELATIONAL SCHEMA)
-- =====================================================================

-- 2.1 Users Table
-- Concept: Entity Integrity (user_id PK), Candidate Key (username UNIQUE),
--          Domain Integrity (role & status CHECK constraints), Referential Integrity (hostel_block FK).
DROP TABLE IF EXISTS users;
CREATE TABLE users (
  user_id        INT AUTO_INCREMENT,
  app_user_key   VARCHAR(50) NULL UNIQUE,
  name           VARCHAR(100) NOT NULL,
  username       VARCHAR(30)  NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  email          VARCHAR(120) NULL,
  role           VARCHAR(30)  NOT NULL,
  room_no        VARCHAR(15)  NULL,
  hostel_block   VARCHAR(20)  NULL,
  status         VARCHAR(20)  NOT NULL DEFAULT 'active',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_users PRIMARY KEY (user_id),
  CONSTRAINT fk_users_block FOREIGN KEY (hostel_block) 
      REFERENCES hostel_blocks(block_name) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_users_role CHECK (role IN (
      'resident', 'maintenance_staff', 'warden', 'deputy_warden',
      'chief_warden', 'dean', 'director', 'admin'
  )),
  CONSTRAINT chk_users_status CHECK (status IN ('active', 'suspended'))
);


-- 2.2 Complaints Table (Primary Operational Entity)
-- Concept: 1NF (atomic columns), 3NF (dependent solely on complaint_id),
--          Foreign Keys establishing 1:N relationship from users to complaints.
DROP TABLE IF EXISTS complaints;
CREATE TABLE complaints (
  complaint_id            VARCHAR(20)  NOT NULL,
  resident_id             INT          NOT NULL,
  category                VARCHAR(40)  NOT NULL,
  severity                VARCHAR(20)  NOT NULL,
  hostel_block            VARCHAR(20)  NOT NULL,
  room_no                 VARCHAR(15)  NOT NULL,
  description             TEXT         NOT NULL,
  evidence_name           VARCHAR(255) NULL,
  status                  VARCHAR(30)  NOT NULL DEFAULT 'Open',
  level                   INT          NOT NULL DEFAULT 1,
  current_authority_role  VARCHAR(30)  NOT NULL DEFAULT 'warden',
  acknowledged            BOOLEAN      NOT NULL DEFAULT FALSE,
  acknowledged_at         DATETIME     NULL,
  created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  response_due            DATETIME     NOT NULL,
  resolution_due          DATETIME     NOT NULL,
  resolved_at             DATETIME     NULL,
  resolution_note         TEXT         NULL,
  breach_flag             BOOLEAN      NOT NULL DEFAULT FALSE,
  version                 INT          NOT NULL DEFAULT 1,
  idempotency_key         VARCHAR(80)  NOT NULL,

  CONSTRAINT pk_complaints PRIMARY KEY (complaint_id),
  CONSTRAINT fk_complaints_resident FOREIGN KEY (resident_id) 
      REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_complaints_category FOREIGN KEY (category) 
      REFERENCES categories(category_name) ON UPDATE CASCADE,
  CONSTRAINT fk_complaints_block FOREIGN KEY (hostel_block) 
      REFERENCES hostel_blocks(block_name) ON UPDATE CASCADE,
  CONSTRAINT fk_complaints_severity FOREIGN KEY (severity) 
      REFERENCES performance_policies(severity) ON UPDATE CASCADE,
  CONSTRAINT chk_complaints_status CHECK (status IN (
      'Open', 'Acknowledged', 'Assigned',
      'Escalated-L1', 'Escalated-L2', 'Escalated-L3', 'Escalated-L4',
      'Resolved', 'Closed', 'Withdrawn'
  ))
);


-- 2.3 Assignments Table (Work Queue)
-- Concept: Many-to-One relationships linking staff members and complaints.
DROP TABLE IF EXISTS assignments;
CREATE TABLE assignments (
  assignment_id       INT AUTO_INCREMENT,
  app_assignment_key  VARCHAR(50) NULL UNIQUE,
  complaint_id        VARCHAR(20) NOT NULL,
  staff_id            INT         NOT NULL,
  assigned_at         DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status              VARCHAR(20) NOT NULL DEFAULT 'active',

  CONSTRAINT pk_assignments PRIMARY KEY (assignment_id),
  CONSTRAINT fk_asg_complaint FOREIGN KEY (complaint_id) 
      REFERENCES complaints(complaint_id) ON DELETE CASCADE,
  CONSTRAINT fk_asg_staff FOREIGN KEY (staff_id) 
      REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT chk_asg_status CHECK (status IN ('active', 'reassigned'))
);


-- 2.4 Escalation Events Table (Audit History)
-- Concept: Temporal tracking of lifecycle transitions and escalation matrix stages.
DROP TABLE IF EXISTS escalation_events;
CREATE TABLE escalation_events (
  escalation_id         INT AUTO_INCREMENT,
  app_escalation_key    VARCHAR(50)  NULL UNIQUE,
  complaint_id          VARCHAR(20)  NOT NULL,
  level                 INT          NOT NULL,
  escalated_to_role     VARCHAR(30)  NOT NULL,
  reason                VARCHAR(255) NOT NULL,
  triggered_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_manual             BOOLEAN      NOT NULL DEFAULT FALSE,
  actor_username        VARCHAR(30)  NULL,
  acknowledged          BOOLEAN      NOT NULL DEFAULT FALSE,
  ack_by                VARCHAR(30)  NULL,
  decision              VARCHAR(255) NULL,
  decision_reason       TEXT         NULL,

  CONSTRAINT pk_escalations PRIMARY KEY (escalation_id),
  CONSTRAINT fk_esc_complaint FOREIGN KEY (complaint_id) 
      REFERENCES complaints(complaint_id) ON DELETE CASCADE
);


-- 2.5 Feedback Table (Student Ratings & Reopen Requests)
-- Concept: Domain Integrity (rating between 1 and 5), Referential Integrity.
DROP TABLE IF EXISTS feedback;
CREATE TABLE feedback (
  feedback_id       INT AUTO_INCREMENT,
  app_feedback_key  VARCHAR(50) NULL UNIQUE,
  complaint_id      VARCHAR(20) NOT NULL,
  resident_id       INT         NOT NULL,
  rating            INT         NULL,
  reopened          BOOLEAN     NOT NULL DEFAULT FALSE,
  submitted_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_feedback PRIMARY KEY (feedback_id),
  CONSTRAINT fk_fb_complaint FOREIGN KEY (complaint_id) 
      REFERENCES complaints(complaint_id) ON DELETE CASCADE,
  CONSTRAINT fk_fb_resident FOREIGN KEY (resident_id) 
      REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT chk_feedback_rating CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5))
);


-- 2.6 Notifications Table
-- Concept: Event notification queue using standard text representation for payload.
DROP TABLE IF EXISTS notifications;
CREATE TABLE notifications (
  notification_id      INT AUTO_INCREMENT,
  app_notification_key VARCHAR(50)  NULL UNIQUE,
  recipient_role       VARCHAR(30)  NOT NULL,
  recipient_block      VARCHAR(20)  NULL,
  type                 VARCHAR(40)  NOT NULL,
  payload              TEXT         NOT NULL,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_read              BOOLEAN      NOT NULL DEFAULT FALSE,

  CONSTRAINT pk_notifications PRIMARY KEY (notification_id),
  CONSTRAINT fk_notif_block FOREIGN KEY (recipient_block) 
      REFERENCES hostel_blocks(block_name) ON UPDATE CASCADE ON DELETE SET NULL
);


-- 2.7 Audit Events Table
-- Concept: Append-only compliance and accountability ledger.
DROP TABLE IF EXISTS audit_events;
CREATE TABLE audit_events (
  audit_id         BIGINT AUTO_INCREMENT,
  correlation_id   VARCHAR(60) NOT NULL,
  actor            VARCHAR(80) NOT NULL,
  action           VARCHAR(60) NOT NULL,
  target           VARCHAR(60) NOT NULL,
  outcome          VARCHAR(30) NOT NULL,
  metadata         TEXT        NULL,
  event_time       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_audit_events PRIMARY KEY (audit_id)
);

SET FOREIGN_KEY_CHECKS = 1;


-- =====================================================================
-- SECTION 3: INDEXING (QUERY OPTIMIZATION)
-- Concept: B-Tree Secondary Indexes to avoid table scans on high-traffic fields.
-- =====================================================================

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_block ON users(hostel_block);

CREATE INDEX idx_complaints_status ON complaints(status);
CREATE INDEX idx_complaints_block ON complaints(hostel_block);
CREATE INDEX idx_complaints_severity ON complaints(severity);
CREATE INDEX idx_complaints_resident ON complaints(resident_id);

CREATE INDEX idx_assignments_complaint ON assignments(complaint_id);
CREATE INDEX idx_assignments_staff ON assignments(staff_id, status);

CREATE INDEX idx_escalations_complaint ON escalation_events(complaint_id);
CREATE INDEX idx_feedback_complaint ON feedback(complaint_id);
CREATE INDEX idx_notifications_role ON notifications(recipient_role, is_read);
CREATE INDEX idx_audit_correlation ON audit_events(correlation_id);
CREATE INDEX idx_audit_time ON audit_events(event_time);


-- =====================================================================
-- SECTION 4: DATABASE VIEWS (DATA ABSTRACTION & REPORTING)
-- =====================================================================

-- 4.1 Summary Analytics View
-- Demonstrates: Aggregate functions (COUNT, SUM), CASE expressions, and GROUP BY.
CREATE OR REPLACE VIEW v_complaint_summary AS
SELECT
  hostel_block,
  severity,
  status,
  COUNT(*) AS total_complaints,
  SUM(CASE WHEN status IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) AS resolved_count,
  SUM(CASE WHEN status LIKE 'Escalated%' THEN 1 ELSE 0 END) AS escalated_count,
  SUM(CASE WHEN breach_flag = 1 THEN 1 ELSE 0 END) AS breached_count
FROM complaints
GROUP BY hostel_block, severity, status;


-- 4.2 Active Complaints View
-- Demonstrates: Multi-table INNER JOIN providing simplified operational view for wardens.
CREATE OR REPLACE VIEW v_active_complaints AS
SELECT
  c.complaint_id,
  u.name AS resident_name,
  u.username AS student_id,
  c.hostel_block,
  c.room_no,
  c.category,
  c.severity,
  c.status,
  c.level,
  c.current_authority_role,
  c.created_at,
  c.resolution_due
FROM complaints c
JOIN users u ON c.resident_id = u.user_id
WHERE c.status NOT IN ('Resolved', 'Closed', 'Withdrawn');


-- 4.3 Staff Workload View
-- Demonstrates: Analytical aggregation to monitor maintenance team ticket allocation.
CREATE OR REPLACE VIEW v_staff_workload AS
SELECT
  u.user_id,
  u.name AS staff_name,
  COUNT(a.assignment_id) AS total_assigned_tasks,
  SUM(CASE WHEN a.status = 'active' THEN 1 ELSE 0 END) AS active_tasks
FROM users u
LEFT JOIN assignments a ON u.user_id = a.staff_id
WHERE u.role = 'maintenance_staff'
GROUP BY u.user_id, u.name;


-- =====================================================================
-- SECTION 5: DATABASE TRIGGERS (AUTOMATED ACTIONS & DATA INTEGRITY)
-- =====================================================================

DELIMITER //

-- 5.1 Trigger: Automatic Audit Logging on New Complaint Insertion
-- Demonstrates: AFTER INSERT Trigger maintaining an automatic security trail.
DROP TRIGGER IF EXISTS trg_complaint_audit_insert //
CREATE TRIGGER trg_complaint_audit_insert
AFTER INSERT ON complaints
FOR EACH ROW
BEGIN
  INSERT INTO audit_events (correlation_id, actor, action, target, outcome, metadata, event_time)
  VALUES (
    CONCAT('corr_', NEW.complaint_id, '_', UNIX_TIMESTAMP()),
    CONCAT('resident_id:', NEW.resident_id),
    'COMPLAINT_CREATED',
    NEW.complaint_id,
    'SUCCESS',
    CONCAT('{"block":"', NEW.hostel_block, '","severity":"', NEW.severity, '"}'),
    NOW()
  );
END //

-- 5.2 Trigger: Before Feedback Validation
-- Demonstrates: BEFORE INSERT Trigger enforcing domain integrity rules.
DROP TRIGGER IF EXISTS trg_feedback_validation //
CREATE TRIGGER trg_feedback_validation
BEFORE INSERT ON feedback
FOR EACH ROW
BEGIN
  IF NEW.rating IS NOT NULL AND (NEW.rating < 1 OR NEW.rating > 5) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Integrity violation: Rating must be an integer between 1 and 5.';
  END IF;
END //

DELIMITER ;


-- =====================================================================
-- SECTION 6: STORED PROCEDURES & ACID TRANSACTION PROOF
-- =====================================================================

DELIMITER //

-- 6.1 Stored Procedure: Assign Staff to Complaint with ACID Transaction
-- Demonstrates:
--   - Atomicity: Both complaint status update and assignment row insertion succeed or fail together.
--   - Consistency: Checks that complaint exists and is in a valid state before assignment.
--   - Isolation: Transaction boundary controls concurrent modification.
--   - Durability: Committed changes remain persistent in the database.
DROP PROCEDURE IF EXISTS sp_assign_complaint_transaction //
CREATE PROCEDURE sp_assign_complaint_transaction(
  IN in_complaint_id VARCHAR(20),
  IN in_staff_id INT,
  IN in_assignment_key VARCHAR(50)
)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    -- Roll back all operations if any error occurs (Atomicity)
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  -- 1. Insert new assignment
  INSERT INTO assignments (app_assignment_key, complaint_id, staff_id, assigned_at, status)
  VALUES (in_assignment_key, in_complaint_id, in_staff_id, NOW(), 'active');

  -- 2. Update complaint status to Assigned
  UPDATE complaints
  SET status = 'Assigned',
      current_authority_role = 'maintenance_staff'
  WHERE complaint_id = in_complaint_id;

  -- 3. Log the assignment event in the audit trail
  INSERT INTO audit_events (correlation_id, actor, action, target, outcome, metadata, event_time)
  VALUES (
    CONCAT('assign_', in_complaint_id, '_', UNIX_TIMESTAMP()),
    CONCAT('staff_id:', in_staff_id),
    'COMPLAINT_ASSIGNED',
    in_complaint_id,
    'SUCCESS',
    '{"assigned_by":"system_proc"}',
    NOW()
  );

  COMMIT;
END //

-- 6.2 Stored Procedure: Parameterized Retrieval of Complaints by Block
-- Demonstrates: Stored procedure with input parameters and joined output.
DROP PROCEDURE IF EXISTS sp_get_complaints_by_block //
CREATE PROCEDURE sp_get_complaints_by_block(
  IN in_block_name VARCHAR(20)
)
BEGIN
  SELECT
    c.complaint_id,
    u.name AS resident_name,
    c.room_no,
    c.category,
    c.severity,
    c.status,
    c.created_at
  FROM complaints c
  JOIN users u ON c.resident_id = u.user_id
  WHERE c.hostel_block = in_block_name
  ORDER BY c.created_at DESC;
END //

DELIMITER ;


-- =====================================================================
-- SECTION 7: DML — INITIAL SEED DATA
-- Preserves exact credentials and identifiers required by the application.
-- =====================================================================

INSERT INTO users (app_user_key, name, username, password_hash, email, role, room_no, hostel_block, status) VALUES
  ('u_admin',   'Admin Office',        'AD900001', 'admin123',    'admin@hostelcare.edu',    'admin',             NULL,    NULL,      'active'),
  ('u_res1',    'Rahul Sharma',        'TY123456', 'resident123', 'rahul@college.edu',       'resident',          'B-204', 'Block B', 'active'),
  ('u_res2',    'Ananya Iyer',         'TY123457', 'resident123', 'ananya@college.edu',      'resident',          'A-110', 'Block A', 'active'),
  ('u_staff1',  'Suresh Patil',        'ST200001', 'staff123',    'suresh@hostelcare.edu',   'maintenance_staff', NULL,    NULL,      'active'),
  ('u_staff2',  'Meena Kulkarni',      'ST200002', 'staff123',    'meena@hostelcare.edu',    'maintenance_staff', NULL,    NULL,      'active'),
  ('u_ward_a',  'Prakash Rane',        'WD300001', 'warden123',   'prakash@hostelcare.edu',  'warden',            NULL,    'Block A', 'active'),
  ('u_ward_b',  'Sunita Deshmukh',     'WD300002', 'warden123',   'sunita@hostelcare.edu',   'warden',            NULL,    'Block B', 'active'),
  ('u_dep1',    'Kiran Joshi',         'WD400001', 'warden123',   'kiran@hostelcare.edu',    'deputy_warden',     NULL,    NULL,      'active'),
  ('u_chief1',  'Dr. Vikram Nair',     'WD500001', 'warden123',   'vikram@hostelcare.edu',   'chief_warden',      NULL,    NULL,      'active'),
  ('u_dean1',   'Dr. Leela Menon',     'WD600001', 'warden123',   'leela@hostelcare.edu',    'dean',              NULL,    NULL,      'active'),
  ('u_dir1',    'Dr. A. Fernandes',    'WD700001', 'warden123',   'fernandes@hostelcare.edu','director',          NULL,    NULL,      'active');

-- Sample Complaints (representing various lifecycle stages)
INSERT INTO complaints (complaint_id, resident_id, category, severity, hostel_block, room_no, description, evidence_name, status, level, current_authority_role, acknowledged, acknowledged_at, created_at, response_due, resolution_due, resolved_at, resolution_note, breach_flag, version, idempotency_key) VALUES
  ('HC-2026-000101', 2, 'Electrical', 'High', 'Block B', 'B-204', 'Ceiling fan is making abnormal loud rattling noise and running at very low speed.', 'fan_noise.jpg', 'Assigned', 1, 'maintenance_staff', 1, '2026-09-09 10:00:00', '2026-09-09 09:30:00', '2026-09-09 11:30:00', '2026-09-10 09:30:00', NULL, NULL, 0, 1, 'idemp_001'),
  ('HC-2026-000102', 3, 'Plumbing / Water', 'Medium', 'Block A', 'A-110', 'Bathroom tap leaking continuously, causing water wastage and low pressure.', NULL, 'Open', 1, 'warden', 0, NULL, '2026-09-09 14:00:00', '2026-09-09 20:00:00', '2026-09-11 14:00:00', NULL, NULL, 0, 1, 'idemp_002'),
  ('HC-2026-000103', 2, 'Internet / Wi-Fi', 'Low', 'Block B', 'B-204', 'Wi-Fi router on 2nd floor dropping connection frequently during evening hours.', NULL, 'Resolved', 1, 'warden', 1, '2026-09-08 11:00:00', '2026-09-08 10:00:00', '2026-09-08 22:00:00', '2026-09-11 10:00:00', '2026-09-09 09:00:00', 'Rebooted access point, replaced RJ45 connector, and verified speed.', 0, 1, 'idemp_003'),
  ('HC-2026-000104', 3, 'Security', 'Critical', 'Block A', 'A-110', 'Main entrance digital door lock malfunctioned and not latching properly.', NULL, 'Escalated-L1', 1, 'chief_warden', 1, '2026-09-09 18:15:00', '2026-09-09 18:00:00', '2026-09-09 18:30:00', '2026-09-10 00:00:00', NULL, NULL, 0, 1, 'idemp_004');

-- Sample Staff Assignments
INSERT INTO assignments (app_assignment_key, complaint_id, staff_id, assigned_at, status) VALUES
  ('asg_001', 'HC-2026-000101', 4, '2026-09-09 10:15:00', 'active');

-- Sample Escalation Event
INSERT INTO escalation_events (app_escalation_key, complaint_id, level, escalated_to_role, reason, triggered_at, is_manual, actor_username, acknowledged, ack_by) VALUES
  ('esc_001', 'HC-2026-000104', 1, 'chief_warden', 'Critical security lock failure requires urgent senior administration intervention', '2026-09-09 18:35:00', 0, 'system', 0, NULL);

-- Sample Student Feedback
INSERT INTO feedback (app_feedback_key, complaint_id, resident_id, rating, reopened, submitted_at) VALUES
  ('fb_001', 'HC-2026-000103', 2, 5, 0, '2026-09-09 10:00:00');

-- Sample Notifications
INSERT INTO notifications (app_notification_key, recipient_role, recipient_block, type, payload, created_at, is_read) VALUES
  ('ntf_001', 'resident', 'Block B', 'ASSIGNMENT', '{"complaint_id":"HC-2026-000101","message":"Staff Suresh Patil assigned to your complaint."}', '2026-09-09 10:15:00', 0),
  ('ntf_002', 'warden', 'Block A', 'ESCALATION', '{"complaint_id":"HC-2026-000104","message":"Critical complaint escalated to Chief Warden."}', '2026-09-09 18:35:00', 0);



-- =====================================================================
-- SECTION 8: SAMPLE DQL QUERIES FOR LAB VIVA & PROJECT PRESENTATION
-- Use these queries to prove and demonstrate DBMS concepts to evaluators:
-- =====================================================================

-- 8.1 Proving Referential Integrity (INNER JOIN across multiple tables):
-- SELECT c.complaint_id, u.name AS student, c.category, c.severity, c.status
-- FROM complaints c
-- INNER JOIN users u ON c.resident_id = u.user_id
-- WHERE c.status = 'Open';

-- 8.2 Proving Aggregation and Filtering (GROUP BY with HAVING):
-- SELECT hostel_block, COUNT(*) AS complaint_count
-- FROM complaints
-- GROUP BY hostel_block
-- HAVING COUNT(*) > 0
-- ORDER BY complaint_count DESC;

-- 8.3 Proving Subquery Usage:
-- SELECT name, username, room_no
-- FROM users
-- WHERE user_id IN (
--   SELECT resident_id FROM complaints WHERE severity = 'Critical'
-- );

-- 8.4 Proving Outer Join (LEFT JOIN):
-- SELECT u.name, u.role, a.assignment_id, a.complaint_id
-- FROM users u
-- LEFT JOIN assignments a ON u.user_id = a.staff_id
-- WHERE u.role = 'maintenance_staff';

-- 8.5 Calling Stored Procedure:
-- CALL sp_get_complaints_by_block('Block A');
