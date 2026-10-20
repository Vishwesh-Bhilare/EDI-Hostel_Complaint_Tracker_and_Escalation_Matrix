import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import Mock, patch


spec = importlib.util.spec_from_file_location("hostelcare_launcher", Path(__file__).resolve().parents[1] / "run_all.py")
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class LauncherTests(unittest.TestCase):
    def test_migrations_use_java_configuration(self):
        with patch.object(launcher.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)) as run:
            launcher.apply_db_migrations()
        command = run.call_args.args[0]
        self.assertEqual(command[0], "java")
        self.assertEqual(command[3], "SqlMigration")
        self.assertEqual(len(command[4:]), 3)
        self.assertNotIn("env", run.call_args.kwargs)  # inherit Java's existing DB configuration

    def test_migration_failure_stops_startup(self):
        with patch.object(launcher.subprocess, "run", return_value=subprocess.CompletedProcess([], 1)):
            with self.assertRaisesRegex(SystemExit, "Database migration failed"):
                launcher.apply_db_migrations()

    def test_busy_port_is_detected_before_compilation(self):
        listener = Mock()
        listener.bind.side_effect = OSError("Address in use")
        socket_context = Mock()
        socket_context.__enter__ = Mock(return_value=listener)
        socket_context.__exit__ = Mock(return_value=False)
        with patch.object(launcher.socket, "socket", return_value=socket_context):
            with self.assertRaisesRegex(SystemExit, "already in use"):
                launcher.check_port_available()

    def test_invalid_port_has_clear_error(self):
        with patch.object(launcher, "BACKEND_PORT", "not-a-number"):
            with self.assertRaisesRegex(SystemExit, "1 to 65535"):
                launcher.check_port_available()

    def test_main_does_not_compile_or_start_with_busy_port(self):
        with patch.object(launcher.signal, "signal"), patch.object(launcher.sys, "argv", ["run_all.py"]), \
                patch.object(launcher, "check_port_available", side_effect=SystemExit("Port busy")), \
                patch.object(launcher, "compile_backend") as compile_backend, \
                patch.object(launcher, "start_backend") as start_backend:
            with self.assertRaises(SystemExit):
                launcher.main()
            compile_backend.assert_not_called()
            start_backend.assert_not_called()

    def test_migrate_only_does_not_start_or_check_server_port(self):
        with patch.object(launcher.signal, "signal"), patch.object(launcher.sys, "argv", ["run_all.py", "--migrate-only"]), \
                patch.object(launcher, "check_port_available") as check_port, \
                patch.object(launcher, "compile_backend"), patch.object(launcher, "apply_db_migrations") as migrate, \
                patch.object(launcher, "start_backend") as start_backend, patch("builtins.print"):
            launcher.main()
            migrate.assert_called_once()
            check_port.assert_not_called()
            start_backend.assert_not_called()

    def test_failed_backend_is_not_reported_as_running(self):
        with patch.object(launcher, "backend_proc", Mock(poll=Mock(return_value=1))), \
                patch.object(launcher, "backend_ready", Mock(wait=Mock(return_value=False))):
            with self.assertRaisesRegex(SystemExit, "No new server is running"):
                launcher.wait_for_backend()

    def test_backend_readiness_is_required(self):
        with patch.object(launcher, "backend_ready", Mock(wait=Mock(return_value=True))):
            launcher.wait_for_backend()

    def test_backend_timeout_stops_owned_process(self):
        with patch.object(launcher.time, "monotonic", side_effect=[0, 0, 11]), \
                patch.object(launcher, "backend_proc", Mock(poll=Mock(return_value=None))), \
                patch.object(launcher, "backend_ready", Mock(wait=Mock(return_value=False))), \
                patch.object(launcher, "stop_backend") as stop:
            with self.assertRaisesRegex(SystemExit, "startup timed out"):
                launcher.wait_for_backend()
            stop.assert_called_once()


if __name__ == "__main__":
    unittest.main()
