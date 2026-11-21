# Finesse Privacy Policy

Effective date: November 21, 2026

Finesse is a self-hosted management dashboard and Impostor server plugin. This policy describes data handled by the Finesse software. The operator who hosts an Impostor server is responsible for that server, its configuration, backups, access controls, and any additional services they enable.

## No Finesse-operated account or telemetry service

Finesse does not operate a central account service or analytics backend. The dashboard does not send usage analytics or server data to the Finesse maintainers. The dashboard itself does not set authentication cookies.

## Data stored in your browser

The dashboard stores saved server names and plugin addresses, language and appearance preferences, and any custom theme artwork you import in that browser's local storage. API keys and passwords are not saved with server profiles. A successful sign-in session is held in that browser tab's session storage and is subject to the server-issued expiration time (currently eight hours). Clearing browser site data removes these saved settings and sessions.

When you sign in or use management features, the browser sends the necessary credentials and requests directly to the Impostor server address you configured. Credentials are sent as API keys or bearer tokens. Use HTTPS for remote servers; the application permits plain HTTP credentials only for loopback addresses. Requests omit browser cookies.

## Data stored by the server plugin

The plugin stores its management data as JSON files in a `Finesse/` subdirectory of the Impostor application directory. Depending on the features used, this can include administrator account names and password hashes, audit events (including sign-in IP addresses and whether an address is local), moderation and ban entries (which may include IP addresses or friend codes), and player reports. Live player, room, and process information is read from the Impostor server when requested and sent only to authenticated dashboard clients. The server operator controls access, retention, backup, and deletion of these files.

The plugin configuration file, `finesse.json`, is stored beside the Impostor executable and contains the API key used to authenticate the super administrator, along with the API address and allowed dashboard origins. Treat this file as a secret and restrict filesystem access to it.

## Third-party requests

The dashboard checks public release metadata and downloads from GitHub. GitHub receives the normal connection information associated with those requests, such as your IP address and request metadata. The interface also loads fonts from Google Fonts; Google may receive the connection information needed to serve those font files. Finesse does not send API keys, passwords, server snapshots, or player data to GitHub or Google Fonts.

The server operator may configure reverse proxies, hosting providers, or other plugins. Those services may process connection data under their own policies.

## Your choices and contact

You can remove browser-stored profiles and preferences through your browser's site-data controls. You can sign out to clear the active session. Server-side records can be managed by the Impostor server operator, who can stop the server and remove or archive the relevant files in the `Finesse/` data directory.

For questions about the Finesse software, contact the maintainers through the [Finesse GitHub repository](https://github.com/HayashiUme/Finesse). For data held by a particular Impostor server, contact that server's operator.
