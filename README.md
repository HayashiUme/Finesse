<p align="center">
  <img src="../../images/miku-icon.png" alt="Finesse" width="128" />
</p>

<h1 align="center">Finesse</h1>

<p align="center">Integrated multi-server management platform for Impostor.</p>

## Preview

<p align="center">
  <img src="../../images/preview.png" alt="Finesse dashboard preview" />
</p>
## Startup

Start the dashboard with Docker Compose:

```sh
cp .env.example .env
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

Then open `http://localhost:4173`. For published images, static hosting, and server plugin setup, see the [English startup guide](docs/readmes/README.en.md) or [简体中文启动指南](docs/readmes/README.zh-CN.md).
