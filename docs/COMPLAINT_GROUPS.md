# Complaint grouping and priority policy

Principal screens show one collapsible group per **hostel + category**. Original
student reports, assignments, status changes and audit histories remain separate.
This is category grouping, not natural-language duplicate detection: two issues
in the same category/hostel share a summary even if their descriptions differ.

Only unresolved reports count toward automatic priority. At **21 or more** open
reports in a group, a Low category becomes Medium and a Medium category becomes
High. High stays High and Critical stays Critical. Cleanliness/Hygiene now defaults
to Medium; Security remains Critical. A warden's manual priority is an optional
minimum, so it cannot lower the category/volume priority. Selecting Automatic
removes that manual minimum. If volume drops back to 20, automatic priority drops
to the category default, but already shortened deadlines are never extended.

## Shorter SLA windows

| Severity | Authority response | Resolution | Final escalation |
|---|---:|---:|---:|
| Low | 6 hours | 24 hours | 48 hours |
| Medium | 3 hours | 12 hours | 24 hours |
| High | 1 hour | 6 hours | 12 hours |
| Critical | 15 minutes | 2 hours | 4 hours |

Resolution and final deadlines start at complaint submission. Each authority gets
a fresh response window when the complaint reaches its queue. Priority increases
tighten deadlines from those original timestamps; page reloads do not restart them.
Existing unresolved complaints also adopt the shorter policy on their next load.

Assignment counts as a Warden response. Warden, Chief Warden, College Authority
and Principal also have explicit Acknowledge buttons. Acknowledgement stops
escalation for an unanswered response; unresolved work can still breach resolution
or final deadlines. Maintenance completion does not substitute for an authority's
acknowledgement after a hand-off.

Students can manually escalate their own unresolved complaint after the current
authority's response deadline passes without acknowledgement, with a required
reason. Current authorities can still manually escalate early with a reason.
The chain is Warden (0) → Chief Warden (1) → College Authority (2) → Principal (3).
There is no level beyond Principal. The Principal can acknowledge and resolve
individual final-level reports inside a group, without closing unrelated reports.

The browser refreshes complaints and checks escalation every 30 seconds; student
button eligibility updates every second. This is still a browser-driven scheduler:
at least one application page must be open for automatic checks. Conditional
updates prevent duplicate level changes when another browser has already moved
or acknowledged the complaint. Frontend role guards are not server authentication;
the existing generic CRUD API remains unchanged in that respect.

## Files

- `js/complaint-policy.js`: category defaults, SLA windows, Map grouping and priority rules.
- `js/data.js`: persistence, priority/deadline synchronization, acknowledgement and escalation.
- `js/principal.js`: grouped overview, filtered groups, grouped escalation log, final-level actions.
- `js/student.js`, `js/warden.js`, `js/authority.js`: escalation/acknowledgement controls.
- `js/app.js`: shared acknowledgement UI, refreshing and student deadline controls.
- `mysql/schema.sql`: schema for a new database.
- `mysql/migrate_complaint_groups.sql`: repeatable additive migration for existing databases.
- `mysql/migrate_background_notifications.sql`: adds the queued email audit state.
- `jdbc/JsonToSqlConverter.java`: permits the new columns and preserves SQL date
  strings without a second JVM timezone conversion.
- `jdbc/NotificationDispatcher.java`: a bounded two-worker background mail queue.
- `jdbc/SqlMigration.java`: applies migrations using the backend's own JDBC settings.
- `jdbc/LocalConfig.java`: reads ignored `.local/hostelcare.json` settings with environment overrides.
- `run_all.py`: checks the port, applies migrations, and waits for confirmed server startup.

