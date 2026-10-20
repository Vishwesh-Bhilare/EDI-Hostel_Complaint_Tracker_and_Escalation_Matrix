-- Background email acceptance is distinct from confirmed delivery. Repeatable.
USE hostelcare;
SET @needs_queue_status = (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications'
    AND COLUMN_NAME = 'status' AND COLUMN_TYPE LIKE '%queued%');
SET @ddl = IF(@needs_queue_status,
  'ALTER TABLE notifications MODIFY COLUMN status ENUM(''queued'',''sent'',''failed'',''skipped'') NOT NULL', 'SELECT 1');
PREPARE migration FROM @ddl;
EXECUTE migration;
DEALLOCATE PREPARE migration;
