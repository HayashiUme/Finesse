# Lua 插件完整开发文档

Finesse 插件是安装在 Impostor 或 Empostor 服务器上的可信 Lua 扩展包。插件通过清单注册仪表盘页面和操作，面板根据清单使用内置区块渲染内容。插件不能注入 JavaScript、HTML 或自己的 React bundle。

## 插件目录

```text
my-extension/
├── plugin.json       # 元数据、页面、操作、主机白名单、翻译
├── plugin.lua        # Lua handler
└── settings.json     # 可选的本地配置和密钥
```

将插件目录复制到服务器可执行文件旁的 `Finesse/plugins/<package-id>/`，然后重启服务器。每个插件目录必须包含 `plugin.json` 和 `plugin.lua`；无效插件会被跳过。仓库 `examples/` 目录中提供了纯本地插件和只读 Rauter API 集成示例。

## 清单字段

以下示例展示清单结构，标记为可选的字段可以省略：

```json
{
  "id": "sample.status",
  "name": "服务器状态",
  "version": "1.0.0",
  "description": "服务器状态页面。",
  "allowedHosts": ["rauter.example.net"],
  "pages": [{
    "id": "overview",
    "title": "概览",
    "description": "当前状态。",
    "handler": "get_overview",
    "sections": [
      { "type": "stats", "title": "状态", "dataPath": "status" },
      { "type": "table", "title": "玩家", "dataPath": "players", "columns": ["name", "state"] },
      { "type": "json", "title": "原始数据", "dataPath": "details" }
    ]
  }],
  "actions": [{
    "id": "refresh",
    "label": "刷新数据",
    "handler": "refresh_data",
    "mutating": false,
    "confirm": "现在刷新吗？"
  }],
  "translations": {}
}
```

ID 只能由 ASCII 字母、数字、点、下划线和短横线组成；页面 ID 与操作 ID 各自必须唯一。页面 handler 返回 JSON 对象，区块通过 `dataPath` 读取其中的属性路径。`stats` 显示数值，`table` 渲染列表（可指定 `columns`，也可根据第一行推断列），`json` 显示格式化后的 JSON。标题和列名建议保持简短。

操作设置 `mutating: true` 后，只有超级管理员能调用。`confirm` 会在浏览器显示确认提示。操作 handler 收到 JSON 请求体字符串；由于扩展 API 尚未提供表单组件，当前面板以 `{}` 调用通用操作。

## 多语言元数据和消息

`translations` 为可选字段，语言键使用 `en`、`zh-CN` 等 BCP 47 locale。缺失翻译会回退到清单中的默认文案。查找顺序为完整 locale、基础语言、英语。没有 `translations` 字段的旧插件会继续按原方式运行。

可翻译插件名称、描述、页面标题与描述、区块标题、操作标签和确认文字。区块翻译使用从零开始的序号字符串作为键。Lua handler 中需要显示的动态文字放在 `messages` 中：

```json
{
  "translations": {
    "en": {
      "name": "Server status",
      "pages": { "overview": { "title": "Overview", "sections": { "0": "State" } } },
      "messages": { "ready": "Ready" }
    },
    "zh-CN": {
      "name": "服务器状态",
      "pages": { "overview": { "title": "概览", "sections": { "0": "状态" } } },
      "messages": { "ready": "就绪" }
    }
  }
}
```

仪表盘会在获取插件列表、页面和操作时通过 `Accept-Language` 发送当前选择的语言。Lua 中可这样读取语言并翻译动态消息：

```lua
function get_overview()
    local language = finesse.language() -- 需要时可按语言调整格式
    local state = finesse.t("ready", "Ready")
    return string.format([[{"status":{"State":"%s"},"language":"%s"}]], state, language)
end
```

`finesse.t(key, fallback)` 会查找所选语言的 `translations[locale].messages[key]`；找不到时返回 `fallback`，若未提供则返回 key。`finesse.language()` 返回规范化的语言标签，例如 `zh-CN` 或 `en-US`。

## Lua handler 执行方式

每次读取页面或调用操作时，Finesse 都会创建一个新的 MoonSharp 软沙箱，加载 `plugin.lua`，并调用清单中指定的 handler。handler 必须返回 JSON 字符串。页面请求按只读方式执行；写操作可由标记为 mutating 的操作处理。handler 在服务器进程中运行，应保持短小且有明确的执行上限。

Lua 可用函数：

| 函数 | 用途 |
| --- | --- |
| `finesse.language()` | 获取当前请求选择的语言。 |
| `finesse.t(key, fallback)` | 获取翻译消息，找不到时使用 fallback。 |
| `finesse.setting(key)` | 从插件的 `settings.json` 读取字符串。 |
| `finesse.basic(user, password)` | 构造 HTTP Basic Authorization 值。 |
| `finesse.request(method, url, headersJson, bodyJson)` | 向白名单主机发 HTTP 请求并返回 JSON 字符串。 |

HTTP helper 支持 GET、POST、PUT、DELETE。目标必须使用 HTTP(S)，且主机名必须与 `allowedHosts` 中的一项完全一致（不能写端口或通配符）。请求不会跟随重定向；请求和响应均有限制，超时为 12 秒。只读页面 handler 只能发 GET；只有 mutating 操作 handler 才允许发起会修改状态的 HTTP 请求。

凭据和本地配置应放在 `settings.json`，并通过文件系统权限限制读取范围。不要把令牌、密码提交到 manifest、Lua 源码或公开仓库。MoonSharp 软沙箱不等同于操作系统隔离：只安装可信插件，避免无限循环和阻塞操作，并校验远程响应数据。

## HTTP 路由

所有扩展路由都要求已登录 Finesse 账户。

| 方法 | 路由 | 用途 |
| --- | --- | --- |
| GET | `/api/v1/extensions` | 列出可用插件并返回本地化清单。 |
| GET | `/api/v1/extensions/{id}/pages/{pageId}` | 运行页面 handler 并返回数据。 |
| POST | `/api/v1/extensions/{id}/actions/{actionId}` | 运行操作；mutating 操作要求超级管理员。 |

## 本地测试与排错

1. 用 JSON 解析器检查 `plugin.json`，并确保所有清单声明的 handler 都在 `plugin.lua` 中实现。
2. 将插件文件夹放入 `Finesse/plugins/` 并重启服务器。
3. 打开**工作区 > 插件**，检查插件、页面和翻译标签是否正常显示。
4. 切换面板语言并重新打开页面，确认清单文案和 `finesse.t()` 返回内容会切换。
5. 插件未出现时查看服务器日志，检查 JSON 格式、重复 ID、区块类型或脚本文件。HTTP 请求失败时，检查 `allowedHosts` 主机名、操作的 mutating 标记，以及 Impostor 进程能否访问目标主机。

## 示例插件

`examples/hello-world/` 演示无需网络访问的页面和中英翻译。`examples/rauter-cluster/` 演示对已声明的 Rauter 主机进行只读 HTTP 请求；它不执行热更新编排或游戏内操作。
