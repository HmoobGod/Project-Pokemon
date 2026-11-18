#!/usr/bin/env python3
"""Fail-closed Android emulator proof of private metadata across actual process death.

Runs ONLY against the disposable org.projectpokemon.offlinesandbox debug package.
Does not clear app data, reset profiles, import game saves, access Standard,
or copy raw preference bytes into logs, CI artifacts, or the repository.
"""
import json
import subprocess
import time
import uuid
import xml.etree.ElementTree as ET

PACKAGE = "org.projectpokemon.offlinesandbox"
ACTIVITY = PACKAGE + "/.OfflineSandboxActivity"
PRIVATE_FILE = "shared_prefs/offline_solo_profile_metadata_v1.xml"
RECORD = "fresh_profile_v1"
NAMESPACE = PACKAGE + ".profile.metadata.v1"


def adb(*args: str, check: bool = True) -> bytes:
    """Enforce bounded commands: no hanging adb call may certify a pass."""
    completed = subprocess.run(
        ("adb", *args), capture_output=True, timeout=30, check=False
    )
    if check and completed.returncode != 0:
        raise AssertionError(
            "Android emulator command failed: " + " ".join(("adb", *args))
            + f" (exit {completed.returncode}); no raw data emitted"
        )
    return completed.stdout


def pid() -> str:
    return adb("shell", "pidof", PACKAGE, check=False).decode(
        "ascii", errors="replace"
    ).strip()


def wait_for_process_present() -> str:
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        found = pid()
        if found:
            return found
        time.sleep(0.4)
    raise AssertionError("Sandbox app process did not start")


def force_stop() -> None:
    adb("shell", "am", "force-stop", PACKAGE)
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if not pid():
            return
        time.sleep(0.4)
    raise AssertionError("Force-stop did not terminate sandbox app process")


def start() -> str:
    # Android Gradle UTP can remove the tested package during teardown. The
    # workflow explicitly installs our own debug APK before this script.
    # A missing target is a harness failure, not a missing/empty player save.
    installed = adb("shell", "pm", "path", PACKAGE).strip()
    if not installed.startswith(b"package:"):
        raise AssertionError("Disposable debug app is not installed; no reset")
    launch = adb("shell", "am", "start", "-W", "-n", ACTIVITY)
    if b"Error:" in launch or b"Status: timeout" in launch:
        raise AssertionError("Android activity launch was rejected or timed out")
    return wait_for_process_present()


def raw_metadata() -> bytes:
    # This is app-owned, generated metadata from the disposable CI debug app.
    # Do not print, upload, or cache the raw XML or profile UUID.
    raw = adb("exec-out", "run-as", PACKAGE, "cat", PRIVATE_FILE)
    if not 20 < len(raw) < 4096:
        raise AssertionError("Missing or oversized sandbox metadata XML")
    return raw


def check_metadata(raw: bytes) -> None:
    root = ET.fromstring(raw)
    assert root.tag == "map", "Expected Android app-private SharedPreferences XML"
    assert len(root) == 1, "Unexpected metadata preference keys"
    key = root[0]
    assert key.tag == "string" and key.get("name") == RECORD
    payload = json.loads(key.text or "")
    assert type(payload) is dict
    assert set(payload) == {"namespace", "schema", "id", "createdAtEpochMillis"}
    assert payload["namespace"] == NAMESPACE
    assert type(payload["schema"]) is int and payload["schema"] == 1
    assert type(payload["createdAtEpochMillis"]) is int
    assert payload["createdAtEpochMillis"] >= 0
    assert type(payload["id"]) is str and payload["id"].startswith("solo-")
    assert uuid.UUID(payload["id"][5:]).version == 4
    # Profile contents are never displayed or uploaded.


def check_airplane_mode() -> None:
    assert adb("shell", "settings", "get", "global", "airplane_mode_on").strip() == b"1", (
        "Emulator airplane-mode requirement not met"
    )


def main() -> None:
    check_airplane_mode()
    force_stop()
    first_pid = start()
    first_raw = raw_metadata()
    check_metadata(first_raw)

    force_stop()
    second_pid = start()
    second_raw = raw_metadata()
    check_metadata(second_raw)
    assert second_pid != first_pid, "Android process was not replaced"
    assert first_raw == second_raw, (
        "App-private raw profile XML changed after force-stop and relaunch"
    )
    check_airplane_mode()
    print("PASS: Android app force-stop/relaunch preserved raw private profile bytes")
    print("PASS: no account reset, profile exposure, game reward, or network grant")


if __name__ == "__main__":
    main()
