"""Mocked fault-injection for the exact Python script used by Android CI.

No Android device, game account, user save, or network access is used here.
Run with python3 -m unittest discover -s android-demo/ci -p 'test_*.py' -v.
"""
import subprocess
import unittest
from unittest.mock import patch

import verify_profile_restart as proof


def completed(rc=0, stdout=b"", stderr=b""):
    return subprocess.CompletedProcess(("adb",), rc, stdout, stderr)


class PidTransportTests(unittest.TestCase):
    @patch.object(proof.subprocess, "run")
    def test_real_process(self, run):
        run.return_value = completed(stdout=b"1421\n")
        self.assertEqual(proof.pid(), "1421")
        run.assert_called_once_with(
            ("adb", "shell", "pidof", proof.PACKAGE),
            capture_output=True, timeout=30, check=False,
        )

    @patch.object(proof.subprocess, "run")
    def test_multiple_processes(self, run):
        run.return_value = completed(stdout=b"1421 1422\n")
        self.assertEqual(proof.pid(), "1421 1422")

    @patch.object(proof.subprocess, "run")
    def test_absent_process_on_connected_device(self, run):
        run.side_effect = [completed(rc=1), completed(stdout=b"device\n")]
        self.assertEqual(proof.pid(), "")
        self.assertEqual(run.call_args_list[1].args[0], ("adb", "get-state"))

    @patch.object(proof.subprocess, "run")
    def test_absent_process_with_offline_device_fails(self, run):
        run.side_effect = [completed(rc=1), completed(stdout=b"offline\n")]
        with self.assertRaisesRegex(AssertionError, "target not ready"):
            proof.pid()

    @patch.object(proof.subprocess, "run")
    def test_absent_process_with_get_state_failure_fails(self, run):
        run.side_effect = [completed(rc=1), completed(rc=255, stderr=b"error: no devices")]
        with self.assertRaisesRegex(AssertionError, "Android emulator command failed"):
            proof.pid()

    @patch.object(proof.subprocess, "run")
    def test_adb_transport_failure_is_not_absent(self, run):
        run.return_value = completed(rc=255)
        with self.assertRaisesRegex(AssertionError, "pidof query failed"):
            proof.pid()
        run.assert_called_once()

    @patch.object(proof.subprocess, "run")
    def test_exit_one_with_stderr_is_not_absent(self, run):
        run.return_value = completed(rc=1, stderr=b"error: device offline")
        with self.assertRaisesRegex(AssertionError, "pidof query failed"):
            proof.pid()

    @patch.object(proof.subprocess, "run")
    def test_bad_exit_code_with_pid_is_rejected(self, run):
        run.return_value = completed(rc=1, stdout=b"123")
        with self.assertRaisesRegex(AssertionError, "pidof query failed"):
            proof.pid()

    @patch.object(proof.subprocess, "run")
    def test_empty_success_is_not_absent(self, run):
        run.return_value = completed()
        with self.assertRaisesRegex(AssertionError, "Malformed sandbox pidof"):
            proof.pid()

    @patch.object(proof.subprocess, "run")
    def test_non_numeric_pid_rejected(self, run):
        run.return_value = completed(stdout=b"error: no devices")
        with self.assertRaisesRegex(AssertionError, "Malformed sandbox pidof"):
            proof.pid()

    @patch.object(proof.subprocess, "run")
    def test_zero_pid_rejected(self, run):
        run.return_value = completed(stdout=b"0")
        with self.assertRaisesRegex(AssertionError, "Malformed sandbox pidof"):
            proof.pid()

    @patch.object(proof.subprocess, "run")
    def test_unexpected_stderr_rejected(self, run):
        run.return_value = completed(stdout=b"123", stderr=b"error: warning")
        with self.assertRaisesRegex(AssertionError, "pidof query failed"):
            proof.pid()

    @patch.object(proof.subprocess, "run")
    def test_timeout_fails_closed(self, run):
        run.side_effect = subprocess.TimeoutExpired("adb", timeout=30)
        with self.assertRaises(subprocess.TimeoutExpired):
            proof.pid()

    @patch.object(proof, "pid", side_effect=AssertionError("ADB failure"))
    @patch.object(proof, "adb", return_value=b"")
    def test_force_stop_propagates_transport_failure(self, adb, pid):
        with self.assertRaisesRegex(AssertionError, "ADB failure"):
            proof.force_stop()
        adb.assert_called_once_with("shell", "am", "force-stop", proof.PACKAGE)
        pid.assert_called_once()

    @patch.object(proof, "pid", return_value="")
    @patch.object(proof, "adb", return_value=b"")
    def test_force_stop_accepts_verified_absence(self, adb, pid):
        self.assertIsNone(proof.force_stop())
        pid.assert_called_once()


class RestartResultTests(unittest.TestCase):
    @patch.object(proof, "check_airplane_mode")
    @patch.object(proof, "force_stop")
    @patch.object(proof, "start", side_effect=["1421", "1422"])
    @patch.object(proof, "raw_metadata", side_effect=[b"private-raw", b"private-raw"])
    @patch.object(proof, "check_metadata")
    @patch("builtins.print")
    def test_byte_exact_restart_logs_only_narrow_evidence(
        self, show, parse, raw, start, stop, airplane
    ):
        proof.main()
        self.assertEqual(stop.call_count, 2)
        self.assertEqual(parse.call_count, 2)
        self.assertEqual(airplane.call_count, 2)
        log = " ".join(str(item) for item in show.call_args_list)
        self.assertIn("two launches", log)
        self.assertNotIn("private-raw", log)
        self.assertNotIn("no account reset", log)

    @patch.object(proof, "check_airplane_mode")
    @patch.object(proof, "force_stop")
    @patch.object(proof, "start", side_effect=["1421", "1421"])
    @patch.object(proof, "raw_metadata", side_effect=[b"saved", b"saved"])
    @patch.object(proof, "check_metadata")
    def test_same_process_fails(self, parse, raw, start, stop, airplane):
        with self.assertRaisesRegex(AssertionError, "process was not replaced"):
            proof.main()

    @patch.object(proof, "check_airplane_mode")
    @patch.object(proof, "force_stop")
    @patch.object(proof, "start", side_effect=["1421", "1422"])
    @patch.object(proof, "raw_metadata", side_effect=[b"saved", b"modified"])
    @patch.object(proof, "check_metadata")
    def test_changed_raw_bytes_fail(self, parse, raw, start, stop, airplane):
        with self.assertRaisesRegex(AssertionError, "raw profile XML changed"):
            proof.main()


if __name__ == "__main__":
    unittest.main()
