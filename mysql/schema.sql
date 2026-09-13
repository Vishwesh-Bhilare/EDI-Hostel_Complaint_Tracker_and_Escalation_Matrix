-- Hostel Complaint Tracker - MySQL Schema
-- Basic tables only (no views/triggers/stored procedures)

CREATE DATABASE IF NOT EXISTS hostelcare;
USE hostelcare;

-- ===================================================
-- USERS (students, wardens, maintenance staff, admin)
-- ===================================================
CREATE TABLE users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  role       ENUM('student', 'warden', 'maintenance', 'admin') NOT NULL,
  prn        VARCHAR(20) UNIQUE,          -- only for students
  email      VARCHAR(100) UNIQUE,         -- only for students
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
-- ===================================================
CREATE TABLE complaints (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  title             VARCHAR(150) NOT NULL,
  category          VARCHAR(50) NOT NULL,
  priority          ENUM('High', 'Moderate', 'Low', 'Undetermined') NOT NULL,
  description       TEXT,
  photo             VARCHAR(255),          -- path/URL to uploaded photo
  completion_photo  VARCHAR(255),          -- path/URL to maintenance completion photo
  status            ENUM('Pending', 'Assigned', 'Under Review', 'Resolved') NOT NULL DEFAULT 'Pending',
  student_id        INT NOT NULL,          -- who filed it
  assigned_to       INT,                   -- maintenance staff (nullable until assigned)
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (student_id) REFERENCES users(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id)
);

-- ===================================================
-- COMPLAINT HISTORY / TIMELINE (one row per status change)
-- ===================================================
CREATE TABLE complaint_history (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id  INT NOT NULL,
  note          VARCHAR(255) NOT NULL,     -- e.g. "Assigned to Maintenance Staff A by Warden A"
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (complaint_id) REFERENCES complaints(id)
);

-- ===================================================
-- Optional seed data matching the frontend demo accounts
-- ===================================================
INSERT INTO users (name, role, prn, email, password, block, room) VALUES
  ('Tushar', 'student', 'B24CE1001', 'tushar@mmcoe.edu.in', 'password123', 'Devgiri Boys Hostel', 'B-204'),
  ('Mahesh', 'student', 'B24CE1002', 'mahesh@mmcoe.edu.in', 'password123', 'Devgiri Boys Hostel', 'B-118');

INSERT INTO users (name, role) VALUES
  ('Warden A', 'warden'),
  ('Maintenance Staff A', 'maintenance'),
  ('Maintenance Staff B', 'maintenance'),
  ('Admin', 'admin');