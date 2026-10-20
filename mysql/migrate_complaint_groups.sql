-- Existing databases only. Additive and safe to re-run; no reports are deleted.
-- MySQL 8.0 does not support ADD COLUMN IF NOT EXISTS, so check metadata first.
USE hostelcare;

SET @add_manual = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'complaints' AND COLUMN_NAME = 'manual_severity');
SET @ddl = IF(@add_manual,
  'ALTER TABLE complaints ADD COLUMN manual_severity ENUM(''Low'',''Medium'',''High'',''Critical'') NULL', 'SELECT 1');
PREPARE migration FROM @ddl;
EXECUTE migration;
DEALLOCATE PREPARE migration;

-- Preserve previously explicit warden corrections, rather than treating every
-- old category default as a manual override (Hygiene now defaults to Medium).
UPDATE complaints c SET c.manual_severity = c.severity
WHERE @add_manual AND EXISTS (SELECT 1 FROM complaint_history h
  WHERE h.complaint_id = c.id AND h.note LIKE 'Severity changed from %');

SET @add_response = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'complaints' AND COLUMN_NAME = 'authority_response_due_at');
SET @ddl = IF(@add_response,
  'ALTER TABLE complaints ADD COLUMN authority_response_due_at TIMESTAMP NULL', 'SELECT 1');
PREPARE migration FROM @ddl;
EXECUTE migration;
DEALLOCATE PREPARE migration;

SET @add_ack = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'complaints' AND COLUMN_NAME = 'authority_acknowledged');
SET @ddl = IF(@add_ack,
  'ALTER TABLE complaints ADD COLUMN authority_acknowledged TINYINT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE migration FROM @ddl;
EXECUTE migration;
DEALLOCATE PREPARE migration;

-- An assignment is a Warden response; it is not a response by a later authority.
UPDATE complaints SET authority_acknowledged = 1
WHERE @add_ack AND (status = 'Resolved' OR (escalation_level = 0 AND status <> 'Pending'));

-- response deadlines and effective priorities are synchronized by initData()
-- using the new policy and existing submission / escalation timestamps.
