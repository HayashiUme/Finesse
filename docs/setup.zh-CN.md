# 安装、端口与 API Key

## 1. 先启动插件

插件目标框架为 .NET 10，需要使用 .NET 10 版本的 Impostor。源码构建需要 .NET 10 SDK；运行依赖框架的 Impostor 发行版时需要安装 .NET 10 ASP.NET Core Runtime。

在 Finesse 根目录执行 `dotnet build plugin/Finesse.Plugin.csproj -c Release`，产物位于 `plugin/bin/Release/net10.0/Finesse.Plugin.dll`。默认引用同级 `Impostor` 仓库中的 API，请确保它与实际运行的服务器版本一致。其他 API 源码路径可通过 `-p:ImpostorApiProject="绝对路径/Impostor.Api.csproj"` 指定。

停止 Impostor，将 `Finesse.Plugin.dll` 放入服务器运行目录下的 `plugins/`，然后重新启动服务器。目录示例：

```text
服务器运行目录/
├── Impostor.Server.dll
├── config.json
├── finesse.json          ← 插件首次启动时生成
└── plugins/
    └── Finesse.Plugin.dll
```

查看启动日志，应出现 `Finesse API listening on http://127.0.0.1:8097/`，后面会显示配置文件的完整路径。`finesse.json` 使用服务器程序所在目录，不受启动命令的当前目录影响。

首次启动会生成一个随机密钥。重启保留原密钥；文件中密钥为空或缺失时会生成并保存。配置文件包含未知字段时会保留。无效 JSON 会报告具体文件路径，不会静默覆盖。

## 2. 配置内容

下方是结构示例。**不要把示例占位文字当作密钥，保留首次启动生成的随机值。**

```json
{
  "url": "http://127.0.0.1:8097/",
  "apiKey": "保留自动生成的随机密钥",
  "allowedOrigins": []
}
```

| 项目 | 用途 |
| --- | --- |
| `url` | 插件 HTTP / WebSocket 监听地址。修改 `8097` 可换端口，保留最后的 `/`。仅支持 `http://127.0.0.1:端口/` 或 `http://localhost:端口/`。 |
| `apiKey` | 超级管理员登录凭据。登录时选择「超级管理员」并输入此值。 |
| `allowedOrigins` | 允许访问插件的远程仪表盘来源，例如 `https://panel.example.com`，包括协议和非默认端口，不带路径或结尾斜杠。HTTP 本机回环来源默认允许。 |

修改后重启 Impostor。环境变量 `FINESSE_URL`、`FINESSE_API_KEY` 优先于文件；如果文件里的密钥正确却提示不匹配，请检查启动环境是否设置了覆盖值。日志不会打印密钥。

账户、举报、全服封禁与操作日志保存在 Impostor 程序目录下的 `Finesse/` 文件夹中。更新插件时保留该目录。首次启动会将旧版根目录中的账户、举报和封禁 JSON 文件迁入新目录；配置文件 `finesse.json` 仍保留在 Impostor 程序目录。

不要提交真实 `finesse.json` 到 Git；仓库已忽略此文件。

## 3. 打开仪表盘

开发运行：在 `dashboard/` 执行 `npm.cmd install` 和 `npm.cmd run dev`，打开终端显示的地址。默认 `5173`，端口占用时 Vite 可能选择其他端口。

填写：

- 服务器名称：自行命名，例如「主服务器」。
- 插件地址：同一台电脑可填 `http://127.0.0.1:8097`。

保存连接后，选择「超级管理员」并输入服务器目录中 `finesse.json` 的 `apiKey`，或选择「管理员」使用超级管理员创建的用户名和密码。浏览器只持久保存服务器名称和地址，不保存密码或 API Key。当前标签页的会话令牌保存在 sessionStorage，八小时后过期。未配置服务器时显示添加服务器界面；真实空服务器显示 0 玩家、0 房间。

登录页不显示侧边栏。登录后从侧边栏进入「账户设置」管理头像；超级管理员还可创建和删除管理员。外观设置与账户管理分开。「退出登录」位于侧边栏底部，会立即清除当前服务器的本地会话和查询缓存，并请求服务端撤销令牌，其他服务器的登录不受影响。若服务器离线，会提示远程撤销未确认；旧令牌可能保留至过期。

登录页及外观设置中可切换「简体中文 / English」。语言立即生效并保存在当前浏览器，刷新后保留，不影响服务器连接配置。首次访问按浏览器语言选择，不支持的语言回退为简体中文。

