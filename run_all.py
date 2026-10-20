#!/usr/bin/env python3
"""
run_all.py — starts the whole HostelCare system with one command.

  1. Compile the Java backend (jdbc/*.java) with the MySQL connector on
     the classpath, into a build/ directory.
  2. Start it: `java TcpServer <port>` (default 8080).
  3. Print the URL and shut it down cleanly on Ctrl+C.

Usage:
    python run_all.py            (Windows)
    python3 run_all.py           (Ubuntu / Linux)
    HOSTELCARE_PORT=9090 python3 run_all.py

On Linux the launcher also prepares MySQL by itself (first run only):
starts the MySQL service if needed, creates the `hostelcare` database and
the `hostelcare` MySQL user (through `sudo mysql`), and loads
mysql/schema.sql. Override the defaults with HOSTELCARE_DB_USER /
HOSTELCARE_DB_PASSWORD (env vars or .local/hostelcare.json), or set
HOSTELCARE_DB_URL to point at a database you manage yourself (this skips
the automatic MySQL setup).

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
import re
import shutil
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

# ---- Linux (Ubuntu) automatic MySQL setup ----
IS_LINUX = sys.platform.startswith("linux")
DB_NAME = "hostelcare"
SCHEMA_SQL = ROOT / "mysql" / "schema.sql"
LINUX_DB_DEFAULTS = {"HOSTELCARE_DB_USER": "hostelcare", "HOSTELCARE_DB_PASSWORD": "mmcoe"}
MIN_JAVA_MAJOR = 11

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


def apply_linux_db_defaults():
    """On Linux, default to the hostelcare/mmcoe MySQL account unless configured."""
    if not IS_LINUX:
        return
    for name, value in LINUX_DB_DEFAULTS.items():
        if name not in os.environ and name not in LOCAL_SETTINGS:
            os.environ[name] = value


def ensure_java():
    """Make sure a JDK (javac) is present; on Ubuntu offer to install one."""
    if shutil.which("javac") is None or shutil.which("java") is None:
        if not (IS_LINUX and shutil.which("apt-get")):
            sys.exit("ERROR: a JDK (java + javac) was not found on PATH. Install JDK 11 or newer.")
        print("A JDK was not found.")
        answer = input("Install it now with `sudo apt-get install -y default-jdk-headless`? [Y/n] ").strip().lower()
        if answer not in ("", "y", "yes"):
            sys.exit("Install a JDK (sudo apt install default-jdk) and run again.")
        sudo = [] if os.geteuid() == 0 else ["sudo"]
        if run(sudo + ["apt-get", "install", "-y", "default-jdk-headless"]).returncode != 0:
            sys.exit("JDK installation failed. Install it manually: sudo apt install default-jdk")
    out = subprocess.run(["javac", "-version"], capture_output=True, text=True)
    match = re.search(r"(\d+)(?:\.(\d+))?", out.stdout + out.stderr)
    if match:
        major = int(match.group(1))
        if major == 1:  # old "1.8" style version numbers
            major = int(match.group(2) or 0)
        if major < MIN_JAVA_MAJOR:
            sys.exit(f"ERROR: JDK {MIN_JAVA_MAJOR}+ is required (found {major}). Run: sudo apt install default-jdk")


def sql_quote(value):
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


def provision_sql(user, password):
    account = f"{sql_quote(user)}@'localhost'"
    return (
        f"CREATE DATABASE IF NOT EXISTS {DB_NAME};\n"
        f"CREATE USER IF NOT EXISTS {account} IDENTIFIED BY {sql_quote(password)};\n"
        f"ALTER USER {account} IDENTIFIED BY {sql_quote(password)};\n"
        f"GRANT ALL PRIVILEGES ON {DB_NAME}.* TO {account};\n"
        "FLUSH PRIVILEGES;\n"
    )


def mysql_server_reachable():
    try:
        with socket.create_connection(("127.0.0.1", 3306), timeout=1):
            return True
    except OSError:
        return False


def ensure_mysql_running():
    if mysql_server_reachable():
        return
    print("MySQL is not running. Trying to start it (sudo may ask for your password)...", flush=True)
    sudo = [] if os.geteuid() == 0 else ["sudo"]
    for service in ("mysql", "mysqld", "mariadb"):
        if subprocess.run(sudo + ["systemctl", "start", service], stderr=subprocess.DEVNULL).returncode == 0:
            break
    for _ in range(30):
        if mysql_server_reachable():
            return
        time.sleep(0.5)
    sys.exit("ERROR: MySQL is not reachable on port 3306. Install/start it: sudo apt install mysql-server && sudo systemctl start mysql")


def mysql_as_app_user(user, password, *args, **kwargs):
    env = os.environ.copy()
    env["MYSQL_PWD"] = password  # keeps the password off the command line
    cmd = ["mysql", "-h", "127.0.0.1", "--protocol=TCP", "-u", user, *args]
    return subprocess.run(cmd, env=env, **kwargs)


def app_user_can_connect(user, password):
    result = mysql_as_app_user(user, password, DB_NAME, "-e", "SELECT 1",
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return result.returncode == 0


def schema_loaded(user, password):
    result = mysql_as_app_user(user, password, "-N", "-B", DB_NAME, "-e", "SHOW TABLES LIKE 'users'",
                               capture_output=True, text=True)
    return result.returncode == 0 and "users" in result.stdout


def provision_mysql_account(user, password):
    """Create the database + MySQL user as the MySQL admin (same as `sudo mysql`)."""
    sql = provision_sql(user, password)
    sudo = [] if os.geteuid() == 0 else ["sudo"]
    print("Creating the MySQL database and user (sudo may ask for your password)...", flush=True)
    if subprocess.run(sudo + ["mysql"], input=sql, text=True).returncode == 0:
        return
    print("`sudo mysql` failed; trying `mysql -u root -p` (enter the MySQL root password)...", flush=True)
    if subprocess.run(["mysql", "-u", "root", "-p"], input=sql, text=True).returncode != 0:
        sys.exit("ERROR: could not create the MySQL user. Run the CREATE USER / GRANT commands manually.")


def setup_database_linux():
    """First-run MySQL bootstrap for Ubuntu: service, user, database, schema."""
    if not IS_LINUX or local_setting("HOSTELCARE_DB_URL"):
        return  # Windows/macOS or a custom DB URL: the database is managed by the user
    user = local_setting("HOSTELCARE_DB_USER", "root")
    password = local_setting("HOSTELCARE_DB_PASSWORD", "")
    if shutil.which("mysql") is None:
        sys.exit("ERROR: the mysql client was not found. Run: sudo apt install mysql-server")
    ensure_mysql_running()
    if not app_user_can_connect(user, password):
        if user == "root":
            sys.exit("ERROR: cannot log in to MySQL as root with the configured password.")
        provision_mysql_account(user, password)
        if not app_user_can_connect(user, password):
            sys.exit(f"ERROR: still cannot log in to MySQL as '{user}'. Check HOSTELCARE_DB_USER / HOSTELCARE_DB_PASSWORD.")
    if not schema_loaded(user, password):
        print("Loading mysql/schema.sql (first run)...", flush=True)
        with open(SCHEMA_SQL, "rb") as schema:
            if mysql_as_app_user(user, password, DB_NAME, stdin=schema).returncode != 0:
                sys.exit("ERROR: loading mysql/schema.sql failed.")
    print(f"MySQL ready: database '{DB_NAME}', user '{user}'.", flush=True)


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
            "Stop the older HostelCare server with Ctrl+C and run the launcher again.\n"
            + ("To use another port: HOSTELCARE_PORT=8081 python3 run_all.py" if IS_LINUX else
               "To use another port in PowerShell: $env:HOSTELCARE_PORT = '8081'")
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

    apply_linux_db_defaults()
    if IS_LINUX:
        print("== Checking Java and MySQL ==", flush=True)
        ensure_java()
        setup_database_linux()

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
