# Dashboard i18n URL shape

Tocsin 的 dashboard 是登录后的自托管运维 console，不依赖按语言区分的公开 URL、SEO 或可索引内容。我们决定 dashboard 路径保持语言无关，例如 `/events`、`/sources`、`/settings`；界面语言由请求级语言解析、浏览器语言或用户偏好决定。外部 webhook 和 API 路径不参与本地化，避免上游集成 URL 因界面语言变化而改变。

Tocsin dashboard 首批支持 `en-US` 和 `zh-Hans`。默认 fallback locale 是 `en-US`，因为当前 UI 文案、测试基线和 SRE 集成术语以英文为主；请求或浏览器语言匹配到简体中文时归一化为 `zh-Hans`。`zh`、`zh-CN`、`zh-SG`、`zh-Hans` 都视为 `zh-Hans`，`en` 和 `en-US` 都视为 `en-US`。

语言和时区作为实例级呈现偏好写入 `settings` 表，默认值为 `en-US` 和 `UTC`，并进入 TOML/JSON 可移植配置。Tocsin 是单实例单团队部署，后台 delivery worker 没有浏览器 session，因此实例级设置是标准通知渲染能够稳定取得的上下文。Better Auth `user` 表仍不承载这些字段，避免把运行时通知行为绑定到某个管理员。

`tocsin_locale` cookie 保留为单浏览器的 console 语言覆盖。console locale 的解析顺序是 cookie、数据库实例默认值、请求或浏览器语言、`en-US` fallback；console time zone 直接使用数据库实例值。登录前的语言切换仍可写 cookie，Settings 保存实例默认语言时也同步当前浏览器 cookie，保证 SSR 与 client 在刷新后立即一致。

首版消息运行时采用 `use-intl`，不引入 Paraglide/codegen。Tocsin 当前主要需要登录后 console 的 UI 文案、表单校验、toast、少量插值和日期数字格式；`use-intl` 的 React provider 与 SSR 模型足够覆盖这些需求。Paraglide 的 compile-time message functions 和 URL localization 对公开、多语言路由站点更有价值，但会在当前阶段增加 Vite plugin、生成文件和 routing 集成复杂度。

i18n 代码作为 console 的顶层应用能力放在 `apps/console/src/i18n/`，而不是藏在 `integrations/` 下。消息文件用 JSON 组织在 `apps/console/src/i18n/messages/{en-US,zh-Hans}.json`，由源码 import 参与 SSR 和打包，不放到 `public/` 里做运行时 fetch。这样翻译文件对人工编辑和翻译工具友好，同时避免首屏额外请求、缓存版本和 SSR/client 消息不一致的问题。

首版 i18n 迁移采用全量用户可见文案抽取，而不是渐进抽取。应抽取导航、标题、按钮、表格列、空状态、表单 label/description/error、toast、dialog、badge label、404/error 页面，以及技术枚举的显示标签。不得翻译稳定协议值、URL path、TOML 字段名、JSON/raw payload key、数据库存储值、provider 或 destination kind 的机器值、Source token、webhook URL、日志和 debug 原始数据。

语言切换入口在登录前后分开呈现。`/login` 和 `/setup` 在右上角提供紧凑语言选择器，dashboard 登录后把单浏览器语言覆盖放在 user menu 内；Settings 编辑实例默认语言和时区。切换单浏览器语言或保存实例呈现偏好后刷新当前页，让 SSR 与 client 使用同一份 locale、messages 和 time zone。

i18n 有两个明确边界。console UI 继续使用 `use-intl` 翻译界面文案；delivery worker 则把实例 `locale` 和 `timeZone` 作为显式 presentation context 传给 destination adapter，只用于 Tocsin 内置的标准通知模板。标准 Slack、Email、Feishu 输出可以翻译字段标签、severity/status 显示值并格式化发生时间。

稳定机器值和外部协议不参与隐式翻译。Webhook JSON、provider payload、用户自定义模板中的 `event.severity`、`event.status`、`event.occurredAt`、数据库值、错误码、日志和 debug 数据保持原样；自定义模板需要本地化显示时可显式使用 `event.severityDisplay`、`event.statusDisplay` 和 `event.occurredAtDisplay`。未知错误、destination transport error、provider parser error、历史 `lastError` 和 raw/debug 数据继续保持原文并执行现有脱敏规则。

i18n 测试以英文为默认 UI 测试基线。组件和路由测试默认固定 `en-US`，避免为每个页面复制双语断言；单独维护 i18n 测试覆盖 message key parity、locale 归一化、cookie 优先级、`Accept-Language` fallback 和 root `<html lang>`。`zh-Hans` 只需要少量 smoke test 覆盖登录页或 shell/nav 等关键入口。server、service 和 package 测试继续断言机器值、错误码和原始错误。

**Considered Options**

- 使用 `/zh-Hans/...`、`/en-US/...` 这类 locale prefix。它适合公开站点，但会增加 auth redirect、复制链接、route tree、webhook 文档和外部集成路径的复杂度。
- 保持 console URL 语言无关。它更符合 authenticated app 的使用方式，也让现有 dashboard URL、Source webhook URL 和未来 API 边界稳定。
- 使用 Paraglide/codegen 作为消息系统。它能提供很强的编译期能力，但当前 dashboard i18n 不需要把 URL localize，也不值得为了首版翻译引入新的生成流水线。
- 把 messages 放到 `public/` 并由浏览器运行时请求。这会让翻译文件更像静态资产，但会增加 SSR 首屏、加载失败和缓存版本处理复杂度。
- 渐进抽取用户可见文案。它能降低单次 diff，但 Tocsin 仍处于 MVP 阶段，现在全量抽取比未来回头追散落文案更便宜。
- 把语言和时区存为 per-user profile。它适合多租户或个人偏好优先的产品，但后台 worker 无法确定应使用哪个管理员的设置，也不符合当前单实例单团队模型。
