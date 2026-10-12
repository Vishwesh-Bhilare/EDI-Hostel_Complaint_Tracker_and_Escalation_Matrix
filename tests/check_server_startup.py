"""Verify actual launcher readiness on a separate port without sending emails."""
import importlib.util
import os
from pathlib import Path
import urllib.request
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("hostelcare_launcher", Path(__file__).resolve().parents[1] / "run_all.py")
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)

launcher.BACKEND_PORT = os.environ.get("HOSTELCARE_TEST_PORT", "18766")
launcher.SMTP_USER = launcher.SMTP_PASS = launcher.SMTP_FROM = ""
with patch.dict(os.environ, {"HOSTELCARE_SMTP_USER": "", "HOSTELCARE_SMTP_PASS": "", "HOSTELCARE_SMTP_FROM": ""}):
    launcher.check_port_available()
    launcher.start_backend()
    try:
        launcher.wait_for_backend()
        with urllib.request.urlopen(f"http://localhost:{launcher.BACKEND_PORT}/", timeout=5) as response:
            assert response.status == 200
            assert b"Hostel Complaint Tracker" in response.read()
        print("Launcher readiness and HTTP response verified.")
    finally:
        launcher.stop_backend()
