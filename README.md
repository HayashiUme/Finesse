# Finesse
Integrated multi-server management platform for Impostor.

- `dashboard/`: Dashboard built with React, TypeScript, and Vite.
- `plugin/`: Management plugin built with .NET 10 and Impostor.Api.

## Installation and Connection

1. Place `Finesse.Plugin.dll` in the `plugins/` folder of your Impostor installation, then restart Impostor.
2. The plugin creates `finesse.json` **in the same directory as the Impostor executable**.
3. Open the dashboard and add a server name and plugin URL (default: `http://127.0.0.1:8097`).
4. Open the server and choose **Super administrator** to sign in with the `apiKey` from `finesse.json`, or **Administrator** to use a username and password created by the super administrator. Finesse shows real server data only, without demo data.

The management API uses port `8097` by default, while the dashboard development server typically uses port `5173`. Both are separate from the game's UDP port. Restart Impostor after changing the plugin configuration.
