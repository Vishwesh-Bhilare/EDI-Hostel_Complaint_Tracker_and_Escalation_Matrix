#!/usr/bin/env python3
"""
run_all.py — starts the whole HostelCare system with one command.

Now that RequestHandler.java serves both the static frontend (index.html,
css/, js/) AND the /api JSON endpoint from the same TCP socket, there is
only one process to run:

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

BACKEND_PORT = os.environ.get("HOSTELCARE_PORT", "8080")

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


def start_backend():
    global backend_proc
    classpath = os.pathsep.join([str(BUILD_DIR), str(MYSQL_JAR)])
    backend_proc = subprocess.Popen(
        ["java", "-cp", classpath, "TcpServer", BACKEND_PORT],
        cwd=ROOT,
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
