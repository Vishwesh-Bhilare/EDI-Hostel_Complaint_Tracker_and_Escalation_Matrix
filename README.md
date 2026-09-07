# HostelCare — Hostel Complaint Tracker & Escalation Matrix

This repository contains the HostelCare frontend prototype plus a lightweight
Java/JDBC server.

## Current persistence design

The frontend's existing `HC.*` business-logic API is preserved. The browser
still exchanges JSON with `/api/state/<key>` because JSON is a convenient HTTP
serialization format, but **application entities are no longer stored as JSON
collections in MySQL**.

The Java server maps those collections to the normalized relational tables:

| Application data | MySQL table |
| --- | --- |
| users / registered accounts | `users` |
| complaints | `complaints` |
| staff assignments | `assignments` |
| escalation history | `escalation_events` |
| resident feedback | `feedback` |
| notifications | `notifications` |
| audit events | `audit_events` |

The existing numeric SQL primary/foreign keys remain intact. Small
`app_*_key` compatibility columns retain the string IDs already used by the
frontend, so the pages and `HC.*` functions do not need an architectural
rewrite.

The active login session and testing-mode toggle remain in browser
`localStorage`. Persistent entity collections are removed from localStorage
after a successful database read/write; localStorage is only used as an
offline/one-time migration fallback.

## Upgrading from the previous `app_state` persistence patch

**Do not re-import `sql/hostelcare_schema.sql` over your existing database.**
That file is a fresh-install schema script and contains `DROP TABLE` statements.

Instead:

1. Replace/extract the updated project files.
2. Keep your existing `hostelcare_db` database exactly as it is.
3. Start the project normally with `run.bat` or `run.sh`.

On startup `HostelCareServer.java` automatically:

1. adds the small compatibility-key columns if your existing tables predate
   this version;
2. reads the old `app_state` collections if that legacy table exists;
3. imports/upserts them into the correct relational tables in dependency order;
4. drops `app_state` only after the migration succeeds.

If migration fails, startup stops with an error and the legacy `app_state`
table is left intact rather than silently discarding it.

## Fresh database setup

For a brand-new MySQL database, import the schema once:

```bash
mysql -u root -p < sql/hostelcare_schema.sql
```

After that, start the application through the Java server rather than opening
HTML files directly.

## Requirements

- Java JDK 17 or newer (`java` and `javac` on PATH)
- MySQL 8.x running locally or reachable over TCP
- included MySQL Connector/J jar in `jdbc/`

## Database configuration

Defaults:

- URL: `jdbc:mysql://localhost:3306/hostelcare_db`
- user: `root`
- password: blank
- web port: `8000`

Optional environment variables:

- `HOSTELCARE_DB_URL`
- `HOSTELCARE_DB_USER`
- `HOSTELCARE_DB_PASSWORD`
- `HOSTELCARE_PORT`

Windows Command Prompt example:

```bat
set HOSTELCARE_DB_USER=root
set HOSTELCARE_DB_PASSWORD=your_mysql_password
run.bat
```

PowerShell example:

```powershell
$env:HOSTELCARE_DB_USER = "root"
$env:HOSTELCARE_DB_PASSWORD = "your_mysql_password"
.\run.bat
```

## Start the project

### Windows

Double-click `run.bat`, or run:

```bat
run.bat
```

### macOS / Linux

```bash
./run.sh
```

Then open:

```text
http://localhost:8000/
```

Do **not** launch `index.html` directly and do not use
`python -m http.server`. Those methods bypass the JDBC server.

## Verify the relational records

After registering a new resident:

```sql
USE hostelcare_db;

SELECT user_id, app_user_key, name, username, email, role,
       room_no, hostel_block, status, created_at
FROM users
ORDER BY user_id;
```

After submitting complaints:

```sql
SELECT complaint_id, resident_id, category, severity,
       hostel_block, room_no, status, level,
       current_authority_role, created_at
FROM complaints
ORDER BY created_at DESC;
```

Assignments and escalation history:

```sql
SELECT * FROM assignments ORDER BY assignment_id DESC;
SELECT * FROM escalation_events ORDER BY escalation_id DESC;
SELECT * FROM feedback ORDER BY feedback_id DESC;
```

The old JSON state table should no longer exist after an upgrade migration:

```sql
SHOW TABLES LIKE 'app_state';
```

The result should be empty.

You can also visit:

```text
http://localhost:8000/api/health
```

A healthy upgraded server reports `"storage":"relational"` and
`"legacy_app_state_present":false`.

## Prototype authentication note

The existing application still performs password comparison inside
`js/api.js`. To avoid changing that established architecture in this storage
migration, the current value is persisted in the existing `users.password_hash`
column even though the prototype is not yet performing backend password hashing.
A later authentication/security pass should move login verification into Java
and store only salted password hashes.

The `notifications.payload` and `audit_events.metadata` columns remain MySQL
`JSON` columns because those two semi-structured fields are explicitly part of
the existing relational schema. Notifications and audit events themselves are
individual relational records; there is no longer a JSON collection containing
all users/complaints/etc.

## JDBC connection test only

`jdbc/TestConnection.java` remains available as a low-level connectivity test.
It verifies that a connection can be opened; it does not run the web app.

## Main pages

- `index.html` — login
- `signup.html` — resident signup
- `resident-dashboard.html` — resident dashboard
- `staff-dashboard.html` — maintenance staff dashboard
- `warden-dashboard.html` — authority dashboard
- `admin-dashboard.html` — administration
- `complaint.html` — complaint submission
- `complaint-detail.html` — complaint lifecycle/actions
