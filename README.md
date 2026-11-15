# Finesse

Server management platform for Impostor.

- `dashboard/`: Dashboard built with React, TypeScript, and Vite.
- `plugin/`: Management plugin built with .NET 8 and Impostor.Api.

## Installation and Connection

1. Place `Finesse.Plugin.dll` in the `plugins/` folder of your Impostor installation, then restart Impostor.
2. The plugin creates `finesse.json` **in the same directory as the Impostor executable**.
3. Open the dashboard, enter a server name and the plugin URL (default: `http://127.0.0.1:8097`), and copy the `apiKey` from the configuration file.
4. Connect to the server. Live data appears only after the connection is verified. If no server is configured or the connection fails, the dashboard displays the server setup page without demo data.

The management API uses port `8097` by default, while the dashboard development server typically uses port `5173`. Both are separate from the game's UDP port. Restart Impostor after changing the plugin configuration.