The migration adds `manual_severity`, `authority_response_due_at` and
`authority_acknowledged`. Existing explicit warden severity corrections are kept
as manual minima. No complaint records are deleted. Apply it to an existing
`hostelcare` database before using the updated frontend. The launcher runs these
files automatically through `SqlMigration` and the same JDBC settings as the backend; a separate
MySQL command-line installation/password is no longer needed. Migration failure
stops startup with a clear error. `python run_all.py --migrate-only` compiles and
applies migrations without starting another server.

Before launching, the script checks whether the configured HTTP port is free.
If another instance owns port 8080, stop its terminal with Ctrl+C before running
`build.bat` again, or set `HOSTELCARE_PORT` to a different port. The launcher prints
the browser URL only after Java confirms that it has opened the listening socket.

## Validation

Run the isolated workflow tests (mocked database, no email):

```text
node --test tests/complaint-workflow.test.cjs
```

`tests/browser-smoke.cjs` tests the real frontend and Java backend against a unique
temporary MySQL database, then removes only that test database. It requires
Playwright, Edge, MySQL and compiled Java classes. Set `NODE_PATH` to your Playwright
installation if needed. Optional `HOSTELCARE_MYSQL_EXE`, `HOSTELCARE_JAVA_EXE` and
`HOSTELCARE_SCREENSHOT_DIR` configure executables and screenshot output. Test
recipients are placeholders and SMTP credentials are disabled.

## Response time and background work

The server now reuses **16 HTTP worker threads** rather than creating a new
thread for every connection. Its request queue holds at most 256 connections;
overload returns HTTP 503. Accepted sockets have a 15-second read timeout.

Real emails run on a separate **two-worker pool** with a queue of up to 128
waiting jobs. `/api` returns after the notification's `queued` audit record is
saved and the job is accepted. The worker later updates that same record to
`sent` or `failed`. The frontend does not label acceptance as delivery. Closing
the browser after acceptance does not cancel the job. This queue is in server
memory, so stopping/restarting the server can interrupt queued mail; it is not
a durable retry service. SMTP connections have a five-second connect timeout.

Dashboard snapshot requests read the required tables through **one HTTP request
and one borrowed JDBC connection**. A separate pool reuses up to five physical
MySQL connections across HTTP and mail workers. A worker waits up to three seconds
for a pool slot; closing its borrowed connection returns it for reuse. See
`docs/FINAL_INTEGRATION.md` for the integrated pool behavior and checks.
Startup uses that snapshot for its initial escalation
check, displays the welcome screen before the sweep completes, and avoids the
old immediate second data load. Independent group-priority writes run with up to
four requests in flight; dependent updates and their history records stay ordered.
Escalation recipients can also be queued concurrently. API requests have a
ten-second timeout, with an instruction to refresh and check whether a timed-out
write completed before trying again.

Open the application at `http://localhost:8080` (or your configured server port),
not by double-clicking `index.html`: relative `/api` requests need the HTTP server.
Opening the HTML file directly now displays a link to the server.

The end-to-end test includes an injected slow sender to prove that mail queue
acceptance returns while delivery threads remain blocked. It also checks queued,
sent and failed states, queue saturation, single-snapshot startup, real browser
operations and direct-file guidance. No real emails are sent by the tests.

## Concepts actually used

- Multithreading: `TcpServer` reuses a 16-thread request pool;
  `RequestHandler implements Runnable` supplies its tasks. `NotificationDispatcher`
  uses a separate two-thread pool so SMTP does not block HTTP responses.
- Bounded FIFO queues: Java `ArrayBlockingQueue` holds pending HTTP/mail work.
- Arrays and linear search: loaded users/complaints and `.find()` lookups.
- Maps: grouping by hostel/category and indexing complaints by ID.
- Sets: unique complaint IDs in authority history (`complaintsEverAtLevel`).
- HashMap/HashSet: Java's table/column whitelist and request/header maps.
- Sorting: priority/escalation ordering using JavaScript `.sort()`.
- Scanning/filtering: status, hostel, ownership and deadline checks.
- No heap, custom tree, graph traversal, or custom sorting algorithm is implemented.
