#!/usr/bin/env python3
"""
run_all.py — starts the whole HostelCare system with one command.

  1. Compile the Java backend (jdbc/*.java) with the MySQL connector on
     the classpath, into a build/ directory.
  2. Start it: `java TcpServer <port>` (default 8080).
  3. Print the URL and shut it down cleanly on Ctrl+C.

Usage:
    python run_all.py
    HOSTELCARE_PORT=9090 python run_all.py

Requirements: a JDK (javac/java) on PATH. MySQL must already be running
and reachable using the env vars DBConnection.java reads
(HOSTELCARE_DB_URL, HOSTELCARE_DB_USER, HOSTELCARE_DB_PASSWORD) if you
set them; otherwise it falls back to the defaults baked into
DBConnection.java.

---------------------------------------------------------------------
Escalation emails (optional): configure HOSTELCARE_SMTP_USER /
HOSTELCARE_SMTP_PASS in .local/hostelcare.json or environment variables.
The local JSON file is ignored by Git. Leave them blank to run
without email notifications (everything else still works normally; the
notifications table will just show "failed"/"skipped" rows).

  SMTP_USER: a Gmail address, e.g. "you@gmail.com"
  SMTP_PASS: an APP PASSWORD for that account (NOT your normal Gmail
             password) — generate one at
             https://myaccount.google.com/apppasswords
             (needs 2-Step Verification turned on first)
---------------------------------------------------------------------
"""

import os
import json
import signal
import socket
import subprocess
import sys
import time
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOCAL_CONFIG_FILE = ROOT / ".local" / "hostelcare.json"
LOCAL_SETTINGS = json.loads(LOCAL_CONFIG_FILE.read_text(encoding="utf-8")) if LOCAL_CONFIG_FILE.exists() else {}


def local_setting(name, fallback=""):
    return os.environ[name] if name in os.environ else LOCAL_SETTINGS.get(name, fallback)


BUILD_DIR = ROOT / "build"
MYSQL_JAR = ROOT / "jdbc" / "mysql-connector-j-26.7.0.jar"
MIGRATION_SQL = ROOT / "mysql" / "migrate_notifications.sql"
GROUP_MIGRATION_SQL = ROOT / "mysql" / "migrate_complaint_groups.sql"
BACKGROUND_MIGRATION_SQL = ROOT / "mysql" / "migrate_background_notifications.sql"

BACKEND_PORT = os.environ.get("HOSTELCARE_PORT", "8080")

# ---- Ignored local configuration / environment variables ----
SMTP_USER = local_setting("HOSTELCARE_SMTP_USER")
SMTP_PASS = local_setting("HOSTELCARE_SMTP_PASS")
SMTP_FROM = local_setting("HOSTELCARE_SMTP_FROM")

# Database settings live in DBConnection.java / HOSTELCARE_DB_* environment
# variables. Migrations use that same JDBC code, with no second password default.

backend_proc = None
backend_ready = threading.Event()


def run(cmd, **kwargs):
    print(f"$ {' '.join(str(c) for c in cmd)}", flush=True)
    return subprocess.run(cmd, **kwargs)


def compile_backend():
    if not MYSQL_JAR.exists():
        sys.exit(f"ERROR: {MYSQL_JAR} not found. Check the jdbc/ folder.")

    BUILD_DIR.mkdir(exist_ok=True)
    java_files = sorted(str(p) for p in (ROOT / "jdbc").glob("*.java"))

    result = run(
        ["javac", "-cp", str(MYSQL_JAR), "-d", str(BUILD_DIR), *java_files]
    )
    if result.returncode != 0:
        sys.exit("Backend compilation failed. Fix the errors above and re-run.")


