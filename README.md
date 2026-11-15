# Finesse

Server management platform for Impostor.

- `dashboard/`: Dashboard built with React, TypeScript, and Vite.
- `plugin/`: Management plugin built with .NET 10 and Impostor.Api.

## Installation and Connection

1. Place `Finesse.Plugin.dll` in the `plugins/` folder of your Impostor installation, then restart Impostor.
2. The plugin creates `finesse.json` **in the same directory as the Impostor executable**.
3. Open the dashboard, enter a server name and the plugin URL (default: `http://127.0.0.1:8097`), and copy the `apiKey` from the configuration file.
4. Choose **Test connection and add** to verify the connection and open the server, or **Save for later** to keep an offline server's configuration. Finesse shows real server data only, without demo data.

The management API uses port `8097` by default, while the dashboard development server typically uses port `5173`. Both are separate from the game's UDP port. Restart Impostor after changing the plugin configuration.

## Multiple Servers

- Open **Servers** in the sidebar to add, search, edit, or remove connections. Each server has its own name, plugin address, and API Key.
- The server directory checks every server's status every 30 seconds and shows player and room counts. Totals include reachable servers only; unavailable counts are displayed as a dash.
- Use the server selector above the sidebar navigation to switch servers. Player lists, room actions, activity logs, and live updates belong to the selected server. Finesse remembers the last selected server after a reload.
- If a connection fails, edit its settings, retry, or switch servers from the same screen. You can save configurations before their servers are available.
- Connections are stored locally in this browser. Existing single-server settings migrate automatically. Removing a saved connection does not stop or modify the game server.

Install the plugin on each Impostor instance. Give each instance its own management address; instances on the same host need different management ports. Add the dashboard origin to each plugin's `allowedOrigins` when hosting the dashboard separately. No plugin update is required for the multi-server dashboard.

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
