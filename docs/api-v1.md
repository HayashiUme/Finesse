# Finesse API v1

默认根地址 `http://127.0.0.1:8097`。配置和远程代理步骤见 `setup.zh-CN.md`。JSON 使用 camelCase；所有数据为独立 DTO。

## 鉴权与来源

除登录和 OPTIONS 预检外，HTTP 路由需要 `Authorization: Bearer <session-token>`；旧客户端仍可使用 `X-Api-Key: <key>`，权限等同超级管理员。浏览器 WebSocket 连接 `/api/v1/events`，提供子协议 `finesse` 和 `bearer.<session-token>`，服务器选择 `finesse`。兼容旧客户端的 `?token=` 和 `?key=`，但应避免凭据出现在访问日志中。来自浏览器的 HTTP 和 WebSocket Origin 必须是 HTTP 本机回环来源或 `allowedOrigins` 中的准确来源。响应设置 `Cache-Control: no-store`，不使用认证 Cookie。

### 账户和会话

| 方法 | 路径 | 请求 / 结果 |
| --- | --- | --- |
| POST | `/api/v1/auth/login/superadmin` | `{apiKey, captchaId?, captchaAnswer?}` |
| POST | `/api/v1/auth/login/admin` | `{username, password, captchaId?, captchaAnswer?}` |
| GET | `/api/v1/auth/me` | `{user}` |
| POST | `/api/v1/auth/logout` | 撤销当前 bearer 会话，返回 204 |
| PUT | `/api/v1/auth/me/avatar` | `{avatar: dataUrl 或 null}`，返回 `{user}` |
| GET | `/api/v1/auth/users` | 管理员列表，仅超级管理员 |
| POST | `/api/v1/auth/users` | `{username, password, avatar?}`，仅超级管理员 |
| DELETE | `/api/v1/auth/users/{id}` | 删除管理员并撤销其会话，仅超级管理员 |

登录成功返回 `{session:{token,expiresAt,user:{id,username,role,avatar}},login:{ip,location,timestamp}}`，会话有效期八小时。失败返回 `{error,challenge?,retryAfterSeconds}`，401 表示 `invalidCredentials` 或 `captchaInvalid`，429 表示 `lockedOut`。首次失败返回的 challenge 含 `id` 和 `prompt`，下一次提交必须附答案。同一 IP 或账户五次失败锁定十五分钟，详情见 `setup.zh-CN.md`。

## 路由

| 方法 | 路径 | 结果 |
| --- | --- | --- |
| GET | `/api/v1/health` | `{status:"ok", pluginVersion:"0.1.0"}` |
| GET | `/api/v1/overview` | 总览对象 |
| GET | `/api/v1/games` | 房间数组 |
| GET | `/api/v1/players` | 全部已连接玩家数组，包括未入房客户端 |
| GET | `/api/v1/audit` | 最近最多 200 条管理操作，较新记录在前 |
| POST | `/api/v1/players/{clientId}/kick` | 踢出玩家；未入房则断开客户端 |
| POST | `/api/v1/players/{clientId}/ban` | 当前房间内封禁；未入房返回 409 |
| POST | `/api/v1/games/{code}/privacy` | JSON 请求体 `{"isPublic":true}` 或 `false` |
| POST | `/api/v1/games/{code}/close` | 踢出该房间当前玩家，即清空房间 |
| WS | `/api/v1/events` | 使用上述认证子协议，每秒完整快照，连接后立即发送首个快照 |

管理操作成功返回 `204 No Content`。`close` 不是结束游戏协议，也不保证操作期间新加入的玩家被清除。`ban` 不建立持久化的全服黑名单。

`privacy` 请求体最多 1024 字节，支持 Content-Length 或分块传输，读取超时为 10 秒。管理命令经容量 64 的队列串行执行；目标在执行时重新查询。

## 数据结构

总览：

```json
{
  "status": "online",
  "uptimeSeconds": 120,
  "onlinePlayers": 0,
  "activeGames": 0,
  "totalGames": 0,
  "pluginVersion": "0.1.0"
}
```

`uptimeSeconds` 是快照服务启动以来的插件运行秒数；`onlinePlayers` 包括未入房客户端；`activeGames` 只计 `Started` 状态；`totalGames` 计所有房间。

玩家字段：`clientId:number`、`name:string`、`gameCode:string|null`、`isHost:boolean`、`inGame:boolean`。`inGame` 表示玩家所在房间正在对局（`Started`）。

房间字段：`code:string`、`state:string`、`playerCount:number`、`maxPlayers:number`、`isPublic:boolean`、`hostName:string|null`、`players:Player[]`。状态沿用 Impostor GameStates 名称，例如 `NotStarted`、`Starting`、`Started`、`Ended`、`Destroyed`。

审计字段：`timestamp`（UTC ISO 时间）、`action`（login/kick/ban/privacy/close/serverBan/unban/broadcast/message）、`target`（用户名及 IP、客户端 ID、封禁目标或房间码）、`success:boolean`、`detail:string`。登录成功与失败均记录；刷新页面仅恢复会话，不新增登录记录。记录同时写服务器日志，内存记录在重启后清空。消息正文不写入操作记录。

WebSocket 消息：

```json
{
  "type": "snapshot",
  "data": {
    "status": "online",
    "uptimeSeconds": 120,
    "onlinePlayers": 0,
    "activeGames": 0,
    "totalGames": 0,
    "pluginVersion": "0.1.0",
    "games": [],
    "players": []
  }
}
```

前端收到有效快照后才显示「实时连接」。HTTP 每秒重新查询，WebSocket 失败时每 5 秒重连，12 秒未收到数据时重建连接。HTTP 快照查询失败时显示连接错误与重试入口，不展示演示数据。

## 错误

格式：`{"error":"说明"}`。

| HTTP 状态 | 含义 |
| --- | --- |
| 400 | 请求体或参数不合法 |
| 401 | 密钥缺失或错误 |
| 403 | Origin 不允许 |
| 404 | 路由、玩家或房间不存在 |
| 408 | 请求体读取超时 |
| 409 | 当前状态不支持操作，例如未入房玩家被房间封禁 |
| 413 | 分块请求体超过大小限制 |
| 429 | 登录失败次数超过限制，等待 retryAfterSeconds 后重试 |
| 500 | 内部错误，详情写服务器日志 |
| 503 | 管理队列已满或正在关闭 |

本版支持超级管理员及普通管理员、登录失败限制和会话撤销。操作记录不单独持久化；账户、封禁和举报分别保存。数据源可能在多个查询之间变化，快照不提供跨玩家与房间的事务一致性保证。

## 新增管理接口

进程指标、举报、服务器封禁、消息广播及服务器信息接口见 [management.md](management.md)。原有踢出、房间封禁、可见性和清空房间接口继续返回 204。