| 端口 | 服务 |
| --- | --- |
| `5173`（开发默认） | 浏览器仪表盘页面 |
| `8097`（插件默认） | Finesse 管理 HTTP API 与 WebSocket |
| Impostor 配置中的游戏端口 | 游戏客户端连接，与上述端口独立 |

生产部署时，将 `dashboard/dist/` 放在静态网站服务器。双击本地 `index.html` 不是部署方式。插件当前不托管前端静态文件。

## 4. 从其他电脑访问

`127.0.0.1` 永远指浏览器所在电脑。远程管理时，请在 Impostor 服务器上配置 HTTPS 反向代理，将 API 代理到本机 `http://127.0.0.1:8097`；仪表盘填写代理后的 HTTPS 地址。不要把仪表盘端口填作 API 地址。

例如仪表盘为 `https://panel.example.com`，API 为 `https://api.example.com`，在 `finesse.json` 中设置：

```json
"allowedOrigins": ["https://panel.example.com"]
```

反向代理需支持 WebSocket Upgrade，保留 `/api/v1/` 路径、`Authorization`、`Sec-WebSocket-Protocol` 请求头，转发 OPTIONS 请求。远程访问时仪表盘和 API 都必须使用 HTTPS；本机回环 HTTP 仅供本机使用。新仪表盘通过 WebSocket 子协议头传递会话令牌，URL 不再携带令牌。旧 API 客户端的查询参数鉴权仍兼容，应避免在访问日志中记录其密钥或令牌。代理必须覆盖用户提交的转发 IP 头，不能直接信任这些值。

## 安全边界

Finesse 不设置认证 Cookie；HTTP 请求明确不携带 Cookie，并禁用响应缓存。密码以随机盐的 PBKDF2-SHA256 哈希保存。HTTPS 可防止网络中的明文窃听，但浏览器开发者工具、TLS 终止代理和服务器仍可看到提交的凭据，不应记录请求体或认证头。sessionStorage 能被同源脚本读取，XSS、恶意扩展或设备失陷仍可导致会话令牌泄露。

首次登录失败后需要算术验证。同一 IP 或同一账户十五分钟内累计五次失败后，锁定十五分钟；账户计数可覆盖更换 IP 的错误凭据尝试。验证失败计入 IP 限制，密码或 API Key 错误还计入账户限制。计数保存在内存，重启清空。算术验证不能抵御有意编写的自动化攻击，公网部署还需反向代理限流或更强验证。账户锁定也可能被恶意触发形成临时拒绝服务。

多服务器、账户、头像及开发命令详见 `guide.md`。

失败计数保护 `/api/v1/auth/login/*` 登录接口；兼容旧客户端的管理路由直接 API Key 鉴权不使用此计数。请保留自动生成的高熵随机密钥，并在代理层对这些路由另外限流。

## 5. 排查连接失败

| 现象 | 检查 |
| --- | --- |
| 没生成 `finesse.json` | 查 Impostor 启动日志中是否加载 Finesse 插件；确认复制到实际运行目录的 `plugins/`，并已重启；按日志中的绝对路径查找文件；确认程序目录可写。 |
| 插件加载失败 | 使用 .NET 10 服务器及相应运行时，核对 Impostor.Api 版本兼容性；不要复制其他服务器的 API DLL。 |
| 无法监听端口 | 更换配置中的空闲端口；Windows 日志若提示 URL 保留权限，需为运行服务器的账户配置相应 HTTP URL 保留。 |
| API Key 不匹配 | 复制当前运行实例生成的密钥；检查 `FINESSE_API_KEY` 环境变量；配置修改后重启。 |
| `Failed to fetch` / 无法访问插件 API | 确认启动日志显示监听成功，插件地址的端口正确；远程使用反向代理地址；检查跨域来源、HTTPS 和代理配置。浏览器可能把跨域拒绝也显示成普通网络错误。 |
| 来源未获允许 | 将浏览器当前仪表盘的准确来源加入 `allowedOrigins`，重启服务器。 |
| API 数据不兼容 / 无效 JSON | 地址可能指向仪表盘页面或其他 HTTP 服务；应填写插件 API 根地址，不包含 `/api/v1`。 |
| 只有定时刷新 | HTTP 已连接，检查反向代理 WebSocket 支持；前端会自动重连 WebSocket。 |

## 6. 验证范围

集成检查覆盖配置生成与持久化、鉴权、跨域、管理命令、审计和连续 WebSocket 推送；玩家及房间操作使用测试对象。另已在隔离副本中启动真实 Impostor，验证加载插件、生成配置、仪表盘连接与空服务器状态。尚未完成真实 Among Us 玩家入房后的端到端操作测试。
