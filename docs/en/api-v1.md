# Finesse API v1

The default API base URL is `http://127.0.0.1:8097`. Use an HTTPS reverse proxy for remote access. Responses use camelCase JSON and dedicated DTOs; the plugin does not expose Impostor's internal objects directly.

## Authentication and origins

All routes except login and OPTIONS preflight require `Authorization: Bearer <session-token>`. Legacy clients can use `X-Api-Key`, which grants super-administrator access. Browser WebSockets connect to `/api/v1/events` and authenticate with the `finesse` and `bearer.<token>` subprotocols. Legacy `?token=` and `?key=` parameters remain available but can leak into access logs. Browser HTTP and WebSocket origins must be loopback or an exact entry in `allowedOrigins`. Responses use `Cache-Control: no-store`; the API does not use authentication cookies.

## Routes

| Method | Path | Request / result |
| --- | --- | --- |
| POST | `/api/v1/auth/login/superadmin` | `{apiKey, captchaId?, captchaAnswer?}` |
| POST | `/api/v1/auth/login/admin` | `{username, password, captchaId?, captchaAnswer?}` |
| GET | `/api/v1/auth/me` | `{user}` |
| POST | `/api/v1/auth/logout` | Revoke the current bearer session; 204 |
| PUT | `/api/v1/auth/me/avatar` | `{avatar: dataUrl or null}`; returns `{user}` |
| GET | `/api/v1/auth/users` | List administrators; super administrator only |
| POST | `/api/v1/auth/users` | `{username, password, avatar?}`; super administrator only |
| DELETE | `/api/v1/auth/users/{id}` | Delete an administrator and revoke their sessions |
| GET | `/api/v1/health` | Health and plugin version |
| GET | `/api/v1/overview` | Server overview |
| GET | `/api/v1/games` | Room array |
| GET | `/api/v1/players` | Connected clients, including clients outside rooms |
| GET | `/api/v1/audit` | Up to 5,000 persistent audit records, newest first |
| POST | `/api/v1/players/{clientId}/kick` | Optional `{reason}` (up to 200 characters) |
| POST | `/api/v1/players/{clientId}/ban` | Ban from the current room; 409 if not in a room |
| GET | `/api/v1/plugins` | Loaded plugin details |
| POST | `/api/v1/plugins/{id}/enable` | Enable a plugin instance; super administrator only |
| POST | `/api/v1/plugins/{id}/disable` | Disable a plugin instance; super administrator only |
| DELETE | `/api/v1/plugins/{id}` | Disable and delete plugin DLL; removal completes after restart |
| POST | `/api/v1/games/{code}/privacy` | JSON body `{"isPublic":true}` or `false` |
| POST | `/api/v1/games/{code}/close` | Disconnect current players in the room |
| WS | `/api/v1/events` | Authenticated full snapshots; first snapshot is sent immediately |

Successful management actions usually return `204 No Content`. `close` empties the room; it does not send the game's end-game protocol and does not guarantee that players joining during the operation are removed. Room `ban` does not create a persistent server-wide ban.

The `privacy` request body is limited to 1,024 bytes and has a 10-second read timeout. Management commands run serially through a bounded queue of 64 items; targets are looked up again when each command executes.

## Login and throttling

Successful login returns `{session:{token,expiresAt,user:{id,username,role,avatar}},login:{ip,location,timestamp}}`. Sessions expire after eight hours. Failures return `{error,challenge?,retryAfterSeconds}`; HTTP 401 indicates invalid credentials or an invalid challenge, and 429 indicates a lockout. After an initial failure, the next attempt must include the returned challenge `id` and answer. Five failures for an IP or account within fifteen minutes trigger a fifteen-minute lockout.

## Response data

The overview includes `status`, `uptimeSeconds`, `onlinePlayers`, `activeGames`, `totalGames` and `pluginVersion`. Uptime starts when the snapshot service starts. `onlinePlayers` includes clients not in rooms; `activeGames` counts rooms in `Started` state.

Player fields include `clientId`, `name`, `gameCode`, `isHost` and `inGame`. Room fields include `code`, `state`, `playerCount`, `maxPlayers`, `isPublic`, `hostName` and `players`. Game state names follow Impostor, such as `NotStarted`, `Starting`, `Started`, `Ended` and `Destroyed`.

WebSocket messages use `{type:"snapshot",data:{...}}`. The server sends a complete snapshot immediately and approximately every second. The dashboard reports a live connection only after receiving a valid snapshot. If WebSockets fail, clients may poll HTTP and retry the connection; no demo data is returned.

Errors use `{"error":"..."}`. Common statuses: 400 invalid input, 401 unauthenticated, 403 disallowed origin, 404 missing route/player/room, 408 body timeout, 409 incompatible state, 413 oversized body, 429 login throttled, 500 internal error, and 503 queue full or shutting down.

Accounts, reports, server-wide bans and audit records persist as JSON files under `Finesse/` beside the Impostor executable. Legacy data files are migrated on startup. Storage is currently JSON-only. Snapshot data can change between queries and is not transactionally consistent across players and rooms. See [management features](/en/management).
