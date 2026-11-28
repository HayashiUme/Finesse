# X-API

X-API provides a public, HPLP-compatible game-list endpoint for clients that cannot send an API key. It is separate from the authenticated panel API and the scoped V2 API keys.

## Endpoint

```http
GET /x-api/games
```

The endpoint is disabled by default. A super administrator can enable it from **Interface** in the server workspace. The same page controls whether private rooms are included and sets the region ID, display name, and URL. Configuration is persisted under the server's `Finesse/` directory.

When enabled, the endpoint returns an object with `games` and `regions`. The games list contains public rooms by default. Treat all returned fields as public because callers are anonymous.

When disabled, the route responds with HTTP `503`. No `X-Api-Key`, panel session, or other credential is needed when enabled.

## Example

```sh
curl https://finesse.example.com/x-api/games
```

For browser clients hosted on another origin, add that exact origin to `allowedOrigins` in `finesse.json`. Keep the management listener private or behind an HTTPS reverse proxy.
