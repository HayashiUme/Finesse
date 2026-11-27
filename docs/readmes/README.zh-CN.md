## 启动

Finesse 会通过 GitHub Container Registry 发布稳定版和 Nightly 面板镜像。镜像在 `4173` 端口提供静态面板，不包含 Impostor 服务器或 Finesse 插件。

### 从仓库运行

安装 Docker Engine 或 Docker Desktop（含 Docker Compose v2），克隆仓库后运行：

```sh
cp .env.example .env
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

Windows PowerShell 使用：

```powershell
Copy-Item .env.example .env
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

访问 `http://localhost:4173`。如需修改端口，在 `.env` 中设置 `FINESSE_DASHBOARD_PORT`，例如 `8090`。查看状态、日志或停止服务：

```sh
docker compose ps
docker compose logs -f dashboard
docker compose down
```

默认 `compose.yaml` 使用 GHCR 发布的镜像。要从源码构建，请像上面的示例一样同时指定 `compose.build.yaml`。使用已发布镜像时，可通过 `FINESSE_IMAGE_TAG` 选择 `latest` 或 `nightly`，然后拉取并启动：

```sh
docker compose pull
docker compose up -d
```

稳定版会发布 `ghcr.io/hayashiume/finesse-dashboard:latest` 和版本标签；Nightly 会发布 `nightly` 和对应构建标签。若要匿名拉取或使用 WUD 自动更新，请在 GitHub 仓库所有者的 Package 设置中公开 GHCR 镜像。否则需要先登录 `ghcr.io`。

### Docker 自动更新

可选的 `auto-update` Compose 配置使用 What's Up Docker（WUD）监视可变镜像标签；发现镜像摘要变化时重建容器，并在健康检查失败时回滚：

```sh
docker compose --profile auto-update up -d
```

此配置面向 Linux Docker Engine 主机。它挂载 Docker socket，使 WUD 能控制 Docker 守护进程，权限等同主机级管理权限。不要在共享或不可信的 Docker 主机上启用。Docker Desktop 用户可以手动更新：`docker compose pull && docker compose up -d`。

使用 Nightly 镜像时，在 `.env` 中设置 `FINESSE_IMAGE_TAG=nightly`。浏览器客户端会检测已部署的面板构建并自动重新加载；容器更新工具负责部署新镜像。

## 静态托管（不使用 Docker）

构建静态网站，并将 `dashboard/dist/` 的内容复制到 Web 服务器站点目录：

```sh
cd dashboard
npm ci
npm run build
```

配置服务器在客户端路由找不到文件时回退到 `index.html`，并避免对 `index.html` 和 `service-worker.js` 使用长期缓存。静态站点自动更新方式见[面板更新工具文档](../dashboard-updater.md)；更新器需要在主机上运行，并通过服务管理器或计划任务注册。

## 服务器插件

1. Impostor 使用 `Finesse.Plugin.dll`，Empostor 使用 `Finesse.Empostor.Plugin.dll`。将对应 DLL 放入该服务器的 `plugins/` 目录。
2. 重启服务器。插件会在服务器可执行文件所在目录生成 `finesse.json`。
3. 在插件的 `allowedOrigins` 中加入面板的准确来源，例如 `http://localhost:4173`；修改后重启 Impostor。
4. 在 Finesse 中添加插件 API 地址。仅当浏览器与 Impostor 在同一台电脑时使用 `http://127.0.0.1:8097`；远程访问请使用 HTTPS 反向代理，并填写代理公开地址。
5. 选择**超级管理员**并使用 `finesse.json` 中的 `apiKey` 登录；或使用超级管理员创建的普通管理员账户登录。

面板容器只提供网页端口。管理 API 默认使用 `8097` 端口，游戏 UDP 端口与两者分开。Finesse 展示真实服务器数据，不使用演示数据。

插件更新需要手动进行：下载适用于对应服务器的 DLL，替换 `plugins/` 中的文件，然后重启服务器。

## 项目结构

- `dashboard/`：使用 React、TypeScript 和 Vite 构建的仪表盘。
- `plugin/Impostor/`：引用本地 Impostor.Api 项目的 .NET 10 插件。
- `plugin/Empostor/`：使用 Empostor.Api NuGet 包的 .NET 10 插件。
