# Finesse：安装、端口与连接

本页介绍如何部署 Finesse 面板、安装 Impostor 插件并完成首次连接。面板只展示真实服务器数据，不使用演示数据。

## Docker 部署

安装 Docker Engine 或 Docker Desktop（含 Docker Compose v2），克隆仓库后运行：

```sh
cp .env.example .env
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

访问 `http://localhost:4173`。可在 `.env` 中设置 `FINESSE_DASHBOARD_PORT` 修改网页端口。查看容器状态、日志或停止服务：

```sh
docker compose ps
docker compose logs -f dashboard
docker compose down
```

默认 Compose 文件使用 GHCR 已发布镜像；从源码构建时同时传入 `compose.build.yaml`。可用 `FINESSE_IMAGE_TAG` 选择 `latest` 或 `nightly`。可选 `auto-update` 配置会挂载 Docker socket，赋予更新器控制 Docker 守护进程的权限，只应在可信的 Linux 主机上启用。

## 静态托管

在有 Node.js 的环境中执行：

```sh
cd dashboard
npm ci
npm run build
```

将 `dashboard/dist/` 内容部署到静态 Web 服务器，并将未知客户端路径回退到 `index.html`。不要对 `index.html` 和 `service-worker.js` 使用长期缓存。自动更新方案见[面板更新器](./dashboard-updater.md)。

## 安装 Impostor / Empostor 插件

1. 为 Impostor 使用 `Finesse.Plugin.dll`，为 Empostor 使用 `Finesse.Empostor.Plugin.dll`。
2. 将 DLL 放到服务器的 `plugins/` 目录并重启服务器。
3. 插件会在服务器可执行文件所在目录创建 `finesse.json`。该文件保存管理 API 地址和超级管理员 API Key。
4. 在 `allowedOrigins` 中加入面板的精确来源，例如 `http://localhost:4173`。来源包含协议、域名和可选端口，不包含路径或末尾斜线。更改后重启服务器。
5. 将对应插件 API 地址添加到 Finesse。浏览器与服务器位于同一台设备时可用 `http://127.0.0.1:8097`。
6. 选择**超级管理员**并输入 `finesse.json` 中的 API Key 登录。之后可创建普通管理员账户，供其他管理员使用用户名和密码登录。

配置示例：

```json
{
  "url": "http://127.0.0.1:8097/",
  "apiKey": "保留插件生成的随机密钥",
  "allowedOrigins": ["http://localhost:4173"]
}
```

管理 API 默认端口为 `8097`，网页面板 Docker 默认端口为 `4173`，开发服务器通常使用 `5173`。这些端口均与游戏 UDP 端口分开。修改插件端口后需重启服务器，并在面板中填写新地址。

## 远程访问与安全

远程浏览器中的 `127.0.0.1` 指向用户自己的设备，并非 Impostor 主机。远程访问请通过 HTTPS 反向代理暴露管理 API，并在 `allowedOrigins` 写入面板地址。不要把管理 API 直接暴露到不可信网络。若面板使用 HTTPS，插件 API 也必须使用 HTTPS；只有本机回环开发地址允许明文 HTTP 认证。

服务器的账户、举报、封禁和管理日志存放在 Impostor 程序目录下的 `Finesse/` 文件夹。升级插件时请备份并保留它。`finesse.json` 是密钥文件，不要提交到 Git 或分享。

## 多台服务器

每台 Impostor 实例都要安装对应插件。相同主机上的实例需要使用不同管理端口。面板可保存多个服务器地址和独立登录会话；仪表盘、玩家、房间和操作页面按当前选中的实例显示数据。

## 常见问题

- **没有生成 `finesse.json`**：检查启动日志中是否加载 Finesse 插件，确认 DLL 位于实际运行目录的 `plugins/`，并检查程序目录写权限。
- **Failed to fetch**：确认日志显示 API 正在监听，面板填写了正确地址，浏览器能够访问该地址，并检查 `allowedOrigins`、HTTPS 和反向代理 WebSocket 设置。
- **API Key 不匹配**：确认使用当前服务器实例的 `finesse.json` 中密钥，并检查是否有 `FINESSE_API_KEY` 环境变量覆盖配置。
- **同一台机器多个服务器**：为每个插件配置不同的 `url` 端口。
- **Docker 中看到 Nginx 只读配置警告**：若随后 Nginx 正常启动，该初始化提示通常不影响静态页面；API 连接需另行检查，详见[Docker 连接排查](./docker-troubleshooting.md)。
