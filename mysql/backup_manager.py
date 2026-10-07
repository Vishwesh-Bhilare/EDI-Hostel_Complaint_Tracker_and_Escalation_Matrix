#!/usr/bin/env python3
"""
backup_manager.py — Core DBMS Backup, Replication & High Availability Manager
for Hostel Complaint Tracker & Escalation Matrix.

Core DBMS Concepts Implemented:
1. Database Backup (Logical Dump): Timestamped SQL snapshots.
2. Secondary / Backup Database Replication: Real-time or periodic hot sync
   between Primary (hostelcare) and Backup (hostelcare_backup).
3. Disaster Recovery & Restoration: One-click restore from backup database or dump file.
4. Health & Parity Check: Compares row counts and table integrity between databases.

Usage:
  python mysql/backup_manager.py --sync        # Syncs data from primary to backup DB
  python mysql/backup_manager.py --dump        # Creates a timestamped .sql dump file
  python mysql/backup_manager.py --restore     # Restores primary DB from backup DB
  python mysql/backup_manager.py --status      # Shows health and table counts of both DBs
"""

import argparse
import datetime
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKUP_DIR = ROOT / "mysql" / "backups"
SCHEMA_SQL = ROOT / "mysql" / "schema.sql"

DB_HOST = os.environ.get("HOSTELCARE_DB_HOST", "localhost")
DB_PORT = os.environ.get("HOSTELCARE_DB_PORT", "3306")
DB_USER = os.environ.get("HOSTELCARE_DB_USER", "root")
DB_PASSWORD = os.environ.get("HOSTELCARE_DB_PASSWORD", "root123")

PRIMARY_DB = "hostelcare"
BACKUP_DB = "hostelcare_backup"

TABLES = [
    "hostel_blocks",
    "complaint_categories",
    "users",
    "pending_registrations",
    "complaints",
    "complaint_history",
    "escalations",
    "notifications",
]


def run_mysql_cmd(query, db=None):
    """Executes a query using the mysql CLI."""
    env = os.environ.copy()
    env["MYSQL_PWD"] = DB_PASSWORD
    cmd = ["mysql", "-h", DB_HOST, "-P", str(DB_PORT), "-u", DB_USER, "-N", "-e", query]
    if db:
        cmd.insert(-2, db)
    res = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if res.returncode != 0:
        raise RuntimeError(f"MySQL error: {res.stderr.strip()}")
    return res.stdout.strip()


def init_backup_database():
    """Initializes hostelcare_backup schema if not present."""
    print(f"[*] Ensuring backup database '{BACKUP_DB}' exists...")
    run_mysql_cmd(f"CREATE DATABASE IF NOT EXISTS {BACKUP_DB};")
    
    # Check if tables exist in backup DB
    existing = run_mysql_cmd("SHOW TABLES;", db=BACKUP_DB)
    if not existing or "complaints" not in existing:
        print(f"[*] Creating normalized schema in '{BACKUP_DB}'...")
        env = os.environ.copy()
        env["MYSQL_PWD"] = DB_PASSWORD
        cmd = ["mysql", "-h", DB_HOST, "-P", str(DB_PORT), "-u", DB_USER, BACKUP_DB]
        with open(SCHEMA_SQL, "rb") as f:
            res = subprocess.run(cmd, stdin=f, capture_output=True, env=env)
        if res.returncode != 0:
            print(f"[!] Warning applying schema to backup DB: {res.stderr.decode()}")
        else:
            print(f"[+] Schema initialized in '{BACKUP_DB}'.")