def apply_db_migrations():
    """Use Java's database configuration; do not start with missing schema fields."""
    files = [MIGRATION_SQL, GROUP_MIGRATION_SQL, BACKGROUND_MIGRATION_SQL]
    missing = [p.name for p in files if not p.exists()]
    if missing:
        sys.exit("Missing migration files: " + ", ".join(missing))
    classpath = os.pathsep.join([str(BUILD_DIR), str(MYSQL_JAR)])
    result = subprocess.run(
        ["java", "-cp", classpath, "SqlMigration", *(str(p) for p in files)], cwd=ROOT
    )
    if result.returncode != 0:
        sys.exit("Database migration failed. Check MySQL and the settings in DBConnection.java / HOSTELCARE_DB_*.")


def check_port_available():
    try:
        port = int(BACKEND_PORT)
        if not 1 <= port <= 65535:
            raise ValueError
    except ValueError:
        sys.exit("HOSTELCARE_PORT must be a number from 1 to 65535.")
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind(("0.0.0.0", port))
    except OSError:
        sys.exit(
            f"Port {port} is already in use or unavailable.\n"
            "Stop the older HostelCare server with Ctrl+C and run build.bat again.\n"
            "To use another port in PowerShell: $env:HOSTELCARE_PORT = '8081'"
        )


def start_backend():
    global backend_proc
    classpath = os.pathsep.join([str(BUILD_DIR), str(MYSQL_JAR)])

    env = os.environ.copy()
    # Forward resolved local settings; explicit environment values take priority.
    if SMTP_USER:
        env["HOSTELCARE_SMTP_USER"] = SMTP_USER
    if SMTP_PASS:
        env["HOSTELCARE_SMTP_PASS"] = SMTP_PASS
    if SMTP_FROM:
        env["HOSTELCARE_SMTP_FROM"] = SMTP_FROM

    if env.get("HOSTELCARE_SMTP_USER") and env.get("HOSTELCARE_SMTP_PASS"):
        print(f"SMTP configured — escalation emails will send as {env['HOSTELCARE_SMTP_USER']}.")
    else:
        print("SMTP not configured — email attempts will be logged as failed/skipped. "
              "Configure SMTP in .local/hostelcare.json or environment variables to enable delivery.")

    backend_ready.clear()
    backend_proc = subprocess.Popen(
        ["java", "-cp", classpath, "TcpServer", BACKEND_PORT],
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    process = backend_proc

    def forward_output():
        for line in process.stdout:
            print(line, end="", flush=True)
            if line.startswith("HostelCare server listening on port "):
                backend_ready.set()

    threading.Thread(target=forward_output, daemon=True).start()
    return backend_proc


def wait_for_backend(timeout=10):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if backend_ready.wait(0.1):
            return
        code = backend_proc.poll()
        if code is not None:
            sys.exit(f"Server failed to start (exit code {code}). No new server is running.")
    stop_backend()
    sys.exit("Server startup timed out. No new server is running.")


def stop_backend():
    if backend_proc and backend_proc.poll() is None:
        backend_proc.terminate()
        try:
            backend_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            backend_proc.kill()


def shutdown(*_):
    print("\nStopping server...")
    stop_backend()
    sys.exit(0)


def main():
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)
    migrate_only = "--migrate-only" in sys.argv[1:]
    if not migrate_only:
        check_port_available()

    print("== Compiling backend ==", flush=True)
    compile_backend()

    print("\n== Applying database migrations using the Java database settings ==", flush=True)
    apply_db_migrations()
    if migrate_only:
        print("Database migrations completed. The server has not been started.")
        return

    print("\n== Starting server ==", flush=True)
    start_backend()
    wait_for_backend()

    print(
        f"\nOpen: http://localhost:{BACKEND_PORT}/\n"
        f"(This one process serves the frontend AND /api.)\n"
        f"Press Ctrl+C to stop.\n",
        flush=True,
    )

    while True:
        ret = backend_proc.poll()
        if ret is not None:
            print(f"Server exited with code {ret}.")
            sys.exit(ret)
        time.sleep(0.5)


if __name__ == "__main__":
    main()
