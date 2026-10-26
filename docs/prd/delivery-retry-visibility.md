# 投递列表展示重试预算与「重试耗尽」

- 状态：已实现（第 125 轮）
- 来源：backlog REQ-58（requirements lane 首次记录，第 21 轮收窄）
- 关联：`packages/core/src/operations.ts`、`packages/api/src/schemas/operations.ts`、
  `apps/console/src/infra/sqlite/repositories/history/history.repository.ts`、
  `apps/console/src/features/deliveries/ui/deliveries-table.tsx`

## 问题

投递列表的「尝试」列只渲染 `attemptCount`（`deliveries-table.tsx` 的 attempts 列），
没有重试预算。同样是 `2`：

- 一条 `2/3` 的投递还会自动重试一次；
- 一条 `2/2` 的投递已经放弃，只能人工重试。

「下次重试」列在没有排期时一律渲染 `—`。`failed` 可能是「预算耗尽」，也可能是
「不可重试错误但仍有预算」，两种情况的 `—` 长得一样，运维必须点进详情页才能区分
（详情页已经展示 `attemptCount / maxAttempts`，见 `delivery-detail-summary.tsx`）。

根因在投影层：`deliveries.max_attempts` 已存在于 SQLite 表与 `DeliveryJob`，
但列表投影 `DeliveryListItem` 没有带出该字段（`history.repository.ts:340-358` 的 select
与 `:415-433` 的映射）。

## 用户故事

作为值班运维，我在投递列表里看到一条失败投递时，希望一眼分辨「还在退避、稍后会重试」
与「重试预算已耗尽、需要人工介入或接受失败」，而不是逐条点开详情确认。

## 范围

- `DeliveryListItem`（core 接口 + oRPC schema）增加 `maxAttempts`，由列表查询直接投影
  `deliveries.max_attempts`，不增加查询次数。
- 「尝试」列改为 `attemptCount/maxAttempts`。
- 「下次重试」列：有排期显示时间戳（不变）；无排期且 `state === "failed"` 且
  `attemptCount >= maxAttempts` 时显示「重试耗尽」；其余保持 `—`。
- 新增中英文案 `deliveries.table.retriesExhausted`，并补组件与仓储回归测试。

## 非目标

- 不改状态机、重试退避、`max_attempts` 语义或 `retryNow` 的预算放宽逻辑。
- 不给列表增加新的筛选维度（按「是否耗尽」过滤）。
- 不改详情页（已达到同等可见性）。
- 不引入 schema/迁移；`max_attempts` 列早已存在。

## 验收标准

1. 列表「尝试」列显示 `2/3` 形式，数值来自该投递行自己的 `max_attempts`（含
   `retryNow` 放宽后的预算）。
2. `failed` 且尝试次数用尽的行在「下次重试」列显示「重试耗尽」（英文
   `Retries exhausted`），不再显示 `—`。
3. 仍有排期的行继续显示时间戳；预算未用尽的终态失败仍显示 `—`，不误报耗尽。
4. 仓储测试断言列表投影携带每行真实预算（默认 3、显式 5）。
5. `vp check`、`vp run -r test`、`vp run -r build` 通过。

## 架构边界

- 契约层：`@tocsin/core` 的 `DeliveryListItem` 与 `@tocsin/api` 的
  `DeliveryListItemSchema` 同步增加字段（类型检查保证一致）。
- 持久层：`history.repository.ts` 的 `listDeliveries` 只多选一列，无新查询、无迁移。
- 展示层：`features/deliveries/ui` 的表格单元格与 i18n 文案；无新组件、无新依赖。
- 回滚：还原上述文件即可；`maxAttempts` 是纯展示字段，旧前端忽略它不会出错。
