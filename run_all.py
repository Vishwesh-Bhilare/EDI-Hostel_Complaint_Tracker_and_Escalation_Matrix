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
Escalation emails (optional): paste your credentials into SMTP_USER /
SMTP_PASS below and this script exports them for the Java process every
time it runs — no `export` needed in your shell. Leave them blank to run
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
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BUILD_DIR = ROOT / "build"
MYSQL_JAR = ROOT / "jdbc" / "mysql-connector-j-26.7.0.jar"
MIGRATION_SQL = ROOT / "mysql" / "migrate_notifications.sql"

BACKEND_PORT = os.environ.get("HOSTELCARE_PORT", "8080")

# ---- Paste your own values here (see the big comment above) ----
SMTP_USER = "vishweshbhilare2024.comp@mmcoe.edu.in"   # e.g. "you@gmail.com"
SMTP_PASS = "omoq null pkoo vnvb"   # the 16-character App Password, not your login password
SMTP_FROM = ""   # optional — leave blank to just send as SMTP_USER

# ---- DB connection, same defaults DBConnection.java falls back to ----
DB_HOST = os.environ.get("HOSTELCARE_DB_HOST", "localhost")
DB_PORT = os.environ.get("HOSTELCARE_DB_PORT", "3306")
DB_USER = os.environ.get("HOSTELCARE_DB_USER", "root")
DB_PASSWORD = os.environ.get("HOSTELCARE_DB_PASSWORD", "root123")

backend_proc = None


def run(cmd, **kwargs):
    print(f"$ {' '.join(str(c) for c in cmd)}")
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


NORMALIZED_MIGRATION_SQL = ROOT / "mysql" / "migrate_to_normalized.sql"
BACKUP_MANAGER = ROOT / "mysql" / "backup_manager.py"


def apply_db_migration():
    """Best-effort: applies normalization migration (master tables, indexes, views)
    and ensures the backup database is synchronized and ready for automatic failover."""
    if not NORMALIZED_MIGRATION_SQL.exists():
        return

    env = os.environ.copy()
    env["MYSQL_PWD"] = DB_PASSWORD
    cmd = ["mysql", "-h", DB_HOST, "-P", str(DB_PORT), "-u", DB_USER, "-e", f"source {NORMALIZED_MIGRATION_SQL.as_posix()}"]

    try:
        result = subprocess.run(cmd, capture_output=True, env=env)
        if result.returncode == 0:
            print("[+] Database normalization & indexes successfully verified.")
        else:
            stderr = result.stderr.decode(errors="replace").strip()
            print(f"Note: normalization migration output: {stderr[:200]}")
    except FileNotFoundError:
        print("Note: 'mysql' CLI not found on PATH — skipping automatic schema migration.")

    # Synchronize Backup Database
    try:
        print("[*] Synchronizing Backup Database (hostelcare_backup)...")
        res = subprocess.run([sys.executable, str(BACKUP_MANAGER), "--sync"], capture_output=True, text=True)
        if res.returncode == 0:
            print("[+] Backup database synchronized & ready for automatic failover.")
        else:
            print(f"Note: backup sync output: {res.stderr[:200]}")
    except Exception as e:
        print(f"Note: Could not run backup sync: {e}")


def start_backend():
    global backend_proc
    classpath = os.pathsep.join([str(BUILD_DIR), str(MYSQL_JAR)])

    env = os.environ.copy()
    # Only override with the hardcoded values above if they're actually set —
    # this way an already-`export`ed shell variable still wins over a blank
    # placeholder left in this file.
    if SMTP_USER:
        env["HOSTELCARE_SMTP_USER"] = SMTP_USER
    if SMTP_PASS:
        env["HOSTELCARE_SMTP_PASS"] = SMTP_PASS
    if SMTP_FROM:
        env["HOSTELCARE_SMTP_FROM"] = SMTP_FROM

    if env.get("HOSTELCARE_SMTP_USER") and env.get("HOSTELCARE_SMTP_PASS"):
        print(f"SMTP configured — escalation emails will send as {env['HOSTELCARE_SMTP_USER']}.")
    else:
        print("SMTP not configured — escalation emails will be skipped (paste SMTP_USER / "
              "SMTP_PASS near the top of run_all.py to enable them).")

    backend_proc = subprocess.Popen(
        ["java", "-cp", classpath, "TcpServer", BACKEND_PORT],
        cwd=ROOT,
        env=env,
    )
    return backend_proc


def shutdown(*_):
    print("\nStopping server...")
    if backend_proc and backend_proc.poll() is None:
        backend_proc.terminate()
        try:
            backend_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            backend_proc.kill()
    sys.exit(0)


def main():
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print("== Compiling backend ==")
    compile_backend()

    print("\n== Verifying DBMS Normalization, Indexes & Backup Database ==")
    apply_db_migration()

    print("\n== Starting server ==")
    start_backend()
    time.sleep(1)  # give the socket a moment to bind

    print(
        f"\nOpen: http://localhost:{BACKEND_PORT}/\n"
        f"(This one process serves the frontend AND /api.)\n"
        f"Press Ctrl+C to stop.\n"
    )

    while True:
        ret = backend_proc.poll()
        if ret is not None:
            print(f"Server exited with code {ret}.")
            sys.exit(ret)
        time.sleep(0.5)


if __name__ == "__main__":
    main()
