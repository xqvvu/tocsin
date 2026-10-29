# 告警源接入预演（Source Intake Rehearsal）

## 状态

已交付（第 158 轮，PR 见 `docs/planning/iteration-backlog.md` 的 REQ-13）。

## 问题

在把上游监控系统的 Webhook 指向 Tocsin 之前，运维无法验证三件事：

1. 这段真实载荷能否被所选 provider 解析器解析出期望的标题、级别、状态与指纹；
2. 按当前路由规则会命中哪些路由、每条路由的哪个条件通过或拒绝；
3. 命中的目标会渲染出什么内容。

现有验证手段只有发送真实 Webhook：它会写入事件与投递，解析失败还会落一条
`parse_failed` 事件；目标测试只覆盖「配置 → 渲染 → 发送」，不覆盖上游载荷与路由判定。
接入调试因此必须在生产流量上试错。

## 用户故事

作为值班 SRE，我想在告警源页面粘贴一次上游的原始 Webhook 请求体，看到规范化结果、
解析失败原因、全部路由的逐条件判定，以及命中目标的渲染预览；整个过程不写入事件或投递，
也不发送任何通知，这样我可以在切换上游流量之前完成接入验证。

## 范围

- 新增只读 oRPC procedure `sources.rehearse`，输入 `{ sourceId, payload }`。
- 新增 `SourceRehearsalService`：读取告警源 → 直接调用 `ProviderRegistry.parse`
  （不经过 `WebhookIntakeService`，避免写库与解析失败落库）→ 读取当前路由并调用
  `evaluateRouteMatch` → 对命中路由的目标做纯渲染预览。
- 输出包含：规范化事件与 provider metadata、全部路由的 `checks`（含 expected/actual）、
  每个命中目标的渲染载荷（脱敏后的 JSON 文本）；后续追加的真实投递判定 `verdict`、
  命中的静默规则 `suppression`（含逐条件检查）与顶层 `delivery`（全局暂停状态）见
  `docs/prd/source-rehearsal-delivery-verdict.md`；每个目标的幂等去重判定 `dedupe`
  （窗口命中、首发事件链接）见 `docs/prd/source-rehearsal-dedupe-window.md`。
- Sources 页工具栏新增「接入预演」对话框：选择告警源、粘贴 JSON 请求体、运行预演；
  解析失败、无路由、无命中目标都有独立空态；停用的告警源显示「真实 Webhook 会被拒绝」。
- 请求体上限 256 KiB（`SOURCE_REHEARSAL_PAYLOAD_MAX_CHARS`）。

## 非目标

- 不发送真实通知，不调用适配器 transport。
- 不写入 `events` / `deliveries` / `attempts`，不产生 job，不触发 worker。
- ~~不做抑制、去重窗口、投递缺口的预测或解释。~~ 抑制部分已由
  `docs/prd/source-rehearsal-delivery-verdict.md` 扩展（预演现在返回每个目标的投递判定与命中的
  静默规则）；幂等去重窗口已由 `docs/prd/source-rehearsal-dedupe-window.md` 扩展
  （预演返回每个目标的去重状态与首发事件）；投递缺口仍不预测。
- 不保存预演历史，不提供样例载荷库，不按历史事件重放。
- 无 schema 变更、无迁移。

## 验收标准

1. 预演成功后返回规范化事件、provider metadata、全部路由的逐条件 evidence。
2. 解析失败时返回脱敏后的 `reason` / `message`，不返回路由或渲染结果；
   告警源的存储配置不合法时归类为 `configuration_error`。
3. 预演前后 `events` / `deliveries` 行数不变，且不调用 `recordEvent` /
   `enqueueForEvent` / 适配器 transport。
4. 未知告警源返回 `NOT_FOUND`；所有过程要求 dashboard 鉴权。
5. 超长请求体在边界被拒绝。
6. 未命中任何路由时不渲染目标；命中路由的目标即使已停用也展示渲染内容并标注停用。
7. 中英文案齐备，`vp check` 与 workspace 测试通过。

## 架构边界

- 契约：`packages/api/src/contract/sources.ts`、`packages/api/src/schemas/sources.ts`。
- 共享类型：`packages/core/src/source/source-rehearsal.ts`（环境中立，不依赖
  `@tocsin/providers`）。
- 服务：`apps/console/src/server/sources/source-rehearsal.service.ts`，构造器显式接收
  `store` / `providers` / `destinations` / `now`；由 `container.createSourceRehearsalService`
  装配，不修改既有 `SourceService` 构造器。
- 入口：`server/orpc/features/sources/router.ts` 用 `withDashboardService` 声明依赖，
  handler 一行委托。
- UI：`features/sources/{model,ui}`，复用 `RouteMatchCheckBadges`、
  `RouteMatchResultBadge`、`SeverityBadge`、`EventJsonBlock`，不新增图表或样式系统。
