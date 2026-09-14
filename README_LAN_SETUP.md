# LAN Setup Guide

## Architecture

One PC (the "server PC") runs both MySQL and the Java TCP server.
All other devices on the same LAN open a browser — they are the clients.
The browser is the only client software needed. No Java, no Python required on client devices.

## On the Server PC

### Prerequisites
- JDK 11 or later installed and on PATH (`javac -version` must work)
- Python 3.6+ installed and on PATH (`python --version` must work)  
- MySQL running locally, with the `hostelcare` database created (run `schema.sql`)
- MySQL credentials matching what is in `jdbc/DBConnection.java`
  (defaults: user=root, password=Sahil@2006#, or set via env vars — see below)

### Step 1: Set credentials (if different from defaults)
On Windows (Command Prompt):
```
set HOSTELCARE_DB_USER=your_mysql_user
set HOSTELCARE_DB_PASSWORD=your_mysql_password
```

On Linux/macOS:
```
export HOSTELCARE_DB_USER=your_mysql_user
export HOSTELCARE_DB_PASSWORD=your_mysql_password
```

### Step 2: Start the server
From the project root directory:
```
python run_all.py
```

Or on a different port:
```
HOSTELCARE_PORT=9090 python run_all.py   # Linux/macOS
set HOSTELCARE_PORT=9090 && python run_all.py   # Windows
```

### Step 3: Note the LAN URL
The server will print something like:
```
HostelCare server listening on port 8080
Open on this machine : http://localhost:8080/
Open from LAN device : http://192.168.1.42:8080/
```
The `192.168.x.x` address is what you give to other devices.

### Step 4: Firewall
On Windows: Allow inbound TCP on the chosen port (default 8080) in Windows Defender Firewall.  
On Linux: `sudo ufw allow 8080/tcp`  
On macOS: The built-in firewall typically allows this automatically for Java processes when prompted.

## On Client Devices (any device on the same LAN)

Open any web browser and navigate to the LAN URL printed in Step 3.
Example: `http://192.168.1.42:8080/`

No installation required. Works on phones, tablets, and laptops.

## Environment Variables Reference

| Variable              | Default                                              | Description            |
|-----------------------|------------------------------------------------------|------------------------|
| HOSTELCARE_PORT       | 8080                                                 | TCP port to listen on  |
| HOSTELCARE_DB_URL     | jdbc:mysql://localhost:3306/hostelcare?...           | Full JDBC URL          |
| HOSTELCARE_DB_USER    | root                                                 | MySQL username         |
| HOSTELCARE_DB_PASSWORD| Sahil@2006#                                          | MySQL password         |

## How It Works

```
[ Server PC ]
  MySQL (port 3306, localhost only)
  Java TcpServer (port 8080, all interfaces: 0.0.0.0)
       │
       │ TCP over LAN (HTTP protocol, hand-parsed)
       │
  ┌────┴──────────────────────────────────┐
  │  Browser on any LAN device            │
  │  GET  /           → index.html        │
  │  GET  /js/api.js  → api.js            │
  │  POST /api        → JSON→SQL→MySQL    │
  └───────────────────────────────────────┘
```

The Java server serves all static files (HTML, CSS, JS) AND handles the /api endpoint
from the same socket. MySQL is never directly accessible from client devices.
The server PC is the only machine that talks to MySQL.
