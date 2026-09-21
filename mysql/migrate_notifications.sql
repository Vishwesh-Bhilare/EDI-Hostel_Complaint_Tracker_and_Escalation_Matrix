-- Run this once against an EXISTING hostelcare database that predates the
-- notifications feature. (A fresh database should just use schema.sql
-- instead — this file only adds what schema.sql already includes.)
--
-- Idempotent: safe to run more than once. run_all.py also runs this
-- automatically on every startup (best-effort) so a fresh checkout works
-- with nothing more than `python run_all.py`.

USE hostelcare;

CREATE TABLE IF NOT EXISTS notifications (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id  INT NOT NULL,
  role          VARCHAR(30) NOT NULL,
  email         VARCHAR(100) NOT NULL,
  subject       VARCHAR(255) NOT NULL,
  status        ENUM('sent', 'failed', 'skipped') NOT NULL,
  sent_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (complaint_id) REFERENCES complaints(id)
);

UPDATE users SET email = 'warden@replace-me.hostelcare.local'      WHERE role = 'warden'            AND email IS NULL;
UPDATE users SET email = 'chiefwarden@replace-me.hostelcare.local' WHERE role = 'chief_warden'       AND email IS NULL;
UPDATE users SET email = 'authority@replace-me.hostelcare.local'   WHERE role = 'college_authority'  AND email IS NULL;
UPDATE users SET email = 'principal@replace-me.hostelcare.local'   WHERE role = 'principal'          AND email IS NULL;
