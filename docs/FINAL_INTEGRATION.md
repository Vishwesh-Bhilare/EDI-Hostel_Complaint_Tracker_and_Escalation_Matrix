# Final integration

`final_integration` combines `dev-branch-Sahil` (`bcf78ca`) with
`distributed-system` (`60044e7`). Both branches remain in the merge history.

## Preserved application behavior

- 16 reusable HTTP workers, a bounded queue of 256 connections, socket read
  timeouts, and HTTP 503 when the queue is full.
- A separate pool of two email workers and a bounded queue of 128 jobs, with
  queued/sent/failed notification auditing.
- Complaint grouping by hostel/category, priority promotion at 21 unresolved
  reports, Hygiene default Medium, shorter SLA windows, acknowledgement and
  overdue/manual escalation.
- Snapshot loading, bounded frontend priority updates, SQL timestamp handling,
  the Windows launcher, repeatable migrations, and ignored local settings.

## Integrated changes

The distributed-system branch adds JDBC connection pooling and concurrency
tests. Its proposed ten HTTP workers are reconciled with our existing sixteen.

`jdbc/DBConnection.java` lazily opens up to five physical MySQL connections.
HTTP and mail workers borrow from this shared pool. These five connections are
database sessions, not five more worker threads. A worker can wait up to three
seconds for a slot; exhaustion produces a database connection timeout.

Calling `close()` on a borrowed connection returns it to the pool. The integrated
implementation prevents double returns, rejects operations on a returned lease,
rolls back uncommitted transactions, restores auto-commit/read-only/catalog/
isolation settings, and replaces broken connections. Failed connection creation
releases its slot so later requests can try again. Existing try-with-resources
database callers continue to work without changes.

`jdbc/RequestHandler.java` includes the incoming worker-name logging behind
`HOSTELCARE_DEBUG_REQUESTS=true`. Logging is off by default. `jdbc/TcpServer.java`
prints the HTTP, mail and JDBC pool sizes at startup.

No database schema change is required for connection pooling. Existing feature
migrations still run through the launcher. Database and SMTP credentials remain
in ignored `.local/hostelcare.json` or environment variables.

## Validation

- Java compilation, 16 complaint workflow tests and nine Python launcher tests.
- `JdbcPoolTest.java`: ten concurrent tasks use at most five physical database
  connections, with connection reuse verified.
- `tests/JdbcPoolRegressionTest.java`: slot limits, timeout, double close, closed
  leases, interruption, transaction rollback, session reset and broken connection
  replacement against a disposable database.
- `ConcurrencyTest.java`: 100 simultaneous static GET requests and 100 simultaneous
  API snapshot requests, with no failures.
- `tests/browser-smoke.cjs`: all sixteen HTTP worker names observed; existing
  grouping, 21-report priority promotion, acknowledgement, resolution, filters,
  mobile/dark layout, student overdue escalation and background mail checks pass.

The browser smoke suite creates and removes its own uniquely named test database;
it does not change the application's database and disables real email delivery.
It also runs the JDBC and HTTP concurrency checks above.

After compiling the Java sources and these root test classes into `build`, the
HTTP test can also target an already running local server:

```powershell
java -cp "build;jdbc/mysql-connector-j-26.7.0.jar" ConcurrencyTest http://localhost:8080/ 100
java -cp "build;jdbc/mysql-connector-j-26.7.0.jar" ConcurrencyTest http://localhost:8080/api 100 snapshot
```

The numbers are concurrency checks on the local machine, not a production
capacity guarantee. JDBC pooling reuses connections; sustained database-heavy
traffic can still wait for the five available database slots.
