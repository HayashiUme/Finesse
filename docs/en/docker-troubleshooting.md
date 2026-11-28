# Docker connection troubleshooting

The dashboard container serves the static React application on port 4173. It does not proxy requests to Impostor. The browser connects directly to each plugin API URL saved in the dashboard, so the plugin must allow the origin from which the browser loaded Finesse.

## Browser shows "Cannot reach the plugin API"

For a remote deployment, add the dashboard's exact origin to the Impostor-side `finesse.json` file. An origin contains the scheme, hostname and optional port only. Do not include a path or trailing slash.

For example, when the dashboard is opened at `https://finesse.example.com`:

```json
{
  "url": "http://127.0.0.1:8097/",
  "apiKey": "keep-the-generated-value",
  "allowedOrigins": [
    "https://finesse.example.com"
  ]
}
```

Use the URL in the browser address bar, not the plugin API domain. Include a non-default port if the dashboard uses one. After editing `finesse.json`, restart Impostor. The plugin API still needs to be reachable from the user's browser; use HTTPS for a public or remote API, because browsers block authenticated HTTP requests from an HTTPS dashboard.

Do not use `http://127.0.0.1:8097` as the saved API URL unless the browser itself runs on the Impostor host. In a remote browser, `127.0.0.1` means the user's own device.

## Nginx entrypoint warning

The message `can not modify /etc/nginx/conf.d/default.conf (read-only file system?)` comes from the unprivileged Nginx image's optional IPv6 setup script. It is informational when followed by `Configuration complete; ready for start up` and Nginx worker startup. The static dashboard can still be served; this warning does not indicate that the plugin API is reachable.
