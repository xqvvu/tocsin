# 事件与投递证据包下载（脱敏 JSON）

## 问题

- 事件详情页与投递详情页已经展示排障所需的全部信息：标准化字段、raw payload/headers、
  路由匹配、投递、尝试记录、渲染 payload、通知目标元数据与加急呼叫
  （`apps/console/src/features/events/ui/event-detail-view.tsx`、
  `apps/console/src/features/deliveries/ui/delivery-detail-view.tsx`）。
- 但这些信息只存在于浏览器页面里，没有导出出口。值班 SRE 要把一次告警
  贴到工单、事故复盘或交给同事复核时，只能逐块复制 JSON 或截图，
  既容易漏字段，也无法保证双方看到的是同一份证据
  （`apps/console/src/features/events/ui/event-detail-page.tsx:57-71`、
  `apps/console/src/features/deliveries/ui/delivery-detail-page.tsx:57-74`）。
- 配置页已有下载能力（`apps/console/src/lib/browser.ts:20-33`），
  运维记录（Event/Delivery）反而没有，两个详情页因此成为「只能看、不能带走」的孤岛。

## 用户故事

- 作为值班 SRE，我在事件详情页可以一键下载该事件的脱敏 JSON 证据包，
  直接附到事故工单，而不必手工复制多个 JSON 区块。
- 作为值班 SRE，我在投递详情页可以下载包含尝试记录、渲染 payload 与通知目标元数据的
  证据包，用于向目标侧证明「Tocsin 发了什么、对方回了什么」。
- 作为复核者，我拿到的文件带版本号、类型与导出时间，能判断它来自哪条记录、
  是否是当时那份快照。

## 范围

- 两个详情页工具栏各增加一个「下载证据包」按钮。
- 证据包是一个 JSON 文档，顶层包含：
  - `schemaVersion`：当前为 `1`；
  - `kind`：`event` 或 `delivery`；
  - `subjectId`：事件 ID 或投递 ID；
  - `exportedAt`：导出时刻（ISO 8601）；
  - `event` / `delivery`：详情页已渲染的 DTO 全文。
- 文件名形如 `tocsin-event-<id>-<UTC 时间戳>.json` 与
  `tocsin-delivery-<id>-<UTC 时间戳>.json`，重复下载不覆盖。
- 导出前对整份文档再执行一次 `redactJsonText`，与页面展示使用同一套脱敏规则。
- 中英文文案同步；纯函数与两个按钮各有测试。

## 非目标

- 不新增 oRPC procedure、服务端 DTO、数据库字段或迁移；证据包完全由页面已加载的数据组成。
- 不导出 CSV、ZIP、PDF，也不做批量导出或上传到外部系统。
- 不扩大可见范围：证据包只包含当前登录用户本来就能在详情页看到的数据。
- 不改变保留策略：已被清理的 raw payload 仍以 `rawPayloadPruned` 标记，不尝试找回。

## 验收标准

- 事件详情页点击「下载证据包」后，浏览器下载一个 JSON 文件，内容包含
  `schemaVersion: 1`、`kind: "event"`、事件 ID、`exportedAt` 与完整事件详情。
- 投递详情页同上，`kind: "delivery"`，且包含 `attempts`、`renderedPayload`、
  `destinationMetadata` 与 `pings`。
- 文件名包含类型、ID 与 UTC 时间戳；ID 中的非文件安全字符被替换为 `-`。
- 导出的文本不包含 `apiKey`、`clientSecret`、`Authorization` 等敏感值，
  也不包含标题/错误文本中 `token=...` 形态的凭据。
- 详情数据缺失（404 分支）时不渲染按钮。
- 单元测试覆盖：顶层元数据、序列化格式、事件与投递两类文档、文件名、
  以及 key 形态与自由文本形态的脱敏；组件测试覆盖按钮点击与下载参数。

## 架构边界

- `apps/console/src/features/operations/model/evidence-bundle.ts`：纯函数与类型，
  只依赖 `@tocsin/core` 的 DTO 类型与 `redactJsonText`，不依赖 React 或服务端模块。
- `apps/console/src/features/events/ui/event-evidence-download.tsx` 与
  `apps/console/src/features/deliveries/ui/delivery-evidence-download.tsx`：
  各自一个导出组件，调用既有 `downloadTextFile`。
- 两个详情页只在工具栏挂载按钮，不改变数据加载、查询键或路由。
- 无 `server/`、`infra/`、oRPC 契约或数据库改动；不新增依赖。
- 证据包内容来自已脱敏的读边界 DTO；导出前再次脱敏是纵深防御，不替代服务端投影。
