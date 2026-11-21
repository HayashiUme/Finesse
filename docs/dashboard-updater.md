# Dashboard updater

Finesse's dashboard is a static site. Unlike a Docker image updater, it does not have a universal service process to restart. This updater downloads the dashboard ZIP from GitHub Releases, validates GitHub's SHA-256 asset digest and the embedded build version, stages the extracted files beside the install directory, then replaces that directory. It can optionally run a host-specific restart command and verify the deployed `service-worker.js` over HTTP. A failed restart or health check restores the previous directory.

The updater uses only Python's standard library and works on Windows, Linux, and macOS. It updates the dashboard only; the Impostor plugin remains a manual DLL replacement followed by an Impostor restart.

## Configure

Copy `tools/finesse-updater.example.json` and set:

- `channel`: `stable` or `nightly`.
- `installDirectory`: the directory served by your static web server. It must already contain the currently deployed Finesse build. Keep this separate from the Finesse source checkout.
- `pollSeconds`: release polling interval; values below five minutes are raised to five minutes.
- `healthUrl`: optional URL to the deployed `service-worker.js`. Leave it out when the host is not reachable from the update process.
- `restartCommand`: optional argument array for the service manager or npm script that actually hosts the site. Leave it empty for Nginx, IIS, or other static file hosting that reads changed files without a restart.

`npm restart` is not built into this repository. It works only if the host's `package.json` defines a restart lifecycle. Configure the real host command instead, for example `systemctl restart finesse-dashboard.service` or a Windows service-control command. The updater never uses a shell to execute the configured command.

## Run once or watch

From the repository root:

```powershell
python tools/finesse_dashboard_updater.py --config C:\finesse\updater.json --check
python tools/finesse_dashboard_updater.py --config C:\finesse\updater.json
python tools/finesse_dashboard_updater.py --config C:\finesse\updater.json --watch
```

`--watch` keeps the updater running and checks Releases at the configured interval. To start it automatically after a reboot, register that command with the host's service manager, Windows Task Scheduler, or container platform. Finesse cannot install that operating-system startup entry without knowing which host platform you use.

For Docker deployments, prefer immutable dashboard images and a container updater such as Watchtower rather than mounting a host folder and running this script inside the web container. Container managers already know how to replace and restart containers while preserving their deployment settings.

The updater keeps the previous release directory beside the install directory. Remove old `.backup-*` directories only after confirming the deployed version is healthy.
