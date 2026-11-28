# X-API 使用说明

X-API 为无法携带 API Key 的外部客户端提供公开的 HPLP 兼容房间列表。它与需要登录的管理 API、使用独立密钥授权的 V2 API 相互独立。

## 接口

```http
GET /x-api/games
```

该接口默认关闭。超级管理员可以在具体服务器工作区的**接口**页面启用它，并设置是否包含私有房间、区域 ID、显示名称和区域 URL。配置保存在服务器的 `Finesse/` 目录中。

启用后，接口返回包含 `games` 与 `regions` 的对象；默认只列出公开房间。由于调用方无需认证，请将返回内容视为任何人都可以读取的数据。

接口关闭时返回 HTTP `503`。启用后无需传递 `X-Api-Key`、面板会话或其他凭据。

## 示例

```sh
curl https://finesse.example.com/x-api/games
```

如果浏览器客户端部署在其他源，请在 `finesse.json` 的 `allowedOrigins` 中填写准确的源地址。管理监听端口应保持私有，或通过 HTTPS 反向代理访问。
