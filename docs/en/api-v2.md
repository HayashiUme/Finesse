# Finesse External API

Finesse exposes read-only endpoints for external tools through the plugin's HTTP listener (default `http://127.0.0.1:8097`). These routes use scoped external API keys and do not accept panel login sessions or the super-administrator API key.

Create keys in the server workspace's **Interface** page. A key starts with `sk-`, is shown only once, and is stored on disk as a SHA-256 hash. Send it in the `X-Api-Key` request header. A key can be granted one or both scopes:

| Scope | Endpoint |
| --- | --- |
| `games` | `GET /v2/api/games` |
| `monitor` | `GET /v2/api/monitor` |

Missing, invalid, or out-of-scope keys receive HTTP `401` with `{"error":"interfaceApiKeyInvalid"}`. Revoking a key takes effect immediately. The separate public compatibility endpoint is documented in [X-API](/en/x-api).

## `GET /v2/api/games`

Returns active game rooms and players, following the data shape of Empostor's `api/games/publicgames` endpoint:

```json
{
  "totalGames": 1,
  "totalPlayers": 2,
  "games": [
    {
      "code": "ABCDEF",
      "codeInt": 123456,
      "state": "NotStarted",
      "isPublic": true,
      "playerCount": 2,
      "maxPlayers": 15,
      "map": "TheSkeld",
      "impostors": 1,
      "host": "Player",
      "hostFriendCode": "FRIEND-CODE",
      "players": [
        { "name": "Player", "friendCode": "FRIEND-CODE", "isHost": true, "platform": "Steam" }
      ]
    }
  ]
}
```

## `GET /v2/api/monitor`

Returns process status, UTC timestamp, process uptime, server version/runtime/platform, processor and memory information, and active room/player counts. The property names follow Empostor Monitor's status response, including `uptimeSeconds`, `uptimeDisplay`, `memoryMb`, `gameCount`, `playerCount`, `activeConnections`, and `games`.

## Welcome page

The Interface page installs an HTML file at the plugin listener's `/index` path; the file is stored at `Finesse/Pages/index.html`. The plugin root `/` does not serve this custom page.

For browser clients hosted on another origin, add that exact origin to `allowedOrigins` in `finesse.json`. Keep the API listener private or behind an HTTPS reverse proxy; do not expose it directly to an untrusted network.
