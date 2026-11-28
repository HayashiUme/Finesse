# Finesse Guide

See [Management features](/en/management) for metrics, reports, server bans, broadcasts, player details and the Empostor feature mapping.

## Multiple Servers

- Open **Servers** in the sidebar to add, search, edit, or remove connections. Each server has its own name, plugin address, and login session.
- The server directory checks signed-in servers every second and shows player and room counts. Totals include reachable servers only; unavailable counts are displayed as a dash. Other servers show **Sign in required**.
- Use the server selector above the sidebar navigation to switch servers. Player lists, room actions, activity logs, and live updates belong to the selected server. Finesse remembers the last selected server after a reload.
- If a connection fails, edit its settings, retry, or switch servers from the same screen. You can save configurations before their servers are available.
- Connections are stored locally in this browser. Existing single-server settings migrate automatically. Removing a saved connection does not stop or modify the game server.

Install the plugin on each Impostor instance. Give each instance its own management address; instances on the same host need different management ports. Add the dashboard origin to each plugin's `allowedOrigins` when hosting the dashboard separately. Deploy the matching dashboard and plugin versions to use account management.

## Accounts and Avatars

- Open **Account settings** directly in the sidebar to edit your avatar or, as the super administrator, create or delete administrator accounts. Account management is separate from appearance settings. Usernames use 3–32 ASCII letters, numbers, dots, dashes or underscores; passwords require 12–256 characters. Ordinary administrators can manage games and players but cannot create or delete accounts.
- Both account types can select, preview, save or remove their own avatar in **Account settings**. The super administrator can also assign an initial avatar when creating an account. PNG, JPEG and WebP source images up to 12 MB are cropped to a square and compressed to 256 × 256 pixels in the browser. The stored image must be at most 256 KB.
- Accounts, password hashes and avatars are stored in `Finesse/accounts.json` beside the Impostor executable. Keep the `Finesse/` data directory when updating the plugin. Existing `finesse-users.json` files are migrated on first startup. Passwords are hashed using salted PBKDF2-SHA256; plaintext passwords are not stored.
- Sessions expire after eight hours and are kept in the current tab's `sessionStorage`. Refreshing restores the session without creating another login notification or audit entry. Closing the tab normally clears its saved session; browser session restoration may retain it until expiry. Restarting Impostor invalidates existing sessions. API Keys are not saved in server connection profiles.
- The login page hides the workspace sidebar and includes server selection, language, theme and configuration help. **Sign out** at the bottom of the sidebar immediately removes the selected server's session and cached queries, then asks the server to revoke its token. Other server sessions and saved connection addresses remain available. If revocation fails, a warning explains that the removed token may still be valid on the server until expiry.
- After one failed login, the next attempt from that IP requires a short arithmetic verification. Five failures from the same IP, or five incorrect credentials for the same account across IPs, within fifteen minutes lock that IP or account for fifteen minutes. Login successes and failures appear in the management log. These counters are held in memory and reset on restart. The arithmetic challenge is a speed bump, not a bot-resistant CAPTCHA; distributed attacks across accounts still need reverse-proxy rate limits or stronger verification.
- For remote access, use HTTPS and configure `allowedOrigins`. Forwarded client IP headers are accepted only from a reverse proxy connecting over loopback.

### Security boundaries

- Dashboard requests use bearer tokens, not authentication cookies. Passwords and API Keys are not persisted by the dashboard. API responses disable caching; fetch requests omit cookies.
- The dashboard refuses authenticated traffic unless both the dashboard and API use HTTPS, except on loopback addresses for local development. HTTPS protects traffic in transit; browser developer tools, the TLS-terminating proxy and the server can still see submitted credentials. Protect the proxy-to-plugin hop too if it crosses machines, and never log request bodies, Authorization or Sec-WebSocket-Protocol headers.
- Dashboard WebSocket authentication uses a protocol header so its session token is not placed in request URLs. Legacy query-string authentication remains available for API clients; avoid it in deployments whose access logs store query strings.
- Session storage is readable by scripts on the dashboard origin. An XSS flaw, a malicious extension or a compromised device can steal a token; this is not equivalent to HttpOnly-cookie isolation. Serve only trusted scripts and configure a restrictive Content Security Policy at the dashboard host.
- The proxy must overwrite client-supplied forwarding headers before forwarding requests. Otherwise an attacker can spoof client IPs and weaken IP-based throttling. Account lockouts can also be used to temporarily deny access to an account.
- Login counters apply to the `/api/v1/auth/login/*` endpoints. Legacy raw API Key authentication on management routes does not use these counters; keep the automatically generated random key and add proxy rate limits for those routes too.

## Dashboard Development

```sh
cd dashboard
npm install
npm run dev
```

Validation:

```sh
npm run build
npm run test:i18n
npm run test:connections
```

Plugin integration checks:

```sh
dotnet run --project tests/Finesse.Integration/Finesse.Integration.csproj
```
