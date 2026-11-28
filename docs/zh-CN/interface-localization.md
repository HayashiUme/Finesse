# 界面国际化

## 使用

添加服务器页及管理页面右上角的语言下拉框支持简体中文（`zh-CN`）和英文（`en`）。修改后立即生效，保留当前页面、筛选、搜索及未提交的输入；刷新后优先使用上次选择。

首次访问会按浏览器语言列表顺序匹配中文或英文；没有匹配则使用简体中文。手动选择保存在 `localStorage` 的 `finesse-language`，与服务器连接独立。浏览器禁用本地存储时，切换在当前页面仍有效。

覆盖导航、总览、玩家、房间、操作记录、连接设置、配置帮助、连接错误、确认与结果提示，以及网页标题、页面 `lang`、辅助标签、日期和数字。服务器名称、玩家名称、房间代码、技术配置字段名保留原样。服务器日志和 API 协议不随界面语言变化；未知的服务器状态及审计详情保留服务端原文。

## 扩展语言

1. 在 `dashboard/src/localization/locales/` 新建语言文件，参考 `zh-CN.ts`。以 `en.ts` 的键为准，用 `Record<keyof typeof en, string>` 约束，保留插值变量。
2. 在 `dashboard/src/localization/i18n.ts` 导入资源，加入 `resources` 和 `languages`，并补充 `initialLanguage()` 的浏览器匹配规则。
3. 在 `LanguageSwitcher.tsx` 增加语言选项，选项用该语言自己的名称，并设置 `lang`。
4. 在 `scripts/check-locales.mjs` 中加入新语言的词条和变量检查，并检查该语言的复数规则。
5. 执行 `npm.cmd run test:i18n` 和 `npm.cmd run build`，验证配置页、连接失败、管理页面和窄屏显示。

新文案放入词条，使用 `t('key', { variable })`，避免拼接翻译片段。状态保存固定标识，翻译只用于显示。包含数量的词条使用 i18next 复数形式；日期与数字使用当前语言格式。

连接错误与操作通知保存翻译键及变量，在显示时翻译，使已有提示可随语言切换。富文本帮助通过 `<Trans>` 映射明确的 React 组件，不使用 `dangerouslySetInnerHTML`。


## 新增 Markdown 文档

在 `docs/zh-CN/` 下新建简体中文 `.md` 文件，英文放在 `docs/en/`。用 `# 页面标题` 开头；也可以在文件顶部的 frontmatter 中用 `title` 指定侧边栏标题。文档站构建后，新页面会自动出现在「更多文档」分组下。

同一篇文档的中英文版本应使用相同的相对路径，例如 `zh-CN/tutorials/setup.md` 和 `en/tutorials/setup.md`。切换语言时会打开对应译文；如果没有译文，则打开另一种语言的首页。
