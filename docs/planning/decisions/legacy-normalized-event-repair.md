# 决策记录：旧库 `normalized_json` 占位符的修复方式（Q-20）

- 日期：2026-10-19
- 状态：已实施
- 触发：自主迭代 backlog `Q-20`（第 14 轮交由 EXPERT_PANEL 自主裁决）
- 决策方式：3 位专家独立评审（安全与可靠性 / 产品与运维 / 独立评估者），
  2 票 A、1 票 C；按「有分歧选最保守且可逆」规则实施 A

## 1. 问题

`0003_complete_legacy_schema` 对缺少列的旧库执行：

```sql
ALTER TABLE events ADD COLUMN normalized_json TEXT NOT NULL DEFAULT '{}';
```

（`apps/console/src/infra/sqlite/migrate/ensure-complete-schema.ts:114-120`）

这会让所有历史事件的 `normalized_json` 恒为 `{}`。读取路径 `eventFromRow`
直接把它交给 `NormalizedEventSchema` 解析
（`apps/console/src/infra/sqlite/repositories/intake/intake.helpers.ts:46-59`），
而合法事件必然包含 title/fingerprint/severity/status/occurredAt
（`packages/core/src/event/normalized-event.ts:22-30`），因此解析必然抛
ZodError。

受影响路径（全部经由 `intake.get` / `listRecent`）：

- 事件详情：`history.repository.ts:132`
- 投递详情：`delivery.repository.ts:250`
- 投递 claim：`delivery.repository.ts:316-319`（在事务内）
- oncall claim：`oncall.repository.ts:176`（在事务内）
- 事件重放与路由重放预览：`event-replay.service.ts:38,53,121,197`

比详情页 500 更严重的是 **worker 饿死**：`claimNext` 在事务内逐条解析事件，
一条旧 `pending` 投递抛错会回滚整批；runner 每 5 秒重试时按
`coalesce(next_attempt_at, created_at)` 升序再次选中同一批最旧行，新告警因此
永久无法派发（`delivery-worker-runner.ts:50,93-108`）。

非 JSON 列在旧库中完整：`title`、`message`、`severity`、`status`、
`fingerprint`、`labels_json`、`occurred_at`、`received_at`；`recordEvent`
在同一个 INSERT 中同时写入这些列与 `normalized_json`
（`intake.repository.ts:41-59`），因此列值可作为重建来源。

## 2. 候选方案

- **A. 仅读取容错**：`eventFromRow` 在 `normalized_json` 恰为 `{}` 时，用非
  JSON 列重建 `NormalizedEvent`。不写库、不加迁移。
- **B. 仅 forward-only `0004` 回填**：扫描占位行并 UPDATE；带迁移读回测试。
- **C. B + A**。

## 3. 三位专家意见

### 安全与可靠性专家

- 推荐 **A**。`eventFromRow` 是全部事件读取的唯一汇聚点，单点修复即覆盖
  详情、投递、重放、oncall。
- `'{}'` 既不可能是合法 `NormalizedEvent`，也不可能是新写入值，哨兵判定
  无歧义。
- 低估的失效：claim 事务回滚导致旧 `pending` 永久毒住 worker。
- B 的风险：`0004` 在启动时同步执行，任一行重建失败即阻断启动，把局部故障
  升级为全站不可用；且一旦记录，旧版 runner 会拒绝启动
  （`runner.ts:177-190`），降级需恢复备份或手改 ledger。
- C 额外引入写路径：B 若写错，A 因值不再是 `'{}'` 而永不触发，静默污染且
  不可再推导。

### 产品与运维专家

- 推荐 **A**。值班语义上最重要的是升级后新告警仍能派发；A 不只修详情页，
  还解除 claim 毒丸。
- B 只带来静态数据整洁，`normalized_json` 当前只被 `eventFromRow` 消费，
  没有可感知收益，不值得承担升级阻断风险。
- C 仅当未来出现直读该列的消费者（导出、SQL 报表）时再做；届时回填必须
  逐行容错、跳过坏行、不阻塞启动。

### 独立评估者

- 推荐 **C**，备选 **A**；B 单独不达标。
- 核实：A 单点覆盖所有读路径；claim 事务与 runner 重试行为属实。
- B 不能保证坏行不触发 claim 抛错；A 零迁移风险，但会永久留下 `'{}'`，
  未来直读 JSON 的代码仍可能踩坑。
- 残余风险：非 `'{}'` 的损坏 JSON 或事件缺失仍会整批回滚，建议另立 worker
  逐行容错项。

## 4. 最终选择

采用 **A（仅读取容错）**。理由：

1. 安全与可靠性、产品与运维两位专家一致推荐 A；唯一分歧是评估者的 C，
   而 C 包含不可平滑降级的迁移，违反本 routine 的「可逆」优先原则。
2. A 完全可逆：`git revert` 即回到原行为，无数据写入、无 schema 变更。
3. A 同时修复详情页与 worker 毒丸，覆盖所有已核实的读路径。

实现约束：

- 只把**精确等于 `'{}'`** 的值视为 `0003` 占位符；其它非法 JSON 继续抛错，
  不掩盖真实损坏。
- 重建只使用 ingest 同一 INSERT 写入的列，不猜测、不写库。
- 记录残余风险：若未来出现直接读取 `normalized_json` 的消费者，需要重新
  评估 B（届时必须逐行容错且不得阻断启动）。

## 5. 验收

- `migrate.test.ts` 的旧库夹具（已应用 0001/0002、缺 `normalized_json` 列）
  升级后可读回 `event-1` 的七个规范化字段。
- 同一夹具中 `history.getEventDetail("event-1")` 成功。
- 同一夹具中 `deliveries.claimNext({ limit: 10 })` 成功领取旧事件投递，
  不再整批回滚。
- `intake.helpers.test.ts`：
  - `'{}'` 占位符按列重建；
  - 合法 `normalized_json` 优先于列；
  - 非空但不合法的 JSON 仍然抛错。
- `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 6. 回滚

- `git revert <fix-sha>` 并重新部署即可；无需数据库操作，无数据损失。
- 回滚后行为回到当前已知缺陷（旧库历史事件读取抛错），因此仅在修复本身
  造成回归时使用。
- 本方案没有 `schema_migrations` 变化，不存在降级拒绝启动的问题。
