<p align="center">
  <img src="images/miku-icon.png" alt="Finesse" width="128" />
</p>

<h1 align="center">Finesse</h1>

<p align="center">Integrated multi-server management platform for Impostor.</p>

[![QQ](https://img.shields.io/badge/QQ-Group-black?style=flat-square)](https://qm.qq.com/q/GeX3Q0Ft0k)
[![GitHub license](https://badgen.net/github/license/HayashiUme/Finesse)](https://github.com/HayashiUme/Finesse/blob/main/LICENSE)
[![GitHub latest commit](https://badgen.net/github/last-commit/HayashiUme/Finesse)](https://github.com/HayashiUme/Finesse/commit/)
[![GitHub all releases](https://img.shields.io/github/downloads/HayashiUme/Finesse/total.svg)](https://github.com/HayashiUme/Finesse/releases/)
[![GitHub contributors](https://badgen.net/github/contributors/HayashiUme/Finesse)](https://github.com/HayashiUme/Finesse/graphs/contributors/)
[![GitHub total-pull-requests](https://badgen.net/github/prs/HayashiUme/Finesse)](https://github.com/HayashiUme/Finesse/pull/)

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
