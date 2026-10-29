# 接入预演披露幂等去重窗口

## 问题

接入预演会渲染命中路由的每个目标，并披露静默、目标启停与全局暂停三道闸门
（`docs/prd/source-rehearsal-delivery-verdict.md`），但**不预测幂等去重**：

- 预演明确把去重排除在范围外（`docs/prd/source-intake-rehearsal.md`「非目标」一节）。
- 真实接入在入队时按 `(告警源, 幂等键, 路由, 目标)` 计算去重键，窗口内（默认 5 分钟）
  已存在则不创建投递：`apps/console/src/server/intake/intake.service.ts:126-129`、
  `apps/console/src/infra/sqlite/repositories/delivery/delivery.repository.ts:120-145`、
  `apps/console/src/infra/sqlite/repositories/delivery/delivery.helpers.ts:103-142`。

后果：上游重试、重复推送或值班同学手动重发同一段载荷时，预演显示「会送达」，
而真实链路创建 0 条投递。这是预演与生产之间仅剩的一处会改变投递数量的差异，
也是排查「dashboard 里没有新通知」时最容易误判的一处。

## 用户故事

作为值班 SRE，我刚收到一条告警、怀疑上游在重复推送时，希望用接入预演回放同一段
载荷就能看到「会被去重」以及窗口内首次投递对应的事件，这样我不会把预演的完整渲染
误当成「又发了一次通知」，也不用去数据库里查去重键。

## 范围

- `@tocsin/core` 的 `SourceRehearsalRender` 增加只读 `dedupe`
  （`packages/core/src/source/source-rehearsal.ts`）：
  - `state`：`not_applicable`（解析器未提供幂等键）/ `would_deliver`（窗口内无键）/
    `would_dedupe`（该目标的全部命中路由都在窗口内）/ `partially_deduped`
    （部分命中路由在窗口内，其余仍会新建投递）；
  - `windowMs` 与 `windowStartsAt`：预演检查的窗口长度与起点；
  - `matchedPairCount` / `dedupedPairCount`：该目标的命中 `(路由, 目标)` 对数与命中窗口数；
  - `routeId` / `routeName` / `firstEventId`：最早命中窗口的路由与首发事件，供 UI 链接。
- `SourceRehearsalVerdict` 增加 `deduped`，并放在判定顺序最前：真实入队在静默判定之前
  就跳过该 `(路由, 目标)`，不会创建行。
- 投递仓储增加只读查询 `findDedupeKeys`
  （`apps/console/src/infra/sqlite/repositories/delivery/delivery.repository.ts:194`），
  复用与入队完全相同的窗口谓词（`created_at >= windowStartsAt`），但不写入、不占用、
  不刷新去重键，也不触发清理。
- `SourceRehearsalService` 用与 `WebhookIntakeService` 相同的默认窗口（5 分钟，
  `dedupeWindowMs` 可注入），在解析成功后一次性查出该幂等键的窗口内命中，
  再按目标投影成 `dedupe`；没有幂等键时直接标记 `not_applicable`，不发查询。
- 预演结果 UI 在每个目标卡片上增加一行「去重判定」，命中窗口时显示
  `命中目标数 / 命中目标总数`、窗口分钟数与「首次由事件 <事件链接>」。

## 非目标

- 不改变入队、去重窗口、清理或重试的任何语义；不新增 schema 或迁移。
- 不做去重窗口的可配置化（仍走 REQ-119 的独立候选）。
- 不预测加急电话（oncall ping）去重，不重放历史去重命中，不写入任何表。
- 不返回去重键原文或幂等键以外的载荷字段。

## 验收标准

1. 窗口内存在同 `(告警源, 幂等键, 路由, 目标)` 键时，`verdict` 为 `deduped`，
   `dedupe.state` 为 `would_dedupe`，并给出 `firstEventId` 与命中的路由。
2. 键在窗口外时 `dedupe.state` 为 `would_deliver`，`verdict` 回到原有闸门结果。
3. 同一目标被多条路由命中、只有部分路由在窗口内时，`dedupe.state` 为
   `partially_deduped`，`verdict` 不宣称「会被去重」（其余路由仍会新建投递）。
4. 解析器没有幂等键时 `dedupe.state` 为 `not_applicable`，且不查询去重仓储。
5. 预演前后 `delivery_dedupe_keys` 行数不变，且不调用 `recordEvent` /
   `enqueueForEvent` / 适配器 transport。
6. 只读查询的窗口谓词与入队一致（边界值 `created_at == windowStartsAt` 算命中）。
7. 中英文案齐备，`vp check` 与 workspace 测试通过。

## 架构边界

- 只读查询落在投递仓储（`infra/sqlite/repositories/delivery/`），复用入队使用的
  同一张表与窗口谓词；服务层只做投影，不复制 SQL。
- 契约在 `@tocsin/core`，保持环境无关；控制台 UI 只渲染 DTO，不读取仓储。
- 无迁移、无新依赖、无后台任务；仍保持单进程 SQLite 形状。
