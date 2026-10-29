# 通知模板补充「本次投递」直链 `tocsin.deliveryUrl`

## 背景

通知模板的 `tocsin` 命名空间只有 `tocsin.eventUrl`
（`packages/destinations/src/template.ts:141,200,401-406`），发送输入同样只带 `eventUrl`
（`packages/destinations/src/types.ts:33-47`）。一个 Event 会扇出到所有匹配的目标，
每条投递各自有独立的尝试记录、传输状态与错误响应。

收件人点开 `tocsin.eventUrl` 落到的却是事件详情页，还要在 N 条投递里自己找「发给我的是哪一条」。
对值班 SRE 来说，事件详情回答的是「发生了什么」，而排障时更常问的是「这条通知发出去了吗、
上游接收端回了什么」。后者只在投递详情页可见。

worker 执行投递时手里已经有 `delivery.job.id`（`apps/console/src/server/deliveries/delivery-execution.ts:109-124`），
控制台也已经会为事件拼绝对直链（`apps/console/src/lib/dashboard-url.ts`，来自 `SERVER_URL`）。
缺的只是把这个 id 也变成模板变量。

## 用户故事

作为一名值班 SRE，我希望通知模板能直接引用「本次投递」的 dashboard 直链，
这样收件人点开就落到那一条投递的尝试记录与传输响应，而不是先到事件详情再逐条翻找。

## 范围

1. `DestinationRenderInput` 增加可选 `deliveryUrl`（`packages/destinations/src/types.ts`）。
2. 模板引擎新增静态变量 `tocsin.deliveryUrl`，与 `tocsin.eventUrl` 同级：
   合并进 `TemplateStaticPath`、`TemplateStaticPathResolvers` 与渲染上下文
   （`packages/destinations/src/template.ts`）。`TemplateVariablePaths` 由 resolver 的 key 派生，
   变量面板自动获得该项。
3. `DestinationTemplateContextSchema` 的 `tocsin` 增加 `deliveryUrl`，用 `.default("")`
   让旧的可移植预览上下文仍能解析（`packages/core/src/destination/destination.ts`）。
4. 控制台 URL helper 从 `event-url.ts` 改名并扩展为 `dashboard-url.ts`，
   新增 `deliveryDetailUrl`，与 `eventDetailUrl` 共用同一套 base URL 归一化与 id 编码。
5. worker 在发送输入里填 `deliveryUrl`（`delivery-execution.ts`）。
6. 变量面板把 `tocsin.deliveryUrl` 与 `tocsin.eventUrl` 一起钉在常用变量区。
7. 文档站 `apps/docs/integrations/destinations.md` 的变量表与文本模板示例补充该变量。

## 非目标

- 不做免登录、签名或带过期时间的链接；链接仍要求 dashboard 登录。
- 不新增尝试编号变量（`attemptNumber`）、不暴露投递内部 id 之外的字段。
- 不改变鉴权、路由、投递或重试语义；不新增 schema 迁移。
- 预演与测试发送不伪造投递链接：没有真实投递记录时渲染为空字符串。

## 验收标准

- 配置了 `SERVER_URL` 时，发送输入包含
  `${SERVER_URL}/deliveries/${encodeURIComponent(deliveryId)}`，模板 `{{tocsin.deliveryUrl}}`
  渲染出该绝对地址。
- 未配置 `SERVER_URL` 时，`deliveryUrl` 为 `undefined`，变量渲染为空字符串。
- 预演与测试发送的渲染上下文中 `tocsin.deliveryUrl` 为 `""`。
- 变量面板列出 `tocsin.deliveryUrl`，且不与 `tocsin.eventUrl` 重复出现。
- 既有 `tocsin.eventUrl` 行为、URL 编码与子路径行为保持不变。

## 架构边界

- `packages/destinations` 只负责模板变量与渲染；URL 的绝对化留在控制台的
  `#/lib/dashboard-url.ts`，沿用 `eventUrl` 的既有分层。
- 模板上下文 schema 属于 `@tocsin/core` 的共享契约，保持环境中立、只做加法。
- 新增字段为可选/带默认值：旧调用点（预演、测试发送、第三方渲染方）无需改动即可编译与运行。
