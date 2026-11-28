# Finesse installation and connection

Finesse publishes dashboard images to GitHub Container Registry for stable releases and Nightly builds. The image serves the static dashboard on port `4173`; it does not contain the Impostor server or plugin.

### Run from this repository

Install Docker Engine or Docker Desktop with Docker Compose v2, clone this repository, then run:

```sh
cp .env.example .env
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

On Windows PowerShell, copy the environment file with:

```powershell
Copy-Item .env.example .env
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

Open `http://localhost:4173`. Set `FINESSE_DASHBOARD_PORT` in `.env` to change the port, for example `8090`. To inspect or stop the dashboard:

```sh
docker compose ps
docker compose logs -f dashboard
docker compose down
```

The default `compose.yaml` uses the published GHCR image. To build from source, combine it with `compose.build.yaml` as shown above. For a published image, choose `latest` or `nightly` with `FINESSE_IMAGE_TAG`, then pull and start it:

```sh
docker compose pull
docker compose up -d
```

Stable releases publish `ghcr.io/hayashiume/finesse-dashboard:latest` and a version tag. Nightly builds publish the `nightly` tag and a build-specific tag. Make the GitHub Container Registry package public in the repository owner's package settings for anonymous pulls and WUD updates; otherwise authenticate Docker to `ghcr.io` before pulling.

### Automatic Docker updates

The optional `auto-update` Compose profile uses What's Up Docker (WUD) to watch the mutable image tag, recreate the container when its registry digest changes, and roll back if its health check fails:

```sh
docker compose --profile auto-update up -d
```

This profile is intended for Linux Docker Engine hosts. It mounts the Docker socket, which grants WUD control over the Docker daemon and is effectively host-level administrative access. Do not enable it on a shared or untrusted Docker host. Docker Desktop users can update manually with `docker compose pull && docker compose up -d`.

For Nightly images, set `FINESSE_IMAGE_TAG=nightly` in `.env` before starting the Compose project. Browser clients detect a deployed dashboard build and reload automatically; the container update agent is responsible for deploying that build.

## Static Hosting Without Docker

Build the static site and copy the contents of `dashboard/dist/` to your web server's document root:

```sh
cd dashboard
npm ci
npm run build
```

Configure the host to serve `index.html` as the fallback for client-side routes, and avoid long-lived caching for `index.html` and `service-worker.js`. For automatic updates on a static host, see [dashboard updater documentation](/en/dashboard-updater); the updater needs to run on the host and be registered with its service manager or scheduler.

## Server Plugins

1. Use `Finesse.Plugin.dll` for Impostor, or `Finesse.Empostor.Plugin.dll` for Empostor. Place the matching DLL in that server's `plugins/` directory.
2. Restart the server. The plugin creates `finesse.json` beside the server executable.
3. Configure the plugin's `allowedOrigins` with the exact dashboard origin, such as `http://localhost:4173`, then restart Impostor after configuration changes.
4. In Finesse, add the plugin API address. Use `http://127.0.0.1:8097` only when the browser runs on the same computer as Impostor; for remote access, use an HTTPS reverse proxy and enter its public URL.
5. Sign in as **Super administrator** with the `apiKey` from `finesse.json`, or as **Administrator** with an account created by the super administrator.

The dashboard container exposes only its web port. The management API defaults to port `8097`; the game's UDP port is separate. Finesse displays live server data and does not use demo data.

Plugin updates remain manual: download the DLL matching your server, replace it in that server's `plugins/` directory, and restart the server.

