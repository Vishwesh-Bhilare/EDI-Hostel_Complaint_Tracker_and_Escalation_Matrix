# Hostel Complaint Tracker & Escalation Matrix: Database Design & DBMS Architecture

This document explains the database design, normalization, load handling, and backup architecture of the HostelCare system based on **core concepts of Database Management Systems (DBMS)**.

---

## 1. Core Architecture & Relational Model

The database is built on the **Relational Model** (Codd's Relational Algebra), where data is organized into tables (relations), rows (tuples), and columns (attributes).

### Database Topology:
- **Primary Database**: `hostelcare` (serves active live transactions)
- **Backup Database**: `hostelcare_backup` (hot-standby replica for disaster recovery and automatic failover)

```
                            +-----------------------------+
                            |        Client Traffic       |
                            |   (Browser / Frontend UI)   |
                            +--------------+--------------+
                                           | HTTP (REST)
                                           v
                            +-----------------------------+
                            |     Java Backend Server     |
                            |   - Connection Pool         |
                            |   - Failover Manager        |
                            +--------------+--------------+
                                           |
                    +----------------------+----------------------+
                    | (Active Connection)                         | (Live Replication)
                    v                                             v
        +-----------------------+                     +-----------------------+
        |   PRIMARY DATABASE    |                     |    BACKUP DATABASE    |
        |     `hostelcare`      | ==================> |  `hostelcare_backup`  |
        | (B-Tree Indexed, 3NF) |    Sync / Failover  | (Hot Standby Replica) |
        +-----------------------+                     +-----------------------+
                    |
                    v
        +-----------------------+
        | Timestamped SQL Dumps |
        |   (mysql/backups/)    |
        +-----------------------+
```

---

## 2. Database Normalization (1NF, 2NF, 3NF)

Normalization is the systematic DBMS process of organizing data in a database to reduce data redundancy and eliminate undesirable anomalies (**Insertion**, **Update**, and **Deletion** anomalies).

### Step 1: First Normal Form (1NF)
- **Rule**: Every column must contain only **atomic** (indivisible) values. There can be no repeating groups or multivalued attributes, and each table must have a designated Primary Key.
- **Implementation**:
  - `complaint_history` decomposes status changes and notes into atomic rows instead of storing arrays or comma-separated timeline strings in the `complaints` table.
  - `escalations` and `notifications` store atomic events with single-valued timestamps and identifiers.
  - Every table has an atomic Primary Key (`id INT AUTO_INCREMENT`).

### Step 2: Second Normal Form (2NF)
- **Rule**: The relation must be in 1NF and must have **no partial functional dependency** (every non-key attribute must be fully functionally dependent on the entire primary key, not a proper subset of it).
- **Implementation**:
  - In our schema, all tables utilize **single-attribute primary keys** (`id`).
  - By mathematical definition in DBMS: If a relation is in 1NF and its primary key consists of a single attribute, **partial dependency cannot exist**. Therefore, all tables inherently satisfy **2NF**.

### Step 3: Third Normal Form (3NF)
- **Rule**: The relation must be in 2NF and have **no transitive dependency** ($X \to Y$ and $Y \to Z$, where non-key attribute $Z$ depends on non-key attribute $Y$).
- **Identified Transitive Anomalies & 3NF Decompositions**:
  1. **Hostel Location Anomaly**:
     - *Issue*: Repeating raw block names (e.g. `'Devgiri Boys Hostel'`) across `users`, `pending_registrations`, and `complaints` creates update anomalies if a hostel is renamed or reconfigured.
     - *3NF Decomposition*: Created master entity `hostel_blocks` (`id` PK, `block_code` UNIQUE, `block_name`, `total_rooms`, `warden_id` FK).
     - Relations link via Foreign Key `block_id REFERENCES hostel_blocks(id)`.
  2. **Complaint Category Anomaly**:
     - *Issue*: `category` was stored as plain text, yet each category functionally determines SLA parameters (`category -> default_severity, sla_hours`).
     - *3NF Decomposition*: Created master entity `complaint_categories` (`id` PK, `name` UNIQUE, `default_severity`, `sla_hours`, `description`).
     - Relations link via Foreign Key `category_id REFERENCES complaint_categories(id)`.

---

## 3. Relational Schema & Constraints

| Table Name | Description | Primary Key (PK) | Foreign Keys (FK) & Referential Actions |
|---|---|---|---|
| `hostel_blocks` | Master list of hostel buildings and rooms | `id` | `warden_id -> users(id) ON DELETE SET NULL` |
| `complaint_categories`| Master categories and SLA definitions | `id` | None (Domain Master) |
| `users` | Students, Wardens, Authorities, Staff, Admin | `id` | `block_id -> hostel_blocks(id) ON DELETE SET NULL` |
| `pending_registrations` | Student registration requests | `id` | `block_id -> hostel_blocks(id) ON DELETE SET NULL` |
| `complaints` | Core complaint tracker relation | `id` | `student_id -> users(id) ON DELETE CASCADE`<br>`assigned_to -> users(id) ON DELETE SET NULL`<br>`category_id -> complaint_categories(id)`<br>`block_id -> hostel_blocks(id)` |
| `complaint_history` | Audit trail of status changes | `id` | `complaint_id -> complaints(id) ON DELETE CASCADE` |
| `escalations` | SLA breach & escalation audit trail | `id` | `complaint_id -> complaints(id) ON DELETE CASCADE` |
| `notifications` | Email dispatch log | `id` | `complaint_id -> complaints(id) ON DELETE CASCADE` |

---

## 4. Managing Database Load Without Server Bottlenecks

Under high concurrent usage (e.g., hundreds of students checking status or filing issues simultaneously), naive databases suffer from high CPU utilization, memory pressure, and socket exhaustion. We implemented core DBMS performance strategies:

### 1. B-Tree Indexing Strategy
Without indexes, MySQL performs a **Full Table Scan** ($O(N)$ disk I/O operations). With B-Tree indexes, lookups require only $O(\log N)$ operations:
- `idx_complaints_status`: Fast dashboard filtering by status (`Pending`, `Assigned`, `Resolved`).
- `idx_complaints_severity`: Rapid sorting of critical vs low severity issues.
- `idx_complaints_escalation`: High-speed scans for the automated escalation background job.
- `idx_complaints_student_status`: Composite index `(student_id, status)` for student personal dashboards.
- `idx_history_complaint_id`, `idx_escalations_complaint_id`, `idx_notifications_complaint_id`: Eliminates full scans during foreign key joins.

### 2. Connection Pooling (Resource Management)
- In `jdbc/DBConnection.java`, physical TCP database connections are expensive to establish (~80ms).
- A **Connection Pool** maintains reusable active connections:
  - Eliminates connection creation overhead.
  - Latency per query drops from ~80ms to **< 2ms**.
  - Restricts maximum concurrent connections (`MAX_POOL_SIZE = 10`), preventing MySQL `Too many connections` crashes under heavy load.

### 3. ACID Compliance & Transactions
- **Atomicity**: Multi-step operations (e.g. updating a complaint and logging history) are executed atomically.
- **Consistency**: Foreign Key constraints enforce referential integrity across all relations.
- **Isolation**: Handled using MySQL's default `REPEATABLE READ` transaction isolation.
- **Durability**: Committed data is written to the database write-ahead log (WAL) and stored permanently on disk.

---

## 5. Backup Database & Automatic Failover Architecture

The system features complete fault tolerance and disaster recovery:

### 1. Standby Backup Database (`hostelcare_backup`)
- A secondary database containing the identical schema and data.
- **Dual-Write Replication**: When any write operation (`INSERT`, `UPDATE`, `DELETE`) occurs through the backend API, `JsonToSqlConverter.java` replicates the operation to `hostelcare_backup` in real-time.

### 2. Automatic Failover (`DBConnection.java`)
- If the primary database (`hostelcare`) crashes, is locked, or is unreachable:
  1. `DBConnection` catches the `SQLException`.
  2. It automatically switches active query routing to `hostelcare_backup`.
  3. A failover alert is logged:
     ```
     [!] WARNING: Primary DB (hostelcare) connection failed: Communications link failure
     [*] ACTIVATING FAILOVER -> Switching traffic to Backup DB (hostelcare_backup)...
     ```
  4. The web application remains 100% online without throwing errors to users.

### 3. Automated Backup Utility (`mysql/backup_manager.py`)
Run the backup manager with simple CLI commands:

```bash
# 1. Check health and parity between Primary and Backup databases
python mysql/backup_manager.py --status

# 2. Synchronize all data from Primary to Backup database
python mysql/backup_manager.py --sync

# 3. Create a timestamped logical SQL dump file in mysql/backups/
python mysql/backup_manager.py --dump

# 4. Disaster Recovery: Restore Primary database from Backup database
python mysql/backup_manager.py --restore

# 5. Restore Primary database from a specific SQL dump file
python mysql/backup_manager.py --restore --file mysql/backups/hostelcare_dump_20261005_111718.sql
```

---

## 6. Relational Views

To provide simple, high-level abstraction without writing complex joins repeatedly, the database includes pre-compiled relational views:

1. **`v_complaints_detailed`**:
   Joins `complaints`, `users` (student), `users` (assigned maintenance staff), `hostel_blocks`, and `complaint_categories` into a comprehensive relational view.

2. **`v_hostel_block_stats`**:
   Aggregates complaint counts, pending issues, and resolution rates grouped by hostel block.
