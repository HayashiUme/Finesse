# Finesse 扩展

Finesse 扩展是放置在 Impostor 服务器上的 Lua 包。扩展可注册工作区页面、声明数据展示区块、请求获准访问的 HTTP 主机，并提供操作。当前 React 面板根据扩展声明渲染内置组件；扩展不能注入自带 JavaScript 或 React bundle。

## 安装示例

将包含 `plugin.json` 和 `plugin.lua` 的扩展文件夹复制到服务器的 `Finesse/plugins/<package-id>/`，然后重启 Impostor。无效扩展会被跳过。仓库中的 `examples/hello-world/` 是无需网络访问的入门例子；复制后重启服务器，再从**工作区 > 扩展**打开它。

`examples/rauter-cluster/` 是只读的 Rauter API 样例。要安装它，需要在 `plugin.json` 的 `allowedHosts` 中声明准确主机，并按示例添加 Rauter 地址和用户令牌凭据。该样例不会摘除服务器、执行热更新或修改游戏状态。

## 扩展清单

`plugin.json` 包含 `id`、`name`、`version`、`description`、`allowedHosts`、`pages` 和 `actions`。ID 允许字母、数字、点、下划线和短横线。页面 sections 支持 `stats`、`table`、`json`，通过 `dataPath` 读取 Lua handler 返回值。操作可设 `mutating: true`，这会要求超级管理员权限；设置 `confirm` 则会在浏览器弹出确认提示。

## Lua handler

每次页面加载或操作都会新建脚本沙箱、读取 `plugin.lua` 并执行清单指定的 handler。handler 应返回 JSON 字符串。HTTP 响应也以 JSON 字符串返回。`finesse.request` 只能访问清单里声明的主机。

Lua 使用 MoonSharp 的软沙箱，但仍运行在 Finesse 服务进程中，不是操作系统隔离边界。扩展属于可信服务器代码；请避免无限循环、长时间同步操作、大型响应体、不受信任的 URL，并妥善保护 API 凭据。请参考仓库 `examples/` 中的 manifest 与代码样例。
