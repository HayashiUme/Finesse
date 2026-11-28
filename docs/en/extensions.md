# Finesse Extensions

Finesse extensions are server-side packages loaded from `Finesse/plugins/<package-id>/`. An extension can register workspace pages, declare display sections, call explicitly allowed HTTP hosts through Lua, and register operations. React renders the declared page using Finesse built-in components; extensions do not ship arbitrary JavaScript or React bundles in this first version.

## Install

Copy an extension folder containing `plugin.json` and `plugin.lua` into `Finesse/plugins/`, then restart Impostor. Invalid packages are skipped. Extension files are trusted server code: only install packages from sources you trust. Lua runs with MoonSharp's soft sandbox and receives only the `finesse` functions described below, but it shares the Finesse process and is not an operating-system security boundary.

`examples/hello-world/` is a minimal extension that makes no network requests and needs no settings. Copy it to `Finesse/plugins/hello-world/`. After restarting Impostor, open **Workspace > Extensions** in the dashboard and select **Hello World > Overview**. A `Ready` status and a JSON details panel confirm that the extension was loaded and its Lua handler ran.

`examples/rauter-cluster/` is a read-only Rauter API example. Copy that folder into `Finesse/plugins/rauter-cluster/`. Edit the installed package's `plugin.json` `allowedHosts` to exactly match the Rauter hostname. Add a sibling `settings.json` with the Rauter URL and a Rauter user-token username/password that is authorized to use `admin_api`:

```json
{
  "baseUrl": "http://127.0.0.1:8080",
  "username": "RAUTER_USER_TOKEN_NAME",
  "password": "YOUR_RAUTER_USER_TOKEN_PASSWORD"
}
```

The example reads `/admin_api/servers/`. It does not implement load-balancer draining, hot updates, or game-changing controls; those require explicit Rauter lifecycle APIs and per-instance command support.

## Manifest

`plugin.json` declares `id`, `name`, `version`, `description`, `allowedHosts`, `pages`, and `actions`. IDs use letters, digits, `.`, `_`, and `-`. Page sections support `stats`, `table`, and `json`, each reading a value from the Lua handler result with `dataPath`. Tables accept explicit `columns` or infer keys from the first row. Actions can set `mutating: true`; Finesse then requires a super administrator. A `confirm` string triggers a browser confirmation prompt.

## Lua API

Each page request or operation creates a fresh sandbox and evaluates `plugin.lua`, then invokes the handler named by the manifest. Handlers return a JSON string (the HTTP result returned by `finesse.request` is already a JSON string).

```lua
finesse.setting("key")
finesse.basic("username", "password")
finesse.request(method, absolute_url, headers_json, body_json)
```

HTTP methods are limited to GET, POST, PUT, and DELETE. The target must use HTTP(S), and the hostname must exactly match an entry in `allowedHosts`. Redirects are disabled. Requests and responses have size limits and a 12 second client timeout. Store credentials in the installed package's `settings.json`, restrict filesystem access to server operators, and do not put secrets in `plugin.json` or `plugin.lua`.

An action handler receives its JSON request body as a Lua string and can return a JSON string. The current generic page renderer invokes actions with an empty object; extensions needing forms should wait for the typed form component API rather than embedding script or HTML into a page.

## API

All routes require a signed-in Finesse account:

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/v1/extensions` | List valid installed extensions and their page/action manifests |
| GET | `/api/v1/extensions/{id}/pages/{pageId}` | Invoke and return a page's data |
| POST | `/api/v1/extensions/{id}/actions/{actionId}` | Invoke an extension operation; mutating actions require super administrator |
