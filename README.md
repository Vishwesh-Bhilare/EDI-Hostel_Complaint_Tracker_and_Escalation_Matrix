# Hostel Complaint Tracker — With Escalation Matrix

**Mini Project · Semester V · Department of Computer Engineering**  
Marathwada Mitra Mandal's College of Engineering · Team 1 · 24th September 2026

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Features](#features)
3. [System Architecture](#system-architecture)
4. [Tech Stack](#tech-stack)
5. [Project Modules](#project-modules)
6. [User Roles](#user-roles)
7. [Escalation Matrix](#escalation-matrix)
8. [SLA Time Limits](#sla-time-limits)
9. [File Structure](#file-structure)
10. [Setup & Running](#setup--running)
11. [Key Functions Reference](#key-functions-reference)
12. [Database Schema](#database-schema)
13. [Auto-Escalation Implementation](#auto-escalation-implementation)
14. [API Reference](#api-reference)
15. [Team](#team)

---

## Project Overview

A centralized hostel complaint management system that allows students to register complaints, enables staff to manage and resolve them, and automatically escalates unresolved complaints to higher authorities based on predefined SLA time limits.

The system covers the full complaint lifecycle — from student submission through warden assignment, maintenance resolution, and multi-level escalation up to the Principal — with email notifications at each escalation event and a complete audit trail.

---

## Features

- **Role-based access** — 7 distinct roles, each with its own dashboard and permissions
- **Complaint registration** — category, severity (auto-set), description, file attachment
- **SLA-based auto-escalation** — `checkEscalations()` runs every 30 seconds; overdue complaints escalate automatically without any manual action
- **Manual escalation** — wardens and authorities can escalate with a required reason at any time
- **Email notifications** — SMTPS/TLS emails sent to the student and the new authority on every escalation
- **Audit trail** — every status change and escalation writes a row to `complaint_history`; shown as a timeline on the student's complaint card
- **Admin approval flow** — new registrations go into `pending_registrations`; admin approves or rejects before an account is created
- **Maintenance loop** — warden can reassign a complaint back to maintenance if the work is not acceptable

---

## System Architecture

Three-tier architecture:

```
Browser (HTML/CSS/JS)
    │
    │  POST /api  (JSON over HTTP)
    ▼
Java TCP Server  ──────────────────────────────────────────────┐
    TcpServer.java       (raw ServerSocket, one thread/client)  │
    RequestHandler.java  (hand-parsed HTTP, action router)      │ SMTPS/TLS
    JsonToSqlConverter   (SQL builder, whitelist-guarded)       │
    SimpleJson.java      (hand-rolled JSON parser)          Mailer.java
    DBConnection.java    (JDBC wrapper)                         │
    │                                                           ▼
    │  JDBC                                              SMTP Server
    ▼
MySQL  (hostelcare DB)
    users · complaints · complaint_history
    escalations · notifications · pending_registrations
```

**Frontend modules:**

| File | Responsibility |
|---|---|
| `index.html` / `signup.html` | Login and registration pages |
| `app.js` | Bootstrap, router, `setInterval` for auto-escalation sweep |
| `data.js` | In-memory store (USERS, COMPLAINTS arrays); all business logic |
| `api.js` | `fetch()` wrapper — POST /api; offline fallback to localStorage |
| `student.js` | Student dashboard — submit, track, request escalation |
| `warden.js` | Warden dashboard — assign, update status, escalate manually |
| `authority.js` | Authority dashboard — resolve or escalate to principal |
| `principal.js` | Principal dashboard — final resolution, directives |
| `maintenance.js` | Maintenance dashboard — mark in-progress or done |
| `admin.js` | Admin dashboard — user management, complaint override |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript (ES6+) |
| Backend | Java (raw TCP ServerSocket, no framework) |
| Database | MySQL via JDBC (`PreparedStatement`) |
| Email | SMTPS / TLS over raw `SSLSocket` (no external mail library) |
| Dev launcher | Python (`run_all.py` — starts Java server + static file server) |

**CS concepts applied:**

| Concept | Where |
|---|---|
| OOP — Classes, Encapsulation, Abstraction | `TcpServer`, `RequestHandler`, `DBConnection`, `Mailer`, `api.js` API object |
| OOP — Runnable / Multithreading | `RequestHandler implements Runnable`; one thread per client |
| DSA — Arrays, HashMap, HashSet | `USERS[]`, `COMPLAINTS[]`, `historyByComplaint`, `complaintsEverAtLevel()` |
| DSA — Linear search, Filter, Sort | `getUser()`, `complaintsAtLevel()`, severity-ordered complaint lists |
| DBMS — Relational, FK, ENUM, CRUD | Full MySQL schema; `DBConnection.query()` / `execute()` |
| DBMS — Audit tables | `complaint_history`, `escalations`, `notifications` |
| Networks — TCP Sockets | `ServerSocket`, `RequestHandler` HTTP parser |
| Networks — SMTP/TLS | `Mailer.java` hand-rolled SMTPS conversation |
| Web Dev — DOM, Validation, Role dashboards | `app.js render()`, `attachSignupHandlers()` |
| Security — SQL injection prevention | `JsonToSqlConverter` whitelists column/table names; values in `PreparedStatement` |

---

## Project Modules

| # | Module | Description |
|---|---|---|
| 01 | User Profile Creation & Authentication | Secure login and role-based access control for all stakeholders |
| 02 | Complaint Registration & Categorization | Students submit complaints; severity auto-set from category |
| 03 | Complaint Assignment & Tracking | Wardens assign to maintenance; full status tracking |
| 04 | Escalation Matrix & Deadline Management | SLA-based auto-escalation: Warden → Chief Warden → Higher Authority → Principal |
| 05 | Admin/Warden Management & Notifications | Role management, email alerts on every escalation |
| 06 | Complaint Resolution, Feedback & Reports | Resolution confirmation, history timeline, analytics dashboards |

---

## User Roles

| Role | Responsibilities | Access |
|---|---|---|
| **Student** | Registers and tracks own complaints | Submit complaints, view own complaints, submit feedback |
| **Maintenance Staff** | Handles assigned complaints | View assigned complaints, update status, add remarks, mark done |
| **Warden** | Supervises complaints and escalations | View all complaints, assign/reassign, handle escalations, monitor SLA |
| **Chief Warden** | Manages Level 1 escalated complaints | View all, assign/reassign, handle complaints escalated beyond Level 1 |
| **Higher Authority** | Manages Level 2 escalated complaints | View all, assign/reassign, handle complaints escalated beyond Level 2 |
| **Principal** | Manages final-level escalations; monitors analytics | Full access to all complaints, reports, escalation history, SLA performance |
| **Admin** | Manages role access and system configuration | User access, database, system config, security settings |

---

## Escalation Matrix

| Level | Responsible Person | Rule |
|---|---|---|
| Level 1 | Warden | Complaint must be resolved within the defined SLA |
| Level 2 | Chief Warden | If Level 1 SLA is exceeded, escalated to Chief Warden |
| Level 3 | Higher Authority | If not resolved at Level 2, escalated to Higher Authority |
| Level 4 | Principal | Final escalation — Principal has full access to all data and history |

Escalation happens **automatically** via `checkEscalations()` (runs every 30 seconds) and can also be triggered **manually** by a Warden or Authority with a required reason. Both paths go through `recordEscalation()` — the single choke point — which updates MySQL, logs the audit row, and triggers the email notification.

---

## SLA Time Limits

| Complaint Category | SLA Limit |
|---|---|
| Maintenance | 24 hours |
| Electrical | 4 hours |
| Plumbing / Water | 6 hours |
| Cleanliness / Hygiene | 2 hours |
| Security | 2 hours |
| Food / Mess | 6 hours |
| Internet / WiFi | 8 hours |
| Other | 24 hours |

Three SLA timestamps are computed at submission time (`sla_warden`, `sla_authority`, `sla_principal`) and stored with each complaint. The sweep compares the due-date for the complaint's **current escalation level** against `Date.now()`.

---

## File Structure

```
├── index.html
├── signup.html
├── styles.css
├── js/
│   ├── app.js           # Bootstrap, router, setInterval escalation sweep
│   ├── data.js          # In-memory store + all business logic
│   ├── api.js           # fetch() wrapper, offline fallback
│   ├── student.js
│   ├── warden.js
│   ├── authority.js
│   ├── principal.js
│   ├── maintenance.js
│   └── admin.js
├── jdbc/
│   ├── TcpServer.java          # ServerSocket loop, spawns RequestHandler threads
│   ├── RequestHandler.java     # HTTP parser, action router, handler methods
│   ├── DBConnection.java       # JDBC singleton, query() / execute()
│   ├── SimpleJson.java         # Hand-rolled JSON parser/stringifier
│   ├── JsonToSqlConverter.java # SQL builder with column whitelist
│   └── Mailer.java             # Raw SMTPS over SSLSocket
├── mysql/
│   ├── schema.sql              # Full DDL — tables, FKs, ENUMs
│   └── migrate_notifications.sql  # ALTER TABLE migration for notifications
└── run_all.py                  # Dev launcher — starts Java server + frontend server
```

---

## Setup & Running

### Prerequisites

- Java 11+
- MySQL 8+
- Python 3 (for dev launcher)
- MySQL Connector/J JAR on classpath

### 1. Database

```sql
-- Create database
CREATE DATABASE hostelcare;

-- Run schema
mysql -u root -p hostelcare < mysql/schema.sql
mysql -u root -p hostelcare < mysql/migrate_notifications.sql
```

### 2. Configure DB connection

Edit `jdbc/DBConnection.java` (or a properties file it reads):

```java
String url  = "jdbc:mysql://localhost:3306/hostelcare";
String user = "your_db_user";
String pass = "your_db_password";
```

### 3. Configure email (Mailer.java)

```java
String smtpHost = "smtp.gmail.com";
int    smtpPort = 465;
String from     = "your_email@gmail.com";
String password = "your_app_password";   // use an App Password, not your login
```

### 4. Compile the Java backend

```bash
javac -cp .:mysql-connector-java-*.jar jdbc/*.java
```

### 5. Run everything

```bash
python run_all.py
```

This starts:
- Java TCP server on port `8080` (or configured port)
- Python HTTP server for the frontend on port `3000`

Then open `http://localhost:3000` in your browser.

### Running Java manually

```bash
java -cp .:mysql-connector-java-*.jar TcpServer 8080
```

---

## Key Functions Reference

### `js/data.js` — Core business logic

| Function | What it does |
|---|---|
| `checkEscalations()` | Runs every 30s. Fetches open complaints, compares each SLA due-date to `Date.now()`, calls `recordEscalation()` for any that are overdue |
| `recordEscalation(id, from, to, reason)` | **Single choke point.** Updates `escalation_level` in MySQL, appends to `complaint_history`, calls `notifyEscalation()` |
| `escalateManually(id, currentLevel, reason)` | Called by Warden/Authority UI. Requires a non-empty reason. Calls `recordEscalation()` |
| `notifyEscalation(id, toLevel)` | Builds recipient list (student + new authority), calls `API.notify()` for each real address |
| `addComplaint(data)` | Creates complaint; auto-sets severity from category; computes all three SLA timestamps |
| `assignComplaint(id, staffId)` | Warden assigns; status → Assigned |
| `markDone(id)` | Maintenance marks work done; status → Under Review |
| `resolveComplaint(id, remarks)` | Warden resolves; status → Resolved |
| `reassignComplaint(id, reason)` | Warden rejects resolution; status → Assigned (loops back) |
| `submitRegistration(data)` | Creates row in `pending_registrations` |
| `approveRegistration(id)` | Creates real user row; marks pending row approved |
| `rejectRegistration(id, reason)` | Marks pending row rejected |
| `debugForceOverdue(id)` | **Dev only.** Backdates all SLA timestamps 999 hours; re-runs sweep immediately |

### `jdbc/RequestHandler.java` — Backend routing

| Method | Route / Action | What it does |
|---|---|---|
| `handleLogin(body)` | `action: "login"` | Validates credentials; returns user object or 401 |
| `handleRegister(body)` | `action: "register"` | Inserts into `pending_registrations` |
| `handleComplaintCreate(body)` | `action: "addComplaint"` | Inserts complaint row via `JsonToSqlConverter` |
| `handleComplaintList(query)` | `action: "getComplaints"` | Returns filtered complaint array |
| `handleComplaintUpdate(body)` | `action: "updateComplaint"` | Updates complaint fields |
| `handleNotify(body)` | `action: "notify"` | Routes straight to `Mailer.send()` — bypasses SQL entirely |
| `handleStaticFile(path)` | `GET /*` | Reads and serves HTML/CSS/JS files |

---

## Database Schema

```sql
-- Core tables (abbreviated)

CREATE TABLE users (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    name         VARCHAR(100),
    email        VARCHAR(100) UNIQUE,
    prn          VARCHAR(20),
    password     VARCHAR(255),
    role         ENUM('student','maintenance','warden','chief_warden',
                      'authority','principal','admin'),
    room_no      VARCHAR(10),
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE complaints (
    id               VARCHAR(20) PRIMARY KEY,   -- e.g. CPL-3A9X2
    student_id       INT REFERENCES users(id),
    title            VARCHAR(200),
    category         VARCHAR(50),
    severity         ENUM('low','medium','high','critical'),
    status           ENUM('pending','assigned','in-progress',
                          'under-review','resolved'),
    escalation_level ENUM('warden','authority','principal') DEFAULT 'warden',
    assigned_to      INT REFERENCES users(id),
    sla_warden       DATETIME,
    sla_authority    DATETIME,
    sla_principal    DATETIME,
    last_escalated_at DATETIME,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE complaint_history (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    complaint_id VARCHAR(20) REFERENCES complaints(id),
    event        VARCHAR(50),   -- 'submitted','assigned','escalated','resolved'...
    from_level   VARCHAR(20),
    to_level     VARCHAR(20),
    reason       TEXT,
    actor_id     INT REFERENCES users(id),
    timestamp    DATETIME
);

CREATE TABLE escalations (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    complaint_id VARCHAR(20) REFERENCES complaints(id),
    from_level   VARCHAR(20),
    to_level     VARCHAR(20),
    reason       TEXT,
    triggered_at DATETIME
);

CREATE TABLE notifications (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    complaint_id VARCHAR(20) REFERENCES complaints(id),
    recipient    VARCHAR(100),
    subject      VARCHAR(255),
    status       ENUM('sent','failed','skipped'),
    sent_at      DATETIME
);

CREATE TABLE pending_registrations (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(100),
    email      VARCHAR(100),
    prn        VARCHAR(20),
    password   VARCHAR(255),
    room_no    VARCHAR(10),
    status     ENUM('pending','approved','rejected') DEFAULT 'pending',
    reason     TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Auto-Escalation Implementation

The auto-escalation engine is fully implemented in `js/data.js`. Here is the complete logic:

```javascript
// SLA hours per severity level
const SLA_HOURS = { low: 72, medium: 24, high: 4, critical: 1 };
const ESCALATION_LEVELS = ['warden', 'authority', 'principal'];

// Runs every 30s via app.js: setInterval(checkEscalations, 30000)
// Also called once on every dashboard render.
async function checkEscalations() {
  const complaints = await apiRequest({ action: 'getComplaints', filter: 'open' });

  for (const complaint of complaints) {
    if (complaint.status === 'resolved') continue;
    if (complaint.escalation_level === 'principal') continue;

    const dueDateKey = `sla_${complaint.escalation_level || 'warden'}`;
    const dueDate    = new Date(complaint[dueDateKey]).getTime();

    if (Date.now() > dueDate) {
      await recordEscalation(
        complaint.id,
        complaint.escalation_level || 'warden',
        nextEscalationLevel(complaint.escalation_level),
        'Auto-escalated: SLA deadline passed'
      );
    }
  }
}

// Single choke point — auto and manual escalations both pass through here
async function recordEscalation(complaintId, fromLevel, toLevel, reason) {
  // 1. Update complaint row in MySQL
  await apiRequest({
    action: 'updateComplaint', id: complaintId,
    updates: { escalation_level: toLevel, last_escalated_at: new Date().toISOString() }
  });
  // 2. Write audit row to complaint_history
  await apiRequest({
    action: 'addHistory', complaint_id: complaintId,
    event: 'escalated', from_level: fromLevel, to_level: toLevel,
    reason, timestamp: new Date().toISOString()
  });
  // 3. Send email to student + new authority
  await notifyEscalation(complaintId, toLevel);
}

// For demo/testing — backdates SLA timestamps, then immediately sweeps
async function debugForceOverdue(complaintId) {
  const past = new Date(Date.now() - 999 * 60 * 60 * 1000).toISOString();
  await apiRequest({
    action: 'updateComplaint', id: complaintId,
    updates: { sla_warden: past, sla_authority: past, sla_principal: past }
  });
  await checkEscalations();
}
```

---

## API Reference

All requests are `POST /api` with a JSON body containing an `action` field. The `action: "notify"` path is handled **before** any SQL dispatch (straight to `Mailer.java`).

| Action | Key fields | Description |
|---|---|---|
| `login` | `email`, `password` | Returns user object or 401 |
| `register` | `name`, `email`, `prn`, `password`, `room_no` | Inserts into `pending_registrations` |
| `getComplaints` | `filter` (`open`/`mine`/`all`), `role`, `userId` | Returns filtered complaint array |
| `addComplaint` | full complaint object | Creates complaint; returns assigned ID |
| `updateComplaint` | `id`, `updates` (partial object) | Updates complaint fields |
| `addHistory` | `complaint_id`, `event`, `reason`, etc. | Appends audit row |
| `notify` | `to`, `subject`, `body` | Sends email via Mailer; logs attempt to `notifications` |
| `approveRegistration` | `id` | Moves pending user to `users` table |
| `rejectRegistration` | `id`, `reason` | Marks pending registration rejected |

Static files (`GET /path`) are served directly by `handleStaticFile()`.

---

## Team

| Roll No | Name | Sub-Team |
|---|---|---|
| B24CE1001 | Tushar Borate | Database & Complaint Management |
| B24CE1007 | Neel Kadam | Database & Complaint Management |
| B24CE1009 | Mahesh Gaikwad | Database & Complaint Management |
| B24CE1003 | Vishwesh Bhilare | Connectivity & Middleware |
| B24CE1002 | Sahil Veer | Connectivity & Middleware |
| B24CE1013 | Vedantika Ranaware | Connectivity & Middleware |
| B24CE1026 | Balraj Rasal | Testing & Documentation |
| B24CE1008 | Kshitij Bhate | Testing & Documentation |
| B24CE1006 | Patil Avishkar | Testing & Documentation |
| B24CE1012 | Ritik Mirase | Testing & Documentation |
| B24CE1004 | Bedse Abhijit | Frontend (UI/UX) |
| B24CE1005 | Ambhore Pravin | Frontend (UI/UX) |
| B24CE1010 | Pooja Umare | Frontend (UI/UX) |

---

> Department of Computer Engineering · Marathwada Mitra Mandal's College of Engineering
