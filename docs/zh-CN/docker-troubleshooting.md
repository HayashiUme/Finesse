# Docker 连接排查

Finesse Docker 容器在 4173 端口提供静态 React 面板，不会代理 Impostor API。浏览器直接访问你添加的插件 API 地址，因此插件必须允许当前面板来源。

## 面板显示无法连接插件 API

在 Impostor 程序目录中的 `finesse.json` 添加面板来源。来源仅包含协议、域名和可选端口，不要附加路径或末尾斜线：

```json
{
  "url": "http://127.0.0.1:8097/",
  "apiKey": "保留插件生成的密钥",
  "allowedOrigins": ["https://finesse.example.com"]
}
```

填写浏览器地址栏里的面板地址，而非插件 API 地址。修改后重启 Impostor。浏览器也必须能够访问插件 API。HTTPS 面板不能向远程的明文 HTTP API 发送认证信息；公开访问请使用 HTTPS 反向代理。

在远程浏览器中，`127.0.0.1` 指向用户自己的电脑。只有浏览器和 Impostor 位于同一台设备时，才能将该地址作为服务器地址。

## Nginx entrypoint 只读警告

非 root Nginx 镜像的可选 IPv6 初始化脚本可能显示 `can not modify /etc/nginx/conf.d/default.conf (read-only file system?)`。如果随后出现 `Configuration complete; ready for start up` 并启动 Nginx worker，这通常只是初始化脚本未能改写默认配置，不影响静态面板文件服务。该提示不能证明插件 API 已连通，需要在浏览器中单独检查 API 连接。

更多部署步骤见[安装与部署](./installation.md)。
