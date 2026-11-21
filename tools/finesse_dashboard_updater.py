#!/usr/bin/env python3
"""Update a deployed Finesse static dashboard from GitHub Releases."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any


API = "https://api.github.com/repos/HayashiUme/Finesse/releases"
ASSET_NAME = "Finesse-dashboard.zip"
USER_AGENT = "Finesse-Dashboard-Updater/1.0"
MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
MAX_EXTRACTED_BYTES = 1024 * 1024 * 1024


class UpdateError(RuntimeError):
    pass


def http_json(url: str) -> Any:
    request = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read())


def release_for(channel: str) -> dict[str, Any] | None:
    if channel == "stable":
        release = http_json(f"{API}/latest")
        return release if isinstance(release, dict) else None
    releases = http_json(f"{API}?per_page=100")
    if not isinstance(releases, list):
        raise UpdateError("GitHub returned an invalid release list")
    return next((item for item in releases if item.get("prerelease") and not item.get("draft")), None)


def parse_version(value: str) -> tuple[tuple[int, ...], tuple[str, ...]]:
    value = value.removeprefix("v").split("+", 1)[0]
    core_text, separator, suffix_text = value.partition("-")
    if not re.fullmatch(r"\d+(?:\.\d+)*", core_text):
        raise UpdateError(f"Unsupported version: {value}")
    core = tuple(int(part) for part in core_text.split("."))
    suffix = tuple(suffix_text.split(".")) if separator else ()
    return core, suffix


def is_newer(candidate: str, current: str) -> bool:
    new_core, new_suffix = parse_version(candidate)
    old_core, old_suffix = parse_version(current)
    width = max(len(new_core), len(old_core))
    new_core += (0,) * (width - len(new_core))
    old_core += (0,) * (width - len(old_core))
    if new_core != old_core:
        return new_core > old_core
    if not new_suffix or not old_suffix:
        return not new_suffix and bool(old_suffix)
    for new, old in zip(new_suffix, old_suffix):
        if new == old:
            continue
        if new.isdigit() and old.isdigit():
            return int(new) > int(old)
        if new.isdigit() != old.isdigit():
            return not new.isdigit()
        return new > old
    return len(new_suffix) > len(old_suffix)


def local_version(install_dir: Path) -> str:
    worker = install_dir / "service-worker.js"
    try:
        content = worker.read_text(encoding="utf-8")
    except OSError as error:
        raise UpdateError(f"Cannot read installed service worker at {worker}: {error}") from error
    match = re.search(r"Finesse build ([^\s]+)", content)
    if not match:
        raise UpdateError(f"No Finesse build version marker found in {worker}")
    return match.group(1)


def get_asset(release: dict[str, Any]) -> dict[str, Any]:
    for asset in release.get("assets", []):
        if asset.get("name") == ASSET_NAME and asset.get("state") == "uploaded":
            return asset
    raise UpdateError(f"Release {release.get('tag_name', '?')} has no {ASSET_NAME} asset")


def download_asset(asset: dict[str, Any], destination: Path) -> None:
    request = urllib.request.Request(asset["browser_download_url"], headers={"User-Agent": USER_AGENT})
    digest = asset.get("digest", "")
    expected = digest.removeprefix("sha256:") if digest.startswith("sha256:") else ""
    if not expected:
        raise UpdateError("GitHub did not provide a SHA-256 digest for the dashboard archive")
    hasher = hashlib.sha256()
    total = 0
    with urllib.request.urlopen(request, timeout=60) as response, destination.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_ARCHIVE_BYTES:
                raise UpdateError("Dashboard archive exceeds the 512 MiB download limit")
            hasher.update(chunk)
            output.write(chunk)
    if hasher.hexdigest().lower() != expected.lower():
        destination.unlink(missing_ok=True)
        raise UpdateError("Dashboard archive SHA-256 digest does not match GitHub release metadata")


def extract_dashboard(archive_path: Path, staging: Path) -> Path:
    extracted_total = 0
    try:
        with zipfile.ZipFile(archive_path) as archive:
            entries = archive.infolist()
            if len(entries) > 50000:
                raise UpdateError("Dashboard archive contains too many files")
            for entry in entries:
                path = PurePosixPath(entry.filename)
                if path.is_absolute() or ".." in path.parts or not path.parts or path.parts[0] != "dashboard":
                    raise UpdateError(f"Unsafe or unexpected path in dashboard archive: {entry.filename}")
                mode = (entry.external_attr >> 16) & 0o170000
                if mode == 0o120000:
                    raise UpdateError(f"Symbolic links are not allowed in dashboard archives: {entry.filename}")
                extracted_total += entry.file_size
                if extracted_total > MAX_EXTRACTED_BYTES:
                    raise UpdateError("Extracted dashboard exceeds the 1 GiB size limit")
            archive.extractall(staging)
    except (OSError, zipfile.BadZipFile) as error:
        raise UpdateError(f"Could not extract dashboard archive: {error}") from error
    dashboard = staging / "dashboard"
    if not (dashboard / "index.html").is_file() or not (dashboard / "service-worker.js").is_file():
        raise UpdateError("Release archive does not contain a valid dashboard build")
    return dashboard


def check_health(url: str, expected_version: str, timeout: int) -> None:
    request = urllib.request.Request(url, headers={"Cache-Control": "no-cache", "User-Agent": USER_AGENT})
    deadline = time.monotonic() + timeout
    last_error = "not reachable yet"
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                body = response.read(1024 * 1024).decode("utf-8", errors="replace")
            if f"Finesse build {expected_version}" in body:
                return
            last_error = "the served worker did not report the new version"
        except (OSError, urllib.error.URLError) as error:
            last_error = str(error)
        time.sleep(2)
    raise UpdateError(f"Dashboard health check failed: {last_error}")


def run_update(config: dict[str, Any], check_only: bool = False) -> bool:
    channel = config.get("channel", "stable")
    if channel not in {"stable", "nightly"}:
        raise UpdateError("channel must be 'stable' or 'nightly'")
    install_dir = Path(config["installDirectory"]).expanduser().resolve()
    if not install_dir.is_dir():
        raise UpdateError(f"installDirectory does not exist or is not a directory: {install_dir}")

    release = release_for(channel)
    if not release:
        print(f"No {channel} release found.")
        return False
    version = str(release.get("tag_name", "")).removeprefix("v")
    installed = local_version(install_dir)
    if version == installed:
        print(f"Dashboard is already up to date ({installed}).")
        return False
    if not is_newer(version, installed):
        print(f"Installed version {installed} is newer than release {version}; skipping downgrade.")
        return False
    asset = get_asset(release)
    print(f"Dashboard update available: {installed} -> {version}")
    if check_only:
        return True

    parent = install_dir.parent
    staging_root = Path(tempfile.mkdtemp(prefix=f".{install_dir.name}.stage-", dir=parent))
    archive_path = staging_root / ASSET_NAME
    try:
        download_asset(asset, archive_path)
        dashboard = extract_dashboard(archive_path, staging_root)
        staged_worker = (dashboard / "service-worker.js").read_text(encoding="utf-8")
        if f"Finesse build {version}" not in staged_worker:
            raise UpdateError("Dashboard build version does not match its GitHub release tag")

        backup_dir = parent / f".{install_dir.name}.backup-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
        os.replace(install_dir, backup_dir)
        try:
            os.replace(dashboard, install_dir)
            command = config.get("restartCommand") or []
            if command:
                if not isinstance(command, list) or not all(isinstance(part, str) for part in command):
                    raise UpdateError("restartCommand must be an array of command arguments")
                result = subprocess.run(command, check=False, timeout=int(config.get("restartTimeoutSeconds", 120)))
                if result.returncode != 0:
                    raise UpdateError(f"Restart command failed with exit code {result.returncode}")
            health_url = config.get("healthUrl")
            if health_url:
                check_health(str(health_url), version, int(config.get("healthTimeoutSeconds", 60)))
        except Exception:
            if install_dir.exists():
                failed_dir = parent / f".{install_dir.name}.failed-{int(time.time())}"
                os.replace(install_dir, failed_dir)
            os.replace(backup_dir, install_dir)
            raise
        print(f"Updated dashboard to {version}; previous files are backed up at {backup_dir}")
        return True
    finally:
        shutil.rmtree(staging_root, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True, help="Path to the updater JSON configuration")
    parser.add_argument("--check", action="store_true", help="Check for updates without installing")
    parser.add_argument("--watch", action="store_true", help="Poll GitHub Releases continuously")
    arguments = parser.parse_args()
    try:
        config_path = Path(arguments.config).expanduser().resolve()
        config = json.loads(config_path.read_text(encoding="utf-8"))
        if arguments.watch and arguments.check:
            raise UpdateError("--check and --watch cannot be used together")
        if not arguments.watch:
            run_update(config, check_only=arguments.check)
            return 0
        interval = max(300, int(config.get("pollSeconds", 3600)))
        print(f"Watching for {config.get('channel', 'stable')} dashboard releases every {interval} seconds.")
        while True:
            try:
                run_update(config)
            except (UpdateError, OSError, urllib.error.URLError, ValueError, KeyError) as error:
                print(f"Update check failed: {error}", file=sys.stderr)
            time.sleep(interval)
    except (UpdateError, OSError, json.JSONDecodeError, ValueError, KeyError) as error:
        print(f"Updater error: {error}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Updater stopped.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
