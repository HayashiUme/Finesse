<p align="center">
  <img src="images/miku-icon.png" alt="Finesse" width="128" />
</p>

<h1 align="center">Finesse</h1>

<p align="center">Integrated multi-server management platform for Impostor.</p>
<p align="center">
  <a href="https://qm.qq.com/q/GeX3Q0Ft0k"><img src="https://img.shields.io/badge/QQ-Group-black?style=flat-square" alt="QQ"></a>
  <a href="https://github.com/HayashiUme/Finesse/blob/main/LICENSE"><img src="https://badgen.net/github/license/HayashiUme/Finesse" alt="GitHub license"></a>
  <a href="https://github.com/HayashiUme/Finesse/commit/"><img src="https://badgen.net/github/last-commit/HayashiUme/Finesse" alt="GitHub latest commit"></a>
  <a href="https://github.com/HayashiUme/Finesse/releases/"><img src="https://img.shields.io/github/downloads/HayashiUme/Finesse/total.svg" alt="GitHub all releases"></a>
  <a href="https://github.com/HayashiUme/Finesse/graphs/contributors/"><img src="https://badgen.net/github/contributors/HayashiUme/Finesse" alt="GitHub contributors"></a>
  <a href="https://github.com/HayashiUme/Finesse/pull/"><img src="https://badgen.net/github/prs/HayashiUme/Finesse" alt="GitHub total-pull-requests"></a>
</p>

## Preview

<p align="center">
  <img src="images/preview.png" alt="Finesse dashboard preview" />
</p>

## Startup

Start the dashboard with Docker Compose:

```sh
cp .env.example .env
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

Then open `http://localhost:4173`. For published images, static hosting, and server plugin setup, see the [English startup guide](docs/readmes/README.en.md) or [简体中文启动指南](docs/readmes/README.zh-CN.md).
