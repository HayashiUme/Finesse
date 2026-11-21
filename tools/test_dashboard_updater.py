import hashlib
import io
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

import finesse_dashboard_updater as updater


def make_archive(version: str, unsafe: bool = False) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr("dashboard/index.html", f"<html>{version}</html>")
        archive.writestr("dashboard/service-worker.js", f"// Finesse build {version}\n")
        if unsafe:
            archive.writestr("dashboard/../../escape.txt", "no")
    return output.getvalue()


class UpdaterTests(unittest.TestCase):
    def test_semver_prerelease_ordering(self):
        self.assertTrue(updater.is_newer("0.1.0-dev.20261121.2", "0.1.0-dev"))
        self.assertTrue(updater.is_newer("0.1.0", "0.1.0-dev"))
        self.assertFalse(updater.is_newer("0.1.0-dev", "0.1.0"))
        self.assertFalse(updater.is_newer("0.1.0-dev.2", "0.1.0-dev.10"))

    def test_extract_rejects_path_traversal(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive_path = root / "dashboard.zip"
            archive_path.write_bytes(make_archive("1.1.0", unsafe=True))
            with self.assertRaises(updater.UpdateError):
                updater.extract_dashboard(archive_path, root / "stage")

    def test_update_runs_restart_and_keeps_backup(self):
        payload = make_archive("1.1.0")
        asset = {"name": updater.ASSET_NAME, "state": "uploaded", "digest": f"sha256:{hashlib.sha256(payload).hexdigest()}"}
        release = {"tag_name": "v1.1.0", "assets": [asset]}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            install = root / "site"
            install.mkdir()
            (install / "index.html").write_text("old", encoding="utf-8")
            (install / "service-worker.js").write_text("// Finesse build 1.0.0\n", encoding="utf-8")
            restart_marker = root / "restart-ran.txt"
            config = {
                "channel": "stable",
                "installDirectory": str(install),
                "restartCommand": [sys.executable, "-c", "import pathlib,sys; pathlib.Path(sys.argv[1]).write_text('yes')", str(restart_marker)],
            }
            with patch.object(updater, "release_for", return_value=release), patch.object(updater, "download_asset", side_effect=lambda _asset, destination: destination.write_bytes(payload)), patch.object(updater, "check_health") as health:
                self.assertTrue(updater.run_update(config))
            self.assertEqual((install / "service-worker.js").read_text(encoding="utf-8"), "// Finesse build 1.1.0\n")
            self.assertTrue(restart_marker.is_file())
            health.assert_not_called()
            backups = list(root.glob(".site.backup-*"))
            self.assertEqual(len(backups), 1)
            self.assertEqual((backups[0] / "index.html").read_text(encoding="utf-8"), "old")

    def test_failed_health_check_restores_previous_site(self):
        payload = make_archive("1.1.0")
        asset = {"name": updater.ASSET_NAME, "state": "uploaded", "digest": f"sha256:{hashlib.sha256(payload).hexdigest()}"}
        release = {"tag_name": "v1.1.0", "assets": [asset]}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            install = root / "site"
            install.mkdir()
            (install / "index.html").write_text("old", encoding="utf-8")
            (install / "service-worker.js").write_text("// Finesse build 1.0.0\n", encoding="utf-8")
            config = {"channel": "stable", "installDirectory": str(install), "healthUrl": "http://127.0.0.1/worker.js"}
            with patch.object(updater, "release_for", return_value=release), patch.object(updater, "download_asset", side_effect=lambda _asset, destination: destination.write_bytes(payload)), patch.object(updater, "check_health", side_effect=updater.UpdateError("health failed")):
                with self.assertRaisesRegex(updater.UpdateError, "health failed"):
                    updater.run_update(config)
            self.assertEqual((install / "service-worker.js").read_text(encoding="utf-8"), "// Finesse build 1.0.0\n")
            self.assertEqual((install / "index.html").read_text(encoding="utf-8"), "old")


if __name__ == "__main__":
    unittest.main()
