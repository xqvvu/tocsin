# 接入预演披露真实送达判定

## 问题

接入预演（Source rehearsal）只做「解析 → 路由匹配 → 目标渲染」三段
（`server/sources/source-rehearsal.service.ts:45-115`），而真实链路还有三道闸门，
预演完全没有体现：

1. **入队时的静默判定**：命中的 `(路由, 目标)` 在写入 `deliveries` 时会按当时生效的
   静默规则决定是否直接落成 `suppressed`
   （`infra/sqlite/repositories/delivery/delivery.repository.ts:148-180`）。
2. **领取时的目标/路由启停**：投递只有在其目标启用、路由启用时才会被领取
   （`delivery.repository.ts:245-263`）。
3. **全局投递暂停**：`settings.deliveryPaused` 为真时，投递队列不领取任何投递，
   队列原地等待（`server/deliveries/delivery-worker.service.ts:64-82`）。

后果：维护窗口或有静默规则覆盖时，预演把目标渲染成一份完整预览，值班同学会据此
向上游确认「链路已通、告警会送达」，而真实告警会被静默或一直排队。这是预演与
生产行为之间唯一没有披露的差异，也是排障时最容易误判的一处。

## 用户故事

作为值班 SRE，我在维护窗口前用接入预演验证上游时，希望同时看到这条告警**此刻真的
会不会送达**、被哪条静默规则挡住、还是因为全局暂停在排队，这样我不会把「预演能渲染」
误当成「告警会送到」。

## 范围

- `@tocsin/core` 的 `SourceRehearsalRender` 增加只读判定：
  - `verdict`：`deliver` / `deduped` / `suppressed` / `queued_paused` /
    `destination_disabled`（`deduped` 由 `docs/prd/source-rehearsal-dedupe-window.md`
    追加，并排在判定顺序最前）；
  - `suppression`：命中时给出规则 `id`、`name`、`kind`、`reason` 与逐条件 `checks`
    （`checks` 与路由判定复用同一 schema，服务端投影前脱敏）。
- `SourceRehearsalResult` 增加 `delivery: { paused, pausedAt }`，让结果本身就能解释
  「为什么在排队」。
- `SourceRehearsalService` 复用真实链路的同一份判定函数
  `selectSuppressionForDelivery`（`packages/core/src/suppression/suppression.ts:278-303`）
  与当前 settings，按预演时刻 `receivedAt` 计算，不复制匹配逻辑。
- 预演结果 UI 增加全局暂停提示条、每个目标的判定徽标与静默规则说明。

判定优先级与真实链路一致：去重窗口先于一切（入队直接跳过、不创建行）；其次静默是
终态；再次目标停用（永不被领取）；再次全局暂停（入队但不领取）；最后才是可送达。

## 非目标

- 不改变入队、领取、暂停或静默的任何语义，不新增投递状态。
- 不做 Token 校验的预演；不写事件表、不写投递表、不调用目标发送。去重窗口的预演由
  `docs/prd/source-rehearsal-dedupe-window.md` 单独扩展。
- 不新增 schema 或迁移。
- 不展示历史的静默命中记录，也不预测未来窗口（只在预演时刻判定）。

## 验收标准

- 无静默、无暂停、目标启用时，`verdict` 为 `deliver`，与改动前渲染结果一致。
- 预演时刻存在命中的静默规则时，`verdict` 为 `suppressed`，并返回规则名、类型、
  可读原因与逐条件检查；返回的检查值已脱敏（不出现原始凭据）。
- `settings.deliveryPaused` 为真且未被静默时，`verdict` 为 `queued_paused`，
  结果顶层 `delivery.paused` 为真并带 `pausedAt`。
- 目标已停用时 `verdict` 为 `destination_disabled`。
- 预演仍然不写任何表、不调用目标 `send`（服务测试用 spy 断言）。
- 服务单测覆盖上述四种判定；i18n 中英文键保持 parity。

## 架构边界

- 契约改动在 `packages/core/src/source/source-rehearsal.ts`（纯 schema 与类型），
  不触碰 server-only 模块，`@tocsin/api` 的 `SourceRehearsalOutputSchema` 自动跟随。
- 判定逻辑在既有 `SourceRehearsalService` 内，依赖 `SqliteStore` 的 settings 与
  suppression 仓储读取；不新增 service、不引入 DI。
- 脱敏复用 `packages/core/src/redaction.ts` 的路由检查投影，新增的 suppression
  `checks` 走同一函数，避免第二套脱敏实现。
- UI 改动限于 `features/sources/ui`，复用现有 shadcn `Badge` / `Alert` 与
  `RouteMatchCheckBadges`，不新增视觉系统；文案使用运维术语「静默」「投递队列」。
