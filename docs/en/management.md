# Server management

These features adapt Empostor's management workflows to Finesse's separate dashboard and Impostor plugin. They use public Impostor.Api interfaces without changing the game server core. Deploy the matching dashboard and rebuilt plugin, then restart Impostor to enable the new endpoints.

## Where to find features

| Page | Features |
| --- | --- |
| Dashboard | Server uptime, process CPU and memory rings, rooms, recent operations and player reports |
| Players | Search by name, client ID, room, IP, friend code or platform; click a name for details and a server ban form; kick with an optional reason and room ban controls |
| Rooms | Map and mode, room details, visibility, clear room and room messages |
| Moderation | Searchable persistent IP and friend-code bans, expiry, unban and reports |
| Messages | Broadcast to all rooms or send to a selected room, with delivery counts |
| Server tools submenu | Server information plus a loaded plugin panel for runtime enable/disable and DLL removal |
| Activity log | Persistent login attempts and queued player, room, ban, message and plugin operations |

Existing language, theme, background, multiple-server and account settings remain available. The plugin marketplace is excluded. Empostor's HPLP settings, server translation reload, theme registries and extension registry depend on its own core services and are not exposed as working controls in Finesse. Finesse uses its own translations and appearance settings.

## Metrics and reports

The single uptime on the dashboard measures the plugin snapshot service's lifetime. CPU measures the Impostor process across logical processors, normalized to 0–100%. The first sample needs approximately one second. Memory measures the process working set, with host physical RAM as the percentage denominator, not the managed heap or container limit. Windows and Linux support physical-memory detection; unavailable values appear as a dash.

Reports are received through the official custom root-message registration for ReportPlayer, following Empostor's packet format. Reporter and target must share a room, self-reporting is rejected, and each connection has a 30-second cooldown. A recorded report means this server received it; it does not imply submission to an official reporting service.

The plugin asynchronously saves the latest 500 reports in `Finesse/reports.json` beside the Impostor executable. The API returns the latest 200. Another plugin owning the same message flag disables reception; the panel displays that status while preserving access to history. A history read/write failure disables persistence and displays a warning; repair the file or permissions and restart. A legacy `finesse-reports.json` is moved into this directory on first startup when no new file exists. Existing Empostor report files are not imported. Actual in-game report reception has not been validated in a running game.

## Server bans

Server bans are separate from the existing room ban button. A server ban matches an IP or friend code, optionally expires after 1–525600 minutes, and can include a reason of up to 200 characters. Leave duration empty for a permanent ban. IP addresses are normalized, including IPv4-mapped IPv6; friend codes ignore case.

Ban records persist in `Finesse/bans.json` beside the executable. Keep this file when upgrading. Writes use a temporary file followed by replacement. A corrupt history disables editing and preserves the original file. Repair it and restart to restore editing. Expired entries no longer match and disappear from the active list. A legacy `finesse-bans.json` is moved into this directory when needed.

Accounts, including password hashes and avatars, persist in `Finesse/accounts.json`; an existing `finesse-users.json` is migrated automatically. Up to 5,000 management records persist in `Finesse/audit.json`. These are JSON stores behind a small data-store interface; JSON is the only implemented provider.

Adding a ban attempts to disconnect matching online clients. The response distinguishes disconnect failures; a saved ban remains effective even if an immediate disconnect fails. Checks run when clients connect and before they join a room, after higher-priority event handlers. Friend-code bans require a trusted identity plugin to populate and validate `IClient.FriendCode`; stock Impostor does not resolve it automatically. IP bans can affect multiple players sharing an address.

## Messages

Messages use the official host character chat API with a `[Server] ` prefix. A room without a host character is skipped. The interface shows sent, skipped and failed room counts. These counts describe completed server-side send calls, not client read receipts. Broadcasts request confirmation. Message text is limited to 250 characters and rejects control characters; message bodies are not included in audit records.

One-second query updates preserve controlled form inputs. Selecting a different message destination intentionally starts a new draft, so an old draft is not accidentally sent to a different audience. If a selected room disappears, it remains selected as offline rather than silently switching to broadcast.

## API additions

All routes require an authenticated administrator or super administrator. Authentication and Origin rules match the existing management API. Mutations run through the bounded management queue.

| Method | Path | Request / response |
| --- | --- | --- |
| GET | `/api/v1/server` | Runtime information |
| GET | `/api/v1/plugins` | Loaded plugin IDs, names, authors, versions and runtime/file status |
| POST | `/api/v1/plugins/{id}/enable` | Enable a loaded plugin instance; super administrator only |
| POST | `/api/v1/plugins/{id}/disable` | Disable a loaded plugin instance; super administrator only |
| DELETE | `/api/v1/plugins/{id}` | Disable and delete its DLL; super administrator only |
| GET | `/api/v1/bans` | `{available, entries}` |
| POST | `/api/v1/bans` | `{kind, value, reason?, durationMinutes?}` |
| DELETE | `/api/v1/bans/{id}` | Remove a ban by its ID |
| POST | `/api/v1/broadcast` | `{message}` |
| POST | `/api/v1/games/{code}/message` | `{message}` |
| GET | `/api/v1/reports` | `{available, persistenceAvailable, reports}` |

Kick requests may include `{reason}`; the reason is sent to the client as the disconnect message and included in the audit record, with a 200-character limit. New mutation routes return `{delivered, skipped, failed}`. For bans, delivered is the number of disconnected clients; for messages it is the number of rooms whose send completed. Invalid input returns 400, missing targets 404, and unavailable ban storage 503.

Ban entry fields: `id` (32-character GUID), `kind` (`ip` or `friendCode`), `value`, `reason`, `createdAt`, `expiresAt` (null for permanent). Duration may be omitted or null for permanent bans. The store holds up to 5000 active entries.

Server information fields: `runtime`, `operatingSystem`, `architecture`, `processId`, `processorCount`, `serverVersion`, `apiAssemblyVersion`.

The overview and WebSocket snapshot include `process`: `processId`, `cpuPercent`, `workingSetBytes`, `physicalMemoryBytes`, `memoryPercent`, `processorCount`, `sampledAt`. CPU is initially null; physical-memory fields can be null when unavailable. Older plugins without this object display unavailable metrics rather than demo values.

Players additionally expose optional `address`, `friendCode`, `version`, `platform`, `language`; rooms expose `map`, `mode`, `name`. These details and exported player data are restricted to authenticated administrators.

Report fields: `time`, `gameCode`, `reporterName`, `reporterFriendCode`, `reportedName`, `reportedFriendCode`, `reason`, `outcome`. Reasons are `InappropriateName`, `InappropriateChat`, `Cheating_Hacking`, `Harassment_Misconduct`. The locally accepted outcome is `Reported`.

New audit actions include `serverBan`, `unban`, `broadcast`, `message`, `pluginEnable`, `pluginDisable` and `pluginDelete`. Audit history returns up to 5,000 newest-first entries and survives restarts.

Impostor's loader does not support unloading its assembly context. Enable and disable call the loaded plugin's `IPlugin` methods and apply only until server restart. Remove first disables the plugin and deletes its assembly file; the already-loaded assembly remains resident until restart. Finesse protects its own plugin entry from disable and removal.