def create_sql_dump():
    """Creates a timestamped logical backup dump using mysqldump."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    dump_file = BACKUP_DIR / f"hostelcare_dump_{timestamp}.sql"

    print(f"[*] Taking full database backup from '{PRIMARY_DB}' -> {dump_file.name}...")
    env = os.environ.copy()
    env["MYSQL_PWD"] = DB_PASSWORD
    cmd = [
        "mysqldump",
        "-h", DB_HOST,
        "-P", str(DB_PORT),
        "-u", DB_USER,
        "--routines",
        "--triggers",
        PRIMARY_DB
    ]

    with open(dump_file, "wb") as f:
        res = subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE, env=env)
    
    if res.returncode != 0:
        print(f"[!] Backup failed: {res.stderr.decode()}")
        return None
    
    size_kb = os.path.getsize(dump_file) / 1024
    print(f"[+] Backup successfully created: {dump_file} ({size_kb:.1f} KB)")
    return dump_file


def sync_primary_to_backup():
    """Replicates all relational data from primary DB to backup DB (Hot Standby Sync)."""
    init_backup_database()
    print(f"[*] Syncing data: '{PRIMARY_DB}' -> '{BACKUP_DB}'...")

    env = os.environ.copy()
    env["MYSQL_PWD"] = DB_PASSWORD

    # Use mysqldump from primary piped directly into backup database
    dump_cmd = [
        "mysqldump",
        "-h", DB_HOST,
        "-P", str(DB_PORT),
        "-u", DB_USER,
        "--single-transaction",
        "--quick",
        PRIMARY_DB
    ]

    load_cmd = [
        "mysql",
        "-h", DB_HOST,
        "-P", str(DB_PORT),
        "-u", DB_USER,
        BACKUP_DB
    ]

    p1 = subprocess.Popen(dump_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
    p2 = subprocess.Popen(load_cmd, stdin=p1.stdout, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
    p1.stdout.close()  # Allow p1 to receive a SIGPIPE if p2 exits.
    stdout, stderr = p2.communicate()

    if p2.returncode == 0:
        print(f"[+] Successfully synchronized '{PRIMARY_DB}' to '{BACKUP_DB}'.")
        print_status()
        return True
    else:
        print(f"[!] Replication error: {stderr.decode()}")
        return False


def restore_primary_from_backup(dump_file_path=None):
    """Restores the primary database if a problem or data corruption occurs."""
    print(f"[!] Disaster Recovery: Restoring '{PRIMARY_DB}'...")
    env = os.environ.copy()
    env["MYSQL_PWD"] = DB_PASSWORD

    if dump_file_path and Path(dump_file_path).exists():
        target = Path(dump_file_path)
        print(f"[*] Restoring from dump file: {target}...")
        with open(target, "rb") as f:
            res = subprocess.run(
                ["mysql", "-h", DB_HOST, "-P", str(DB_PORT), "-u", DB_USER, PRIMARY_DB],
                stdin=f, capture_output=True, env=env
            )
        if res.returncode == 0:
            print(f"[+] Primary database restored successfully from {target.name}.")
            return True
        else:
            print(f"[!] Restore failed: {res.stderr.decode()}")
            return False
    else:
        print(f"[*] Restoring directly from hot backup database '{BACKUP_DB}'...")
        dump_cmd = [
            "mysqldump",
            "-h", DB_HOST,
            "-P", str(DB_PORT),
            "-u", DB_USER,
            "--single-transaction",
            "--quick",
            BACKUP_DB
        ]
        load_cmd = [
            "mysql",
            "-h", DB_HOST,
            "-P", str(DB_PORT),
            "-u", DB_USER,
            PRIMARY_DB
        ]
        p1 = subprocess.Popen(dump_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
        p2 = subprocess.Popen(load_cmd, stdin=p1.stdout, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
        p1.stdout.close()
        stdout, stderr = p2.communicate()
        if p2.returncode == 0:
            print(f"[+] Primary database '{PRIMARY_DB}' restored from '{BACKUP_DB}'.")
            return True
        else:
            print(f"[!] Restore error: {stderr.decode()}")
            return False


def print_status():
    """Prints status and parity between Primary and Backup databases."""
    print("\n" + "=" * 65)
    print(" DBMS DATABASE HEALTH & BACKUP STATUS")
    print("=" * 65)
    print(f"{'Relation (Table)':<25} | {'Primary (' + PRIMARY_DB + ')':<18} | {'Backup (' + BACKUP_DB + ')':<18}")
    print("-" * 65)

    primary_ok = True
    backup_ok = True

    for tbl in TABLES:
        # Primary count
        try:
            p_cnt = run_mysql_cmd(f"SELECT COUNT(*) FROM {tbl};", db=PRIMARY_DB)
        except Exception:
            p_cnt = "OFFLINE/ERR"
            primary_ok = False

        # Backup count
        try:
            b_cnt = run_mysql_cmd(f"SELECT COUNT(*) FROM {tbl};", db=BACKUP_DB)
        except Exception:
            b_cnt = "OFFLINE/ERR"
            backup_ok = False

        print(f"{tbl:<25} | {p_cnt:<18} | {b_cnt:<18}")

    print("-" * 65)
    print(f"Primary Database Status: {'HEALTHY' if primary_ok else 'FAILED / OFFLINE'}")
    print(f"Backup Database Status:  {'HEALTHY' if backup_ok else 'FAILED / OFFLINE'}")
    print("=" * 65 + "\n")


def main():
    parser = argparse.ArgumentParser(description="HostelCare DBMS Backup & High Availability Manager")
    parser.add_argument("--sync", action="store_true", help="Sync data from primary DB to backup DB")
    parser.add_argument("--dump", action="store_true", help="Generate timestamped SQL dump file")
    parser.add_argument("--restore", action="store_true", help="Restore primary DB from backup DB")
    parser.add_argument("--file", type=str, help="Specific SQL dump file to restore from")
    parser.add_argument("--status", action="store_true", help="Display health and parity status")

    args = parser.parse_args()

    if args.sync:
        sync_primary_to_backup()
    elif args.dump:
        create_sql_dump()
    elif args.restore:
        restore_primary_from_backup(args.file)
    elif args.status:
        print_status()
    else:
        # Default action: sync and show status
        sync_primary_to_backup()


if __name__ == "__main__":
    main()
