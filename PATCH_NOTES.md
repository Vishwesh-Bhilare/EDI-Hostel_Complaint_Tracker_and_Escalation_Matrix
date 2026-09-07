# Relational Persistence Upgrade Notes

## Requested change

The previous persistence patch solved restart persistence, but it stored each
complete `hc_*` collection as one JSON value in the `app_state` table.

This upgrade keeps the established frontend/business-logic architecture while
moving entity persistence into the normalized tables that already exist in the
project schema.

## Architecture preserved

Unchanged:

- all HTML pages and dashboard flows;
- all public `HC.*` function names and their callers;
- complaint/escalation business logic in `js/api.js`;
- `/api/state/<key>` as the low-level browser-to-Java contract;
- numeric MySQL primary keys and existing foreign-key relationships.

JSON is now only the HTTP serialization format between JavaScript and Java.
It is not used as the database container for users, complaints, assignments,
escalations, or feedback.

## Database mapping

- `hc_users` -> `users`
- `hc_complaints` -> `complaints`
- `hc_assignments` -> `assignments`
- `hc_escalations` -> `escalation_events`
- `hc_feedback` -> `feedback`
- `hc_notifications` -> `notifications`
- `hc_audit` -> `audit_events`
- `hc_seeded_v2` -> derived from whether `users` contains rows (no table/row)

Compatibility-key columns were added to entities whose SQL primary key is an
auto-increment integer but whose existing frontend ID is a string:

- `users.app_user_key`
- `assignments.app_assignment_key`
- `escalation_events.app_escalation_key`
- `feedback.app_feedback_key`
- `notifications.app_notification_key`

These keys prevent a frontend rewrite while SQL relationships continue using
`users.user_id`, `assignments.staff_id`, `complaints.resident_id`, etc.

## Automatic migration of your current data

If the old `app_state` table exists, server startup migrates its data in this
order:

1. users
2. complaints
3. assignments
4. escalations
5. feedback
6. notifications
7. audit events

The migration upserts records into the relational tables, then drops
`app_state` only after the import completes successfully. If an error occurs,
startup fails and the old table is retained.

The low-level JavaScript storage helper also removes legacy persistent `hc_*`
localStorage copies after MySQL becomes authoritative. Session/testing-mode
keys remain local intentionally.

## Files changed in this upgrade

- `jdbc/HostelCareServer.java`
- `js/api.js` (storage helper only; business logic unchanged)
- `sql/hostelcare_schema.sql`
- `README.md`
- `PATCH_NOTES.md`

No HTML or CSS file was changed. `DBConnection.java`, `run.bat`, and `run.sh`
remain compatible and required no additional architectural changes.

## Important upgrade instruction

If you already used the previous fixed version and have data in
`hostelcare_db.app_state`, **do not run the schema SQL again**. Simply extract
this project over/alongside the previous project and start `run.bat`. The Java
server performs the non-destructive upgrade against the existing database.

`sql/hostelcare_schema.sql` is for a fresh database installation.

## Verification queries

After starting the upgraded project:

```sql
USE hostelcare_db;

-- Registered accounts should be individual rows.
SELECT user_id, app_user_key, name, username, role, hostel_block, status
FROM users
ORDER BY user_id;

-- Complaints should be individual rows with a real users.user_id FK.
SELECT complaint_id, resident_id, category, severity, status,
       current_authority_role, created_at
FROM complaints
ORDER BY created_at DESC;

SELECT assignment_id, app_assignment_key, complaint_id, staff_id, status
FROM assignments
ORDER BY assignment_id DESC;

SELECT escalation_id, app_escalation_key, complaint_id, level,
       escalated_to_role, reason, triggered_at
FROM escalation_events
ORDER BY escalation_id DESC;

SELECT feedback_id, app_feedback_key, complaint_id, resident_id, rating, reopened
FROM feedback
ORDER BY feedback_id DESC;

-- The legacy whole-state JSON table should be gone.
SHOW TABLES LIKE 'app_state';
```

## Validation performed here

- `HostelCareServer.java` compiles with the included MySQL Connector/J jar.
- `js/api.js` passes Node JavaScript syntax validation.
- The edited project retains the same page-level `HC.*` API.

A live MySQL round-trip cannot be executed in this sandbox because there is no
MySQL server installed here. The final migration/record verification therefore
needs to be exercised against your existing local `hostelcare_db` when you run
`run.bat`.

## Scope/security note

This task intentionally changes storage, not authentication architecture. The
current frontend still compares the password value itself, so the existing
`password_hash` column temporarily holds that compatible value. Backend login +
salted password hashing should be a separate pass.

The schema's existing `notifications.payload` and `audit_events.metadata`
columns remain JSON fields because they are intentionally semi-structured
columns within otherwise relational records. The former `app_state` collection
storage is removed.
