-- Hostel Complaint Tracker - MySQL Schema
-- Basic tables only (no views/triggers/stored procedures)

CREATE DATABASE IF NOT EXISTS hostelcare;
USE hostelcare;

-- ===================================================
-- USERS (students, wardens, escalation authorities, maintenance staff, admin)
-- ===================================================
CREATE TABLE users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  role       ENUM('student', 'warden', 'chief_warden', 'college_authority', 'principal', 'maintenance', 'admin') NOT NULL,
  prn        VARCHAR(20) UNIQUE,          -- only for students
  email      VARCHAR(100) UNIQUE,         -- students, and the escalation-chain
                                           -- staff roles (see seed data below)
  password   VARCHAR(255),                -- store a hash, not plain text
  block      VARCHAR(100),                -- hostel block (students)
  room       VARCHAR(20)                  -- room number (students)
);

-- ===================================================
-- PENDING REGISTRATIONS (student signups awaiting admin approval)
-- ===================================================
CREATE TABLE pending_registrations (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  name              VARCHAR(100) NOT NULL,
  prn               VARCHAR(20) NOT NULL,
  email             VARCHAR(100) NOT NULL,
  password          VARCHAR(255) NOT NULL,
  block             VARCHAR(100) NOT NULL,
  status            ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  rejection_reason  VARCHAR(255),
  requested_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===================================================
-- COMPLAINTS
-- severity drives the SLA policy (response/resolution due-by) and therefore
-- the escalation matrix. It defaults from category at creation time but the
-- warden may correct it (e.g. a student picking an inflated category for a
-- minor issue) via updateComplaintSeverity() in js/data.js.
-- ===================================================
CREATE TABLE complaints (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  title               VARCHAR(150) NOT NULL,
  category            VARCHAR(50) NOT NULL,
  severity            ENUM('Low', 'Medium', 'High', 'Critical') NOT NULL,
  description         TEXT,
  photo               VARCHAR(255),          -- path/URL to uploaded photo
  completion_photo    VARCHAR(255),          -- path/URL to maintenance completion photo
  status              ENUM('Pending', 'Assigned', 'Under Review', 'Resolved') NOT NULL DEFAULT 'Pending',
  student_id          INT NOT NULL,          -- who filed it
  hostel_block        VARCHAR(100),          -- bound from the student's block at creation
  assigned_to         INT,                   -- maintenance staff (nullable until assigned)
  escalation_level    TINYINT NOT NULL DEFAULT 0,  -- 0=Warden, 1=Chief Warden, 2=College Authority, 3=Principal
  response_due_at     TIMESTAMP NULL,        -- SLA: must be assigned/acknowledged by this time
  resolution_due_at   TIMESTAMP NULL,        -- SLA: must be resolved by this time
  final_due_at        TIMESTAMP NULL,        -- last-resort threshold: escalate all the way to Principal
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (student_id) REFERENCES users(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id)
);

-- ===================================================
-- COMPLAINT HISTORY / TIMELINE (one row per status/severity/escalation change)
-- ===================================================
CREATE TABLE complaint_history (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id  INT NOT NULL,
  note          VARCHAR(255) NOT NULL,     -- e.g. "Assigned to Maintenance Staff A by Warden A"
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (complaint_id) REFERENCES complaints(id)
);

-- ===================================================
-- ESCALATIONS (audit trail of every level change - the SRS's EscalationEvent)
-- ===================================================
CREATE TABLE escalations (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id       INT NOT NULL,
  level              TINYINT NOT NULL,          -- 1, 2 or 3
  escalated_to_role  VARCHAR(30) NOT NULL,       -- chief_warden | college_authority | principal
  reason             VARCHAR(255) NOT NULL,      -- "SLA breach (auto)" or a manual override reason
  triggered_by       VARCHAR(20) NOT NULL DEFAULT 'system', -- 'system' or a user id, for manual escalations
  triggered_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (complaint_id) REFERENCES complaints(id)
);

-- ===================================================
-- NOTIFICATIONS (audit trail of escalation emails — what was sent/skipped)
-- Purely a log: RequestHandler's "notify" action sends the email itself and
-- doesn't touch this table; js/data.js writes one row per attempt via the
-- normal insert action, same as complaint_history/escalations above.
-- ===================================================
CREATE TABLE notifications (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id  INT NOT NULL,
  role          VARCHAR(30) NOT NULL,       -- chief_warden | college_authority | principal
  email         VARCHAR(100) NOT NULL,
  subject       VARCHAR(255) NOT NULL,
  status        ENUM('sent', 'failed', 'skipped') NOT NULL,
  sent_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (complaint_id) REFERENCES complaints(id)
);

-- ===================================================
-- Optional seed data matching the frontend demo accounts
--
-- The escalation-chain staff (warden/chief_warden/college_authority/
-- principal) get placeholder emails on a domain that can never receive
-- real mail and can never collide with a real address: the "is this a
-- placeholder?" check in js/data.js is just
--   email.endsWith('@replace-me.hostelcare.local')
-- To actually test notifications, UPDATE the relevant row's email to a
-- real address (e.g. your own @mmcoe.edu.in) and leave the rest alone.
-- ===================================================
INSERT INTO users (name, role, prn, email, password, block, room) VALUES
  ('Tushar', 'student', 'B24CE1001', 'tusharborate2024.comp@mmcoe.edu.in', '12345678', 'Devgiri Boys Hostel', 'B-204'),
  ('Mahesh', 'student', 'B24CE1009', 'maheshgaikwad2024.comp@mmcoe.edu.in', '12345678', 'Devgiri Boys Hostel', 'B-118');

INSERT INTO users (name, role, email) VALUES
  ('Warden A', 'warden', 'warden@replace-me.hostelcare.local'),
  ('Chief Warden', 'chief_warden', 'chiefwarden@replace-me.hostelcare.local'),
  ('College Authority', 'college_authority', 'authority@replace-me.hostelcare.local'),
  ('Principal', 'principal', 'principal@replace-me.hostelcare.local');

INSERT INTO users (name, role) VALUES
  ('Maintenance Staff A', 'maintenance'),
  ('Maintenance Staff B', 'maintenance'),
  ('Admin', 'admin');
