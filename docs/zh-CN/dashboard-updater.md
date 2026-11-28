# 面板更新器

Finesse 面板是静态网站，不同主机没有统一的重启服务。仓库的 Python 更新器从 GitHub Releases 下载面板 ZIP，校验 GitHub SHA-256 digest 和构建版本，将文件暂存后替换安装目录。它可以调用主机服务管理器，并通过 HTTP 检查已部署的 `service-worker.js`。若重启或健康检查失败，会恢复原来的目录。

更新器只使用 Python 标准库，支持 Windows、Linux 和 macOS。它只更新面板；插件 DLL 仍需手动替换，并重启 Impostor。

## 配置

复制 `tools/finesse-updater.example.json` 后设置：

- `channel`：选择 `stable` 或 `nightly`。
- `installDirectory`：正在由 Web 服务器提供的面板目录，必须是有效 Finesse 构建，且应与源码目录分开。
- `pollSeconds`：检查间隔，小于五分钟的值会提高到五分钟。
- `healthUrl`：可选的 `service-worker.js` 地址；更新主机无法访问时留空。
- `restartCommand`：可选的服务管理命令数组。Nginx、IIS 等读取磁盘静态文件的服务通常无需重启。

`npm restart` 只有托管目录的 `package.json` 实现了 `restart` 生命周期时才有效。请填写该主机上真实存在的服务命令。更新器不会通过 shell 执行命令。

## 运行

在仓库根目录运行：

```powershell
python tools/finesse_dashboard_updater.py --config C:\finesse\updater.json --check
python tools/finesse_dashboard_updater.py --config C:\finesse\updater.json --watch
```

`--watch` 会持续轮询。若需开机启动，请使用系统服务、Windows 任务计划程序或容器平台注册。Docker 部署建议使用镜像更新器。更新器会在站点目录旁保留旧版本备份；确认部署健康后再清理。
