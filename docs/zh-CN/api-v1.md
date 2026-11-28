# HTTP API v1

默认 API 根地址为 `http://127.0.0.1:8097`。远程访问应经由 HTTPS 反向代理。API 使用 camelCase JSON，并向前端返回独立数据模型，不直接暴露服务器内部对象。

## 认证与来源

除登录和 OPTIONS 预检外，请求需要 `Authorization: Bearer <session-token>`。兼容旧客户端使用 `X-Api-Key`，该方式具有超级管理员权限。浏览器 WebSocket 使用 `/api/v1/events`，并通过 `finesse` 与 `bearer.<token>` 子协议传递会话。旧版 `?token=` / `?key=` 查询参数仍可用，但可能进入访问日志，不建议使用。浏览器 Origin 必须是回环来源或 `allowedOrigins` 中的精确来源。响应禁止缓存，不设置认证 Cookie。

## 主要路由

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/api/v1/auth/login/superadmin` | 使用 `apiKey` 登录 |
| POST | `/api/v1/auth/login/admin` | 使用用户名和密码登录 |
| GET | `/api/v1/auth/me` | 获取当前账户 |
| POST | `/api/v1/auth/logout` | 撤销当前会话 |
| GET | `/api/v1/overview` | 获取服务器总览 |
| GET | `/api/v1/games` | 获取房间 |
| GET | `/api/v1/players` | 获取已连接玩家 |
| GET | `/api/v1/audit` | 获取管理日志 |
| POST | `/api/v1/players/{clientId}/kick` | 踢出玩家，可传 `reason` |
| POST | `/api/v1/players/{clientId}/ban` | 对当前房间封禁玩家 |
| GET | `/api/v1/plugins` | 列出已加载插件 |
| POST | `/api/v1/plugins/{id}/enable` | 启用插件（超级管理员） |
| POST | `/api/v1/plugins/{id}/disable` | 停用插件（超级管理员） |
| DELETE | `/api/v1/plugins/{id}` | 删除插件文件（超级管理员） |
| POST | `/api/v1/games/{code}/privacy` | 更改房间可见性 |
| POST | `/api/v1/games/{code}/close` | 踢出该房间当前玩家 |
| WS | `/api/v1/events` | 建立实时快照推送 |

成功的管理操作通常返回 `204 No Content`。房间 `close` 是清空房间，不是结束游戏协议，也不能保证期间新加入的玩家被清除。房间 `ban` 不会创建全服持久封禁。

## 登录限制

登录成功返回会话令牌、过期时间、用户信息和登录来源信息。会话有效期为八小时。首次登录失败后会返回算术验证题；同一 IP 或账户在 15 分钟内失败五次会锁定 15 分钟。登录成功及失败都会写入审计记录。

## 关键响应数据

总览包含 `status`、`uptimeSeconds`、`onlinePlayers`、`activeGames`、`totalGames` 和 `pluginVersion`。运行时间从快照服务启动时计算；在线玩家数含未入房客户端；活动房间只统计正在游戏的房间。WebSocket 连接后立即发送首个完整快照，之后约每秒推送，消息类型为 `snapshot`。

HTTP 状态码包括 400 参数错误、401 未认证、403 Origin 不允许、404 不存在、409 状态冲突、413 请求体过大、429 登录受限、500 内部错误和 503 队列不可用。账户、举报、全服封禁及操作审计持久化在服务器可执行文件旁的 `Finesse/` 目录。详细行为见[管理功能](./management.md)。
